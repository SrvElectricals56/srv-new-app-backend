import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { UserStatus } from '../../common/enums';

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

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: string,
    type?: string,
  ) {
    const skip = (page - 1) * limit;

    const electricianQb = this.electricianRepository.createQueryBuilder('e');
    const dealerQb = this.dealerRepository.createQueryBuilder('d');
    const appUserQb = this.appUserRepository.createQueryBuilder('u');
    const counterboyQb = this.counterboyRepository.createQueryBuilder('c');

    if (search) {
      electricianQb.andWhere(
        '(e.name ILIKE :s OR e.phone ILIKE :s OR e.electricianCode ILIKE :s)',
        { s: `%${search}%` },
      );
      dealerQb.andWhere(
        '(d.name ILIKE :s OR d.phone ILIKE :s OR d.dealerCode ILIKE :s)',
        { s: `%${search}%` },
      );
      appUserQb.andWhere(
        '(u.name ILIKE :s OR u.phone ILIKE :s OR u.userCode ILIKE :s)',
        { s: `%${search}%` },
      );
      counterboyQb.andWhere(
        '(c.name ILIKE :s OR c.phone ILIKE :s OR c.counterboyCode ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (status && status !== 'all') {
      electricianQb.andWhere('e.status = :status', { status });
      dealerQb.andWhere('d.status = :status', { status });
      appUserQb.andWhere('u.status = :status', { status });
      counterboyQb.andWhere('c.status = :status', { status });
    }

    let electricians: Electrician[] = [];
    let dealers: Dealer[] = [];
    let appUsers: AppUser[] = [];
    let counterboys: CounterBoy[] = [];

    if (!type || type === 'all' || type === 'electrician') {
      electricians = await electricianQb.getMany();
    }
    if (!type || type === 'all' || type === 'dealer') {
      dealers = await dealerQb.getMany();
    }
    if (!type || type === 'all' || type === 'customer') {
      appUsers = await appUserQb.getMany();
    }
    if (!type || type === 'all' || type === 'counterboy') {
      counterboys = await counterboyQb.getMany();
    }

    // Map to unified referral records
    const elecRecords = electricians.map((e) => ({
      id: e.id,
      userName: e.name,
      phone: e.phone,
      referralCode: e.electricianCode,
      type: 'electrician',
      tier: e.tier,
      status: e.status,
      totalPoints: e.totalPoints,
      walletBalance: e.walletBalance,
      totalScans: e.totalScans,
      totalRedemptions: e.totalRedemptions,
      joinedDate: e.joinedDate,
      city: e.city,
      state: e.state,
      dealerId: e.dealerId,
    }));

    const dealerRecords = dealers.map((d) => ({
      id: d.id,
      userName: d.name,
      phone: d.phone,
      referralCode: d.dealerCode,
      type: 'dealer',
      tier: d.tier,
      status: d.status,
      totalPoints: 0,
      walletBalance: d.walletBalance,
      totalScans: 0,
      totalRedemptions: 0,
      joinedDate: d.joinedDate,
      city: d.town,
      state: d.state,
      dealerId: null,
    }));

    const customerRecords = appUsers.map((u) => ({
      id: u.id,
      userName: u.name,
      phone: u.phone,
      referralCode: u.userCode,
      type: 'customer',
      tier: u.tier,
      status: u.status,
      totalPoints: u.totalPoints,
      walletBalance: u.walletBalance,
      totalScans: 0,
      totalRedemptions: u.totalRedemptions,
      joinedDate: u.joinedDate,
      city: u.city,
      state: u.state,
      dealerId: null,
    }));

    const counterboyRecords = counterboys.map((c) => ({
      id: c.id,
      userName: c.name,
      phone: c.phone,
      referralCode: c.counterboyCode,
      type: 'counterboy',
      tier: c.tier,
      status: c.status,
      totalPoints: c.totalPoints,
      walletBalance: c.walletBalance,
      totalScans: c.totalScans,
      totalRedemptions: c.totalRedemptions,
      joinedDate: c.joinedDate,
      city: c.city,
      state: c.state,
      dealerId: c.dealerId,
    }));

    const all = [...elecRecords, ...dealerRecords, ...customerRecords, ...counterboyRecords].sort(
      (a, b) => new Date(b.joinedDate).getTime() - new Date(a.joinedDate).getTime(),
    );

    const total = all.length;
    const data = all.slice(skip, skip + limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
    const [totalElectricians, totalDealers, totalCustomers, totalCounterboys] = await Promise.all([
      this.electricianRepository.count(),
      this.dealerRepository.count(),
      this.appUserRepository.count(),
      this.counterboyRepository.count(),
    ]);

    const [activeElectricians, activeDealers, activeCustomers, activeCounterboys] = await Promise.all([
      this.electricianRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.dealerRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.appUserRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.counterboyRepository.count({ where: { status: UserStatus.ACTIVE } }),
    ]);

    const topElectricians = await this.electricianRepository.find({
      order: { totalPoints: 'DESC' },
      take: 5,
    });

    return {
      totalReferrals: totalElectricians + totalDealers + totalCustomers + totalCounterboys,
      activeReferrals: activeElectricians + activeDealers + activeCustomers + activeCounterboys,
      totalElectricians,
      totalDealers,
      totalCustomers,
      totalCounterboys,
      topReferrers: topElectricians.map((e) => ({
        id: e.id,
        name: e.name,
        type: 'electrician',
        referralCode: e.electricianCode,
        totalPoints: e.totalPoints,
        totalScans: e.totalScans,
      })),
    };
  }
}
