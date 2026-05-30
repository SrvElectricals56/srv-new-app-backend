import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CrossRolePhoneService } from './cross-role-phone.service';

@Injectable()
export class CrossRolePhoneBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(CrossRolePhoneBootstrapService.name);

  constructor(private readonly crossRolePhoneService: CrossRolePhoneService) {}

  async onModuleInit() {
    try {
      const result = await this.crossRolePhoneService.deduplicateAll();
      if (result.removed > 0) {
        this.logger.warn(
          `Removed ${result.removed} duplicate mobile profile(s) across ${result.duplicatePhones} phone number(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Cross-role phone deduplication failed during startup',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
