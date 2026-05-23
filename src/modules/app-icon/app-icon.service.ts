import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CreateAppIconDto } from './dto/create-app-icon.dto';
import { UpdateAppIconDto } from './dto/update-app-icon.dto';
import { AppIcon } from '../../database/entities/app-icon.entity';

@Injectable()
export class AppIconService {
  constructor(
    @InjectRepository(AppIcon)
    private appIconRepository: Repository<AppIcon>,
  ) {}

  async create(createAppIconDto: CreateAppIconDto) {
    const icon = this.appIconRepository.create({
      ...createAppIconDto,
      id: randomUUID(),
    });

    if (createAppIconDto.isActive) {
      await this.deactivateAll();
    }

    return this.appIconRepository.save(icon);
  }

  async findAll() {
    return this.appIconRepository.find({
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const icon = await this.appIconRepository.findOne({ where: { id } });
    if (!icon) {
      throw new NotFoundException('App icon not found');
    }
    return icon;
  }

  async findActive() {
    const icon = await this.appIconRepository.findOne({ where: { isActive: true } });
    return icon;
  }

  async update(id: string, updateAppIconDto: UpdateAppIconDto) {
    const icon = await this.findOne(id);

    if (updateAppIconDto.isActive) {
      await this.deactivateAll();
    }

    await this.appIconRepository.update(id, updateAppIconDto);
    return this.findOne(id);
  }

  async setActive(iconId: string) {
    const icon = await this.findOne(iconId);
    await this.deactivateAll();
    await this.appIconRepository.update(iconId, { isActive: true });
    return this.findOne(iconId);
  }

  async remove(id: string) {
    const icon = await this.findOne(id);
    await this.appIconRepository.remove(icon);
    return { message: 'App icon deleted successfully' };
  }

  private async deactivateAll() {
    await this.appIconRepository.update({ isActive: true }, { isActive: false });
  }
}
