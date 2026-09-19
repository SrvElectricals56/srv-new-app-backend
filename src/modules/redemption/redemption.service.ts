import * as crypto from 'crypto';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { NotificationStatus, RedemptionStatus, TransactionSource, TransactionType, UserRole } from '../../common/enums';
import { Notification } from '../../database/entities/notification.entity';

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
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
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

  private buildUserBalanceUpdate(role: UserRole, balanceAfter: number, totalPoints: number) {
    const updateData: Record<string, any> = {
      walletBalance: balanceAfter,
    };

    if (role !== UserRole.DEALER) {
      updateData.totalPoints = totalPoints;
      if (role === UserRole.ELECTRICIAN) {
        updateData.tier = this.calculateElectricianTier(totalPoints);
      }
    }

    return updateData;
  }

  private async refundHeldPoints(redemption: Redemption, reason: string, manager: EntityManager) {
    if (!redemption.transactionId) return;

    const user = await this.getUserForUpdate(redemption.userId, redemption.role, manager);
    if (!user) {
      throw new NotFoundException('User not found for this redemption');
    }

    const isDealerBonus =
      redemption.role === UserRole.DEALER &&
      (redemption.type === 'dealer_bonus_bank_transfer' || redemption.type === 'bonus_withdrawal');

    const balanceBefore = Number(
      isDealerBonus ? (user as any).bonusPoints ?? 0 : (user as any).walletBalance ?? 0,
    );
    const refundPoints = Number(redemption.points ?? 0);
    const balanceAfter = balanceBefore + refundPoints;

    if (isDealerBonus) {
      await manager.getRepository(Dealer).update(redemption.userId, {
        bonusPoints: balanceAfter,
      });
    } else {
      await this.getUserRepositoryByRole(redemption.role, manager).update(
        redemption.userId,
        this.buildUserBalanceUpdate(redemption.role, balanceAfter, Number((user as any).totalPoints ?? 0) + refundPoints) as any,
      );
    }

    await manager.getRepository(Wallet).save(
      manager.getRepository(Wallet).create({
        userId: redemption.userId,
        userRole: redemption.role,
        type: TransactionType.CREDIT,
        source: TransactionSource.REFUND,
        amount: refundPoints,
        balanceBefore,
        balanceAfter,
        description: `Refund for rejected redemption ${redemption.id}. Reason: ${reason}`,
        referenceId: redemption.id,
        referenceType: 'redemption',
      }),
    );
  }

  private async holdPointsAgain(
    redemption: Redemption,
    nextStatus: RedemptionStatus,
    manager: EntityManager,
  ) {
    if (!redemption.transactionId) return;

    const user = await this.getUserForUpdate(redemption.userId, redemption.role, manager);
    if (!user) {
      throw new NotFoundException('User not found for this redemption');
    }

    const isDealerBonus =
      redemption.role === UserRole.DEALER &&
      (redemption.type === 'dealer_bonus_bank_transfer' || redemption.type === 'bonus_withdrawal');

    const balanceBefore = Number(
      isDealerBonus ? (user as any).bonusPoints ?? 0 : (user as any).walletBalance ?? 0,
    );
    const lockedPoints = Number(redemption.points ?? 0);

    if (balanceBefore < lockedPoints) {
      throw new BadRequestException(
        isDealerBonus
          ? 'User no longer has enough bonus points to re-activate this request'
          : 'User no longer has enough wallet balance to re-activate this request',
      );
    }

    const balanceAfter = balanceBefore - lockedPoints;

    if (isDealerBonus) {
      await manager.getRepository(Dealer).update(redemption.userId, {
        bonusPoints: balanceAfter,
      });
    } else {
      await this.getUserRepositoryByRole(redemption.role, manager).update(
        redemption.userId,
        this.buildUserBalanceUpdate(redemption.role, balanceAfter, Math.max(0, Number((user as any).totalPoints ?? 0) - lockedPoints)) as any,
      );
    }

    await manager.getRepository(Wallet).save(
      manager.getRepository(Wallet).create({
        userId: redemption.userId,
        userRole: redemption.role,
        type: TransactionType.DEBIT,
        source: TransactionSource.REDEMPTION,
        amount: lockedPoints,
        balanceBefore,
        balanceAfter,
        description: `Points locked again after redemption ${redemption.id} moved to ${nextStatus}`,
        referenceId: redemption.id,
        referenceType: 'redemption',
      }),
    );
  }

  private async syncWalletForStatusChange(
    redemption: Redemption,
    nextStatus: RedemptionStatus,
    rejectionReason: string,
    manager: EntityManager,
  ) {
    if (
      redemption.status !== RedemptionStatus.REJECTED &&
      nextStatus === RedemptionStatus.REJECTED
    ) {
      await this.refundHeldPoints(redemption, rejectionReason, manager);
      return;
    }

    if (
      redemption.status === RedemptionStatus.REJECTED &&
      nextStatus !== RedemptionStatus.REJECTED
    ) {
      await this.holdPointsAgain(redemption, nextStatus, manager);
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: RedemptionStatus,
    role?: UserRole,
    userId?: string,
    from?: string,
    to?: string,
    search?: string,
  ) {
    page = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    limit = Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 20;
    for (const date of [from, to]) {
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
        throw new BadRequestException('Use a valid YYYY-MM-DD date');
      }
    }
    if (from && to && from > to) throw new BadRequestException('Start date must be before end date');
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

    if (from) queryBuilder.andWhere(`redemption.requestedAt >= CAST(:from AS date)::timestamp AT TIME ZONE 'Asia/Kolkata'`, { from });
    if (to) queryBuilder.andWhere(`redemption.requestedAt < (CAST(:to AS date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`, { to });
    if (search?.trim()) {
      queryBuilder.andWhere(`(redemption."userName" ILIKE :search OR redemption."userId" ILIKE :search
        OR redemption.type ILIKE :search OR redemption."rejectionReason" ILIKE :search
        OR EXISTS (SELECT 1 FROM (
          SELECT id::text, 'electrician' AS role, name, phone, "electricianCode" AS code FROM electricians
          UNION ALL SELECT id::text, 'dealer', name, phone, "dealerCode" FROM dealers
          UNION ALL SELECT id::text, 'user', name, phone, "userCode" FROM app_users
          UNION ALL SELECT id::text, 'counterboy', name, phone, "counterboyCode" FROM counterboys
        ) u WHERE u.id = redemption."userId" AND u.role = redemption.role::text
          AND (u.name ILIKE :search OR u.phone ILIKE :search OR u.code ILIKE :search)))`, { search: `%${search.trim()}%` });
    }
    const summaryQuery = queryBuilder.clone();
    queryBuilder
      .orderBy('redemption.requestedAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    const idsByRole = new Map<UserRole, string[]>();
    for (const row of data) {
      idsByRole.set(row.role, [...(idsByRole.get(row.role) ?? []), row.userId]);
    }
    const [electricians, dealers, appUsers, counterboys, statusRows] = await Promise.all([
      idsByRole.get(UserRole.ELECTRICIAN)?.length
        ? this.electricianRepository.find({ where: { id: In(idsByRole.get(UserRole.ELECTRICIAN)!) }, select: ['id', 'name', 'phone', 'electricianCode'] })
        : Promise.resolve([]),
      idsByRole.get(UserRole.DEALER)?.length
        ? this.dealerRepository.find({ where: { id: In(idsByRole.get(UserRole.DEALER)!) }, select: ['id', 'name', 'phone', 'dealerCode'] })
        : Promise.resolve([]),
      idsByRole.get(UserRole.USER)?.length
        ? this.appUserRepository.find({ where: { id: In(idsByRole.get(UserRole.USER)!) }, select: ['id', 'name', 'phone', 'userCode'] })
        : Promise.resolve([]),
      idsByRole.get(UserRole.COUNTERBOY)?.length
        ? this.counterboyRepository.find({ where: { id: In(idsByRole.get(UserRole.COUNTERBOY)!) }, select: ['id', 'name', 'phone', 'counterboyCode'] })
        : Promise.resolve([]),
      summaryQuery.select('redemption.status', 'status')
        .addSelect('COUNT(*)::int', 'count')
        .addSelect('COALESCE(SUM(redemption.amount), 0)', 'amount')
        .groupBy('redemption.status').getRawMany(),
    ]);
    const userMap = new Map<string, { name: string; phone: string; code?: string | null }>();
    electricians.forEach((user) => userMap.set(`${UserRole.ELECTRICIAN}:${user.id}`, { name: user.name, phone: user.phone, code: user.electricianCode }));
    dealers.forEach((user) => userMap.set(`${UserRole.DEALER}:${user.id}`, { name: user.name, phone: user.phone, code: user.dealerCode }));
    appUsers.forEach((user) => userMap.set(`${UserRole.USER}:${user.id}`, { name: user.name, phone: user.phone, code: user.userCode }));
    counterboys.forEach((user) => userMap.set(`${UserRole.COUNTERBOY}:${user.id}`, { name: user.name, phone: user.phone, code: user.counterboyCode }));
    const enrichedData = data.map((row) => {
      const user = userMap.get(`${row.role}:${row.userId}`);
      return {
        ...row,
        userName: row.userName || user?.name || 'Unknown user',
        userPhone: user?.phone ?? null,
        userCode: user?.code ?? null,
      };
    });
    const summary = { approved: { count: 0, amount: 0 }, pending: { count: 0, amount: 0 }, rejected: { count: 0, amount: 0 }, processing: { count: 0, amount: 0 }, completed: { count: 0, amount: 0 } } as Record<string, { count: number; amount: number }>;
    for (const row of statusRows) {
      summary[row.status] = { count: Number(row.count ?? 0), amount: Number(row.amount ?? 0) };
    }

    return {
      data: enrichedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary,
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

  async updateStatus(
    id: string,
    nextStatus: RedemptionStatus,
    adminId: string,
    rejectionReason?: string,
  ) {
    if (
      ![
        RedemptionStatus.PENDING,
        RedemptionStatus.APPROVED,
        RedemptionStatus.REJECTED,
      ].includes(nextStatus)
    ) {
      throw new BadRequestException('Unsupported redemption status');
    }

    const reason = rejectionReason?.trim() || 'Rejected by admin';

    await this.dataSource.transaction(async (manager) => {
      const redemption = await manager.getRepository(Redemption)
        .createQueryBuilder('redemption')
        .setLock('pessimistic_write')
        .where('redemption.id = :id', { id })
        .getOne();

      if (!redemption) {
        throw new NotFoundException('Redemption not found');
      }

      await this.syncWalletForStatusChange(redemption, nextStatus, reason, manager);

      if (
        redemption.status !== RedemptionStatus.APPROVED &&
        nextStatus === RedemptionStatus.APPROVED &&
        redemption.role === UserRole.ELECTRICIAN
      ) {
        await this.creditDealerCommission(redemption, manager);
      }

      await manager.getRepository(Redemption).update(id, {
        status: nextStatus,
        rejectionReason: nextStatus === RedemptionStatus.REJECTED ? reason : null,
        processedBy: nextStatus === RedemptionStatus.PENDING ? null : adminId,
        processedAt: nextStatus === RedemptionStatus.PENDING ? null : new Date(),
      });
    });

    const updated = await this.findOne(id);
    await this.sendRedemptionNotification(updated, nextStatus);
    return updated;
  }

  async approve(id: string, adminId: string) {
    return this.updateStatus(id, RedemptionStatus.APPROVED, adminId);
  }

  async reject(id: string, rejectionReason: string, adminId: string) {
    return this.updateStatus(id, RedemptionStatus.REJECTED, adminId, rejectionReason);
  }

  private async creditDealerCommission(redemption: Redemption, manager: EntityManager) {
    const electrician = await manager.getRepository(Electrician).findOne({
      where: { id: redemption.userId },
    });
    if (!electrician || !electrician.dealerId) return;

    const dealer = await manager.getRepository(Dealer)
      .createQueryBuilder('dealer')
      .setLock('pessimistic_write')
      .where('dealer.id = :dealerId', { dealerId: electrician.dealerId })
      .getOne();
    if (!dealer) return;

    const alreadyCredited = await manager.getRepository(Wallet).findOne({ where: {
      referenceId: redemption.id, source: TransactionSource.COMMISSION, type: TransactionType.CREDIT,
    } });
    if (alreadyCredited) return;
    const commission = Math.round(Number(redemption.points) * 0.05);
    if (commission <= 0) return;

    const balanceBefore = Number(dealer.walletBalance ?? 0);
    const balanceAfter = balanceBefore + commission;

    await manager.getRepository(Dealer).update(electrician.dealerId, {
      walletBalance: balanceAfter,
    });

    await manager.getRepository(Dealer).increment(
      { id: electrician.dealerId },
      'bonusPoints',
      commission,
    );

    await manager.getRepository(Wallet).save(
      manager.getRepository(Wallet).create({
        id: crypto.randomUUID(),
        userId: electrician.dealerId,
        userRole: UserRole.DEALER,
        type: TransactionType.CREDIT,
        source: TransactionSource.COMMISSION,
        amount: commission,
        balanceBefore,
        balanceAfter,
        description: `5% commission on electrician withdrawal - ${electrician.name}`,
        referenceId: redemption.id,
        referenceType: 'redemption',
      }),
    );
  }

  private async sendRedemptionNotification(redemption: Redemption, status: RedemptionStatus) {
    if (status !== RedemptionStatus.APPROVED && status !== RedemptionStatus.REJECTED) return;

    const isWithdrawal = ['bank_transfer', 'dealer_bonus_bank_transfer', 'bonus_withdrawal'].includes(redemption.type);
    const isGift = ['gift', 'gift_order'].includes(redemption.type);

    let title: string;
    let message: string;

    if (status === RedemptionStatus.APPROVED) {
      if (isWithdrawal) {
        title = 'Withdrawal Approved';
        message = `Your withdrawal of ₹${redemption.amount} has been approved and will be processed soon.`;
      } else if (isGift) {
        title = 'Gift Approved';
        message = 'Your gift redemption has been approved.';
      } else {
        title = 'Redemption Approved';
        message = 'Your redemption request has been approved.';
      }
    } else {
      const reason = redemption.rejectionReason || 'N/A';
      if (isWithdrawal) {
        title = 'Withdrawal Rejected';
        message = `Your withdrawal of ₹${redemption.amount} has been rejected. Reason: ${reason}`;
      } else if (isGift) {
        title = 'Gift Rejected';
        message = `Your gift redemption has been rejected. Reason: ${reason}`;
      } else {
        title = 'Redemption Rejected';
        message = `Your redemption request has been rejected. Reason: ${reason}`;
      }
    }

    await this.notificationRepository.save(
      this.notificationRepository.create({
        title,
        message,
        targetUserIds: [redemption.userId],
        targetRole: redemption.role,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        totalSent: 1,
      }),
    );
  }

  async remove(id: string) {
    const redemption = await this.findOne(id);
    await this.redemptionRepository.remove(redemption);
    return { message: 'Redemption deleted successfully' };
  }
}
