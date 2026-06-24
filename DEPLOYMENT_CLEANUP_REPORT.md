# Deployment Cleanup Audit Report

Project: SRV Admin Backend, Admin Frontend, Mobile App Frontend  
Backend path: `C:\Users\dell\Desktop\ADMIN-BACKEND`  
Admin frontend path: `C:\Users\dell\Desktop\ADMIN-FRONTEND`  
App frontend path: `C:\Users\dell\Desktop\NEW APP`  
Audit date: 2026-06-24

## Executive Summary

The current production-facing backend is primarily a NestJS + TypeORM application. Prisma is present and active only for `admin_permissions` through `AdminService`; most other Prisma models are not used by runtime code.

The highest confidence cleanup candidates are legacy backup tables, empty Prisma-only feature tables, one-off SQL migration files, and one-time import scripts. Do not delete core tables such as `products`, `qr_codes`, `scans`, `wallet_transactions`, role tables, orders, settings, notifications, banners, offers, gifts, support, app icons, plays, app ratings, mobile push tokens, or sub-dealers.

Before removing anything from the live database, take a full database backup and test the removal on a staging clone.

## Audit Scope And Evidence

Checked:

- Backend TypeORM entities, modules, controllers, raw SQL, package scripts, seeds, migrations, and Prisma schema.
- Admin frontend API client usage in `src/lib/api.ts`.
- Mobile app API usage in `src/shared/api/services.ts`.
- Live local PostgreSQL table inventory and row counts from database `srv_admin`.
- Prisma-only models and references.
- Enum dependency usage in PostgreSQL.

Runtime observations:

- `DB_SYNCHRONIZE=false`; deployment should rely on controlled migrations, not automatic schema sync.
- TypeORM runtime entities are registered in `src/app.module.ts`.
- Prisma client is imported only by `src/modules/admin/admin.service.ts` for `adminPermission`.

## Database Tables: Removal Candidates

### High Confidence Remove Or Archive

| Table | Rows | Why It Looks Unwanted | Recommendation |
| --- | ---: | --- | --- |
| `qr_codes_backup_20260618083100` | 1301 | Backup table, no backend entity, no controller/module usage, not referenced by frontend. | Export once if needed, then drop from deploy database. |
| `qr_codes_backup_20260618083135` | 5301 | Backup table, no runtime reference. | Export once if needed, then drop. |
| `qr_codes_backup_20260618083208` | 5301 | Backup table, no runtime reference. | Export once if needed, then drop. |
| `chat_conversations` | 0 | Prisma-only table. No Nest module/controller/service uses chat. | Drop if chat feature is not planned for this release. |
| `chat_messages` | 0 | Prisma-only table paired with unused chat feature. | Drop with `chat_conversations` if chat is out of scope. |
| `festivals` | 0 | Prisma-only table. Active mobile festival endpoint reads theme values from `settings`, not this table. | Drop if no dedicated festival admin feature is planned. |
| `reward_schemes` | 0 | Prisma-only table. Active `/mobile/reward-schemes` maps gift products from `products` where category is `gift`. | Drop if gift products remain the reward source. |

### Medium Confidence Remove After Export Or Business Confirmation

| Table | Rows | Why It Looks Unwanted | Risk / Check Before Removal |
| --- | ---: | --- | --- |
| `otp_codes` | 8 | Runtime mobile OTP uses in-memory `otpStore`, not this table. No active TypeORM entity. | Rows may be old/stale. Confirm no external OTP service expects DB-backed OTP history. |
| `user_profile_images` | 4 | Current profile photo update writes `profileImage` directly onto `electricians`, `dealers`, `app_users`, or `counterboys`. | Export first if these base64/image records are valuable historical uploads. |
| `user_qr_codes` | 1 | Current `/mobile/profile/qr-code` generates QR value dynamically from user code/id and does not read this table. | Export the single row first; remove if no legacy QR image is needed. |
| `_prisma_migrations` | 1 | Prisma migration metadata. Runtime is TypeORM-first. | Only remove if Prisma migrations will no longer be used. Keep while `AdminService` still uses Prisma client. |

## Database Tables To Keep

