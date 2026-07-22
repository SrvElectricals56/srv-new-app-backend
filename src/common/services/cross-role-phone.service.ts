import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';

export type RegisteredMobileRole = 'dealer' | 'electrician' | 'user' | 'counterboy';

export type PhoneRegistrationMatch = {
  role: RegisteredMobileRole;
  id: string;
  phone: string;
  name?: string;
  createdAt?: Date;
};

const ROLE_LABELS: Record<RegisteredMobileRole, string> = {
  dealer: 'SRV Dealer',
  electrician: 'SRV Electrician',
  user: 'SRV Customer',
  counterboy: 'SRV Counter Boy',
};

const ROLE_PRIORITY: Record<RegisteredMobileRole, number> = {
  dealer: 4,
  electrician: 3,
  counterboy: 2,
  user: 1,
};

@Injectable()
export class CrossRolePhoneService {
  private readonly logger = new Logger(CrossRolePhoneService.name);

  constructor(
    @InjectRepository(Dealer) private readonly dealerRepository: Repository<Dealer>,
    @InjectRepository(Electrician) private readonly electricianRepository: Repository<Electrician>,
    @InjectRepository(AppUser) private readonly appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy) private readonly counterboyRepository: Repository<CounterBoy>,
  ) {}

  normalizePhone(phone?: string | null): string {
    return String(phone ?? '').replace(/\D/g, '').slice(-10);
  }

  buildAlreadyRegisteredMessage(role: RegisteredMobileRole): string {
    return `You are already registered as ${ROLE_LABELS[role]}.`;
  }

  buildLoginRoleMismatchMessage(role: RegisteredMobileRole): string {
    return `This number is registered as ${ROLE_LABELS[role]}. Please login with that profile.`;
  }

  async findAllRegistrationsByPhone(phone: string): Promise<PhoneRegistrationMatch[]> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) return [];

    const [dealers, electricians, users, counterboys] = await Promise.all([
      this.findMatchesInRepository(this.dealerRepository, 'dealer', phone, normalizedPhone, 'dealer'),
      this.findMatchesInRepository(this.electricianRepository, 'electrician', phone, normalizedPhone, 'electrician'),
      this.findMatchesInRepository(this.appUserRepository, 'user', phone, normalizedPhone, 'user'),
      this.findMatchesInRepository(this.counterboyRepository, 'counterboy', phone, normalizedPhone, 'counterboy'),
    ]);

    return [...dealers, ...electricians, ...users, ...counterboys];
  }

  async findPrimaryRegistrationByPhone(phone: string): Promise<PhoneRegistrationMatch | null> {
    const matches = await this.findAllRegistrationsByPhone(phone);
    if (!matches.length) return null;
    return this.pickKeeper(matches);
  }

  async assertLoginRole(phone: string, targetRole: RegisteredMobileRole): Promise<void> {
    const primary = await this.findPrimaryRegistrationByPhone(phone);
    if (primary && primary.role !== targetRole) {
      throw new ConflictException(this.buildLoginRoleMismatchMessage(primary.role));
    }
  }

  pickKeeper(matches: PhoneRegistrationMatch[]): PhoneRegistrationMatch {
    return [...matches].sort((a, b) => {
      const priorityDiff = ROLE_PRIORITY[b.role] - ROLE_PRIORITY[a.role];
      if (priorityDiff !== 0) return priorityDiff;
      const aTime = a.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })[0];
  }

  async assertPhoneAvailableForRole(
    phone: string,
    targetRole: RegisteredMobileRole,
    exclude?: { role: RegisteredMobileRole; id: string },
  ): Promise<void> {
    const matches = await this.findAllRegistrationsByPhone(phone);
    const relevant = exclude
      ? matches.filter((match) => !(match.role === exclude.role && match.id === exclude.id))
      : matches;

    if (!relevant.length) return;

    const keeper = this.pickKeeper(relevant);
    throw new ConflictException(this.buildAlreadyRegisteredMessage(keeper.role));
  }

  async deduplicatePhone(phone: string): Promise<{ kept: PhoneRegistrationMatch | null; removed: PhoneRegistrationMatch[] }> {
    const matches = await this.findAllRegistrationsByPhone(phone);
    if (matches.length <= 1) {
      return { kept: matches[0] ?? null, removed: [] };
    }

    const keeper = this.pickKeeper(matches);
    const removed: PhoneRegistrationMatch[] = [];

    for (const match of matches) {
      if (match.role === keeper.role && match.id === keeper.id) continue;
      await this.deleteRegistration(match);
      removed.push(match);
    }

    return { kept: keeper, removed };
  }

  async deduplicateAll(): Promise<{
    duplicatePhones: number;
    removed: number;
    kept: PhoneRegistrationMatch[];
    removedEntries: PhoneRegistrationMatch[];
  }> {
    const all = await this.loadAllRegistrations();
    const grouped = new Map<string, PhoneRegistrationMatch[]>();

    for (const registration of all) {
      const key = this.normalizePhone(registration.phone);
      if (!key) continue;
      const bucket = grouped.get(key) ?? [];
      bucket.push(registration);
      grouped.set(key, bucket);
    }

    let duplicatePhones = 0;
    let removed = 0;
    const kept: PhoneRegistrationMatch[] = [];
    const removedEntries: PhoneRegistrationMatch[] = [];

    for (const [, registrations] of grouped) {
      if (registrations.length <= 1) continue;
      duplicatePhones += 1;
      const keeper = this.pickKeeper(registrations);
      kept.push(keeper);

      for (const registration of registrations) {
        if (registration.role === keeper.role && registration.id === keeper.id) continue;
        await this.deleteRegistration(registration);
        removed += 1;
        removedEntries.push(registration);
        this.logger.warn(
          `Removed duplicate ${registration.role} ${registration.id} (${registration.phone}); kept ${keeper.role} ${keeper.id}`,
        );
      }
    }

    return { duplicatePhones, removed, kept, removedEntries };
  }

  private async loadAllRegistrations(): Promise<PhoneRegistrationMatch[]> {
    const [dealers, electricians, users, counterboys] = await Promise.all([
      this.dealerRepository.find({ select: ['id', 'phone', 'name', 'joinedDate'] }),
      this.electricianRepository.find({ select: ['id', 'phone', 'name', 'joinedDate'] }),
      this.appUserRepository.find({ select: ['id', 'phone', 'name', 'joinedDate'] }),
      this.counterboyRepository.find({ select: ['id', 'phone', 'name', 'joinedDate'] }),
    ]);

    return [
      ...dealers.map((row) => this.toMatch('dealer', row)),
      ...electricians.map((row) => this.toMatch('electrician', row)),
      ...users.map((row) => this.toMatch('user', row)),
      ...counterboys.map((row) => this.toMatch('counterboy', row)),
    ];
  }

  private toMatch(
    role: RegisteredMobileRole,
    row: { id: string; phone: string; name?: string; joinedDate?: Date },
  ): PhoneRegistrationMatch {
    return {
      role,
      id: row.id,
      phone: row.phone,
      name: row.name,
      createdAt: row.joinedDate,
    };
  }

  private async findMatchesInRepository<T extends { id: string; phone: string; name?: string; joinedDate?: Date }>(
    repository: Repository<T>,
    alias: string,
    rawPhone: string,
    normalizedPhone: string,
    role: RegisteredMobileRole,
  ): Promise<PhoneRegistrationMatch[]> {
    const rows = await repository
      .createQueryBuilder(alias)
      .select([`${alias}.id`, `${alias}.phone`, `${alias}.name`, `${alias}.joinedDate`])
      .where(`${alias}.phone = :rawPhone`, { rawPhone })
      .orWhere(
        `regexp_replace(regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g'), '^0+', '') = regexp_replace(:normalizedPhone, '^0+', '')`,
        { normalizedPhone },
      )
      .getMany();

    return rows.map((row) => this.toMatch(role, row));
  }

  private async deleteRegistration(match: PhoneRegistrationMatch): Promise<void> {
    switch (match.role) {
      case 'dealer':
        await this.dealerRepository.delete(match.id);
        break;
      case 'electrician':
        await this.electricianRepository.delete(match.id);
        break;
      case 'user':
        await this.appUserRepository.delete(match.id);
        break;
      case 'counterboy':
        await this.counterboyRepository.delete(match.id);
        break;
      default:
        break;
    }
  }
}
