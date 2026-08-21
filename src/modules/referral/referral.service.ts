import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterboyRepository: Repository<CounterBoy>,
  ) {}

  private getReferralOwnersCte() {
    return `
      WITH owners AS (
        SELECT id::text, name, phone, "electricianCode" AS code, 'electrician' AS role, status::text, "joinedDate"
        FROM "electricians"
        UNION ALL
        SELECT id::text, name, phone, "dealerCode" AS code, 'dealer' AS role, status::text, "joinedDate"
        FROM "dealers"
        UNION ALL
        SELECT id::text, name, phone, "userCode" AS code, 'user' AS role, status::text, "joinedDate"
        FROM "app_users"
        UNION ALL
        SELECT id::text, name, phone, "counterboyCode" AS code, 'counterboy' AS role, status::text, "joinedDate"
        FROM "counterboys"
      ), reward_totals AS (
        SELECT
          "referrerUserId"::text AS id,
          "referrerRole"::text AS role,
          COUNT(*)::int AS "referredCount",
          COALESCE(SUM(points), 0) AS "bonusEarned",
          MAX("createdAt") AS "latestReferralAt"
        FROM "referral_rewards"
        GROUP BY "referrerUserId", "referrerRole"
      )`;
  }

  private async findRewardRows(
    page: number,
    limit: number,
    search?: string,
    status?: string,
    type?: string,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 20));
    const values: unknown[] = [];
    const where: string[] = [];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (search?.trim()) {
      const param = addValue(`%${search.trim()}%`);
      where.push(`(o.name ILIKE ${param} OR o.phone ILIKE ${param} OR o.code ILIKE ${param})`);
    }
    if (status && status !== 'all') {
      where.push(`o.status = ${addValue(status)}`);
    }
    if (type && type !== 'all') {
      const normalizedType = type === 'customer' ? 'user' : type;
      where.push(`o.role = ${addValue(normalizedType)}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitParam = addValue(safeLimit);
    const offsetParam = addValue((safePage - 1) * safeLimit);
    const rows = await this.electricianRepository.query(
      `${this.getReferralOwnersCte()}
       SELECT
         o.id,
         o.name AS "userName",
         o.phone,
         o.code AS "referralCode",
         CASE WHEN o.role = 'user' THEN 'customer' ELSE o.role END AS type,
         o.status,
         r."referredCount",
         r."bonusEarned",
         r."latestReferralAt",
         o."joinedDate"
       FROM reward_totals r
       JOIN owners o ON o.id = r.id AND o.role = r.role
       ${whereSql}
       ORDER BY r."latestReferralAt" DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    );

    const countValues = values.slice(0, values.length - 2);
    const countRows = await this.electricianRepository.query(
      `${this.getReferralOwnersCte()}
       SELECT COUNT(*)::int AS total
       FROM reward_totals r
       JOIN owners o ON o.id = r.id AND o.role = r.role
       ${whereSql}`,
      countValues,
    );
    const total = Number(countRows[0]?.total ?? 0);
    return { data: rows, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: string,
    type?: string,
  ) {
    return this.findRewardRows(page, limit, search, status, type);
  }

  async findOne(id: string) {
    // Try electrician first
    const electrician = await this.electricianRepository.findOne({ where: { id } });
    if (electrician) {
      return {
        id: electrician.id,
        userName: electrician.name,
        phone: electrician.phone,
        referralCode: electrician.electricianCode,
        type: 'electrician',
        tier: electrician.tier,
        status: electrician.status,
        totalPoints: electrician.totalPoints,
        walletBalance: electrician.walletBalance,
        totalScans: electrician.totalScans,
        totalRedemptions: electrician.totalRedemptions,
        joinedDate: electrician.joinedDate,
        city: electrician.city,
        state: electrician.state,
        email: electrician.email,
        upiId: electrician.upiId,
        bankLinked: electrician.bankLinked,
        dealerId: electrician.dealerId,
      };
    }

    // Try dealer
    const dealer = await this.dealerRepository.findOne({ where: { id } });
    if (dealer) {
      return {
        id: dealer.id,
        userName: dealer.name,
        phone: dealer.phone,
        referralCode: dealer.dealerCode,
        type: 'dealer',
        tier: dealer.tier,
        status: dealer.status,
        totalPoints: 0,
        walletBalance: dealer.walletBalance,
        totalScans: 0,
        totalRedemptions: 0,
        joinedDate: dealer.joinedDate,
        city: dealer.town,
        state: dealer.state,
        email: dealer.email,
        upiId: dealer.upiId,
        bankLinked: dealer.bankLinked,
        dealerId: null,
      };
    }

    // Try customer (app_user)
    const appUser = await this.appUserRepository.findOne({ where: { id } });
    if (appUser) {
      return {
        id: appUser.id,
        userName: appUser.name,
        phone: appUser.phone,
        referralCode: appUser.userCode,
        type: 'customer',
        tier: appUser.tier,
        status: appUser.status,
        totalPoints: appUser.totalPoints,
        walletBalance: appUser.walletBalance,
        totalScans: 0,
        totalRedemptions: appUser.totalRedemptions,
        joinedDate: appUser.joinedDate,
        city: appUser.city,
        state: appUser.state,
        email: appUser.email,
        upiId: appUser.upiId,
        bankLinked: appUser.bankLinked,
        dealerId: null,
      };
    }

    // Try counterboy
    const counterboy = await this.counterboyRepository.findOne({ where: { id } });
    if (counterboy) {
      return {
        id: counterboy.id,
        userName: counterboy.name,
        phone: counterboy.phone,
        referralCode: counterboy.counterboyCode,
        type: 'counterboy',
        tier: counterboy.tier,
        status: counterboy.status,
        totalPoints: counterboy.totalPoints,
        walletBalance: counterboy.walletBalance,
        totalScans: counterboy.totalScans,
        totalRedemptions: counterboy.totalRedemptions,
        joinedDate: counterboy.joinedDate,
        city: counterboy.city,
        state: counterboy.state,
        email: counterboy.email,
        upiId: counterboy.upiId,
        bankLinked: counterboy.bankLinked,
        dealerId: counterboy.dealerId,
      };
    }

    throw new NotFoundException('Referral record not found');
  }

  async update(id: string, updateData: any) {
    // Try electrician first
    const electrician = await this.electricianRepository.findOne({ where: { id } });
    if (electrician) {
      const allowed: any = {};
      if (updateData.status !== undefined) allowed.status = updateData.status;
      if (updateData.phone !== undefined) allowed.phone = updateData.phone;
      if (updateData.tier !== undefined) allowed.tier = updateData.tier;
      await this.electricianRepository.update(id, allowed);
      return this.findOne(id);
    }

    // Try dealer
    const dealer = await this.dealerRepository.findOne({ where: { id } });
    if (dealer) {
      const allowed: any = {};
      if (updateData.status !== undefined) allowed.status = updateData.status;
      if (updateData.phone !== undefined) allowed.phone = updateData.phone;
      if (updateData.tier !== undefined) allowed.tier = updateData.tier;
      await this.dealerRepository.update(id, allowed);
      return this.findOne(id);
    }

    // Try customer
    const appUser = await this.appUserRepository.findOne({ where: { id } });
    if (appUser) {
      const allowed: any = {};
      if (updateData.status !== undefined) allowed.status = updateData.status;
      if (updateData.phone !== undefined) allowed.phone = updateData.phone;
      if (updateData.tier !== undefined) allowed.tier = updateData.tier;
      await this.appUserRepository.update(id, allowed);
      return this.findOne(id);
    }

    // Try counterboy
    const counterboy = await this.counterboyRepository.findOne({ where: { id } });
    if (counterboy) {
      const allowed: any = {};
      if (updateData.status !== undefined) allowed.status = updateData.status;
      if (updateData.phone !== undefined) allowed.phone = updateData.phone;
      if (updateData.tier !== undefined) allowed.tier = updateData.tier;
      await this.counterboyRepository.update(id, allowed);
      return this.findOne(id);
    }

    throw new NotFoundException('Referral record not found');
  }

  async remove(id: string) {
    const electrician = await this.electricianRepository.findOne({ where: { id } });
    if (electrician) {
      await this.electricianRepository.remove(electrician);
      return { message: 'Referral record deleted successfully' };
    }

    const dealer = await this.dealerRepository.findOne({ where: { id } });
    if (dealer) {
      await this.dealerRepository.remove(dealer);
      return { message: 'Referral record deleted successfully' };
    }

    const appUser = await this.appUserRepository.findOne({ where: { id } });
    if (appUser) {
      await this.appUserRepository.remove(appUser);
      return { message: 'Referral record deleted successfully' };
    }

    const counterboy = await this.counterboyRepository.findOne({ where: { id } });
    if (counterboy) {
      await this.counterboyRepository.remove(counterboy);
      return { message: 'Referral record deleted successfully' };
    }

    throw new NotFoundException('Referral record not found');
  }

  async getStats() {
    const rows = await this.electricianRepository.query(
      `${this.getReferralOwnersCte()}
       SELECT
         COUNT(*)::int AS "totalReferrers",
         COALESCE(SUM(r."referredCount"), 0)::int AS "successfulReferrals",
         COALESCE(SUM(r."bonusEarned"), 0) AS "referrerBonusGiven"
       FROM reward_totals r
       JOIN owners o ON o.id = r.id AND o.role = r.role`,
    );
    const topReferrers = await this.electricianRepository.query(
      `${this.getReferralOwnersCte()}
       SELECT o.id, o.name, CASE WHEN o.role = 'user' THEN 'customer' ELSE o.role END AS type,
              o.code AS "referralCode", r."referredCount", r."bonusEarned"
       FROM reward_totals r
       JOIN owners o ON o.id = r.id AND o.role = r.role
       ORDER BY r."referredCount" DESC, r."latestReferralAt" DESC
       LIMIT 5`,
    );
    const summary = rows[0] ?? {};
    return {
      totalReferrals: Number(summary.successfulReferrals ?? 0),
      activeReferrals: Number(summary.totalReferrers ?? 0),
      bonusGiven: Number(summary.referrerBonusGiven ?? 0) * 2,
      topReferrers,
    };
  }
}
