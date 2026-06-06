import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('banners')
export class Banner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true, default: '#FFFFFF' })
  bgColor: string;

  @Column({ nullable: true, default: 'cover' })
  resizeMode: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  displayOrder: number;

  @Column({ type: 'text', array: true, nullable: true })
  targetRole: string[];

  @Column({ nullable: true })
  linkUrl: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ default: 0 })
  order: number;

  @Column({ default: 0 })
  clickCount: number;

  @Column({ default: 0 })
  viewCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
