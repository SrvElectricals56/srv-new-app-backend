import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { RedemptionStatus, TransactionSource, TransactionType, UserRole } from '../../common/enums';

@Injectable()
export class RedemptionService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(Redemption)
    private redemptionRepository: Repository<Redemption>,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterboyRepository: Repository<CounterBoy>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  private getUserRepositoryByRole(role: UserRole, manager?: EntityManager) {
    switch (role) {
      case UserRole.ELECTRICIAN:
        return manager ? manager.getRepository(Electrician) : this.electricianRepository;
      case UserRole.DEALER:
        return manager ? manager.getRepository(Dealer) : this.dealerRepository;
      case UserRole.USER:
        return manager ? manager.getRepository(AppUser) : this.appUserRepository;
      case UserRole.COUNTERBOY:
        return manager ? manager.getRepository(CounterBoy) : this.counterboyRepository;
      default:
        throw new BadRequestException('Unsupported user role');
    }
  }

  private async getUserForUpdate(userId: string, role: UserRole, manager: EntityManager) {
    return this.getUserRepositoryByRole(role, manager)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
  }

  private calculateElectricianTier(points: number) {
    if (points >= 10000) return 'Diamond';
    if (points >= 5001) return 'Platinum';
    if (points >= 1001) return 'Gold';
    return 'Silver';
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: RedemptionStatus,
    role?: UserRole,
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.redemptionRepository.createQueryBuilder('redemption');

    if (status) {
      queryBuilder.andWhere('redemption.status = :status', { status });
    }

    if (role) {
      queryBuilder.andWhere('redemption.role = :role', { role });
    }

    if (userId) {
      queryBuilder.andWhere('redemption.userId = :userId', { userId });
    }

    queryBuilder
      .orderBy('redemption.requestedAt', 'DESC')
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

  async findOne(id: string) {
    const redemption = await this.redemptionRepository.findOne({
      where: { id },
    });

    if (!redemption) {
      throw new NotFoundException('Redemption not found');
    }

    return redemption;
  }

  async approve(id: string, adminId: string) {
    const redemption = await this.findOne(id);

    if (redemption.status !== RedemptionStatus.PENDING) {
      throw new BadRequestException('Only pending redemptions can be approved');
    }

    await this.redemptionRepository.update(id, {
      status: RedemptionStatus.APPROVED,
      processedBy: adminId,
      processedAt: new Date(),
    });

    return this.findOne(id);
  }

  async reject(id: string, rejectionReason: string, adminId: string) {
    const reason = rejectionReason?.trim() || 'Rejected by admin';

    return this.dataSource.transaction(async (manager) => {
      const redemption = await manager.getRepository(Redemption)
        .createQueryBuilder('redemption')
        .setLock('pessimistic_write')
        .where('redemption.id = :id', { id })
        .getOne();

      if (!redemption) {
        throw new NotFoundException('Redemption not found');
      }

      if (redemption.status !== RedemptionStatus.PENDING) {
        throw new BadRequestException('Only pending redemptions can be rejected');
      }

      if (redemption.transactionId) {
        const user = await this.getUserForUpdate(redemption.userId, redemption.role, manager);
        if (!user) {
          throw new NotFoundException('User not found for this redemption');
        }

        const balanceBefore = Number((user as any).walletBalance ?? 0);
        const refundPoints = Number(redemption.points ?? 0);
        const balanceAfter = balanceBefore + refundPoints;
        const updateData: Record<string, any> = {
          walletBalance: balanceAfter,
        };

        if (redemption.role !== UserRole.DEALER) {
          const totalPointsAfter = balanceAfter;
          updateData.totalPoints = totalPointsAfter;
          if (redemption.role === UserRole.ELECTRICIAN) {
            updateData.tier = this.calculateElectricianTier(totalPointsAfter);
          }
        }

        await this.getUserRepositoryByRole(redemption.role, manager).update(
          redemption.userId,
          updateData as any,
        );

        await manager.getRepository(Wallet).save(
          manager.getRepository(Wallet).create({
            userId: redemption.userId,
            userRole: redemption.role,
            type: TransactionType.CREDIT,
            source: TransactionSource.REFUND,
            amount: refundPoints,
            balanceBefore,
            balanceAfter,
            description: `Refund for rejected redemption ${redemption.id}`,
            referenceId: redemption.id,
            referenceType: 'redemption',
          }),
        );
      }

      await manager.getRepository(Redemption).update(id, {
        status: RedemptionStatus.REJECTED,
        rejectionReason: reason,
        processedBy: adminId,
        processedAt: new Date(),
      });

      return this.findOne(id);
    });
  }

  async remove(id: string) {
    const redemption = await this.findOne(id);
    await this.redemptionRepository.remove(redemption);
    return { message: 'Redemption deleted successfully' };
  }
}
