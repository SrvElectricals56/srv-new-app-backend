# SRV Deployment Cleanup Report

Prepared for: Deployment and Technical Review  
Prepared on: 2026-06-24  
Scope: Backend, Admin Frontend, Mobile App Frontend, Prisma schema, migrations, scripts, and local database structure

## 1. Purpose

This report identifies database tables, migration files, scripts, and dependencies that appear unused, duplicated, legacy, or risky before deployment.

The goal is not to remove features blindly. The goal is to give the deployment team a clear, professional checklist of what should be reviewed, archived, removed, or kept before the project is deployed.

No files or database objects were deleted during this audit.

## 2. Overall Finding

The project is currently a NestJS backend using TypeORM as the main runtime database layer. Prisma is still present, but it is only actively required for admin permission management.

Most business-critical modules are active and should not be removed:

- Admin authentication and permissions
- Dealers, electricians, customers, and counter boys
- Products, product categories, QR codes, scans
- Wallet, redemptions, transfers, product orders, gift orders
- Banners, offers, testimonials, notifications
- Settings, app icons, support tickets, app activity, app ratings
- Mobile push tokens and sub-dealer onboarding

The main cleanup opportunities are:

- Legacy QR backup tables
- Empty Prisma-only feature tables
- Old OTP/profile/QR helper tables that are no longer used by active code
- One-time SQL migration files
- One-time import and seed scripts
- Unused duplicate PostgreSQL enum types
- Prisma dependencies after admin permissions are moved to TypeORM

## 3. Priority Summary

| Priority | Area | Action |
| --- | --- | --- |
| High | QR backup tables | Export if needed, then remove from deploy database. |
| High | Empty Prisma-only tables | Remove if related features are not planned for this release. |
| Medium | OTP/profile/QR legacy tables | Export first, then remove after business confirmation. |
| Medium | Prisma usage | Keep until `admin_permissions` is migrated to TypeORM. |
| Medium | Prisma migration files | Archive after a clean deployment schema/migration is prepared. |
| Low | Duplicate enum types | Remove only after staging verification. |
| Low | One-time scripts | Exclude from production artifact unless operations still need them. |

## 4. High-Confidence Database Cleanup

These tables are not used by the active backend modules or frontend flows.

| Table | Current Rows | Reason | Recommended Action |
| --- | ---: | --- | --- |
| `qr_codes_backup_20260618083100` | 1301 | Backup table. No entity, controller, service, or frontend usage found. | Export once if required, then drop. |
| `qr_codes_backup_20260618083135` | 5301 | Backup table. No runtime usage found. | Export once if required, then drop. |
| `qr_codes_backup_20260618083208` | 5301 | Backup table. No runtime usage found. | Export once if required, then drop. |
| `chat_conversations` | 0 | Prisma-only table. No chat module exists in active backend. | Drop if chat is not in this release. |
| `chat_messages` | 0 | Prisma-only table paired with unused chat feature. | Drop with `chat_conversations`. |
| `festivals` | 0 | Prisma-only table. Active festival API reads theme from `settings`, not this table. | Drop if no dedicated festival admin feature is planned. |
| `reward_schemes` | 0 | Prisma-only table. Active reward scheme API maps gift products from `products`. | Drop if gift products remain the reward source. |

## 5. Medium-Confidence Database Cleanup

These tables look unused by current runtime code, but they contain data or could have historical value. Export before removal.

| Table | Current Rows | Current Runtime Behavior | Recommended Action |
| --- | ---: | --- | --- |
| `otp_codes` | 8 | Mobile OTP currently uses in-memory storage in backend code. | Export, confirm no external OTP process uses it, then drop. |
| `user_profile_images` | 4 | Profile photos are stored directly on role tables via `profileImage`. | Export images, confirm they are not needed, then drop. |
| `user_qr_codes` | 1 | User QR API generates QR data dynamically from user code/id. | Export single row, confirm no legacy QR image is needed, then drop. |
| `_prisma_migrations` | 1 | Prisma migration metadata. | Keep until Prisma is fully retired from backend runtime. |

## 6. Tables That Should Not Be Removed

The following tables are active and should remain in the deployment database.

