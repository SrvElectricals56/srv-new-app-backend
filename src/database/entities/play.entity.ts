import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type PlayViewer = {
  userId: string;
  role: string;
  viewedAt: string;
};

export type PlayLike = {
  userId: string;
  role: string;
  userName?: string | null;
  likedAt: string;
};

export type PlayShare = {
  userId: string;
  role: string;
  userName?: string | null;
  sharedAt: string;
};

export type PlayCommentReply = {
  id: string;
  message: string;
  authorId: string;
  authorName?: string | null;
  authorRole: string;
  createdAt: string;
};

export type PlayComment = {
  id: string;
  message: string;
  authorId: string;
  authorName?: string | null;
  authorRole: string;
  createdAt: string;
  replies: PlayCommentReply[];
};

@Entity('plays')
export class Play {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  videoUrl: string;           // YouTube / direct URL

  @Column({ nullable: true })
  thumbnailUrl: string;

  @Column({ default: 'reels' })
  category: string;           // reels | guides | tips

  @Column({ default: 0 })
  displayOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'text', array: true, nullable: true })
  targetRoles: string[];

  @Column({ default: 0 })
  viewCount: number;

  // JSON array of { userId, role, viewedAt }
  @Column({ type: 'jsonb', default: '[]' })
  viewers: PlayViewer[];

  // JSON array of { userId, role, userName?, likedAt }
  @Column({ type: 'jsonb', default: '[]' })
  likes: PlayLike[];

  // JSON array of { userId, role, userName?, sharedAt }
  @Column({ type: 'jsonb', default: '[]' })
  shares: PlayShare[];

  // JSON array of comments with nested replies.
  @Column({ type: 'jsonb', default: '[]' })
  comments: PlayComment[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
