import { UserStatus } from '../enums';

export type ElectricianActivityStatus = 'proactive' | 'active' | 'inactive';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getElectricianActivityStatus(input: {
  accountStatus: UserStatus | string;
  joinedDate?: Date | string | null;
  lastScanAt?: Date | string | null;
  now?: Date;
}): ElectricianActivityStatus {
  if (input.accountStatus === UserStatus.INACTIVE || input.accountStatus === UserStatus.SUSPENDED) {
    return 'inactive';
  }

  const now = input.now ?? new Date();
  const lastScanAt = input.lastScanAt ? new Date(input.lastScanAt) : null;
  const joinedDate = input.joinedDate ? new Date(input.joinedDate) : null;
  const ageInDays = (date: Date | null) =>
    date && !Number.isNaN(date.getTime())
      ? Math.max(0, (now.getTime() - date.getTime()) / DAY_MS)
      : Number.POSITIVE_INFINITY;

  if (ageInDays(lastScanAt) <= 7) return 'proactive';
  if (ageInDays(lastScanAt) <= 30 || ageInDays(joinedDate) <= 30) return 'active';
  return 'inactive';
}
