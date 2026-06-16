import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { UserStatus } from '../../common/enums';
import { CrossRolePhoneService } from '../../common/services/cross-role-phone.service';

@Injectable()
export class CounterBoyService {
  private appInstallColumnsEnsured = false;

  constructor(
    @InjectRepository(CounterBoy)
    private counterboyRepository: Repository<CounterBoy>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    private readonly crossRolePhoneService: CrossRolePhoneService,
  ) {}

  private async ensureAppInstallColumns() {
    if (this.appInstallColumnsEnsured) return;
    await this.counterboyRepository.query(`
      ALTER TABLE "counterboys"
      ADD COLUMN IF NOT EXISTS "appInstalled" boolean NOT NULL DEFAULT false
    `);
    await this.counterboyRepository.query(`
      ALTER TABLE "counterboys"
      ADD COLUMN IF NOT EXISTS "firstAppLoginAt" timestamptz
    `);
    this.appInstallColumnsEnsured = true;
  }

  private async generateUniqueCounterBoyCode() {
    const prefix = `CB${String(Date.now()).slice(-6)}`;

    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const code = `${prefix}-${Math.floor(Math.random() * 900 + 100)}`;
      const exists = await this.counterboyRepository.exists({ where: { counterboyCode: code } });
      if (!exists) return code;
    }