These are active in backend modules and/or frontend flows:

| Table | Why Keep |
| --- | --- |
| `admins` | Admin auth and admin management. |
| `admin_permissions` | Actively used by Prisma in `AdminService`. Do not drop unless replacing Prisma permission logic with TypeORM first. |
| `dealers`, `electricians`, `app_users`, `counterboys` | Core role tables used by admin and mobile app. |
| `products`, `product_categories`, `qr_codes`, `scans` | Product catalog, QR scanning, admin QR management, mobile scanning. |
| `wallet_transactions`, `redemptions` | Wallet, transfers, withdrawals, redemption history. |
| `product_cart_items`, `product_orders`, `gift_orders` | COD/Razorpay cart and order flows plus gift orders. |
| `banners`, `offers`, `testimonials`, `notifications` | Admin-managed content consumed by mobile app. |
| `settings`, `points_config` | App settings, role page controls, point rules, app rating history joins. |
| `support_tickets` | Mobile support and admin support workflow. |
| `app_icons` | Admin app icon management. |
| `app_activity_events` | Mobile activity tracking and admin role activity insights. |
| `plays` | Admin play/video content and mobile play interactions. |
| `app_ratings` | Mobile rating API and admin rate-us history. |
| `mobile_push_tokens` | Push-token registration and targeted notification sending. |
| `sub_dealers` | Current fallback dealer/onboarding workflow uses it. |

## PostgreSQL Enum Cleanup Candidates

The live database contains duplicate legacy TypeORM enum types with no dependent columns. These are candidates for cleanup after staging verification:

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

Do not remove enum types that currently have dependent columns, including:

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

## Prisma Structure Audit

### Keep For Now

Prisma cannot be removed completely today because:

- `src/modules/admin/admin.service.ts` imports `PrismaClient`.
- `AdminService.getPermissions()` reads `prisma.adminPermission.findMany`.
- `AdminService.updatePermissions()` uses `deleteMany` and `createMany`.
- Live `admin_permissions` has 12 rows.

### Recommended Future Cleanup

If you want a TypeORM-only backend before deployment:

1. Create a TypeORM `AdminPermission` entity mapped to `admin_permissions`.
2. Register it in `AppModule` and `AdminModule`.
3. Replace `PrismaClient` calls in `AdminService` with TypeORM repository calls.
4. Remove `@prisma/client`, `prisma`, package script `studio`, `prisma/schema.prisma`, and `prisma/migrations`.
5. Remove `_prisma_migrations` only after Prisma migration tooling is fully retired.

### Prisma Models That Look Unused Or Duplicative

These Prisma models do not have active TypeORM modules and are not directly used by runtime code:

- `ChatConversation`
- `ChatMessage`
- `Festival`
- `OtpCode`
- `RewardScheme`
- `UserProfileImage`
- `UserQrCode`

Important nuance:

- `RewardScheme` feature exists in mobile UI, but backend implements it from `products` gift rows, not the `reward_schemes` table.
- `Festival` endpoint exists, but backend reads from `settings`, not `festivals`.
- Profile image and user QR endpoints exist, but backend stores/generates them without `user_profile_images` or `user_qr_codes`.

## Migration Files: Cleanup Candidates

### Prisma SQL Migrations

The folder `prisma/migrations` contains legacy/manual SQL migrations, but the active backend does not run `prisma migrate deploy` from package scripts. Package scripts only expose `studio`.

Candidates to archive from deploy artifacts after consolidating schema:

- `prisma/migrations/20260430100926_fix_uuid_defaults/migration.sql`
- `prisma/migrations/add_user_counterboy_roles.sql`
- `prisma/migrations/manual_add_aadhar_images.sql`
- `prisma/migrations/20260508_add_play_interactions_columns.sql`
- `prisma/migrations/20260508_counterboy_wallet_bank_fields.sql`
- `prisma/migrations/20260523_add_app_icons_table.sql`
- `prisma/migrations/20260523_fix_counterboy_missing_columns.sql`
- `prisma/migrations/20260527_add_password_hash_to_electricians_dealers.sql`
- `prisma/migrations/migration_lock.toml`

