import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppUser } from '../../database/entities/app-user.entity';
import { UserStatus } from '../../common/enums';
import { CrossRolePhoneService } from '../../common/services/cross-role-phone.service';

@Injectable()
export class AppUserService {
  constructor(
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    private readonly crossRolePhoneService: CrossRolePhoneService,
  ) {}

  private async generateUniqueUserCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = `CUST${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
      const exists = await this.appUserRepository.exists({ where: { userCode: code } });
      if (!exists) return code;
    }

    throw new BadRequestException('Unable to generate unique customer code');
  }

  private normalizeRequestedCode(code?: string | null) {
    const normalized = code?.trim();
    return normalized ? normalized : null;
  }

  private async ensureUniqueUserCode(code: string, excludeId?: string) {
    const existing = await this.appUserRepository.findOne({ where: { userCode: code } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('Customer code already exists');
    }
  }

  private async hashPassword(password?: string) {
    const trimmed = password?.trim();
    if (!trimmed) return null;
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(trimmed, salt);
  }

  private serialize(user: AppUser) {
    const { passwordHash, ...rest } = user;
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
    };
  }

  private async findOnePlain(id: string) {
    const user = await this.appUserRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: Partial<AppUser>) {
    if (!data.name?.trim() || !data.phone?.trim()) {
      throw new BadRequestException('Name and phone are required');
    }

    const phone = data.phone.trim();
    const email = data.email?.trim() || null;

    await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, 'user');

    if (email) {
      const existingEmail = await this.appUserRepository.exists({ where: { email } });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    const passwordHash = await this.hashPassword((data as Partial<AppUser> & { password?: string }).password);
    const requestedCode = this.normalizeRequestedCode(data.userCode);

    if (requestedCode) {
      await this.ensureUniqueUserCode(requestedCode);
    }

    const payload: Partial<AppUser> = {
      ...data,
      name: data.name.trim(),
      phone,
      email,
      userCode: requestedCode ?? await this.generateUniqueUserCode(),
      tier: (data.tier ?? 'Silver') as AppUser['tier'],
      status: data.status ?? UserStatus.ACTIVE,
      kycStatus: (data.kycStatus ?? 'not_submitted') as AppUser['kycStatus'],
      totalPoints: Number(data.totalPoints ?? 0),
      walletBalance: Number(data.walletBalance ?? 0),
      totalRedemptions: Number(data.totalRedemptions ?? 0),
      bankLinked: Boolean(data.bankLinked),
      passwordHash: passwordHash ?? undefined,
    };

    delete (payload as Partial<AppUser> & { password?: string }).password;

    const entity = this.appUserRepository.create(payload);

    const saved = await this.appUserRepository.save(entity);
    return this.findOne(saved.id);
  }

  async importMany(records: any[]) {
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
        let existing = await this.appUserRepository.findOne({ where: { phone } });

        if (existing) {
          const { id, password, ...updateData } = record;
          const payload = { ...updateData } as Partial<AppUser> & { password?: string };
          delete payload.password;
          const passwordHash = await this.hashPassword(record.password);
          if (passwordHash) payload.passwordHash = passwordHash;
          await this.appUserRepository.update(existing.id, payload);
          updated++;
        } else {
          await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, 'user');
          const data: any = { ...record };
          if (!data.userCode) data.userCode = await this.generateUniqueUserCode();
          const passwordHash = await this.hashPassword(data.password);
          const payload: Partial<AppUser> = {
            name: data.name.trim(),
            phone,
            email: data.email?.trim() || null,
            userCode: data.userCode,
            city: data.city || null,
            state: data.state || null,
            district: data.district || null,
            tier: data.tier ?? 'Silver',
            status: data.status ?? UserStatus.ACTIVE,
            kycStatus: data.kycStatus ?? 'not_submitted',
            totalPoints: Number(data.totalPoints ?? 0),
            walletBalance: Number(data.walletBalance ?? 0),
            totalRedemptions: Number(data.totalRedemptions ?? 0),
            bankLinked: Boolean(data.bankLinked),
            passwordHash: passwordHash ?? undefined,
          };
          const entity = this.appUserRepository.create(payload);
          await this.appUserRepository.save(entity);
          created++;
        }
      } catch (err: any) {
        failed++;
        errors.push(`Row ${record.name ?? record.phone}: ${err.message}`);
      }
    }

    return { created, updated, failed, errors: errors.slice(0, 20), total: records.length };
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

  async findAll(page = 1, limit = 20, search?: string, status?: string, state?: string, city?: string) {
    const skip = (page - 1) * limit;
    const where: any[] = [];

    if (search) {
      where.push(
        { name: Like(`%${search}%`) },
        { phone: Like(`%${search}%`) },
        { userCode: Like(`%${search}%`) },
        { email: Like(`%${search}%`) },
      );
    }

    const query = this.appUserRepository.createQueryBuilder('u');
    if (search) {
      query.where(
        'u.name ILIKE :s OR u.phone ILIKE :s OR u.userCode ILIKE :s OR u.email ILIKE :s',
        { s: `%${search}%` },
      );
    }
    if (status) {
      query.andWhere('u.status = :status', { status });
    }
    if (state) {
      query.andWhere('u.state = :state', { state });
    }
    if (city) {
      query.andWhere('u.city = :city', { city });
    }

    const [data, total] = await query
      .orderBy('u.joinedDate', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data: data.map((user) => this.serialize(user)), total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.findOnePlain(id);
    return this.serialize(user);
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.findOnePlain(id);
    await this.appUserRepository.update(id, { status });
    return this.findOne(id);
  }

  async update(id: string, data: Partial<AppUser>) {
    const existing = await this.findOnePlain(id);

    if (data.phone?.trim() && data.phone.trim() !== existing.phone) {
      await this.crossRolePhoneService.assertPhoneAvailableForRole(data.phone.trim(), 'user', {
        role: 'user',
        id,
      });
    }

    const passwordHash = await this.hashPassword((data as Partial<AppUser> & { password?: string }).password);
    const payload = { ...data } as Partial<AppUser> & { password?: string };
    const requestedCode = this.normalizeRequestedCode(payload.userCode);
    delete payload.password;
    if (Object.prototype.hasOwnProperty.call(payload, 'userCode')) {
      if (requestedCode) {
        await this.ensureUniqueUserCode(requestedCode, id);
        payload.userCode = requestedCode;
      } else {
        delete payload.userCode;
      }
    }
    if (passwordHash) {
      payload.passwordHash = passwordHash;
      await this.appUserRepository.update(id, payload);
      await this.appUserRepository.increment({ id }, 'tokenVersion', 1);
    } else {
      await this.appUserRepository.update(id, payload);
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const user = await this.findOnePlain(id);
    await this.appUserRepository.remove(user);
    return { deleted: true };
  }

  async getStats() {
    const total = await this.appUserRepository.count();
    const active = await this.appUserRepository.count({ where: { status: UserStatus.ACTIVE } });
    const pending = await this.appUserRepository.count({ where: { status: UserStatus.PENDING } });
    const inactive = await this.appUserRepository.count({ where: { status: UserStatus.INACTIVE } });
    return { total, active, pending, inactive };
  }

  async getDistinctStates(): Promise<{ states: string[] }> {
    const rows = await this.appUserRepository
      .createQueryBuilder('u')
      .select('DISTINCT u.state', 'state')
      .where('u.state IS NOT NULL')
      .andWhere(`TRIM(u.state) <> ''`)
      .orderBy('u.state', 'ASC')
      .getRawMany();
    return { states: this.normalizeLocationValues(rows.map(r => r.state)) };
  }

  async getDistinctCities(state?: string): Promise<{ cities: string[] }> {
    const query = this.appUserRepository
      .createQueryBuilder('u')
      .select('DISTINCT u.city', 'city')
      .where('u.city IS NOT NULL')
      .andWhere(`TRIM(u.city) <> ''`);
    if (state) {
      query.andWhere('u.state = :state', { state });
    }
    const rows = await query.orderBy('u.city', 'ASC').getRawMany();
    return { cities: this.normalizeLocationValues(rows.map(r => r.city)) };
  }
}
