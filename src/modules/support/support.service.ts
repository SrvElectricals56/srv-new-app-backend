import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { SupportTicketStatus, SupportTicketPriority, NotificationStatus } from '../../common/enums';
import { Notification } from '../../database/entities/notification.entity';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private supportTicketRepository: Repository<SupportTicket>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  async getTickets(
    page: number = 1,
    limit: number = 20,
    status?: SupportTicketStatus,
    priority?: SupportTicketPriority,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.supportTicketRepository.createQueryBuilder('ticket');

    if (status) {
      queryBuilder.andWhere('ticket.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('ticket.priority = :priority', { priority });
    }

    queryBuilder
      .orderBy('ticket.createdAt', 'DESC')
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

  async getTicket(id: string) {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    return ticket;
  }

  async respond(id: string, message: string, adminId: string) {
    const ticket = await this.getTicket(id);

    const newReply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender: 'admin',
      senderName: 'Admin Support',
      message,
      timestamp: new Date(),
    };

    const existingReplies = ticket.replies || [];
    const updatedReplies = [...existingReplies, newReply];

    await this.supportTicketRepository.update(id, {
      response: message,
      replies: updatedReplies,
      assignedTo: adminId,
      status: SupportTicketStatus.IN_PROGRESS,
    });

    // Create notification for the user
    if (ticket.userId) {
      const notification = this.notificationRepository.create({
        title: 'Reply to your enquiry',
        message: `Admin replied to "${ticket.subject}": ${message.substring(0, 100)}`,
        targetUserIds: [ticket.userId],
        targetRole: ticket.userRole || undefined,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        totalSent: 1,
      });
      await this.notificationRepository.save(notification);
    }

    return this.getTicket(id);
  }

  async updateStatus(id: string, status: SupportTicketStatus, adminId: string) {
    const ticket = await this.getTicket(id);

    await this.supportTicketRepository.update(id, {
      status,
      assignedTo: adminId,
    });

    return this.getTicket(id);
  }
}