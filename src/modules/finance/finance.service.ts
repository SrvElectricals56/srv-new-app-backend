import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../database/entities/wallet.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { TransactionType, TransactionSource, UserRole, RedemptionStatus } from '../../common/enums';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Redemption)
    private redemptionRepository: Repository<Redemption>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterBoyRepository: Repository<CounterBoy>,
  ) {}

  private async resolveUser(identifier: string): Promise<{ name: string; phone: string; role: string; walletBalance: number } | null> {
    if (!identifier) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = uuidRegex.test(identifier);
    const idMatch = isUuid ? [{ id: identifier }] : [];
    const phoneMatch = [{ phone: identifier }];
    const [d, e] = await Promise.all([
      this.dealerRepository.findOne({ where: [...idMatch, ...phoneMatch, { dealerCode: identifier }] }),
      this.electricianRepository.findOne({ where: [...idMatch, ...phoneMatch, { electricianCode: identifier }] }),
    ]);
    const user = d || e;
    if (user) return { name: user.name, phone: user.phone, role: d ? 'dealer' : 'electrician', walletBalance: user.walletBalance ?? 0 };
    return null;
  }

  async getSummary() {
    const [
      totalCredits,
      totalDebits,
      totalRedemptions,
      pendingRedemptions,
      electricianWalletBalance,
      dealerWalletBalance,
    ] = await Promise.all([
      this.walletRepository
        .createQueryBuilder('wallet')
        .select('SUM(wallet.amount)', 'total')
        .where('wallet.type = :type', { type: TransactionType.CREDIT })
        .getRawOne(),
      this.walletRepository
        .createQueryBuilder('wallet')
        .select('SUM(wallet.amount)', 'total')
        .where('wallet.type = :type', { type: TransactionType.DEBIT })
        .getRawOne(),
      this.redemptionRepository
        .createQueryBuilder('redemption')
        .select('SUM(redemption.amount)', 'total')
        .where('redemption.status = :status', { status: RedemptionStatus.COMPLETED })
        .getRawOne(),
      this.redemptionRepository.count({
        where: { status: RedemptionStatus.PENDING },
      }),
      this.electricianRepository
        .createQueryBuilder('electrician')
        .select('SUM(electrician.walletBalance)', 'total')
        .getRawOne(),
      this.dealerRepository
        .createQueryBuilder('dealer')
        .select('SUM(dealer.walletBalance)', 'total')
        .getRawOne(),
    ]);

    return {
      totalCredits: parseFloat(totalCredits?.total || '0'),
      totalDebits: parseFloat(totalDebits?.total || '0'),
      totalRedemptions: parseFloat(totalRedemptions?.total || '0'),
      pendingRedemptions,
      electricianWalletBalance: parseFloat(electricianWalletBalance?.total || '0'),
      dealerWalletBalance: parseFloat(dealerWalletBalance?.total || '0'),
      netBalance: parseFloat(totalCredits?.total || '0') - parseFloat(totalDebits?.total || '0'),
    };
  }

  async getTransactions(
    page: number = 1,
    limit: number = 20,
    type?: TransactionType,
    userRole?: UserRole,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.walletRepository.createQueryBuilder('wallet');

    if (type) {
      queryBuilder.andWhere('wallet.type = :type', { type });
    }

    if (userRole) {
      queryBuilder.andWhere('wallet.userRole = :userRole', { userRole });
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

  async getDealerBonus() {
    const dealers = await this.dealerRepository.find({
      select: ['id', 'name', 'phone', 'walletBalance', 'electricianCount', 'bonusPoints', 'bonusStatus'],
    });

    const bonusData = dealers.map(dealer => ({
      id: dealer.id,
      name: dealer.name,
      phone: dealer.phone,
      walletBalance: dealer.walletBalance,
      electricianCount: dealer.electricianCount,
      bonusPoints: Number(dealer.bonusPoints ?? 0),
      bonusStatus: dealer.bonusStatus || 'pending',
    }));

    return {
      dealers: bonusData,
      totalBonusAmount: bonusData.reduce((sum, d) => sum + d.bonusPoints, 0),
    };
  }

  async transferDealerBonus(
    transferData: { dealerId: string; amount: number; description?: string },
    adminId: string,
  ) {
    const { dealerId, amount, description } = transferData;

    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new Error('Dealer not found');

    const currentBalance = dealer.walletBalance || 0;
    const newBalance = currentBalance + amount;

    const transaction = this.walletRepository.create({
      userId: dealerId,
      userRole: UserRole.DEALER,
      type: TransactionType.CREDIT,
      source: TransactionSource.BONUS,
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      description: description || 'Dealer bonus transfer',
      referenceId: adminId,
      referenceType: 'admin_transfer',
    });

    await this.walletRepository.save(transaction);
    await this.dealerRepository.update(dealerId, { walletBalance: newBalance });

    return {
      message: 'Dealer bonus transferred successfully',
      transaction,
    };
  }

  async getTransferPoints() {
    const transfers = await this.walletRepository.find({
      where: { source: TransactionSource.TRANSFER, type: TransactionType.CREDIT },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const enriched = await Promise.all(transfers.map(async (t) => {
      let fromName: string | null = null;
      let fromPhone: string | null = null;
      let toName: string | null = null;
      let toPhone: string | null = null;

      if (t.description) {
        // Normalize: strip [REVERSED] prefix and . Reason: suffix
        let desc = t.description
          .replace(/^\[REVERSED\]\s*/i, '')
          .replace(/\.\s*Reason:.*$/, '');

        // Try new format: "Manual transfer from Name (Phone) to Name (Phone)"
        const match = desc.match(
          /^Manual transfer from (.+?) \(([^)]*)\) to (.+?) \(([^)]*)\)$/,
        );
        if (match) {
          fromName = match[1];
          fromPhone = match[2] || null;
          toName = match[3];
          toPhone = match[4] || null;
        } else {
          // Fallback to old format: "Manual transfer from <value> to <value>"
          const parts = desc.split(' to ');
          if (parts.length >= 2) {
            const rawFrom = parts[0].replace('Manual transfer from ', '').trim();
            const rawTo = parts.slice(1).join(' to ').trim();
            // Try to resolve as user identifier
            const [fromUser, toUser] = await Promise.all([
              this.resolveUser(rawFrom),
              this.resolveUser(rawTo),
            ]);
            if (fromUser) { fromName = fromUser.name; fromPhone = fromUser.phone; }
            else fromName = rawFrom;
            if (toUser) { toName = toUser.name; toPhone = toUser.phone; }
            else toName = rawTo;
          } else {
            // Description is just a reason string — use as fallback fromName
            fromName = desc;
          }
        }
      }

      return {
        ...t,
        fromName,
        fromPhone,
        toName,
        toPhone,
      };
    }));

    return {
      transfers: enriched,
      totalTransfers: enriched.length,
    };
  }

  async manualTransferPoints(
    body: { fromUser: string; toUser: string; points: number; reason?: string },
    adminId: string,
  ) {
    const { fromUser, toUser, points, reason } = body;

    const [resolvedFrom, resolvedTo] = await Promise.all([
      this.resolveUser(fromUser),
      this.resolveUser(toUser),
    ]);

    if (!resolvedFrom) {
      throw new Error(`From user not found: "${fromUser}". Please enter a valid name, phone, or code.`);
    }
    if (!resolvedTo) {
      throw new Error(`To user not found: "${toUser}". Please enter a valid name, phone, or code.`);
    }

    if (resolvedFrom.role !== 'dealer' && resolvedFrom.role !== 'electrician') {
      throw new Error(`Transfers are only allowed for dealers and electricians. "${resolvedFrom.name}" is a ${resolvedFrom.role}.`);
    }
    if (resolvedTo.role !== 'dealer' && resolvedTo.role !== 'electrician') {
      throw new Error(`Transfers are only allowed for dealers and electricians. "${resolvedTo.name}" is a ${resolvedTo.role}.`);
    }

    if (resolvedFrom.walletBalance < points) {
      throw new Error(
        `Insufficient balance. ${resolvedFrom.name} has only ${resolvedFrom.walletBalance} points, but you are trying to transfer ${points} points.`,
      );
    }

    const fromDisplay = `${resolvedFrom.name} (${resolvedFrom.phone})`;
    const toDisplay = `${resolvedTo.name} (${resolvedTo.phone})`;
    const description = reason
      ? `Manual transfer from ${fromDisplay} to ${toDisplay}. Reason: ${reason}`
      : `Manual transfer from ${fromDisplay} to ${toDisplay}`;

    // Deduct from sender
    const fromNewBalance = resolvedFrom.walletBalance - points;
    // Add to receiver
    const toNewBalance = resolvedTo.walletBalance + points;

    if (resolvedFrom.role === 'dealer') {
      await this.dealerRepository.update(fromUser, { walletBalance: fromNewBalance });
    } else {
      await this.electricianRepository.update(fromUser, { walletBalance: fromNewBalance });
    }
    if (resolvedTo.role === 'dealer') {
      await this.dealerRepository.update(toUser, { walletBalance: toNewBalance });
    } else {
      await this.electricianRepository.update(toUser, { walletBalance: toNewBalance });
    }

    const transferRef = crypto.randomUUID();

    // Create debit record for sender
    const debitTx = this.walletRepository.create({
      userId: fromUser,
      userRole: resolvedFrom.role === 'dealer' ? UserRole.DEALER : UserRole.ELECTRICIAN,
      type: TransactionType.DEBIT,
      source: TransactionSource.TRANSFER,
      amount: points,
      balanceBefore: resolvedFrom.walletBalance,
      balanceAfter: fromNewBalance,
      description,
      referenceId: transferRef,
      referenceType: 'manual_transfer',
    });

    // Create credit record for receiver
    const creditTx = this.walletRepository.create({
      userId: toUser,
      userRole: resolvedTo.role === 'dealer' ? UserRole.DEALER : UserRole.ELECTRICIAN,
      type: TransactionType.CREDIT,
      source: TransactionSource.TRANSFER,
      amount: points,
      balanceBefore: resolvedTo.walletBalance,
      balanceAfter: toNewBalance,
      description,
      referenceId: transferRef,
      referenceType: 'manual_transfer',
    });

    await this.walletRepository.save([debitTx, creditTx]);

    return {
      message: 'Points transferred successfully',
      fromUser,
      toUser,
      points,
      reason,
      fromBalance: fromNewBalance,
      toBalance: toNewBalance,
    };
  }

  async reverseTransfer(id: string, adminId: string) {
    // Find the credit record (shown in the list)
    const creditTx = await this.walletRepository.findOne({ where: { id } });
    if (!creditTx) throw new Error('Transfer not found');

    const amount = creditTx.amount;
    const description = creditTx.description;

    // Find the paired debit record by referenceId if it's a paired transfer
    const pairedDebit = creditTx.referenceId && creditTx.referenceType === 'manual_transfer'
      ? await this.walletRepository.findOne({
          where: { referenceId: creditTx.referenceId, referenceType: 'manual_transfer', type: TransactionType.DEBIT },
        })
      : null;

    // Restore sender's wallet balance
    if (pairedDebit) {
      const senderNewBalance = pairedDebit.balanceBefore;
      if (pairedDebit.userRole === UserRole.DEALER) {
        await this.dealerRepository.update(pairedDebit.userId, { walletBalance: senderNewBalance });
      } else {
        await this.electricianRepository.update(pairedDebit.userId, { walletBalance: senderNewBalance });
      }
    }

    // Deduct from receiver's wallet balance
    const receiverNewBalance = creditTx.balanceBefore;
    if (creditTx.userRole === UserRole.DEALER) {
      await this.dealerRepository.update(creditTx.userId, { walletBalance: receiverNewBalance });
    } else {
      await this.electricianRepository.update(creditTx.userId, { walletBalance: receiverNewBalance });
    }

    // Mark credit record as reversed
    await this.walletRepository.update(id, {
      description: `[REVERSED] ${description}`,
      referenceType: 'reversed_transfer',
    });

    // Mark paired debit record as reversed if it exists
    if (pairedDebit) {
      await this.walletRepository.update(pairedDebit.id, {
        description: `[REVERSED] ${description}`,
        referenceType: 'reversed_transfer',
      });
    }

    // Create reversal audit record
    const reversal = this.walletRepository.create({
      userId: adminId,
      userRole: UserRole.ELECTRICIAN,
      type: TransactionType.DEBIT,
      source: TransactionSource.TRANSFER,
      amount,
      balanceBefore: creditTx.balanceAfter,
      balanceAfter: creditTx.balanceBefore,
      description: `Reversal of: ${description}`,
      referenceId: id,
      referenceType: 'transfer_reversal',
    });

    await this.walletRepository.save(reversal);

    return { message: 'Transfer reversed successfully', reversal };
  }

  async deleteTransfer(id: string) {
    const transfer = await this.walletRepository.findOne({ where: { id } });
    if (!transfer) throw new Error('Transfer not found');
    await this.walletRepository.delete(id);
    return { message: 'Transfer deleted successfully' };
  }

  async markDealerBonusPaid(dealerId: string, adminId: string) {
    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new Error('Dealer not found');

    const bonusPoints = Number(dealer.bonusPoints ?? 0);

    if (bonusPoints > 0) {
      const currentBalance = dealer.walletBalance || 0;
      const newBalance = currentBalance + bonusPoints;

      await this.walletRepository.save(
        this.walletRepository.create({
          userId: dealerId,
          userRole: UserRole.DEALER,
          type: TransactionType.CREDIT,
          source: TransactionSource.BONUS,
          amount: bonusPoints,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description: 'Dealer bonus payment',
          referenceId: adminId,
          referenceType: 'bonus_payment',
        }),
      );

      await this.dealerRepository.update(dealerId, {
        walletBalance: newBalance,
        bonusPoints: 0,
        bonusStatus: 'paid',
      });
    } else {
      await this.dealerRepository.update(dealerId, { bonusStatus: 'paid' });
    }

    return { message: 'Dealer bonus marked as paid', dealerId, bonusAmount: bonusPoints };
  }

  async updateDealerBonus(
    dealerId: string,
    data: { bonusPoints?: number; electricianCount?: number; bonusStatus?: string },
  ) {
    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new Error('Dealer not found');

    const updatePayload: Partial<typeof dealer> = {};
    if (data.bonusPoints !== undefined) updatePayload.bonusPoints = data.bonusPoints;
    if (data.electricianCount !== undefined) updatePayload.electricianCount = data.electricianCount;
    if (data.bonusStatus !== undefined) (updatePayload as any).bonusStatus = data.bonusStatus;

    await this.dealerRepository.update(dealerId, updatePayload as any);
    const updated = await this.dealerRepository.findOne({ where: { id: dealerId } });

    return {
      message: 'Dealer bonus updated successfully',
      dealer: {
        id: updated?.id,
        name: updated?.name,
        phone: updated?.phone,
        walletBalance: updated?.walletBalance,
        electricianCount: updated?.electricianCount,
        bonusPoints: Number((updated as any)?.bonusPoints ?? 0),
        bonusStatus: (updated as any)?.bonusStatus || 'pending',
      },
    };
  }

  async bulkMarkDealerBonusPaid(dealerIds: string[], adminId: string) {
    const results = await Promise.allSettled(
      dealerIds.map(id => this.markDealerBonusPaid(id, adminId))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    return { message: `${succeeded}/${dealerIds.length} bonuses marked as paid`, succeeded };
  }
}
