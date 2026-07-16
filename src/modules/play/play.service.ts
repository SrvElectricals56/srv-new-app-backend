import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import axios from 'axios';
import {
  Play,
  type PlayComment,
  type PlayCommentReply,
  type PlayLike,
  type PlayShare,
  type PlayViewer,
} from '../../database/entities/play.entity';

const PLAY_TARGET_ROLES = ['user', 'dealer', 'electrician', 'counterboy'] as const;
type PlayTargetRole = (typeof PLAY_TARGET_ROLES)[number];

type PlayInteractionsResponse = {
  playId: string;
  likeCount: number;
  shareCount: number;
  likedByMe: boolean;
  comments: PlayComment[];
};

type InstagramMediaItem = {
  id: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string;
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
};

@Injectable()
export class PlayService implements OnModuleInit {
  private readonly logger = new Logger(PlayService.name);

  constructor(
    @InjectRepository(Play)
    private playRepository: Repository<Play>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.syncInstagramVideos({ silent: true });
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async findAll(includeInactive = false) {
    const qb = this.playRepository.createQueryBuilder('play');
    if (!includeInactive) qb.where('play.isActive = :active', { active: true });
    qb.orderBy('play.displayOrder', 'ASC').addOrderBy('play.createdAt', 'DESC');
    const data = await qb.getMany();
    return {
      data: data.map((play) => this.serializePlay(play)),
      total: data.length,
    };
  }

  async findOne(id: string) {
    const play = await this.findOneEntity(id);
    return this.serializePlay(play);
  }

  async create(body: Partial<Play>) {
    const play = this.playRepository.create({
      ...this.prepareWriteBody(body),
      targetRoles: this.normalizeTargetRoles((body as any)?.targetRoles ?? (body as any)?.targetRole, true),
    });
    return this.playRepository.save(play);
  }

  async update(id: string, body: Partial<Play>) {
    await this.findOneEntity(id);
    await this.playRepository.update(id, this.prepareWriteBody(body));
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOneEntity(id);
    await this.playRepository.delete(id);
    return { message: 'Play deleted successfully' };
  }

  // ── Mobile — public list ───────────────────────────────────────────────────

  async getActivePlays(role: string) {
    const normalizedRole = this.normalizeRole(role);
    if (!normalizedRole) {
      return { data: [] };
    }

    const plays = await this.playRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });

