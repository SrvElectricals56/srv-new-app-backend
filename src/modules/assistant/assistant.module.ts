import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../database/entities/product.entity';
import { Settings } from '../../database/entities/settings.entity';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Settings])],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