| Table Group | Tables | Reason |
| --- | --- | --- |
| Admin | `admins`, `admin_permissions` | Admin login, roles, and permissions. |
| User roles | `dealers`, `electricians`, `app_users`, `counterboys` | Core business users for admin and mobile app. |
| Catalog and QR | `products`, `product_categories`, `qr_codes`, `scans` | Product catalog, QR generation, and scan history. |
| Wallet and redemption | `wallet_transactions`, `redemptions` | Wallet balance, transfers, withdrawal, redemption history. |
| Orders | `product_cart_items`, `product_orders`, `gift_orders` | COD, Razorpay, cart, delivery, gift order workflows. |
| App content | `banners`, `offers`, `testimonials`, `notifications` | Admin-managed content consumed by mobile app. |
| App configuration | `settings`, `points_config` | App settings, role controls, points configuration, rating history joins. |
| Support and activity | `support_tickets`, `app_activity_events`, `app_ratings` | Support workflow, app analytics, app rating history. |
| App operations | `app_icons`, `mobile_push_tokens`, `sub_dealers`, `plays` | App icon management, push notifications, fallback dealer flow, play/video content. |

## 7. Prisma Review

### Current Status

Prisma is not the primary backend ORM. TypeORM is the primary ORM.

However, Prisma is still actively used in:

- `src/modules/admin/admin.service.ts`
- `AdminService.getPermissions()`
- `AdminService.updatePermissions()`
- Table: `admin_permissions`

Because of this, Prisma should not be removed yet.

### Prisma Models That Look Unused

These Prisma models do not have active TypeORM modules and are not directly used by runtime code:

| Prisma Model | Database Table | Finding |
| --- | --- | --- |
| `ChatConversation` | `chat_conversations` | No active chat feature found. |
| `ChatMessage` | `chat_messages` | No active chat feature found. |
| `Festival` | `festivals` | Active festival API reads from `settings`. |
| `OtpCode` | `otp_codes` | Active OTP uses in-memory storage. |
| `RewardScheme` | `reward_schemes` | Active reward schemes are mapped from gift products. |
| `UserProfileImage` | `user_profile_images` | Active profile photo uses role table `profileImage`. |
| `UserQrCode` | `user_qr_codes` | Active user QR is generated dynamically. |

### Recommended Prisma Cleanup Plan

1. Create a TypeORM entity for `admin_permissions`.
2. Register it in the backend module structure.
3. Replace Prisma calls in `AdminService` with TypeORM repository calls.
4. Verify admin permission editing in the admin panel.
5. Remove Prisma dependencies and scripts only after the above works.
6. Remove `_prisma_migrations` only after Prisma migration tooling is fully retired.

## 8. Migration File Review

### Prisma Migration Files

The folder `prisma/migrations` contains legacy and manual SQL migration files. The active backend does not appear to run Prisma migrations as part of deployment.

Files to archive after creating a clean deployment baseline:

- `prisma/migrations/20260430100926_fix_uuid_defaults/migration.sql`
- `prisma/migrations/add_user_counterboy_roles.sql`
- `prisma/migrations/manual_add_aadhar_images.sql`
- `prisma/migrations/20260508_add_play_interactions_columns.sql`
- `prisma/migrations/20260508_counterboy_wallet_bank_fields.sql`
- `prisma/migrations/20260523_add_app_icons_table.sql`
- `prisma/migrations/20260523_fix_counterboy_missing_columns.sql`
- `prisma/migrations/20260527_add_password_hash_to_electricians_dealers.sql`
- `prisma/migrations/migration_lock.toml`

Recommendation:

Do not delete these blindly from source control. First create a clean production baseline migration or schema dump that represents the current required schema.

### TypeORM Migration

Keep this file for now:

- `src/database/migrations/1716645600000-add-play-target-roles.ts`

Reason:

It adds `plays.targetRoles`, which is used by the active Play module. It can be folded into a consolidated baseline later.

## 9. Script Review

These scripts should not be part of a normal production deployment image unless the operations team explicitly needs them.

| Script | Type | Recommendation |
| --- | --- | --- |
| `scripts/import-legacy-qr.mjs` | One-time legacy import | Archive after final import. Do not ship by default. |
| `scripts/import-razorpay-keys.mjs` | One-time Razorpay helper | Archive or keep only in secure operations tooling. |
| `src/database/seeds/seed.ts` | Development seed | Do not run in production. It uses development-style setup. |
| `src/database/seeds/app-seed.ts` | Demo/sample seed | Do not run in production. |
| `src/database/seeds/update-product-images.ts` | One-time image update | Archive after image data is finalized. |

## 10. Dependency Review

### Backend