Reason:

- These are one-off schema patches and legacy baseline files.
- Current backend contains many runtime `ALTER TABLE IF NOT EXISTS` guards.
- Current TypeORM entities and live schema have moved beyond the Prisma baseline.

Do not delete these from source history until you create a clean deployment migration or SQL schema dump for production.

### TypeORM Migration

Keep for now:

- `src/database/migrations/1716645600000-add-play-target-roles.ts`

Reason:

- It is the only TypeORM migration file.
- It adds `plays.targetRoles`, which is used by the active Play module.
- After production schema is confirmed to already include `plays.targetRoles`, it can be folded into a consolidated baseline migration.

## Script Cleanup Candidates

| File | Purpose | Deployment Recommendation |
| --- | --- | --- |
| `scripts/import-legacy-qr.mjs` | One-time importer from legacy SQL dump into products/QR/users. | Do not ship in production image unless another legacy import is planned. Archive after final import. |
| `scripts/import-razorpay-keys.mjs` | One-time helper for Razorpay environment/key import. | Do not ship in production image. Keep only in secure operations docs/tools if still needed. |
| `src/database/seeds/seed.ts` | Development seed script with `synchronize: true`. | Do not run in production. Remove from deploy artifact or clearly mark dev-only. |
| `src/database/seeds/app-seed.ts` | Application sample data seed. | Dev/demo only. Do not run against production. |
| `src/database/seeds/update-product-images.ts` | One-off product image update script. | Archive after image migration is complete. |

Package script cleanup candidates after replacing Prisma:

- `studio`
- `typeorm`, `migration:generate`, `migration:run`, `migration:revert` if you are not using TypeORM CLI migrations operationally.
- `seed` should not be available in production deployment scripts.

## Dependency Cleanup Candidates

Backend dependencies to review:

- `@prisma/client` and `prisma`: keep until `AdminService` no longer uses Prisma.
- `mysql2`: likely only needed for old import/legacy compatibility; current TypeORM config uses Postgres. Remove if no MySQL import scripts remain.
- `sqlite3`: not used by current Postgres runtime. Remove unless tests or local dev need SQLite.

Admin frontend dependencies to review:

- `docx`, `officegen`, `jszip`, `jspdf`, `xlsx`: keep only if export/report features actively use them. The UI has export features, so verify before removing.

Mobile app dependencies to review:

- No obvious database-cleanup dependency issue. Mobile app uses Razorpay, notifications, file/image upload, camera, location, and document tools in current flows.

## Recommended Cleanup Order

1. Take a full Postgres backup.
2. On staging, drop or archive clear backup tables first:
   - `qr_codes_backup_20260618083100`
   - `qr_codes_backup_20260618083135`
   - `qr_codes_backup_20260618083208`
3. Drop empty unused Prisma-only feature tables on staging:
   - `chat_conversations`
   - `chat_messages`
   - `festivals`
   - `reward_schemes`
4. Export and then decide on low-volume legacy tables:
   - `otp_codes`
   - `user_profile_images`
   - `user_qr_codes`
5. Replace Prisma usage for `admin_permissions` if you want TypeORM-only deployment.
6. After Prisma is removed from runtime, archive `prisma/migrations`, remove Prisma dependencies/scripts, and drop `_prisma_migrations`.
7. Clean unused enum types after confirming no dependencies on staging.
8. Build and smoke test:
   - Backend: auth, admin permissions, product list, QR list, scan, wallet, orders, gifts, notifications, settings, app icons, mobile profile.
   - Admin frontend: login, product orders delivered, QR management, settings, admin permissions.
   - Mobile app: login, product purchase, scan, wallet, rating, support, profile QR/photo.

## Final Deployment Note

Do not remove `admin_permissions` or Prisma packages yet unless you first refactor `AdminService` away from Prisma. That is the only active blocker to a fully TypeORM-only cleanup.

The safest immediate cleanup before deployment is:

- Remove/archive QR backup tables.
- Remove empty chat/festival/reward tables if those features are out of scope.
- Exclude one-off import/seed scripts from the production artifact.
- Keep Prisma until admin permissions are migrated.
