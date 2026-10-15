import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  private async enrichUsers(tickets: SupportTicket[]) {
    const ids = [...new Set(tickets.map(ticket => ticket.userId).filter(Boolean))];
    if (!ids.length) return tickets.map(ticket => ({ ...ticket, userPhone: null }));
    const accounts = await this.supportTicketRepository.query(`
      SELECT id::text, name, phone, 'electrician' AS role FROM electricians WHERE id::text = ANY($1::text[])
      UNION ALL SELECT id::text, name, phone, 'dealer' FROM dealers WHERE id::text = ANY($1::text[])
      UNION ALL SELECT id::text, name, phone, 'user' FROM app_users WHERE id::text = ANY($1::text[])
      UNION ALL SELECT id::text, name, phone, 'counterboy' FROM counterboys WHERE id::text = ANY($1::text[])
    `, [ids]);
    const users = new Map(accounts.map((account: any) => [`${account.role}:${account.id}`, account]));
    return tickets.map(ticket => {
      const account: any = users.get(`${ticket.userRole}:${ticket.userId}`);
      return { ...ticket, userName: ticket.userName || account?.name, userPhone: account?.phone ?? null };
    });
  }

  async getTickets(
    page: number = 1,
    limit: number = 20,
    status?: SupportTicketStatus | 'pending' | 'in-progress',
    priority?: SupportTicketPriority,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.supportTicketRepository.createQueryBuilder('ticket');

    if (status) {
      queryBuilder.andWhere('ticket.status = :status', {
        status: this.normalizeStatus(status),
      });
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
      data: await this.enrichUsers(data),
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

    return (await this.enrichUsers([ticket]))[0];
  }

  async respond(id: string, message: string, adminId: string) {
    const ticket = await this.getTicket(id);
    const cleanedMessage = message?.trim();
    if (!cleanedMessage) {
      throw new BadRequestException('Reply message is required');
    }

    const newReply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender: 'admin',
      senderName: 'Admin Support',
      message: cleanedMessage,
      timestamp: new Date(),
    };

    const existingReplies = ticket.replies || [];
    const updatedReplies = [...existingReplies, newReply];

    await this.supportTicketRepository.update(id, {
      response: cleanedMessage,
      replies: updatedReplies,
      assignedTo: adminId,
      status: SupportTicketStatus.IN_PROGRESS,
    });

    // Create notification for the user
    if (ticket.userId) {
      const notification = this.notificationRepository.create({
        title: 'Reply to your enquiry',
        message: cleanedMessage.substring(0, 100),
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

  async updateStatus(
    id: string,
    status: SupportTicketStatus | 'pending' | 'in-progress',
    adminId: string,
  ) {
    const ticket = await this.getTicket(id);

    await this.supportTicketRepository.update(id, {
      status: this.normalizeStatus(status),
      assignedTo: adminId,
    });

    return this.getTicket(id);
  }

  async updateReply(id: string, replyId: string, message: string, adminId: string) {
    const ticket = await this.getTicket(id);
    const cleanedMessage = message?.trim();
    if (!cleanedMessage) {
      throw new BadRequestException('Reply message is required');
    }

    const replies = [...(ticket.replies ?? [])];
    const index = replies.findIndex((reply) => reply.id === replyId);
    if (index < 0) throw new NotFoundException('Reply not found');
    if (replies[index].sender !== 'admin') {
      throw new ForbiddenException('Only admin replies can be edited');
    }

    replies[index] = {
      ...replies[index],
      message: cleanedMessage,
      editedAt: new Date().toISOString(),
    } as typeof replies[number];
    const lastAdminReply = [...replies].reverse().find((reply) => reply.sender === 'admin');
    await this.supportTicketRepository.update(id, {
      replies,
      response: lastAdminReply?.message ?? null,
      assignedTo: adminId,
    });
    return this.getTicket(id);
  }

  async deleteReply(id: string, replyId: string, adminId: string) {
    const ticket = await this.getTicket(id);
    const target = (ticket.replies ?? []).find((reply) => reply.id === replyId);
    if (!target) throw new NotFoundException('Reply not found');
    if (target.sender !== 'admin') {
      throw new ForbiddenException('Only admin replies can be deleted');
    }

    const replies = (ticket.replies ?? []).filter((reply) => reply.id !== replyId);
    const lastAdminReply = [...replies].reverse().find((reply) => reply.sender === 'admin');
    await this.supportTicketRepository.update(id, {
      replies,
      response: lastAdminReply?.message ?? null,
      assignedTo: adminId,
    });
    return this.getTicket(id);
  }

  private normalizeStatus(
    status: SupportTicketStatus | 'pending' | 'in-progress',
  ): SupportTicketStatus {
    if (status === 'pending') return SupportTicketStatus.OPEN;
    if (status === 'in-progress') return SupportTicketStatus.IN_PROGRESS;
    if (Object.values(SupportTicketStatus).includes(status as SupportTicketStatus)) {
      return status as SupportTicketStatus;
    }
    throw new BadRequestException('Invalid support ticket status');
  }
}
