import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { UserStatus, MemberTier } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';

@Injectable()
export class DealerService {
  constructor(
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private readonly tierService: TierService,
  ) {}

  private async hashPassword(password?: string) {
    const trimmed = password?.trim();
    if (!trimmed) return null;
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(trimmed, salt);
  }

  private serialize(dealer: Dealer) {
    const { passwordHash, electricians, ...rest } = dealer as Dealer & { electricians?: Electrician[] };
    return {
      ...rest,
      ...(electricians
        ? {
            electricians: electricians.map((electrician) => {
              const { passwordHash: electricianPasswordHash, ...electricianRest } = electrician;
              return {
                ...electricianRest,
                hasPassword: Boolean(electricianPasswordHash),
              };
            }),
          }
        : {}),
      hasPassword: Boolean(passwordHash),
    };
  }

  async create(createDealerDto: CreateDealerDto) {
    const existingDealer = await this.dealerRepository.findOne({
      where: [
        { phone: createDealerDto.phone },
        { dealerCode: createDealerDto.dealerCode },
      ],
    });

    if (existingDealer) {
      throw new ConflictException('Dealer with this phone or code already exists');
    }

    // New dealer starts with 0 electricians → Silver tier
    const data: any = { ...createDealerDto };
    data.electricianCount = 0;
    data.tier = MemberTier.SILVER;

    const dealer = this.dealerRepository.create(data);
    return this.dealerRepository.save(dealer);
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: UserStatus,
    tier?: MemberTier,
    state?: string,
    city?: string,
    bankLinked?: boolean,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.dealerRepository.createQueryBuilder('dealer');

    if (search) {
      queryBuilder.andWhere(
        '(dealer.name ILIKE :search OR dealer.phone ILIKE :search OR dealer.town ILIKE :search OR dealer.dealerCode ILIKE :search OR dealer.contactPerson ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (status) {
      queryBuilder.andWhere('dealer.status = :status', { status });
    }

    if (tier) {
      queryBuilder.andWhere('dealer.tier = :tier', { tier });
    }

    if (state) {
      queryBuilder.andWhere('dealer.state = :state', { state });
    }

    if (city) {
      queryBuilder.andWhere('dealer.town = :city', { city });
    }

    if (bankLinked !== undefined) {
      queryBuilder.andWhere('dealer.bankLinked = :bankLinked', { bankLinked });
    }

    if (dateFrom) {
      queryBuilder.andWhere('dealer.joinedDate >= :dateFrom', { dateFrom: new Date(dateFrom) });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('dealer.joinedDate <= :dateTo', { dateTo: to });
    }

    queryBuilder.orderBy('dealer.joinedDate', 'DESC').skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data: data.map((dealer) => this.serialize(dealer)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const dealer = await this.dealerRepository.findOne({
      where: { id },
      relations: ['electricians'],
    });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    return this.serialize(dealer);
  }

  async update(id: string, updateDealerDto: UpdateDealerDto) {
    const dealer = await this.findOne(id);

    if (updateDealerDto.phone && updateDealerDto.phone !== dealer.phone) {
      const existingDealer = await this.dealerRepository.findOne({
        where: { phone: updateDealerDto.phone },
      });
      if (existingDealer) {
        throw new ConflictException('Dealer with this phone already exists');
      }
    }

    // Strip tier from update payload — tier is always auto-calculated
    const passwordHash = await this.hashPassword(updateDealerDto.password);
    const {
      tier: _ignoredTier,
      electricianCount: _ignoredCount,
      password: _ignoredPassword,
      ...safeData
    } = updateDealerDto as any;

    if (passwordHash) {
      safeData.passwordHash = passwordHash;
      await this.dealerRepository.update(id, safeData);
      await this.dealerRepository.increment({ id }, 'tokenVersion', 1);
    } else {
      await this.dealerRepository.update(id, safeData);
    }

    // Re-sync tier from actual electrician count
    await this.tierService.syncDealerTier(id);

    return this.findOne(id);
  }

  async updateStatus(id: string, status: UserStatus, rejectionReason?: string) {
    const normalizedReason = rejectionReason?.trim();
    await this.dealerRepository.update(id, {
      status,
      rejectionReason:
        status === UserStatus.INACTIVE ? normalizedReason || 'Rejected by admin' : null,
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const dealer = await this.dealerRepository.findOne({ where: { id } });
    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }
    await this.dealerRepository.remove(dealer);
    return { message: 'Dealer deleted successfully' };
  }

  async getDealerElectricians(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.electricianRepository.findAndCount({
      where: { dealerId: id },
      skip,
      take: limit,
      order: { joinedDate: 'DESC' },
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDealerWallet(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.walletRepository.findAndCount({
      where: { userId: id },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private mapImportColumns(record: any) {
    const map: Record<string, string> = {
      'STATE': 'state',
      'DISTRICT': 'district',
      'DEALER NAME': 'contactPerson',
      'SHOP/BUSINESS NAME': 'name',
      'SHOP BUSINESS NAME': 'name',
      'DEALER ADDRESS': 'address',
      'GST/PAN NUMBER': 'gstNumber',
      'GST PAN NUMBER': 'gstNumber',
      'PHONE NO.': 'phone',
      'PHONE NO': 'phone',
      'SALES MAN NAME': 'salesManName',
      'TOWN': 'town',
      'TOWN CODE': 'townCode',
      'ELECTRICIAN LIST': 'electricianList',
      'LIST CODE': 'listCode',
      'RTO CODE': 'rtoCode',
      'DEALER CODE': 'dealerCode',
    };

    const normalize = (k: string) =>
      k.toUpperCase().trim().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');

    const mapped: any = {};

    for (const [key, value] of Object.entries(record)) {
      const normalized = normalize(key);
      const dbField = map[normalized] || null;

      if (dbField) {
        mapped[dbField] = value;
      }
    }

    // Fallback: use DEALER NAME as name if SHOP/BUSINESS NAME is empty
    if (!String(mapped.name ?? '').trim() && String(mapped.contactPerson ?? '').trim()) {
      mapped.name = mapped.contactPerson;
    }

    return mapped;
  }

  async importMany(records: any[]) {
    let created = 0, updated = 0, failed = 0, errors: string[] = [];

    for (const record of records) {
      let mapped: any;
      try {
        mapped = this.mapImportColumns(record);

        if (!String(mapped.name ?? '').trim() || !String(mapped.phone ?? '').trim()) {
          failed++;
          errors.push(`Row missing SHOP/BUSINESS NAME or PHONE NO.: ${JSON.stringify(record)}`);
          continue;
        }

        const rawPhone = String(mapped.phone).trim();
        const phone = rawPhone.replace(/\D/g, '').slice(0, 10);

        if (!phone || phone.length < 10) {
          failed++;
          errors.push(`Invalid phone number: ${rawPhone}`);
          continue;
        }

        mapped.phone = phone;

        let existing = await this.dealerRepository.findOne({ where: { phone } });

        const saveOrRetry = async (data: any, retries = 0): Promise<void> => {
          try {
            const entity = this.dealerRepository.create(data);
            await this.dealerRepository.save(entity);
          } catch (saveErr: any) {
            if (saveErr.code === '23505' && saveErr.constraint?.includes('dealerCode') && retries < 3) {
              data.dealerCode = `DLR${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
              return saveOrRetry(data, retries + 1);
            }
            throw saveErr;
          }
        };

        if (existing) {
          const { id, joinedDate, tier, electricianCount, ...updateData } = mapped;
          await this.dealerRepository.update(existing.id, updateData);
          await this.tierService.syncDealerTier(existing.id);
          updated++;
        } else {
          const data: any = { ...mapped };
          if (!data.dealerCode) {
            data.dealerCode = `DLR${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
          }
          data.electricianCount = 0;
          data.tier = MemberTier.SILVER;
          await saveOrRetry(data);
          created++;
        }
      } catch (err: any) {
        const ref = String(mapped?.name ?? record.name ?? mapped?.phone ?? record.phone ?? 'unknown');
        failed++;
        errors.push(`Row ${ref}: ${err.message}`);
      }
    }

    return { created, updated, failed, errors: errors.slice(0, 20), total: records.length };
  }

  async getDistinctStates(): Promise<{ states: string[] }> {
    const rows = await this.dealerRepository
      .createQueryBuilder('dealer')
      .select('DISTINCT dealer.state', 'state')
      .where('dealer.state IS NOT NULL')
      .andWhere(`TRIM(dealer.state) <> ''`)
      .orderBy('dealer.state', 'ASC')
      .getRawMany();
    return {
      states: Array.from(
        new Set(
          rows
            .map((r) => String(r.state ?? '').trim())
            .filter((state) => state !== '' && state !== '?'),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    };
  }

  async getDistinctCities(state?: string): Promise<{ cities: string[] }> {
    const query = this.dealerRepository
      .createQueryBuilder('dealer')
      .select('DISTINCT dealer.town', 'city')
      .where('dealer.town IS NOT NULL')
      .andWhere(`TRIM(dealer.town) <> ''`);
    if (state) {
      query.andWhere('dealer.state = :state', { state });
    }
    const rows = await query.orderBy('dealer.town', 'ASC').getRawMany();
    return {
      cities: Array.from(
        new Set(
          rows
            .map((r) => String(r.city ?? '').trim())
            .filter((city) => city !== '' && city !== '?'),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    };
  }

  async getTop(from: string, to: string, limit: number = 10) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const results = await this.electricianRepository
      .createQueryBuilder('e')
      .select('e.dealerId', 'dealerId')
      .addSelect('COUNT(*)', 'periodElectricians')
      .where('e.joinedDate >= :from', { from: fromDate })
      .andWhere('e.joinedDate <= :to', { to: toDate })
      .andWhere('e.dealerId IS NOT NULL')
      .groupBy('e.dealerId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany();

    if (results.length === 0) return [];

    const dealerIds = results.map(r => r.dealerId);
    const dealers = await this.dealerRepository
      .createQueryBuilder('d')
      .where('d.id IN (:...ids)', { ids: dealerIds })
      .getMany();

    const dealerMap = new Map(dealers.map(d => [d.id, d]));

    return results.map(r => {
      const d = dealerMap.get(r.dealerId);
      return {
        id: r.dealerId,
        name: d?.name ?? 'Unknown',
        phone: d?.phone ?? '',
        dealerCode: d?.dealerCode ?? '',
        town: d?.town ?? '',
        state: d?.state ?? '',
        tier: d?.tier ?? 'Silver',
        electricianCount: d?.electricianCount ?? 0,
        monthlyTarget: d?.monthlyTarget ?? 0,
        achievedTarget: d?.achievedTarget ?? 0,
        periodElectricians: Number(r.periodElectricians),
      };
    });
  }

  async getStats() {
    const [total, active, pending, inactive] = await Promise.all([
      this.dealerRepository.count(),
      this.dealerRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.dealerRepository.count({ where: { status: UserStatus.PENDING } }),
      this.dealerRepository.count({ where: { status: UserStatus.INACTIVE } }),
    ]);
    return { total, active, pending, inactive };
  }
}
