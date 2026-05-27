import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { DebitWalletDto } from './dto/debit-wallet.dto';
import { Wallet } from '../../database/entities/wallet.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { TransactionType, TransactionSource, UserRole } from '../../common/enums';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterBoyRepository: Repository<CounterBoy>,
  ) {}

  async getTransactions(
    page: number = 1,
    limit: number = 20,
    userId?: string,
    userRole?: UserRole,
    type?: TransactionType,
    source?: TransactionSource,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.walletRepository.createQueryBuilder('wallet');

    if (userId) {
      queryBuilder.andWhere('wallet.userId = :userId', { userId });
    }

    if (userRole) {
      queryBuilder.andWhere('wallet.userRole = :userRole', { userRole });
    }

    if (type) {
      queryBuilder.andWhere('wallet.type = :type', { type });
    }

    if (source) {
      queryBuilder.andWhere('wallet.source = :source', { source });
    }

    queryBuilder
      .orderBy('wallet.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTransaction(id: string) {
    const transaction = await this.walletRepository.findOne({
      where: { id },
      relations: ['electrician', 'dealer'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async credit(creditWalletDto: CreditWalletDto, adminId: string) {
    const { userId, userRole, amount, source, description, referenceId, referenceType } = creditWalletDto;

    // Get current balance
    const user = await this.getUser(userId, userRole);
    const currentBalance = user.walletBalance || 0;
    const newBalance = currentBalance + amount;

    // Create transaction record
    const transaction = this.walletRepository.create({
      userId,
      userRole,
      type: TransactionType.CREDIT,
      source,
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      description: description || `Admin credit - ${source}`,
      referenceId,
      referenceType,
    });

    await this.walletRepository.save(transaction);

    // Update user balance and totalPoints (for electricians)
    await this.updateUserBalance(userId, userRole, newBalance, amount);

    return {
      message: 'Wallet credited successfully',
      transaction,
      newBalance,
    };
  }

  async debit(debitWalletDto: DebitWalletDto, adminId: string) {
    const { userId, userRole, amount, source, description, referenceId, referenceType } = debitWalletDto;

    // Get current balance
    const user = await this.getUser(userId, userRole);
    const currentBalance = user.walletBalance || 0;

    if (currentBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const newBalance = currentBalance - amount;

    // Create transaction record
    const transaction = this.walletRepository.create({
      userId,
      userRole,
      type: TransactionType.DEBIT,
      source,
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      description: description || `Admin debit - ${source}`,
      referenceId,
      referenceType,
    });

    await this.walletRepository.save(transaction);

    // Update user balance and totalPoints (for electricians, debit reduces points)
    await this.updateUserBalance(userId, userRole, newBalance, -amount);

    return {
      message: 'Wallet debited successfully',
      transaction,
      newBalance,
    };
  }

  private async getUser(userId: string, userRole: UserRole) {
    switch (userRole) {
      case UserRole.ELECTRICIAN: {
        const electrician = await this.electricianRepository.findOne({ where: { id: userId } });
        if (!electrician) throw new NotFoundException('Electrician not found');
        return electrician;
      }
      case UserRole.DEALER: {
        const dealer = await this.dealerRepository.findOne({ where: { id: userId } });
        if (!dealer) throw new NotFoundException('Dealer not found');
        return dealer;
      }
      case UserRole.USER: {
        const user = await this.appUserRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        return user;
      }
      case UserRole.COUNTERBOY: {
        const counterBoy = await this.counterBoyRepository.findOne({ where: { id: userId } });
        if (!counterBoy) throw new NotFoundException('Counter boy not found');
        return counterBoy;
      }
      default:
        throw new NotFoundException('User not found');
    }
  }

  private async updateUserBalance(userId: string, userRole: UserRole, newBalance: number, pointsDelta?: number) {
    const updateData: any = { walletBalance: newBalance };

    if (pointsDelta !== undefined && userRole !== UserRole.DEALER) {
      const syncedPoints = Math.max(0, Number(newBalance ?? 0));
      updateData.totalPoints = syncedPoints;
      if (userRole === UserRole.ELECTRICIAN) {
        updateData.tier = this.calculateTier(syncedPoints);
      }
    }

    switch (userRole) {
      case UserRole.ELECTRICIAN:
        await this.electricianRepository.update(userId, updateData);
        return;
      case UserRole.DEALER:
        await this.dealerRepository.update(userId, { walletBalance: newBalance });
        return;
      case UserRole.USER:
        await this.appUserRepository.update(userId, updateData);
        return;
      case UserRole.COUNTERBOY:
        await this.counterBoyRepository.update(userId, updateData);
        return;
    }
  }

  private calculateTier(points: number): string {
    if (points >= 10000) return 'Diamond';
    if (points >= 5001) return 'Platinum';
    if (points >= 1001) return 'Gold';
    return 'Silver';
  }
}
