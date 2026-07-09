import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('qr_download_history')
export class QrDownloadHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  adminId: string;

  @Column({ nullable: true })
  adminEmail: string;

  @Column({ nullable: true })
  adminName: string;

  @Column({ default: 'staff' })
  adminRole: string;

  @Column({ nullable: true })
  productId: string;

  @Column()
  productName: string;

  @Column({ nullable: true })
  batchId: string;

  @Column({ type: 'integer', nullable: true })
  batchNo: number | null;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ default: 'qr' })
  downloadType: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  downloadedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