    return {
      data: plays
        .filter((play) => this.isVisibleForRole(play, normalizedRole))
        .map((play) => this.serializePlay(play)),
    };
  }

  // ── Mobile — record a view ─────────────────────────────────────────────────

  async recordView(id: string, userId: string, role: string) {
    const play = await this.playRepository.findOne({ where: { id } });
    if (!play || !play.isActive || !this.isVisibleForRole(play, role)) return { message: 'ok' };

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
    const play = await this.findOneEntity(id);
    return {
      id: play.id,
      title: play.title,
      totalViews: play.viewCount,
      uniqueViewers: this.getViewersArray(play).length,
      viewers: this.getViewersArray(play),
    };
  }

  async getInteractions(id: string, userId?: string, role?: string) {
    const play = role ? await this.findVisibleEntity(id, role) : await this.findOneEntity(id);
    return this.buildInteractions(play, userId);
  }

  async toggleLike(id: string, userId: string, role: string, userName?: string | null) {
    const play = await this.findVisibleEntity(id, role);
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

  async recordShare(id: string, userId: string, role: string, userName?: string | null) {
    const play = await this.findVisibleEntity(id, role);
    const shares = this.getSharesArray(play);
    shares.push({
      userId,
      role,
      userName: userName?.trim() || null,
      sharedAt: new Date().toISOString(),
    });

    await this.playRepository.update(id, { shares });
    return this.buildInteractions({ ...play, shares }, userId);
  }

  async addComment(id: string, user: { id: string; role: string; name?: string | null }, message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new BadRequestException('Comment message is required');
    }

    const play = await this.findVisibleEntity(id, user.role);
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

    const play = await this.findOneEntity(id);
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

  async deleteComment(id: string, commentId: string) {
    const play = await this.findOneEntity(id);
    const comments = this.getCommentsArray(play);
    const nextComments = comments.filter((comment) => comment.id !== commentId);

    if (nextComments.length === comments.length) {
      throw new NotFoundException('Comment not found');
    }

    await this.playRepository.update(id, { comments: nextComments });
    return this.buildInteractions({ ...play, comments: nextComments });
  }

  async getStats() {
    const all = await this.playRepository.find();
    const totalViews = all.reduce((sum, p) => sum + (p.viewCount ?? 0), 0);
    const uniqueViewers = new Set(
      all.flatMap((p) => this.getViewersArray(p).map((v) => v.userId)),
    ).size;
    const totalLikes = all.reduce((sum, play) => sum + this.getLikesArray(play).length, 0);
    const totalComments = all.reduce((sum, play) => sum + this.getCommentsCount(play), 0);
    const totalShares = all.reduce((sum, play) => sum + this.getSharesArray(play).length, 0);
    return {
      totalPlays: all.length,
      activePlays: all.filter((p) => p.isActive).length,
      totalViews,
      uniqueViewers,
      totalLikes,
      totalComments,
      totalShares,
    };
  }

  async getInstagramSyncStatus() {
    const accountId = this.getInstagramAccountId();
    const token = this.getInstagramAccessToken();
    const lastSync = this.configService.get<string>('INSTAGRAM_LAST_SYNC_NOTE') ?? null;
    const syncedCount = await this.playRepository.count({
      where: { externalSource: 'instagram' },
    });

    return {
      enabled: Boolean(accountId && token),
      accountConfigured: Boolean(accountId),
      tokenConfigured: Boolean(token),
      syncedCount,
      lastSync,
      requiredEnv: ['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN'],
    };
  }

  async syncInstagramVideos(options: { silent?: boolean; limit?: number } = {}) {
    const accountId = this.getInstagramAccountId();
    const token = this.getInstagramAccessToken();
    const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);

    if (!accountId || !token) {
      const result = {
        message: 'Instagram sync skipped. Configure INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN.',
        configured: false,
        created: 0,
        updated: 0,
        skipped: 0,
      };
      if (!options.silent) return result;
      this.logger.debug(result.message);
      return result;
    }

    try {
      const media = await this.fetchInstagramMedia(accountId, token, limit);
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const item of media) {
        if (item.media_type !== 'VIDEO' || !item.media_url) {
          skipped += 1;
          continue;
        }

        const existing = await this.playRepository.findOne({
          where: { externalSource: 'instagram', externalId: item.id },
        });
        const caption = (item.caption ?? '').trim();
        const title = this.buildInstagramTitle(caption);
        const payload: Partial<Play> = {
          title,
          description: caption || 'SRV Electricals Instagram video',
          videoUrl: item.media_url,
          thumbnailUrl: item.thumbnail_url ?? null,
          category: 'reels',
          isActive: true,
          displayOrder: existing?.displayOrder ?? 0,
          targetRoles: existing?.targetRoles?.length ? existing.targetRoles : [...PLAY_TARGET_ROLES],
          externalSource: 'instagram',
          externalId: item.id,
          externalPermalink: item.permalink ?? null,
          externalPublishedAt: item.timestamp ? new Date(item.timestamp) : null,
        };

        if (existing) {
          await this.playRepository.update(existing.id, payload);
          updated += 1;
        } else {
          await this.playRepository.save(this.playRepository.create(payload));
          created += 1;
        }
      }

      return {
        message: 'Instagram videos synced successfully',
        configured: true,
        fetched: media.length,
        created,
        updated,
        skipped,
      };
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || error?.message || 'Instagram sync failed';
      if (options.silent) {
        this.logger.warn(`Instagram sync failed: ${message}`);
        return { message, configured: true, created: 0, updated: 0, skipped: 0 };
      }
      throw new BadRequestException(message);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncInstagramVideosOnSchedule() {
    await this.syncInstagramVideos({ silent: true });
  }

  private getViewersArray(play: Play): PlayViewer[] {
    return Array.isArray(play.viewers) ? play.viewers : [];
  }

  private async findOneEntity(id: string) {
    const play = await this.playRepository.findOne({ where: { id } });
    if (!play) throw new NotFoundException('Play not found');
    return play;
  }

  private async findVisibleEntity(id: string, role: string) {
    const play = await this.findOneEntity(id);
    if (!play.isActive || !this.isVisibleForRole(play, role)) {
      throw new NotFoundException('Play not found');
    }
    return play;
  }

  private normalizeRole(role?: string | null): PlayTargetRole | null {
    const value = role?.trim().toLowerCase();
    switch (value) {
      case 'dealer':
      case 'electrician':
      case 'user':
      case 'counterboy':
        return value;
      case 'customer':
        return 'user';
      case 'counter_boy':
      case 'counter-boy':
      case 'counter boy':
        return 'counterboy';
      default:
        return null;
    }
  }

  private normalizeTargetRoles(input: unknown, useDefault = false): PlayTargetRole[] {
    if (Array.isArray(input)) {
      const collected = new Set<PlayTargetRole>();
      for (const value of input) {
        if (typeof value !== 'string') {
          continue;
        }

        const normalizedValue = value.trim().toLowerCase();
        if (normalizedValue === 'all' || normalizedValue === 'both') {
          return [...PLAY_TARGET_ROLES];
        }

        const normalizedRole = this.normalizeRole(value);
        if (normalizedRole) {
          collected.add(normalizedRole);
        }
      }

      if (collected.size > 0) {
        return [...collected];
      }
    }

    if (typeof input === 'string') {
      return this.normalizeTargetRoles(
        input
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        useDefault,
      );
    }

    return useDefault ? ['user'] : [];
  }

  private getTargetRoles(play: Play): PlayTargetRole[] {
    return this.normalizeTargetRoles(play.targetRoles, true);
  }

  private isVisibleForRole(play: Play, role: string) {
    const normalizedRole = this.normalizeRole(role);
    if (!normalizedRole) {
      return false;
    }

    return this.getTargetRoles(play).includes(normalizedRole);
  }

  private prepareWriteBody(body: Partial<Play>) {
    const payload: Partial<Play> & { targetRole?: unknown } = { ...body } as any;
    const rawTargetRoles = payload.targetRoles ?? payload.targetRole;

    if (rawTargetRoles !== undefined) {
      payload.targetRoles = this.normalizeTargetRoles(rawTargetRoles, true);
    }

    delete payload.targetRole;
    return payload;
  }

  private serializePlay(play: Play) {
    const {
      viewers: _viewers,
      likes: _likes,
      comments: _comments,
      shares: _shares,
      ...rest
    } = play;
    return {
      ...rest,
      targetRoles: this.getTargetRoles(play),
      likeCount: this.getLikesArray(play).length,
      commentCount: this.getCommentsCount(play),
      shareCount: this.getSharesArray(play).length,
    };
  }

  private getLikesArray(play: Play): PlayLike[] {
    return Array.isArray(play.likes) ? play.likes : [];
  }

  private getSharesArray(play: Play): PlayShare[] {
    return Array.isArray(play.shares) ? play.shares : [];
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
    const shares = this.getSharesArray(play);

    return {
      playId: play.id,
      likeCount: likes.length,
      shareCount: shares.length,
      likedByMe: userId ? likes.some((like) => like.userId === userId) : false,
      comments,
    };
  }

  private getInstagramAccountId() {
    return this.configService.get<string>('INSTAGRAM_USER_ID')?.trim();
  }

  private getInstagramAccessToken() {
    return this.configService.get<string>('INSTAGRAM_ACCESS_TOKEN')?.trim();
  }

  private async fetchInstagramMedia(accountId: string, token: string, limit: number) {
    const apiVersion = this.configService.get<string>('INSTAGRAM_GRAPH_VERSION', 'v23.0');
    const response = await axios.get<{ data?: InstagramMediaItem[] }>(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(accountId)}/media`,
      {
        params: {
          fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp',
          access_token: token,
          limit,
        },
        timeout: 15000,
      },
    );

    return Array.isArray(response.data?.data) ? response.data.data : [];
  }

  private buildInstagramTitle(caption: string) {
    const firstLine = caption
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (!firstLine) return 'SRV Instagram Reel';
    return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
  }

}
