import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Scan } from '../../database/entities/scan.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { UserRole, RedemptionStatus, UserStatus, KYCStatus } from '../../common/enums';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(Scan)
    private scanRepository: Repository<Scan>,
    @InjectRepository(Redemption)
    private redemptionRepository: Repository<Redemption>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterBoyRepository: Repository<CounterBoy>,
    @InjectRepository(SupportTicket)
    private supportTicketRepository: Repository<SupportTicket>,
  ) {}

  async getDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      totalElectricians,
      totalDealers,
      activeElectricians,
      activeDealers,
      totalScansToday,
      totalScansYesterday,
      totalPointsAwarded,
      pendingRedemptions,
      totalRedemptions,
      totalAppUsers,
      totalCounterboys,
      totalEnquiries,
      electricianKyc,
      dealerKyc,
      appUserKyc,
      counterboyKyc,
    ] = await Promise.all([
      this.electricianRepository.count(),
      this.dealerRepository.count(),
      this.electricianRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.dealerRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.scanRepository.count({
        where: { scannedAt: Between(today, new Date()) },
      }),
      this.scanRepository.count({
        where: { scannedAt: Between(yesterday, today) },
      }),
      this.electricianRepository
        .createQueryBuilder('electrician')
        .select('SUM(electrician.totalPoints)', 'total')
        .getRawOne(),
      this.redemptionRepository.count({
        where: { status: RedemptionStatus.PENDING },
      }),
      this.redemptionRepository.count(),
      this.appUserRepository.count(),
      this.counterBoyRepository.count(),
      this.supportTicketRepository.count(),
      this.getKycCounts(this.electricianRepository),
      this.getKycCounts(this.dealerRepository),
      this.getKycCounts(this.appUserRepository),
      this.getKycCounts(this.counterBoyRepository),
    ]);

    const growthRate = totalScansYesterday > 0 
      ? ((totalScansToday - totalScansYesterday) / totalScansYesterday) * 100 
      : 0;

    const kyc = [electricianKyc, dealerKyc, appUserKyc, counterboyKyc].reduce(
      (sum, row) => ({
        total: sum.total + row.total,
        verified: sum.verified + row.verified,
        pending: sum.pending + row.pending,
        rejected: sum.rejected + row.rejected,
        notSubmitted: sum.notSubmitted + row.notSubmitted,
      }),
      { total: 0, verified: 0, pending: 0, rejected: 0, notSubmitted: 0 },
    );

    return {
      totalElectricians,
      totalDealers,
      totalUsers: totalElectricians + totalDealers + totalAppUsers + totalCounterboys,
      activeUsers: activeElectricians + activeDealers,
      totalKyc: kyc.total,
      kycVerified: kyc.verified,
      kycPending: kyc.pending,
      kycRejected: kyc.rejected,
      kycNotSubmitted: kyc.notSubmitted,
      totalEnquiries,
      totalScansToday,
      totalPointsAwarded: parseInt(totalPointsAwarded?.total || '0'),
      pendingRedemptions,
      totalRedemptions,
      growthRate: Math.round(growthRate * 100) / 100,
    };
  }

  private async getKycCounts<T extends { kycStatus: KYCStatus }>(repository: Repository<T>) {
    const rows = await repository
      .createQueryBuilder('account')
      .select('account.kycStatus', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('account.kycStatus')
      .getRawMany<{ status: KYCStatus; count: number | string }>();
    const counts = { total: 0, verified: 0, pending: 0, rejected: 0, notSubmitted: 0 };
    for (const row of rows) {
      const count = Number(row.count);
      counts.total += count;
      if (row.status === KYCStatus.VERIFIED) counts.verified += count;
      else if (row.status === KYCStatus.PENDING) counts.pending += count;
      else if (row.status === KYCStatus.REJECTED) counts.rejected += count;
      else counts.notSubmitted += count;
    }
    return counts;
  }

  async getScans() {
    const last7Days = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const [electricianScans, dealerScans] = await Promise.all([
        this.scanRepository.count({
          where: {
            role: UserRole.ELECTRICIAN,
            scannedAt: Between(date, nextDate),
          },
        }),
        this.scanRepository.count({
          where: {
            role: UserRole.DEALER,
            scannedAt: Between(date, nextDate),
          },
        }),
      ]);

      last7Days.push({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: date.toISOString().split('T')[0],
        electrician: electricianScans,
        dealer: dealerScans,
        total: electricianScans + dealerScans,
      });
    }

    return {
      last7Days,
      totalScans: last7Days.reduce((sum, day) => sum + day.total, 0),
    };
  }

  async getUsers() {
    const tierDistribution = await this.electricianRepository
      .createQueryBuilder('electrician')
      .select('electrician.tier', 'tier')
      .addSelect('COUNT(*)', 'count')
      .groupBy('electrician.tier')
      .getRawMany();

    const userGrowth = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const [newElectricians, newDealers] = await Promise.all([
        this.electricianRepository.count({
          where: { joinedDate: Between(date, nextDate) },
        }),
        this.dealerRepository.count({
          where: { joinedDate: Between(date, nextDate) },
        }),
      ]);

      userGrowth.push({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: date.toISOString().split('T')[0],
        electricians: newElectricians,
        dealers: newDealers,
        total: newElectricians + newDealers,
      });
    }

    return {
      tierDistribution,
      userGrowth,
    };
  }

  async getRevenue() {
    const totalWalletBalance = await this.walletRepository
      .createQueryBuilder('wallet')
      .select('SUM(wallet.amount)', 'total')
      .where('wallet.type = :type', { type: 'credit' })
      .getRawOne();

    const totalRedemptions = await this.redemptionRepository
      .createQueryBuilder('redemption')
      .select('SUM(redemption.amount)', 'total')
      .where('redemption.status = :status', { status: RedemptionStatus.COMPLETED })
      .getRawOne();

    const monthlyRevenue = [];
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const monthRedemptions = await this.redemptionRepository
        .createQueryBuilder('redemption')
        .select('SUM(redemption.amount)', 'total')
        .where('redemption.status = :status', { status: RedemptionStatus.COMPLETED })
        .andWhere('redemption.requestedAt >= :start', { start: date })
        .andWhere('redemption.requestedAt < :end', { end: nextMonth })
        .getRawOne();

      monthlyRevenue.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        amount: parseFloat(monthRedemptions?.total || '0'),
      });
    }

    return {
      totalWalletBalance: parseFloat(totalWalletBalance?.total || '0'),
      totalRedemptions: parseFloat(totalRedemptions?.total || '0'),
      monthlyRevenue,
    };
  }
}