| Dependency | Current Assessment | Recommendation |
| --- | --- | --- |
| `@prisma/client` | Still required by `AdminService`. | Keep until admin permissions are converted to TypeORM. |
| `prisma` | Needed only for Prisma tooling. | Keep only while Prisma workflow remains. |
| `mysql2` | Current backend database is Postgres. Likely legacy/import related. | Remove if no MySQL import work remains. |
| `sqlite3` | Current backend database is Postgres. | Remove unless tests/local tooling require it. |

### Admin Frontend

The admin frontend uses export/report features, so review before removing:

- `docx`
- `officegen`
- `jszip`
- `jspdf`
- `xlsx`

### Mobile App

No obvious cleanup dependency was identified. Current flows use camera, notifications, image upload, location, Razorpay, web browser, and file/document features.

## 11. PostgreSQL Enum Cleanup

The database contains duplicate enum types that currently have no dependent columns. They are cleanup candidates after staging verification.

Candidate enum types:

- `admins_role_enum`
- `dealers_kycstatus_enum`
- `dealers_status_enum`
- `dealers_tier_enum`
- `electricians_kycstatus_enum`
- `electricians_status_enum`
- `electricians_subcategory_enum`
- `electricians_tier_enum`
- `notifications_status_enum`
- `offers_status_enum`
- `redemptions_role_enum`
- `redemptions_status_enum`
- `scans_mode_enum`
- `scans_role_enum`
- `support_tickets_priority_enum`
- `support_tickets_status_enum`
- `support_tickets_userrole_enum`
- `wallet_transactions_source_enum`
- `wallet_transactions_type_enum`
- `wallet_transactions_userrole_enum`

Do not remove enum types that are still attached to columns, including:

- `AdminRole`
- `UserRole`
- `MemberTier`
- `UserStatus`
- `KYCStatus`
- `ElectricianSubCategory`
- `ScanMode`
- `RedemptionStatus`
- `NotificationStatus`
- `OfferStatus`
- `TransactionType`
- `TransactionSource`
- `SupportTicketStatus`
- `SupportTicketPriority`
- `GiftOrderStatus`
- `product_cart_items_userrole_enum`
- `product_orders_status_enum`
- `product_orders_userrole_enum`
- `app_activity_events_eventtype_enum`
- `app_activity_events_userrole_enum`

## 12. Recommended Cleanup Sequence

Follow this order to reduce deployment risk.

1. Take a full PostgreSQL backup.
2. Restore the backup into a staging database.
3. Drop or archive QR backup tables in staging.
4. Drop empty unused Prisma-only feature tables in staging.
5. Export and review `otp_codes`, `user_profile_images`, and `user_qr_codes`.
6. Smoke test backend, admin frontend, and mobile app.
7. Convert `admin_permissions` from Prisma to TypeORM if you want a TypeORM-only backend.
8. Remove Prisma dependencies only after admin permissions work without Prisma.
9. Archive one-time scripts and old migration files from production artifacts.
10. Clean unused enum types after staging validation.
11. Repeat smoke tests.
12. Apply the approved cleanup to production.

## 13. Smoke Test Checklist

Backend:

- Admin login and token refresh
- Admin permissions view and update
- Product list, create, update
- QR list, generate, scan
- Wallet history and redemption history
- Product order delivered flow
- Gift order flow
- Notifications and push token lookup
- Settings and app rating history
- App icon API
- Support tickets

Admin frontend:

- Login
- Dashboard
- Product orders and delivered button
- QR management
- Users, dealers, electricians, counter boys
- Settings
- Admin permissions
- Export buttons

Mobile app:

- Login/signup for all roles
- Product list
- COD order
- Razorpay order
- My Orders
- QR scan
- Wallet
- Profile update and profile photo
- Profile QR code
- Support ticket
- Rating
- Notifications
- Plays

## 14. Final Recommendation

For this deployment, the safest immediate cleanup is:

1. Remove or archive the three `qr_codes_backup_*` tables after backup.
2. Remove empty unused tables: `chat_conversations`, `chat_messages`, `festivals`, `reward_schemes`.
3. Export and review `otp_codes`, `user_profile_images`, and `user_qr_codes`.
4. Do not remove `admin_permissions`, Prisma packages, or Prisma metadata until admin permissions are migrated to TypeORM.
5. Exclude one-time import and seed scripts from production deployment artifacts.

The biggest architectural cleanup item is Prisma. It is mostly legacy now, but it is still required for admin permissions. Removing Prisma before replacing that permission logic would break the admin panel.
