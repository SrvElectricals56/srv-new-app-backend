import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationStatus } from '../../common/enums';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  private normalizeTargetRole(targetRole?: string | null) {
    const normalized = String(targetRole ?? '').trim().toLowerCase();

    if (!normalized || normalized === 'all users' || normalized === 'all' || normalized === 'specific user') {
      return null;
    }

    const roleMap: Record<string, string> = {
      electrician: 'electrician',
      'only electricians': 'electrician',
      dealer: 'dealer',
      'only dealers': 'dealer',
      user: 'user',
      customer: 'user',
      'only customers': 'user',
      counterboy: 'counterboy',
      counterboys: 'counterboy',
      'only counterboys': 'counterboy',
    };

    return roleMap[normalized] ?? normalized;
  }

  async create(createNotificationDto: CreateNotificationDto, adminId: string) {
    const notification = this.notificationRepository.create({
      ...createNotificationDto,
      targetRole: this.normalizeTargetRole(createNotificationDto.targetRole),
      createdBy: adminId,
    });
    return this.notificationRepository.save(notification);
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: NotificationStatus,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.notificationRepository.createQueryBuilder('notification');

    if (status) {
      queryBuilder.andWhere('notification.status = :status', { status });
    }

    queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async update(id: string, updateNotificationDto: UpdateNotificationDto) {
    await this.notificationRepository.update(id, {
      ...updateNotificationDto,
      targetRole:
        updateNotificationDto.targetRole === undefined
          ? undefined
          : this.normalizeTargetRole(updateNotificationDto.targetRole),
    });
    return this.findOne(id);
  }

  async send(id: string) {
    const notification = await this.findOne(id);

    if (notification.status === NotificationStatus.SENT) {
      throw new BadRequestException('Notification already sent');
    }

    // Mock sending logic - in real implementation, integrate with Firebase/push service
    const totalSent = notification.targetUserIds?.length || 100; // Mock count

    await this.notificationRepository.update(id, {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      totalSent,
    });

    return {
      message: 'Notification sent successfully',
      totalSent,
    };
  }

  async remove(id: string) {
    const notification = await this.findOne(id);
    // Allow deleting any notification regardless of status
    await this.notificationRepository.remove(notification);
    return { message: 'Notification deleted successfully' };
  }
}
