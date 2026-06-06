import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('testimonials')
export class Testimonial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  personName: string;

  @Column({ nullable: true })
  initials: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true, default: 'Silver' })
  tier: string;

  @Column({ default: 1 })
  yearsConnected: number;

  @Column({ type: 'text' })
  quote: string;

  @Column({ nullable: true })
  highlight: string;

  @Column({ type: 'text', array: true, nullable: true })
  gradientColors: string[];

  @Column({ nullable: true })
  ringColor: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 1 })
  displayOrder: number;

  @Column({ nullable: true, default: 'all' })
  userCategory: string; // 'all' | 'electrician' | 'dealer' | 'customer' | 'counterboy'

  // Legacy fields kept for backward compat
  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  role: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 5.0, nullable: true })
  rating: number;

  @Column({ nullable: true })
  imageUrl: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
