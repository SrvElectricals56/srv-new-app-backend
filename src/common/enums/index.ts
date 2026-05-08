export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  STAFF = 'staff',
}

export enum UserRole {
  DEALER = 'dealer',
  ELECTRICIAN = 'electrician',
  USER = 'user',
  COUNTERBOY = 'counterboy',
}

export enum MemberTier {
  SILVER = 'Silver',
  GOLD = 'Gold',
  PLATINUM = 'Platinum',
  DIAMOND = 'Diamond',
}

export enum UserStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum ScanMode {
  SINGLE = 'single',
  MULTI = 'multi',
}

export enum RedemptionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

export enum NotificationStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  FAILED = 'failed',
}

export enum OfferStatus {
  ACTIVE = 'active',
  SCHEDULED = 'scheduled',
  EXPIRED = 'expired',
  INACTIVE = 'inactive',
}

export enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum TransactionSource {
  SCAN = 'scan',
  BONUS = 'bonus',
  REDEMPTION = 'redemption',
  TRANSFER = 'transfer',
  REFUND = 'refund',
  COMMISSION = 'commission',
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportTicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ElectricianSubCategory {
  GENERAL_ELECTRICIAN = 'General Electrician',
  INDUSTRIAL_ELECTRICIAN = 'Industrial Electrician',
  RESIDENTIAL_WIRING = 'Residential Wiring',
  SOLAR_INSTALLER = 'Solar Installer',
  AC_APPLIANCE_TECHNICIAN = 'AC/Appliance Technician',
  PANEL_BOARD_SPECIALIST = 'Panel Board Specialist',
  LIGHTING_SPECIALIST = 'Lighting Specialist',
  CONTRACTOR = 'Contractor',
}

export enum KYCStatus {
  NOT_SUBMITTED = 'not_submitted',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export enum BankAccountType {
  SAVINGS = 'savings',
  CURRENT = 'current',
}
