import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('app_icons')
@Index('IDX_app_icons_native_key', ['nativeKey'], { unique: true, where: '"nativeKey" IS NOT NULL' })
export class AppIcon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  nativeKey: string | null;

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: 0 })
  displayOrder: number;

  @Column({ nullable: true })
  updatedBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