    throw new BadRequestException('Unable to generate unique counter boy code');
  }

  private normalizeRequestedCode(code?: string | null) {
    const normalized = code?.trim();
    return normalized ? normalized : null;
  }

  private async ensureUniqueCounterBoyCode(code: string, excludeId?: string) {
    const existing = await this.counterboyRepository.findOne({ where: { counterboyCode: code } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('Counter boy code already exists');
    }
  }

  private async hashPassword(password?: string) {
    const trimmed = password?.trim();
    if (!trimmed) return null;
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(trimmed, salt);
  }

  private serialize(counterboy: CounterBoy, dealer?: Partial<Dealer> | null) {
    const { passwordHash, ...rest } = counterboy;
    return {
      ...rest,
      dealerName: dealer?.name ?? null,
      dealerPhone: dealer?.phone ?? null,
      dealerCode: dealer?.dealerCode ?? null,
      appInstalled: Boolean(counterboy.appInstalled),
      firstAppLoginAt: counterboy.firstAppLoginAt ?? null,
      hasPassword: Boolean(passwordHash),
    };
  }

  private async findOnePlain(id: string) {
    await this.ensureAppInstallColumns();
    const cb = await this.counterboyRepository.findOne({ where: { id } });
    if (!cb) throw new NotFoundException('Counter boy not found');
    return cb;
  }

  private normalizeLocationValues(values: Array<string | null | undefined>) {
    return Array.from(
      new Set(
        values
          .map((value) => String(value ?? '').trim())
          .filter((value) => value !== '' && value !== '?'),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  async importMany(records: any[]) {
    await this.ensureAppInstallColumns();
    let created = 0, updated = 0, failed = 0, errors: string[] = [];

    for (const record of records) {
      try {
        if (!record.name?.trim() || !record.phone?.trim()) {
          failed++;
          errors.push(`Row missing name or phone: ${JSON.stringify(record)}`);
          continue;
        }

        const rawPhone = String(record.phone).trim();
        const phone = rawPhone.replace(/\D/g, '').slice(0, 10);
        if (!phone || phone.length < 10) {
          failed++;
          errors.push(`Invalid phone number: ${rawPhone}`);
          continue;
        }

        record.phone = phone;
        let existing = await this.counterboyRepository.findOne({ where: { phone } });

        if (existing) {
          const { id, password, ...updateData } = record;
          const payload = { ...updateData } as Partial<CounterBoy> & { password?: string };
          delete payload.password;
          const passwordHash = await this.hashPassword(record.password);
          if (passwordHash) payload.passwordHash = passwordHash;
          await this.counterboyRepository.update(existing.id, payload);
          updated++;
        } else {
          await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, 'counterboy');
          const data: any = { ...record };

          if (!data.counterboyCode) {
            data.counterboyCode = await this.generateUniqueCounterBoyCode();
          }

          const passwordHash = await this.hashPassword(data.password);
          const payload: Partial<CounterBoy> = {
            name: data.name.trim(),
            phone,
            email: data.email?.trim() || null,
            counterboyCode: data.counterboyCode,
            dealerId: null,
            city: data.city || null,
            state: data.state || null,
            district: data.district || null,
            tier: data.tier ?? 'Silver',
            status: data.status ?? UserStatus.ACTIVE,
            kycStatus: data.kycStatus ?? 'not_submitted',
            totalScans: Number(data.totalScans ?? 0),
            totalPoints: Number(data.totalPoints ?? 0),
            walletBalance: Number(data.walletBalance ?? 0),
            totalRedemptions: Number(data.totalRedemptions ?? 0),
            bankLinked: Boolean(data.bankLinked),
            passwordHash: passwordHash ?? undefined,
          };
          const entity = this.counterboyRepository.create(payload);
          await this.counterboyRepository.save(entity);
          created++;
        }
      } catch (err: any) {
        failed++;
        errors.push(`Row ${record.name ?? record.phone}: ${err.message}`);
      }
    }

    return { created, updated, failed, errors: errors.slice(0, 20), total: records.length };
  }

  async findAll(page = 1, limit = 20, search?: string, status?: string, state?: string, city?: string, appInstalled?: boolean) {
    await this.ensureAppInstallColumns();
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
    if (state) {
      query.andWhere('cb.state = :state', { state });
    }
    if (city) {
      query.andWhere('cb.city = :city', { city });
    }
    if (appInstalled !== undefined) {
      query.andWhere('cb.appInstalled = :appInstalled', { appInstalled });
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
    await this.ensureAppInstallColumns();
    if (!data.name?.trim() || !data.phone?.trim()) {
      throw new BadRequestException('Name and phone are required');
    }

    const phone = data.phone.trim();
    const email = data.email?.trim() || null;

    await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, 'counterboy');

    if (email) {
      const existingEmail = await this.counterboyRepository.exists({ where: { email } });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    const passwordHash = await this.hashPassword((data as Partial<CounterBoy> & { password?: string }).password);
    const requestedCode = this.normalizeRequestedCode(data.counterboyCode);

    if (requestedCode) {
      await this.ensureUniqueCounterBoyCode(requestedCode);
    }

    const payload: Partial<CounterBoy> = {
      ...data,
      name: data.name.trim(),
      phone,
      email,
      dealerId: null,
      counterboyCode: requestedCode ?? await this.generateUniqueCounterBoyCode(),
      tier: (data.tier ?? 'Silver') as CounterBoy['tier'],
      status: data.status ?? UserStatus.ACTIVE,
      kycStatus: (data.kycStatus ?? 'not_submitted') as CounterBoy['kycStatus'],
      totalScans: Number(data.totalScans ?? 0),
      totalPoints: Number(data.totalPoints ?? 0),
      walletBalance: Number(data.walletBalance ?? 0),
      totalRedemptions: Number(data.totalRedemptions ?? 0),
      bankLinked: Boolean(data.bankLinked),
      passwordHash: passwordHash ?? undefined,
    };

    delete (payload as Partial<CounterBoy> & { password?: string }).password;

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
    const existing = await this.findOnePlain(id);

    if (data.phone?.trim() && data.phone.trim() !== existing.phone) {
      await this.crossRolePhoneService.assertPhoneAvailableForRole(data.phone.trim(), 'counterboy', {
        role: 'counterboy',
        id,
      });
    }

    const passwordHash = await this.hashPassword((data as Partial<CounterBoy> & { password?: string }).password);
    const payload = { ...data } as Partial<CounterBoy> & { password?: string };
    const requestedCode = this.normalizeRequestedCode(payload.counterboyCode);
    payload.dealerId = null;
    delete payload.password;
    if (Object.prototype.hasOwnProperty.call(payload, 'counterboyCode')) {
      if (requestedCode) {
        await this.ensureUniqueCounterBoyCode(requestedCode, id);
        payload.counterboyCode = requestedCode;
      } else {
        delete payload.counterboyCode;
      }
    }
    if (passwordHash) {
      payload.passwordHash = passwordHash;
      await this.counterboyRepository.update(id, payload);
      await this.counterboyRepository.increment({ id }, 'tokenVersion', 1);
    } else {
      await this.counterboyRepository.update(id, payload);
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const cb = await this.findOnePlain(id);
    await this.counterboyRepository.remove(cb);
    return { deleted: true };
  }

  async getStats() {
    const row = await this.counterboyRepository
      .createQueryBuilder('cb')
      .select('COUNT(*)::int', 'total')
      .addSelect('COUNT(*) FILTER (WHERE cb.status = :active)::int', 'active')
      .addSelect('COUNT(*) FILTER (WHERE cb.status = :pending)::int', 'pending')
      .addSelect('COUNT(*) FILTER (WHERE cb.status = :inactive)::int', 'inactive')
      .setParameters({
        active: UserStatus.ACTIVE,
        pending: UserStatus.PENDING,
        inactive: UserStatus.INACTIVE,
      })
      .getRawOne();

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      pending: Number(row?.pending ?? 0),
      inactive: Number(row?.inactive ?? 0),
    };
  }

  async getDistinctStates(): Promise<{ states: string[] }> {
    const rows = await this.counterboyRepository
      .createQueryBuilder('cb')
      .select('DISTINCT cb.state', 'state')
      .where('cb.state IS NOT NULL')
      .andWhere(`TRIM(cb.state) <> ''`)
      .orderBy('cb.state', 'ASC')
      .getRawMany();
    return { states: this.normalizeLocationValues(rows.map(r => r.state)) };
  }

  async getDistinctCities(state?: string): Promise<{ cities: string[] }> {
    const query = this.counterboyRepository
      .createQueryBuilder('cb')
      .select('DISTINCT cb.city', 'city')
      .where('cb.city IS NOT NULL')
      .andWhere(`TRIM(cb.city) <> ''`);
    if (state) {
      query.andWhere('cb.state = :state', { state });
    }
    const rows = await query.orderBy('cb.city', 'ASC').getRawMany();
    return { cities: this.normalizeLocationValues(rows.map(r => r.city)) };
  }
}
