import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CreateAppIconDto } from './dto/create-app-icon.dto';
import { UpdateAppIconDto } from './dto/update-app-icon.dto';
import { AppIcon } from '../../database/entities/app-icon.entity';
import { isBundledAppIconKey } from './app-icon.constants';

@Injectable()
export class AppIconService {
  constructor(
    @InjectRepository(AppIcon)
    private appIconRepository: Repository<AppIcon>,
  ) {}

  async create(createAppIconDto: CreateAppIconDto) {
    if (createAppIconDto.nativeKey) {
      const existing = await this.appIconRepository.findOne({ where: { nativeKey: createAppIconDto.nativeKey } });
      if (existing) throw new ConflictException('This bundled launcher icon already exists');
    }
    const icon = this.appIconRepository.create({
      ...createAppIconDto,
      id: randomUUID(),
    });

    if (createAppIconDto.isActive) {
      this.assertActivatable(icon);
      await this.deactivateAll();
    }

    return this.appIconRepository.save(icon);
  }

  async findAll() {
    const icons = await this.appIconRepository.find({
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
    return icons.map((icon) => this.withBundledPreview(icon));
  }

  async findOne(id: string) {
    const icon = await this.appIconRepository.findOne({ where: { id } });
    if (!icon) {
      throw new NotFoundException('App icon not found');
    }
    return this.withBundledPreview(icon);
  }

  async findActive() {
    const icon = await this.appIconRepository.findOne({ where: { isActive: true } });
    return icon ? this.withBundledPreview(icon) : {
      id: null,
      name: 'Default SRV',
      imageUrl: '/app-icons/default.png',
      nativeKey: 'default',
      isActive: true,
      displayOrder: 0,
    };
  }

  async update(id: string, updateAppIconDto: UpdateAppIconDto) {
    const icon = await this.findOne(id);

    if (updateAppIconDto.nativeKey && updateAppIconDto.nativeKey !== icon.nativeKey) {
      const existing = await this.appIconRepository.findOne({ where: { nativeKey: updateAppIconDto.nativeKey } });
      if (existing) throw new ConflictException('This bundled launcher icon already exists');
    }

    if (updateAppIconDto.isActive) {
      this.assertActivatable({ ...icon, ...updateAppIconDto });
      await this.deactivateAll();
    }

    await this.appIconRepository.update(id, updateAppIconDto);
    return this.findOne(id);
  }

  async setActive(iconId: string) {
    const icon = await this.findOne(iconId);
    this.assertActivatable(icon);
    await this.deactivateAll();
    await this.appIconRepository.update(iconId, { isActive: true });
    return this.findOne(iconId);
  }

  async remove(id: string) {
    const icon = await this.findOne(id);
    if (icon.nativeKey) {
      throw new BadRequestException('Bundled launcher icons cannot be deleted');
    }
    await this.appIconRepository.remove(icon);
    return { message: 'App icon deleted successfully' };
  }

  private async deactivateAll() {
    await this.appIconRepository.update({ isActive: true }, { isActive: false });
  }

  private assertActivatable(icon: Pick<AppIcon, 'nativeKey'>) {
    if (!isBundledAppIconKey(icon.nativeKey)) {
      throw new BadRequestException(
        'This image is not bundled in the installed mobile app and cannot be used as a launcher icon',
      );
    }
  }

  private withBundledPreview(icon: AppIcon): AppIcon {
    if (!isBundledAppIconKey(icon.nativeKey)) return icon;
    return {
      ...icon,
      imageUrl: `/app-icons/${icon.nativeKey}.png`,
    };
  }
}
