import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateElectricianDto } from './dto/create-electrician.dto';
import { UpdateElectricianDto } from './dto/update-electrician.dto';
import { Electrician } from '../../database/entities/electrician.entity';
import { Scan } from '../../database/entities/scan.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { UserStatus, MemberTier } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';

@Injectable()
export class ElectricianService {
  constructor(
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Scan)
    private scanRepository: Repository<Scan>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private readonly tierService: TierService,
  ) {}

  async create(createElectricianDto: CreateElectricianDto) {
    const existingElectrician = await this.electricianRepository.findOne({
      where: [
        { phone: createElectricianDto.phone },
        { electricianCode: createElectricianDto.electricianCode },
      ],
    });

    if (existingElectrician) {
      throw new ConflictException('Electrician with this phone or code already exists');
    }

    const data: any = { ...createElectricianDto };
    if (!data.dealerId || data.dealerId.trim() === '') {
      data.dealerId = null;
    }

    // Set initial tier based on points (if provided)
    const points = Number(data.totalPoints ?? 0);
    data.tier = this.tierService.calculateElectricianTier(points);

    const electrician = this.electricianRepository.create(data);
    const saved = (await this.electricianRepository.save(electrician as any)) as unknown as Electrician;

    // If linked to a dealer, sync dealer's tier
    if (saved.dealerId) {
      await this.tierService.syncDealerTier(saved.dealerId);
    }

    return saved;
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: UserStatus,
    tier?: MemberTier,
    state?: string,
    dealerId?: string,
    subCategory?: string,
    bankLinked?: boolean,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.electricianRepository
      .createQueryBuilder('electrician')
      .leftJoinAndSelect('electrician.dealer', 'dealer');

    if (search) {
      queryBuilder.andWhere(
        '(electrician.name ILIKE :search OR electrician.phone ILIKE :search OR electrician.city ILIKE :search OR electrician.electricianCode ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (status) {
      queryBuilder.andWhere('electrician.status = :status', { status });
    }

    if (tier) {
      queryBuilder.andWhere('electrician.tier = :tier', { tier });
    }

    if (state) {
      queryBuilder.andWhere('electrician.state = :state', { state });
    }

    if (dealerId) {
      queryBuilder.andWhere('electrician.dealerId = :dealerId', { dealerId });
    }

    if (subCategory) {
      queryBuilder.andWhere('electrician.subCategory = :subCategory', { subCategory });
    }

    if (bankLinked !== undefined) {
      queryBuilder.andWhere('electrician.bankLinked = :bankLinked', { bankLinked });
    }

    if (dateFrom) {
      queryBuilder.andWhere('electrician.joinedDate >= :dateFrom', { dateFrom: new Date(dateFrom) });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('electrician.joinedDate <= :dateTo', { dateTo: to });
    }

    queryBuilder
      .orderBy('electrician.joinedDate', 'DESC')
      .skip(skip)
      .take(limit);

    const [rawData, total] = await queryBuilder.getManyAndCount();

    const data = rawData.map(e => ({
      ...e,
      dealerName: (e as any).dealer?.name ?? null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const electrician = await this.electricianRepository.findOne({
      where: { id },
      relations: ['dealer'],
    });

    if (!electrician) {
      throw new NotFoundException('Electrician not found');
    }

    return electrician;
  }

  async update(id: string, updateElectricianDto: UpdateElectricianDto) {
    const electrician = await this.findOne(id);

    if (updateElectricianDto.phone && updateElectricianDto.phone !== electrician.phone) {
      const existingElectrician = await this.electricianRepository.findOne({
        where: { phone: updateElectricianDto.phone },
      });
      if (existingElectrician) {
        throw new ConflictException('Electrician with this phone already exists');
      }
    }

    const data: any = { ...updateElectricianDto };
    if (data.dealerId !== undefined && (!data.dealerId || data.dealerId.trim() === '')) {
      data.dealerId = null;
    }

    // Auto-recalculate tier when totalPoints changes — ignore any manually passed tier
    if (data.totalPoints !== undefined) {
      const points = Number(data.totalPoints);
      data.tier = this.tierService.calculateElectricianTier(points);
      if (data.walletBalance === undefined) {
        data.walletBalance = points;
      }
    } else if (data.walletBalance !== undefined) {
      // walletBalance changed but totalPoints not — sync totalPoints too
      data.totalPoints = Number(data.walletBalance);
      data.tier = this.tierService.calculateElectricianTier(data.totalPoints);
    }

    const oldDealerId = electrician.dealerId;
    await this.electricianRepository.update(id, data);

    // Sync dealer tier if dealer assignment changed
    const newDealerId = data.dealerId !== undefined ? data.dealerId : oldDealerId;
    if (oldDealerId !== newDealerId) {
      if (oldDealerId) await this.tierService.syncDealerTier(oldDealerId);
      if (newDealerId) await this.tierService.syncDealerTier(newDealerId);
    } else if (newDealerId) {
      await this.tierService.syncDealerTier(newDealerId);
    }

    return this.findOne(id);
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.electricianRepository.update(id, { status });
    return this.findOne(id);
  }

  async remove(id: string) {
    const electrician = await this.findOne(id);
    const dealerId = electrician.dealerId;

    await this.electricianRepository.remove(electrician);

    // Sync dealer tier after removal
    if (dealerId) {
      await this.tierService.syncDealerTier(dealerId);
    }

    return { message: 'Electrician deleted successfully' };
  }

  async getElectricianScans(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.scanRepository.findAndCount({
      where: { userId: id },
      skip,
      take: limit,
      order: { scannedAt: 'DESC' },
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getElectricianWallet(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.walletRepository.findAndCount({
      where: { userId: id },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
        let existing = await this.electricianRepository.findOne({ where: { phone } });

        if (existing) {
          const { id, joinedDate, ...updateData } = record;
          if (updateData.totalPoints !== undefined) {
            const points = Number(updateData.totalPoints);
            updateData.tier = this.tierService.calculateElectricianTier(points);
          }
          await this.electricianRepository.update(existing.id, updateData);
          updated++;
        } else {
          const data: any = { ...record };
          if (!data.electricianCode) {
            data.electricianCode = `ELEC${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
          }
          if (!data.dealerId || data.dealerId.trim() === '') data.dealerId = null;
          const points = Number(data.totalPoints ?? 0);
          data.tier = this.tierService.calculateElectricianTier(points);
          const entity = this.electricianRepository.create(data);
          await this.electricianRepository.save(entity as any);
          if (data.dealerId) await this.tierService.syncDealerTier(data.dealerId);
          created++;
        }
      } catch (err: any) {
        failed++;
        errors.push(`Row ${record.name ?? record.phone}: ${err.message}`);
      }
    }

    return { created, updated, failed, errors: errors.slice(0, 20), total: records.length };
  }

  async getDistinctStates(): Promise<{ states: string[] }> {
    const rows = await this.electricianRepository
      .createQueryBuilder('electrician')
      .select('DISTINCT electrician.state', 'state')
      .where('electrician.state IS NOT NULL')
      .orderBy('electrician.state', 'ASC')
      .getRawMany();
    return { states: rows.map(r => r.state).filter(Boolean) };
  }

  async getDistinctCategories(): Promise<{ categories: string[] }> {
    const rows = await this.electricianRepository
      .createQueryBuilder('electrician')
      .select('DISTINCT electrician.subCategory', 'subCategory')
      .where('electrician.subCategory IS NOT NULL')
      .orderBy('electrician.subCategory', 'ASC')
      .getRawMany();
    return { categories: rows.map(r => r.subCategory).filter(Boolean) };
  }

  async getTierCounts() {
    const rows = await this.electricianRepository
      .createQueryBuilder('electrician')
      .select('electrician.tier', 'tier')
      .addSelect('COUNT(*)', 'count')
      .groupBy('electrician.tier')
      .getRawMany();

    const result: Record<string, number> = { Silver: 0, Gold: 0, Platinum: 0, Diamond: 0 };
    for (const row of rows) {
      result[row.tier] = parseInt(row.count, 10);
    }
    return result;
  }
}
