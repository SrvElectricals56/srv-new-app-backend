import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { AppUser } from '../../database/entities/app-user.entity';
import { UserStatus } from '../../common/enums';

@Injectable()
export class AppUserService {
  constructor(
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
  ) {}

  private async generateUniqueUserCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = `CUST${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
      const exists = await this.appUserRepository.exists({ where: { userCode: code } });
      if (!exists) return code;
    }

    throw new BadRequestException('Unable to generate unique customer code');
  }

  async create(data: Partial<AppUser>) {
    if (!data.name?.trim() || !data.phone?.trim()) {
      throw new BadRequestException('Name and phone are required');
    }

    const phone = data.phone.trim();
    const email = data.email?.trim() || null;

    const existingPhone = await this.appUserRepository.exists({ where: { phone } });
    if (existingPhone) {
      throw new BadRequestException('Phone number already exists');
    }

    if (email) {
      const existingEmail = await this.appUserRepository.exists({ where: { email } });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    const payload: Partial<AppUser> = {
      ...data,
      name: data.name.trim(),
      phone,
      email,
      userCode: await this.generateUniqueUserCode(),
      tier: (data.tier ?? 'Silver') as AppUser['tier'],
      status: data.status ?? UserStatus.PENDING,
      kycStatus: (data.kycStatus ?? 'not_submitted') as AppUser['kycStatus'],
      totalPoints: Number(data.totalPoints ?? 0),
      walletBalance: Number(data.walletBalance ?? 0),
      totalRedemptions: Number(data.totalRedemptions ?? 0),
      bankLinked: Boolean(data.bankLinked),
    };

    const entity = this.appUserRepository.create(payload);

    const saved = await this.appUserRepository.save(entity);
    return this.findOne(saved.id);
  }

  async findAll(page = 1, limit = 20, search?: string, status?: string) {
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

    const [data, total] = await query
      .orderBy('u.joinedDate', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.appUserRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.findOne(id);
    await this.appUserRepository.update(id, { status });
    return this.findOne(id);
  }

  async update(id: string, data: Partial<AppUser>) {
    await this.findOne(id);
    await this.appUserRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    const user = await this.findOne(id);
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
}
