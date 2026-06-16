import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { UserRole } from '../../common/enums';

export enum AppActivityEventType {
  SCREEN_VIEW = 'screen_view',
  SCREEN_TIME = 'screen_time',
  PRODUCT_VIEW = 'product_view',
  PRODUCT_ADD_TO_CART = 'product_add_to_cart',
  PRODUCT_BUY_NOW = 'product_buy_now',
  PROFILE_VIEW = 'profile_view',
  BUTTON_TAP = 'button_tap',
}

@Entity('app_activity_events')
@Index(['userId', 'userRole', 'createdAt'])
@Index(['eventType', 'createdAt'])
export class AppActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  userRole: UserRole;

  @Column()
  userName: string;

  @Column({ nullable: true })
  userPhone: string;

  @Column({ nullable: true })
  userCode: string;

  @Column({
    type: 'enum',
    enum: AppActivityEventType,
  })
  eventType: AppActivityEventType;

  @Column()
  eventLabel: string;

  @Column({ nullable: true })
  screen: string;

  @Column({ nullable: true })
  previousScreen: string;

  @Column({ nullable: true })
  productId: string;

  @Column({ nullable: true })
  productName: string;

  @Column({ nullable: true })
  productCategory: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
