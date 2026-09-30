/**
 * TierService — Centralized tier calculation & auto-sync
 *
 * Electrician tier  →  based on totalPoints
 *   Silver   : 0    – 1000
 *   Gold     : 1001 – 5000
 *   Platinum : 5001 – 9999
 *   Diamond  : 10000+
 *
 * Dealer tier  →  based on electricianCount
 *   Silver   : 0   – 100
 *   Gold     : 101 – 300
 *   Platinum : 301 – 500
 *   Diamond  : 501+
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { MemberTier } from '../enums';
import { Settings } from '../../database/entities/settings.entity';
import { numericSetting } from '../utils/app-settings.util';

@Injectable()
export class TierService {
  constructor(
    @InjectRepository(Electrician)
    private electricianRepo: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepo: Repository<Dealer>,
    @InjectRepository(Settings)
    private settingsRepo: Repository<Settings>,
  ) {}

  // ─── Tier calculation helpers ─────────────────────────────────────────────

  async calculateElectricianTier(points: number): Promise<MemberTier> {
    const map = Object.fromEntries((await this.settingsRepo.find()).map(row => [row.key, row.value]));
    if (points >= numericSetting(map, 'diamondMin', 10001)) return MemberTier.DIAMOND;
    if (points >= numericSetting(map, 'platinumMin', 5001)) return MemberTier.PLATINUM;
    if (points >= numericSetting(map, 'goldMin', 1001)) return MemberTier.GOLD;
    return MemberTier.SILVER;
  }

  async calculateDealerTier(electricianCount: number): Promise<MemberTier> {
    const map = Object.fromEntries((await this.settingsRepo.find()).map(row => [row.key, row.value]));
    if (electricianCount >= numericSetting(map, 'dealerDiamondMin', 51)) return MemberTier.DIAMOND;
    if (electricianCount >= numericSetting(map, 'dealerPlatinumMin', 26)) return MemberTier.PLATINUM;
    if (electricianCount >= numericSetting(map, 'dealerGoldMin', 11)) return MemberTier.GOLD;
    return MemberTier.SILVER;
  }

  // ─── Sync electrician tier ────────────────────────────────────────────────

  /**
   * Recalculate & persist tier for one electrician based on current totalPoints.
   * Returns the new tier (or existing if unchanged).
   */
  async syncElectricianTier(electricianId: string): Promise<MemberTier> {
    const electrician = await this.electricianRepo.findOne({
      where: { id: electricianId },
    });
    if (!electrician) return MemberTier.SILVER;

    const newTier = await this.calculateElectricianTier(electrician.totalPoints);
    if (newTier !== electrician.tier) {
      await this.electricianRepo.update(electricianId, { tier: newTier });
    }
    return newTier;
  }

  /**
   * Called after points change — updates tier + walletBalance in one shot.
   */
  async applyPointsToElectrician(
    electricianId: string,
    newTotalPoints: number,
    newWalletBalance?: number,
  ): Promise<MemberTier> {
    const newTier = await this.calculateElectricianTier(newTotalPoints);
    const update: Partial<Electrician> = {
      totalPoints: newTotalPoints,
      tier: newTier,
    };
    if (newWalletBalance !== undefined) {
      update.walletBalance = newWalletBalance;
    }
    await this.electricianRepo.update(electricianId, update);
    return newTier;
  }

  // ─── Sync dealer tier ─────────────────────────────────────────────────────

  /**
   * Recalculate & persist tier for one dealer based on actual electrician count in DB.
   * Also keeps electricianCount column in sync.
   */
  async syncDealerTier(dealerId: string): Promise<MemberTier> {
    const count = await this.electricianRepo.count({
      where: { dealerId },
    });
    const newTier = await this.calculateDealerTier(count);

    await this.dealerRepo.update(dealerId, {
      electricianCount: count,
      tier: newTier,
    });

    return newTier;
  }

  /**
   * Sync ALL dealers' tiers in one pass (useful for bulk operations / cron).
   */
  async syncAllDealerTiers(): Promise<void> {
    const dealers = await this.dealerRepo.find({ select: ['id'] });
    await Promise.all(dealers.map((d) => this.syncDealerTier(d.id)));
  }

  /**
   * Sync ALL electricians' tiers in one pass.
   */
  async syncAllElectricianTiers(): Promise<void> {
    const electricians = await this.electricianRepo.find({
      select: ['id', 'totalPoints', 'tier'],
    });
    const updates = (await Promise.all(electricians
      .map(async (e) => ({
        id: e.id,
        newTier: await this.calculateElectricianTier(e.totalPoints),
        currentTier: e.tier,
      }))))
      .filter((e) => e.newTier !== e.currentTier);

    await Promise.all(
      updates.map((e) =>
        this.electricianRepo.update(e.id, { tier: e.newTier }),
      ),
    );
  }
}
