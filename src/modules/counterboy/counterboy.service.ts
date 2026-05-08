import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { UserStatus } from '../../common/enums';

@Injectable()
export class CounterBoyService {
  constructor(
    @InjectRepository(CounterBoy)
    private counterboyRepository: Repository<CounterBoy>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
  ) {}

  private async generateUniqueCounterBoyCode(dealer?: Partial<Dealer> | null) {
    const prefix = dealer?.dealerCode?.trim()
      ? dealer.dealerCode.trim()
      : `CB${String(Date.now()).slice(-6)}`;

    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const code = dealer?.dealerCode?.trim()
        ? `${prefix}-${String(attempt).padStart(3, '0')}`
        : `${prefix}-${Math.floor(Math.random() * 900 + 100)}`;
      const exists = await this.counterboyRepository.exists({ where: { counterboyCode: code } });
      if (!exists) return code;
    }

    throw new BadRequestException('Unable to generate unique counter boy code');
  }

  private serialize(counterboy: CounterBoy, dealer?: Partial<Dealer> | null) {
    return {
      ...counterboy,
      dealerName: dealer?.name ?? null,
      dealerPhone: dealer?.phone ?? null,
      dealerCode: dealer?.dealerCode ?? null,
    };
  }

  private async findOnePlain(id: string) {
    const cb = await this.counterboyRepository.findOne({ where: { id } });
    if (!cb) throw new NotFoundException('Counter boy not found');
    return cb;
  }

  async findAll(page = 1, limit = 20, search?: string, status?: string) {
    const skip = (page - 1) * limit;

    const query = this.counterboyRepository
      .createQueryBuilder('cb')
      .leftJoin(Dealer, 'dealer', 'dealer.id::text = cb."dealerId"::text')
      .addSelect('dealer.name', 'dealer_name')
      .addSelect('dealer.phone', 'dealer_phone')
      .addSelect('dealer.dealerCode', 'dealer_code');

    if (search) {
      query.where(
        'cb.name ILIKE :s OR cb.phone ILIKE :s OR cb.counterboyCode ILIKE :s OR cb.email ILIKE :s',
        { s: `%${search}%` },
      );
    }
    if (status) {
      query.andWhere('cb.status = :status', { status });
    }

    const total = await query.clone().getCount();

    const { entities, raw } = await query
      .orderBy('cb.joinedDate', 'DESC')
      .skip(skip)
      .take(limit)
      .getRawAndEntities();

    return {
      data: entities.map((item, index) => this.serialize(item, {
        name: raw[index]?.dealer_name ?? null,
        phone: raw[index]?.dealer_phone ?? null,
        dealerCode: raw[index]?.dealer_code ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const cb = await this.findOnePlain(id);
    let dealer: Partial<Dealer> | null = null;

    if (cb.dealerId) {
      dealer = await this.dealerRepository
        .createQueryBuilder('dealer')
        .select(['dealer.name as name', 'dealer.phone as phone', 'dealer.dealerCode as "dealerCode"'])
        .where('dealer.id::text = :dealerId', { dealerId: String(cb.dealerId) })
        .getRawOne();
    }

    return this.serialize(cb, dealer);
  }

  async create(data: Partial<CounterBoy>) {
    if (!data.name?.trim() || !data.phone?.trim()) {
      throw new BadRequestException('Name and phone are required');
    }

    const phone = data.phone.trim();
    const email = data.email?.trim() || null;

    const existingPhone = await this.counterboyRepository.exists({ where: { phone } });
    if (existingPhone) {
      throw new BadRequestException('Phone number already exists');
    }

    if (email) {
      const existingEmail = await this.counterboyRepository.exists({ where: { email } });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    let dealer: Dealer | null = null;
    if (data.dealerId) {
      dealer = await this.dealerRepository.findOne({ where: { id: String(data.dealerId) } });
      if (!dealer) {
        throw new BadRequestException('Selected dealer was not found');
      }
    }

    const payload: Partial<CounterBoy> = {
      ...data,
      name: data.name.trim(),
      phone,
      email,
      dealerId: data.dealerId ? String(data.dealerId) : undefined,
      counterboyCode: await this.generateUniqueCounterBoyCode(dealer),
      tier: (data.tier ?? 'Silver') as CounterBoy['tier'],
      status: data.status ?? UserStatus.PENDING,
      kycStatus: (data.kycStatus ?? 'not_submitted') as CounterBoy['kycStatus'],
      totalScans: Number(data.totalScans ?? 0),
      totalPoints: Number(data.totalPoints ?? 0),
      walletBalance: Number(data.walletBalance ?? 0),
      totalRedemptions: Number(data.totalRedemptions ?? 0),
      bankLinked: Boolean(data.bankLinked),
    };

    const entity = this.counterboyRepository.create(payload);

    const saved = await this.counterboyRepository.save(entity);
    return this.findOne(saved.id);
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.findOnePlain(id);
    await this.counterboyRepository.update(id, { status });
    return this.findOne(id);
  }

  async update(id: string, data: Partial<CounterBoy>) {
    await this.findOnePlain(id);
    await this.counterboyRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    const cb = await this.findOnePlain(id);
    await this.counterboyRepository.remove(cb);
    return { deleted: true };
  }

  async getStats() {
    const total = await this.counterboyRepository.count();
    const active = await this.counterboyRepository.count({ where: { status: UserStatus.ACTIVE } });
    const pending = await this.counterboyRepository.count({ where: { status: UserStatus.PENDING } });
    const inactive = await this.counterboyRepository.count({ where: { status: UserStatus.INACTIVE } });
    return { total, active, pending, inactive };
  }
}
