-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'LIKE_NEW', 'USED_GOOD', 'USED_FAIR', 'REFURBISHED', 'FOR_PARTS');

-- CreateEnum
CREATE TYPE "AuthenticityStatus" AS ENUM ('PLATFORM_VERIFIED', 'PROOF_PROVIDED', 'CLAIMED', 'UNCLAIMED');

-- CreateEnum
CREATE TYPE "ReturnPolicyType" AS ENUM ('NO_RETURNS', 'STORE_CREDIT_ONLY', 'REFUND_WITHIN_WINDOW', 'CASE_BY_CASE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "authenticity_proof_urls" TEXT[],
ADD COLUMN     "authenticity_status" "AuthenticityStatus" NOT NULL DEFAULT 'UNCLAIMED',
ADD COLUMN     "compare_at_price" DECIMAL(10,2),
ADD COLUMN     "condition" "ProductCondition" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "condition_note" TEXT,
ADD COLUMN     "is_buyer_protection_eligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "return_policy_terms" TEXT,
ADD COLUMN     "return_policy_type" "ReturnPolicyType" NOT NULL DEFAULT 'NO_RETURNS',
ADD COLUMN     "return_window_days" INTEGER,
ADD COLUMN     "warranty_duration_days" INTEGER,
ADD COLUMN     "warranty_terms" TEXT;
