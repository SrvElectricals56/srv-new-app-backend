import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1700000000000 implements MigrationInterface {
    name = 'InitialSchema1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."wallet_transactions_userrole_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."wallet_transactions_type_enum" AS ENUM('credit', 'debit')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."wallet_transactions_source_enum" AS ENUM(
                'scan',
                'bonus',
                'redemption',
                'transfer',
                'refund',
                'commission',
                'purchase'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "wallet_transactions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "userRole" "public"."wallet_transactions_userrole_enum" NOT NULL,
                "type" "public"."wallet_transactions_type_enum" NOT NULL,
                "source" "public"."wallet_transactions_source_enum" NOT NULL,
                "amount" numeric(10, 2) NOT NULL,
                "balanceBefore" numeric(10, 2) NOT NULL,
                "balanceAfter" numeric(10, 2) NOT NULL,
                "description" text,
                "referenceId" character varying,
                "referenceType" character varying,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5120f131bde2cda940ec1a621db" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."support_tickets_userrole_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."support_tickets_status_enum" AS ENUM('open', 'in_progress', 'resolved', 'closed')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."support_tickets_priority_enum" AS ENUM('low', 'medium', 'high', 'urgent')
        `);
        await queryRunner.query(`
            CREATE TABLE "support_tickets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying,
                "userName" character varying,
                "userRole" "public"."support_tickets_userrole_enum",
                "subject" character varying NOT NULL,
                "message" text NOT NULL,
                "photoUrl" text,
                "photoUrls" text array,
                "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'open',
                "priority" "public"."support_tickets_priority_enum" NOT NULL DEFAULT 'medium',
                "assignedTo" character varying,
                "response" text,
                "replies" json,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "testimonials" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "personName" character varying NOT NULL,
                "initials" character varying,
                "location" character varying,
                "tier" character varying DEFAULT 'Silver',
                "yearsConnected" integer NOT NULL DEFAULT '1',
                "quote" text NOT NULL,
                "highlight" character varying,
                "gradientColors" text array,
                "ringColor" character varying,
                "isActive" boolean NOT NULL DEFAULT true,
                "displayOrder" integer NOT NULL DEFAULT '1',
                "userCategory" character varying DEFAULT 'all',
                "name" character varying,
                "role" character varying,
                "content" text,
                "rating" numeric(2, 1) DEFAULT '5',
                "imageUrl" character varying,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_63b03c608bd258f115a0a4a1060" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "key" character varying NOT NULL,
                "value" text NOT NULL,
                "description" character varying,
                "updatedBy" character varying,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_c8639b7626fa94ba8265628f214" UNIQUE ("key"),
                CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "points_config" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "productId" uuid NOT NULL,
                "productName" character varying NOT NULL,
                "basePoints" integer NOT NULL DEFAULT '0',
                "bonusPoints" integer NOT NULL DEFAULT '0',
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e17ee4728e25f54ccba2e32c982" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "products" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "sub" character varying NOT NULL,
                "category" character varying NOT NULL,
                "subCategory" character varying,
                "image" character varying,
                "points" integer NOT NULL DEFAULT '0',
                "badge" character varying,
                "price" numeric(10, 2) NOT NULL,
                "mrp" numeric(10, 2),
                "stock" integer NOT NULL DEFAULT '0',
                "totalScanned" integer NOT NULL DEFAULT '0',
                "sku" character varying,
                "weight" character varying,
                "description" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_c44ac33a05b144dd0d9ddcf9327" UNIQUE ("sku"),
                CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."scans_role_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."scans_mode_enum" AS ENUM('single', 'multi')
        `);
        await queryRunner.query(`
            CREATE TABLE "scans" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "userName" character varying NOT NULL,
                "role" "public"."scans_role_enum" NOT NULL,
                "productId" uuid NOT NULL,
                "productName" character varying NOT NULL,
                "points" numeric(12, 2) NOT NULL DEFAULT '0',
                "mode" "public"."scans_mode_enum" NOT NULL DEFAULT 'single',
                "location" character varying,
                "latitude" character varying,
                "longitude" character varying,
                "qrCodeId" character varying,
                "scannedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_41156c08314b9e541c1cb18c588" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."redemptions_role_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."redemptions_status_enum" AS ENUM(
                'pending',
                'approved',
                'rejected',
                'processing',
                'completed'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "redemptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "userName" character varying NOT NULL,
                "role" "public"."redemptions_role_enum" NOT NULL,
                "type" character varying NOT NULL,
                "points" integer NOT NULL DEFAULT '0',
                "amount" numeric(10, 2),
                "status" "public"."redemptions_status_enum" NOT NULL DEFAULT 'pending',
                "upiId" character varying,
                "bankAccount" character varying,
                "ifsc" character varying,
                "accountHolderName" character varying,
                "transactionId" character varying,
                "rejectionReason" text,
                "processedBy" character varying,
                "processedAt" TIMESTAMP,
                "requestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_def143ab94376fea5985bb04219" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "qr_codes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying NOT NULL,
                "productId" uuid NOT NULL,
                "productName" character varying NOT NULL,
                "qrImageUrl" character varying,
                "isScanned" boolean NOT NULL DEFAULT false,
                "scanCount" integer NOT NULL DEFAULT '0',
                "lastScannedBy" character varying,
                "lastScannedAt" TIMESTAMP,
                "legacyRedeemerId" integer,
                "redeemerName" character varying,
                "redeemerPhone" character varying,
                "redeemerCode" character varying,
                "batchId" character varying,
                "batchNo" integer,
                "sequenceNo" integer,
                "rewardPoints" numeric(12, 2) NOT NULL DEFAULT '0',
                "isActive" boolean NOT NULL DEFAULT true,
                "createdBy" character varying,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8a8ba2310839f388674c1b095c8" UNIQUE ("code"),
                CONSTRAINT "PK_4b7aa338e150a878ce9e2c55c5c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."product_orders_userrole_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."product_orders_status_enum" AS ENUM(
                'pending',
                'approved',
                'shipped',
                'delivered',
                'rejected'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "product_orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "userRole" "public"."product_orders_userrole_enum" NOT NULL,
                "userName" character varying NOT NULL,
                "userPhone" character varying,
                "userCode" character varying,
                "productId" character varying NOT NULL,
                "productName" character varying NOT NULL,
                "productImage" character varying,
                "quantity" integer NOT NULL DEFAULT '1',
                "price" numeric(10, 2) NOT NULL DEFAULT '0',
                "status" "public"."product_orders_status_enum" NOT NULL DEFAULT 'pending',
                "shippingAddress" text,
                "trackingNumber" character varying,
                "courierName" character varying,
                "rejectionReason" text,
                "paymentMethod" character varying NOT NULL DEFAULT 'cod',
                "paymentStatus" character varying NOT NULL DEFAULT 'pending',
                "razorpayOrderId" character varying,
                "razorpayPaymentId" character varying,
                "paidAt" TIMESTAMP WITH TIME ZONE,
                "paymentFailureReason" text,
                "estimatedDeliveryAt" TIMESTAMP WITH TIME ZONE,
                "dispatchedAt" TIMESTAMP WITH TIME ZONE,
                "deliveredAt" TIMESTAMP WITH TIME ZONE,
                "rejectedAt" TIMESTAMP WITH TIME ZONE,
                "refundStatus" character varying,
                "refundMessage" text,
                "deliveryNotes" text,
                "orderedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_73ec4b5952704b8268bed22358e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "product_categories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "label" text NOT NULL,
                "glyph" text,
                "imageUrl" text,
                "sortOrder" integer NOT NULL DEFAULT '0',
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7069dac60d88408eca56fdc9e0c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."product_cart_items_userrole_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TABLE "product_cart_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "userRole" "public"."product_cart_items_userrole_enum" NOT NULL,
                "userName" character varying NOT NULL,
                "userPhone" character varying,
                "userCode" character varying,
                "productId" character varying NOT NULL,
                "productName" character varying NOT NULL,
                "productImage" character varying,
                "quantity" integer NOT NULL DEFAULT '1',
                "price" numeric(10, 2) NOT NULL DEFAULT '0',
                "addedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8143acafd2edec8bce6559d0e97" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "plays" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "description" character varying,
                "videoUrl" character varying NOT NULL,
                "thumbnailUrl" character varying,
                "category" character varying NOT NULL DEFAULT 'reels',
                "displayOrder" integer NOT NULL DEFAULT '0',
                "isActive" boolean NOT NULL DEFAULT true,
                "targetRoles" text array,
                "viewCount" integer NOT NULL DEFAULT '0',
                "viewers" jsonb NOT NULL DEFAULT '[]',
                "likes" jsonb NOT NULL DEFAULT '[]',
                "comments" jsonb NOT NULL DEFAULT '[]',
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_d2e16be5395a94fdc41ab0f999d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."offers_status_enum" AS ENUM('active', 'scheduled', 'expired', 'inactive')
        `);
        await queryRunner.query(`
            CREATE TABLE "offers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "description" text NOT NULL,
                "discount" character varying,
                "validFrom" date NOT NULL,
                "validTo" date NOT NULL,
                "targetRole" character varying,
                "status" "public"."offers_status_enum" NOT NULL DEFAULT 'active',
                "productCategory" character varying,
                "bonusPoints" integer NOT NULL DEFAULT '0',
                "imageUrl" character varying,
                "termsAndConditions" character varying,
                "usageCount" integer NOT NULL DEFAULT '0',
                "maxUsage" integer,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_4c88e956195bba85977da21b8f4" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notifications_status_enum" AS ENUM('draft', 'scheduled', 'sent', 'failed')
        `);
        await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "message" text NOT NULL,
                "targetRole" character varying,
                "targetUserIds" text array,
                "status" "public"."notifications_status_enum" NOT NULL DEFAULT 'draft',
                "scheduledAt" TIMESTAMP,
                "sentAt" TIMESTAMP,
                "totalSent" integer NOT NULL DEFAULT '0',
                "totalOpened" integer NOT NULL DEFAULT '0',
                "openRate" numeric(5, 2) NOT NULL DEFAULT '0',
                "imageUrl" character varying,
                "actionUrl" character varying,
                "createdBy" character varying,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."gift_orders_role_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."gift_orders_status_enum" AS ENUM(
                'pending',
                'approved',
                'shipped',
                'delivered',
                'rejected'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "gift_orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "userName" character varying NOT NULL,
                "userCode" character varying,
                "dealerName" character varying,
                "role" "public"."gift_orders_role_enum" NOT NULL,
                "giftProductId" character varying NOT NULL,
                "giftName" character varying NOT NULL,
                "giftImage" character varying,
                "pointsUsed" integer NOT NULL DEFAULT '0',
                "status" "public"."gift_orders_status_enum" NOT NULL DEFAULT 'pending',
                "rejectionReason" text,
                "processedBy" character varying,
                "processedAt" TIMESTAMP,
                "shippingAddress" character varying,
                "trackingNumber" character varying,
                "courierName" character varying,
                "deliveryNotes" text,
                "dispatchedAt" TIMESTAMP,
                "deliveredAt" TIMESTAMP,
                "orderedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_23e6563d46398ab60cb859fa2dd" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."electricians_subcategory_enum" AS ENUM(
                'General Electrician',
                'Industrial Electrician',
                'Residential Wiring',
                'Solar Installer',
                'AC/Appliance Technician',
                'Panel Board Specialist',
                'Lighting Specialist',
                'Contractor'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."electricians_tier_enum" AS ENUM('Silver', 'Gold', 'Platinum', 'Diamond')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."electricians_status_enum" AS ENUM('active', 'pending', 'inactive', 'suspended')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."electricians_kycstatus_enum" AS ENUM(
                'not_submitted',
                'pending',
                'verified',
                'rejected'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "electricians" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "phone" character varying NOT NULL,
                "electricianCode" character varying NOT NULL,
                "email" character varying,
                "profileImage" character varying,
                "city" character varying NOT NULL,
                "state" character varying NOT NULL,
                "district" character varying NOT NULL,
                "pincode" character varying,
                "address" text,
                "subCategory" "public"."electricians_subcategory_enum" NOT NULL DEFAULT 'General Electrician',
                "tier" "public"."electricians_tier_enum" NOT NULL DEFAULT 'Silver',
                "totalPoints" integer NOT NULL DEFAULT '0',
                "totalScans" integer NOT NULL DEFAULT '0',
                "walletBalance" integer NOT NULL DEFAULT '0',
                "totalRedemptions" integer NOT NULL DEFAULT '0',
                "status" "public"."electricians_status_enum" NOT NULL DEFAULT 'active',
                "bankLinked" boolean NOT NULL DEFAULT false,
                "upiId" character varying,
                "bankAccount" character varying,
                "ifsc" character varying,
                "bankName" character varying,
                "accountHolderName" character varying,
                "kycStatus" "public"."electricians_kycstatus_enum" NOT NULL DEFAULT 'not_submitted',
                "aadharNumber" character varying,
                "panNumber" character varying,
                "aadharFrontImage" character varying,
                "panDocument" character varying,
                "gstDocument" character varying,
                "kycRejectionReason" character varying,
                "dealerId" uuid,
                "fallbackDealerName" character varying,
                "fallbackDealerPhone" character varying,
                "passwordHash" character varying,
                "tokenVersion" integer NOT NULL DEFAULT '0',
                "lastActivityAt" TIMESTAMP,
                "appInstalled" boolean NOT NULL DEFAULT false,
                "firstAppLoginAt" TIMESTAMP WITH TIME ZONE,
                "joinedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_12717381b057c6702c7818bb7b2" UNIQUE ("phone"),
                CONSTRAINT "UQ_30e88df7a3bdc5eff3e5fd18b52" UNIQUE ("electricianCode"),
                CONSTRAINT "PK_1504366685e4a64bec4b90dc099" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."dealers_tier_enum" AS ENUM('Silver', 'Gold', 'Platinum', 'Diamond')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."dealers_status_enum" AS ENUM('active', 'pending', 'inactive', 'suspended')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."dealers_kycstatus_enum" AS ENUM(
                'not_submitted',
                'pending',
                'verified',
                'rejected'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "dealers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "phone" character varying NOT NULL,
                "dealerCode" character varying NOT NULL,
                "email" character varying,
                "profileImage" character varying,
                "town" character varying NOT NULL,
                "district" character varying NOT NULL,
                "state" character varying NOT NULL,
                "address" text NOT NULL,
                "pincode" character varying,
                "gstNumber" character varying,
                "contactPerson" character varying,
                "salesManName" character varying,
                "townCode" character varying,
                "rtoCode" character varying,
                "listCode" character varying,
                "electricianList" text,
                "tier" "public"."dealers_tier_enum" NOT NULL DEFAULT 'Silver',
                "electricianCount" integer NOT NULL DEFAULT '0',
                "status" "public"."dealers_status_enum" NOT NULL DEFAULT 'pending',
                "rejectionReason" character varying,
                "bankLinked" boolean NOT NULL DEFAULT false,
                "upiId" character varying,
                "bankAccount" character varying,
                "ifsc" character varying,
                "bankName" character varying,
                "accountHolderName" character varying,
                "kycStatus" "public"."dealers_kycstatus_enum" NOT NULL DEFAULT 'not_submitted',
                "aadharNumber" character varying,
                "panNumber" character varying,
                "aadharFrontImage" character varying,
                "panDocument" character varying,
                "gstDocument" character varying,
                "kycRejectionReason" character varying,
                "totalOrders" integer NOT NULL DEFAULT '0',
                "monthlyTarget" numeric(10, 2) NOT NULL DEFAULT '0',
                "achievedTarget" numeric(10, 2) NOT NULL DEFAULT '0',
                "walletBalance" integer NOT NULL DEFAULT '0',
                "bonusStatus" character varying NOT NULL DEFAULT 'pending',
                "bonuspoints" numeric(10, 2) NOT NULL DEFAULT '0',
                "passwordHash" character varying,
                "tokenVersion" integer NOT NULL DEFAULT '0',
                "lastActivityAt" TIMESTAMP,
                "appInstalled" boolean NOT NULL DEFAULT false,
                "firstAppLoginAt" TIMESTAMP WITH TIME ZONE,
                "joinedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_431f73a52981918013f9fd666ef" UNIQUE ("phone"),
                CONSTRAINT "UQ_468b88face34421da6f16cb62eb" UNIQUE ("dealerCode"),
                CONSTRAINT "PK_4d0d8be9eac6e1822ad16d21194" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."counterboys_tier_enum" AS ENUM('Silver', 'Gold', 'Platinum', 'Diamond')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."counterboys_status_enum" AS ENUM('active', 'pending', 'inactive', 'suspended')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."counterboys_kycstatus_enum" AS ENUM(
                'not_submitted',
                'pending',
                'verified',
                'rejected'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "counterboys" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "phone" character varying NOT NULL,
                "counterboyCode" character varying NOT NULL,
                "email" character varying,
                "profileImage" character varying,
                "city" character varying,
                "state" character varying,
                "district" character varying,
                "pincode" character varying,
                "address" text,
                "dealerId" uuid,
                "totalScans" integer NOT NULL DEFAULT '0',
                "totalPoints" integer NOT NULL DEFAULT '0',
                "walletBalance" integer NOT NULL DEFAULT '0',
                "totalRedemptions" integer NOT NULL DEFAULT '0',
                "tier" "public"."counterboys_tier_enum" NOT NULL DEFAULT 'Silver',
                "status" "public"."counterboys_status_enum" NOT NULL DEFAULT 'active',
                "kycStatus" "public"."counterboys_kycstatus_enum" NOT NULL DEFAULT 'not_submitted',
                "aadharNumber" character varying,
                "panNumber" character varying,
                "aadharFrontImage" character varying,
                "panDocument" character varying,
                "gstDocument" character varying,
                "kycRejectionReason" character varying,
                "bankLinked" boolean NOT NULL DEFAULT false,
                "upiId" character varying,
                "bankAccount" character varying,
                "ifsc" character varying,
                "bankName" character varying,
                "accountHolderName" character varying,
                "passwordHash" character varying,
                "tokenVersion" integer NOT NULL DEFAULT '0',
                "language" character varying,
                "darkMode" boolean NOT NULL DEFAULT false,
                "pushEnabled" boolean NOT NULL DEFAULT true,
                "lastActivityAt" TIMESTAMP,
                "appInstalled" boolean NOT NULL DEFAULT false,
                "firstAppLoginAt" TIMESTAMP WITH TIME ZONE,
                "joinedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_6444c6676002df864c6b39ed44e" UNIQUE ("phone"),
                CONSTRAINT "UQ_2f2d79a33c1b82b3e17427d257b" UNIQUE ("counterboyCode"),
                CONSTRAINT "PK_3f96cc25bf7b22fe2684fee535a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "banners" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "imageUrl" character varying,
                "bgColor" character varying DEFAULT '#FFFFFF',
                "resizeMode" character varying DEFAULT 'cover',
                "isActive" boolean NOT NULL DEFAULT true,
                "displayOrder" integer NOT NULL DEFAULT '0',
                "targetRole" text array,
                "linkUrl" character varying,
                "status" character varying NOT NULL DEFAULT 'active',
                "order" integer NOT NULL DEFAULT '0',
                "clickCount" integer NOT NULL DEFAULT '0',
                "viewCount" integer NOT NULL DEFAULT '0',
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e9b186b959296fcb940790d31c3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."app_users_tier_enum" AS ENUM('Silver', 'Gold', 'Platinum', 'Diamond')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."app_users_status_enum" AS ENUM('active', 'pending', 'inactive', 'suspended')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."app_users_kycstatus_enum" AS ENUM(
                'not_submitted',
                'pending',
                'verified',
                'rejected'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "app_users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "phone" character varying NOT NULL,
                "userCode" character varying NOT NULL,
                "email" character varying,
                "profileImage" character varying,
                "city" character varying,
                "state" character varying,
                "district" character varying,
                "pincode" character varying,
                "address" text,
                "tier" "public"."app_users_tier_enum" NOT NULL DEFAULT 'Silver',
                "totalPoints" integer NOT NULL DEFAULT '0',
                "walletBalance" integer NOT NULL DEFAULT '0',
                "totalRedemptions" integer NOT NULL DEFAULT '0',
                "status" "public"."app_users_status_enum" NOT NULL DEFAULT 'active',
                "bankLinked" boolean NOT NULL DEFAULT false,
                "upiId" character varying,
                "bankAccount" character varying,
                "ifsc" character varying,
                "bankName" character varying,
                "accountHolderName" character varying,
                "kycStatus" "public"."app_users_kycstatus_enum" NOT NULL DEFAULT 'not_submitted',
                "aadharNumber" character varying,
                "panNumber" character varying,
                "aadharFrontImage" character varying,
                "panDocument" character varying,
                "gstDocument" character varying,
                "kycRejectionReason" character varying,
                "passwordHash" character varying,
                "tokenVersion" integer NOT NULL DEFAULT '0',
                "language" character varying,
                "darkMode" boolean NOT NULL DEFAULT false,
                "pushEnabled" boolean NOT NULL DEFAULT true,
                "lastActivityAt" TIMESTAMP,
                "appInstalled" boolean NOT NULL DEFAULT false,
                "firstAppLoginAt" TIMESTAMP WITH TIME ZONE,
                "joinedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_e0fa7f6d1b9f2d22a66fffcee6b" UNIQUE ("phone"),
                CONSTRAINT "UQ_defabd717e13a291f50390a8a3f" UNIQUE ("userCode"),
                CONSTRAINT "PK_9b97e4fbff9c2f3918fda27f999" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "app_icons" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "imageUrl" character varying,
                "isActive" boolean NOT NULL DEFAULT false,
                "displayOrder" integer NOT NULL DEFAULT '0',
                "updatedBy" character varying,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_221255f11a4137d5fd240fda4ac" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."app_activity_events_userrole_enum" AS ENUM('dealer', 'electrician', 'user', 'counterboy')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."app_activity_events_eventtype_enum" AS ENUM(
                'screen_view',
                'screen_time',
                'product_view',
                'product_add_to_cart',
                'product_buy_now',
                'profile_view',
                'button_tap'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "app_activity_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "userRole" "public"."app_activity_events_userrole_enum" NOT NULL,
                "userName" character varying NOT NULL,
                "userPhone" character varying,
                "userCode" character varying,
                "eventType" "public"."app_activity_events_eventtype_enum" NOT NULL,
                "eventLabel" character varying NOT NULL,
                "screen" character varying,
                "previousScreen" character varying,
                "productId" character varying,
                "productName" character varying,
                "productCategory" character varying,
                "quantity" integer NOT NULL DEFAULT '1',
                "durationMs" integer NOT NULL DEFAULT '0',
                "metadata" jsonb,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_2a3412ebae28515f3cdc17628a3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_768d94751ea5fbabda1b951193" ON "app_activity_events" ("eventType", "createdAt")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ea467168d50851357b2fd35ed3" ON "app_activity_events" ("userId", "userRole", "createdAt")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."admins_role_enum" AS ENUM('super_admin', 'admin', 'staff')
        `);
        await queryRunner.query(`
            CREATE TABLE "admins" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "password" character varying NOT NULL,
                "name" character varying NOT NULL,
                "role" "public"."admins_role_enum" NOT NULL DEFAULT 'staff',
                "phone" character varying,
                "isActive" boolean NOT NULL DEFAULT true,
                "lastLoginAt" TIMESTAMP,
                "refreshToken" character varying,
                "tokenVersion" integer NOT NULL DEFAULT '0',
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_051db7d37d478a69a7432df1479" UNIQUE ("email"),
                CONSTRAINT "PK_e3b38270c97a854c48d2e80874e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "admin_permissions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "adminId" uuid NOT NULL,
                "module" character varying NOT NULL,
                "canView" boolean NOT NULL DEFAULT false,
                "canCreate" boolean NOT NULL DEFAULT false,
                "canEdit" boolean NOT NULL DEFAULT false,
                "canDelete" boolean NOT NULL DEFAULT false,
                "canExport" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_a2845024d02a9d39207103244fb" UNIQUE ("adminId", "module"),
                CONSTRAINT "PK_97efc32c48511fc4061111040a0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "points_config"
            ADD CONSTRAINT "FK_ea88418d812405549308dba4129" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "scans"
            ADD CONSTRAINT "FK_182abc8c2bd69c5634917911863" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "qr_codes"
            ADD CONSTRAINT "FK_18199ba6e6311e2bb596e151a1a" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "electricians"
            ADD CONSTRAINT "FK_b0a9c29568dd51193a02d8a1abe" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "counterboys"
            ADD CONSTRAINT "FK_60c0a73b74ed5f03bef0fed0f64" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "admin_permissions"
            ADD CONSTRAINT "FK_30b916ec242b9cd74b973ff184e" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "admin_permissions" DROP CONSTRAINT "FK_30b916ec242b9cd74b973ff184e"
        `);
        await queryRunner.query(`
            ALTER TABLE "counterboys" DROP CONSTRAINT "FK_60c0a73b74ed5f03bef0fed0f64"
        `);
        await queryRunner.query(`
            ALTER TABLE "electricians" DROP CONSTRAINT "FK_b0a9c29568dd51193a02d8a1abe"
        `);
        await queryRunner.query(`
            ALTER TABLE "qr_codes" DROP CONSTRAINT "FK_18199ba6e6311e2bb596e151a1a"
        `);
        await queryRunner.query(`
            ALTER TABLE "scans" DROP CONSTRAINT "FK_182abc8c2bd69c5634917911863"
        `);
        await queryRunner.query(`
            ALTER TABLE "points_config" DROP CONSTRAINT "FK_ea88418d812405549308dba4129"
        `);
        await queryRunner.query(`
            DROP TABLE "admin_permissions"
        `);
        await queryRunner.query(`
            DROP TABLE "admins"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."admins_role_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ea467168d50851357b2fd35ed3"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_768d94751ea5fbabda1b951193"
        `);
        await queryRunner.query(`
            DROP TABLE "app_activity_events"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."app_activity_events_eventtype_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."app_activity_events_userrole_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "app_icons"
        `);
        await queryRunner.query(`
            DROP TABLE "app_users"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."app_users_kycstatus_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."app_users_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."app_users_tier_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "banners"
        `);
        await queryRunner.query(`
            DROP TABLE "counterboys"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."counterboys_kycstatus_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."counterboys_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."counterboys_tier_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "dealers"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."dealers_kycstatus_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."dealers_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."dealers_tier_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "electricians"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."electricians_kycstatus_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."electricians_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."electricians_tier_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."electricians_subcategory_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "gift_orders"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."gift_orders_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."gift_orders_role_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "notifications"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notifications_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "offers"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."offers_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "plays"
        `);
        await queryRunner.query(`
            DROP TABLE "product_cart_items"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."product_cart_items_userrole_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "product_categories"
        `);
        await queryRunner.query(`
            DROP TABLE "product_orders"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."product_orders_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."product_orders_userrole_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "qr_codes"
        `);
        await queryRunner.query(`
            DROP TABLE "redemptions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."redemptions_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."redemptions_role_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "scans"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."scans_mode_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."scans_role_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "products"
        `);
        await queryRunner.query(`
            DROP TABLE "points_config"
        `);
        await queryRunner.query(`
            DROP TABLE "settings"
        `);
        await queryRunner.query(`
            DROP TABLE "testimonials"
        `);
        await queryRunner.query(`
            DROP TABLE "support_tickets"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."support_tickets_priority_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."support_tickets_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."support_tickets_userrole_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "wallet_transactions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."wallet_transactions_source_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."wallet_transactions_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."wallet_transactions_userrole_enum"
        `);
    }

}
