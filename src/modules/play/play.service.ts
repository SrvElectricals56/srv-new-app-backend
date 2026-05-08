import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Play,
  type PlayComment,
  type PlayCommentReply,
  type PlayLike,
  type PlayViewer,
} from '../../database/entities/play.entity';

type PlayInteractionsResponse = {
  playId: string;
  likeCount: number;
  likedByMe: boolean;
  comments: PlayComment[];
};

@Injectable()
export class PlayService {
  constructor(
    @InjectRepository(Play)
    private playRepository: Repository<Play>,
  ) {}

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async findAll(includeInactive = false) {
    const qb = this.playRepository.createQueryBuilder('play');
    if (!includeInactive) qb.where('play.isActive = :active', { active: true });
    qb.orderBy('play.displayOrder', 'ASC').addOrderBy('play.createdAt', 'DESC');
    const data = await qb.getMany();
    return { data, total: data.length };
  }

  async findOne(id: string) {
    const play = await this.playRepository.findOne({ where: { id } });
    if (!play) throw new NotFoundException('Play not found');
    return play;
  }

  async create(body: Partial<Play>) {
    const play = this.playRepository.create(body);
    return this.playRepository.save(play);
  }

  async update(id: string, body: Partial<Play>) {
    await this.findOne(id);
    await this.playRepository.update(id, body);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.playRepository.delete(id);
    return { message: 'Play deleted successfully' };
  }

  // ── Mobile — public list ───────────────────────────────────────────────────

  async getActivePlays() {
    const plays = await this.playRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
    // Strip private interaction arrays from public response.
    return {
      data: plays.map(({ viewers: _v, likes: _l, comments: _c, ...rest }) => rest),
    };
  }

  // ── Mobile — record a view ─────────────────────────────────────────────────

  async recordView(id: string, userId: string, role: string) {
    const play = await this.playRepository.findOne({ where: { id } });
    if (!play) return { message: 'ok' };

    const viewers = this.getViewersArray(play);

    // Only count unique user views
    const alreadyViewed = viewers.some((v) => v.userId === userId);
    if (!alreadyViewed) {
      viewers.push({ userId, role, viewedAt: new Date().toISOString() });
      await this.playRepository.update(id, {
        viewCount: (play.viewCount ?? 0) + 1,
        viewers,
      });
    }
    return { message: 'ok' };
  }

  // ── Admin — viewer analytics ───────────────────────────────────────────────

  async getViewers(id: string) {
    const play = await this.findOne(id);
    return {
      id: play.id,
      title: play.title,
      totalViews: play.viewCount,
      uniqueViewers: this.getViewersArray(play).length,
      viewers: this.getViewersArray(play),
    };
  }

  async getInteractions(id: string, userId?: string) {
    const play = await this.findOne(id);
    return this.buildInteractions(play, userId);
  }

  async toggleLike(id: string, userId: string, role: string, userName?: string | null) {
    const play = await this.findOne(id);
    const likes = this.getLikesArray(play);
    const existingIndex = likes.findIndex((like) => like.userId === userId);

    if (existingIndex >= 0) {
      likes.splice(existingIndex, 1);
    } else {
      likes.push({
        userId,
        role,
        userName: userName?.trim() || null,
        likedAt: new Date().toISOString(),
      });
    }

    await this.playRepository.update(id, { likes });
    return this.buildInteractions({ ...play, likes }, userId);
  }

  async addComment(id: string, user: { id: string; role: string; name?: string | null }, message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new BadRequestException('Comment message is required');
    }

    const play = await this.findOne(id);
    const comments = this.getCommentsArray(play);
    comments.unshift({
      id: randomUUID(),
      message: trimmed,
      authorId: user.id,
      authorName: user.name?.trim() || null,
      authorRole: user.role,
      createdAt: new Date().toISOString(),
      replies: [],
    });

    await this.playRepository.update(id, { comments });
    return this.buildInteractions({ ...play, comments }, user.id);
  }

  async replyToComment(
    id: string,
    commentId: string,
    user: { id: string; role: string; name?: string | null },
    message: string,
  ) {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new BadRequestException('Reply message is required');
    }

    const play = await this.findOne(id);
    const comments = this.getCommentsArray(play).map((comment) => {
      if (comment.id !== commentId) return comment;

      const replies = Array.isArray(comment.replies) ? [...comment.replies] : [];
      const reply: PlayCommentReply = {
        id: randomUUID(),
        message: trimmed,
        authorId: user.id,
        authorName: user.name?.trim() || 'Admin Team',
        authorRole: user.role,
        createdAt: new Date().toISOString(),
      };

      return {
        ...comment,
        replies: [...replies, reply],
      };
    });

    const found = comments.some((comment) => comment.id === commentId);
    if (!found) {
      throw new NotFoundException('Comment not found');
    }

    await this.playRepository.update(id, { comments });
    return this.buildInteractions({ ...play, comments });
  }

  async getStats() {
    const all = await this.playRepository.find();
    const totalViews = all.reduce((sum, p) => sum + (p.viewCount ?? 0), 0);
    const uniqueViewers = new Set(
      all.flatMap((p) => this.getViewersArray(p).map((v) => v.userId)),
    ).size;
    const totalLikes = all.reduce((sum, play) => sum + this.getLikesArray(play).length, 0);
    const totalComments = all.reduce((sum, play) => sum + this.getCommentsCount(play), 0);
    return {
      totalPlays: all.length,
      activePlays: all.filter((p) => p.isActive).length,
      totalViews,
      uniqueViewers,
      totalLikes,
      totalComments,
    };
  }

  private getViewersArray(play: Play): PlayViewer[] {
    return Array.isArray(play.viewers) ? play.viewers : [];
  }

  private getLikesArray(play: Play): PlayLike[] {
    return Array.isArray(play.likes) ? play.likes : [];
  }

  private getCommentsArray(play: Play): PlayComment[] {
    if (!Array.isArray(play.comments)) return [];
    return play.comments.map((comment) => ({
      ...comment,
      replies: Array.isArray(comment.replies) ? comment.replies : [],
    }));
  }

  private getCommentsCount(play: Play) {
    return this.getCommentsArray(play).reduce(
      (sum, comment) => sum + 1 + (Array.isArray(comment.replies) ? comment.replies.length : 0),
      0,
    );
  }

  private buildInteractions(play: Play, userId?: string): PlayInteractionsResponse {
    const likes = this.getLikesArray(play);
    const comments = this.getCommentsArray(play);

    return {
      playId: play.id,
      likeCount: likes.length,
      likedByMe: userId ? likes.some((like) => like.userId === userId) : false,
      comments,
    };
  }
}
