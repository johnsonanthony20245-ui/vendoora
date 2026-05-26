-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('SOLE_PROPRIETOR', 'LIMITED_LIABILITY', 'CORPORATION', 'COOPERATIVE', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SaasPlan" AS ENUM ('STARTER', 'GROWTH', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PayoutSchedule" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SellerStaffRole" AS ENUM ('ADMIN', 'FULFILLMENT', 'SUPPORT', 'VIEWER');

-- CreateTable
CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "business_slug" TEXT NOT NULL,
    "business_description" TEXT,
    "business_logo_url" TEXT,
    "business_banner_url" TEXT,
    "business_email" TEXT NOT NULL,
    "business_phone" TEXT NOT NULL,
    "business_address" JSONB NOT NULL,
    "business_type" "BusinessType" NOT NULL,
    "tax_id" TEXT,
    "registration_number" TEXT,
    "kyc_tier" INTEGER NOT NULL DEFAULT 0,
    "kyc_status" "KYCStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "kyc_tier_promoted_at" TIMESTAMP(3),
    "kyc_documents" JSONB,
    "saas_plan" "SaasPlan" NOT NULL DEFAULT 'STARTER',
    "saas_plan_started_at" TIMESTAMP(3),
    "saas_plan_renewed_at" TIMESTAMP(3),
    "saas_commission_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "payout_method" "PayoutMethod" NOT NULL DEFAULT 'MTN_MOMO',
    "payout_account_id" TEXT,
    "payout_schedule" "PayoutSchedule" NOT NULL DEFAULT 'WEEKLY',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "feature_starts_at" TIMESTAMP(3),
    "feature_ends_at" TIMESTAMP(3),
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_gmv" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_disputes" INTEGER NOT NULL DEFAULT 0,
    "dispute_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "on_time_rate" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "rating_average" DOUBLE PRECISION,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_staff" (
    "seller_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "SellerStaffRole" NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "seller_staff_pkey" PRIMARY KEY ("seller_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sellers_user_id_key" ON "sellers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_business_slug_key" ON "sellers"("business_slug");

-- CreateIndex
CREATE INDEX "sellers_business_slug_idx" ON "sellers"("business_slug");

-- CreateIndex
CREATE INDEX "sellers_kyc_tier_idx" ON "sellers"("kyc_tier");

-- CreateIndex
CREATE INDEX "sellers_saas_plan_idx" ON "sellers"("saas_plan");

-- CreateIndex
CREATE INDEX "sellers_is_suspended_idx" ON "sellers"("is_suspended");

-- CreateIndex
CREATE INDEX "sellers_is_featured_idx" ON "sellers"("is_featured");

-- CreateIndex
CREATE INDEX "seller_staff_user_id_idx" ON "seller_staff"("user_id");

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_staff" ADD CONSTRAINT "seller_staff_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_staff" ADD CONSTRAINT "seller_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_staff" ADD CONSTRAINT "seller_staff_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
