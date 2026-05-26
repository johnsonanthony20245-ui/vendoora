-- CreateEnum
CREATE TYPE "EscrowBeneficiaryType" AS ENUM ('SELLER', 'DRIVER', 'PLATFORM', 'BUYER', 'INSURANCE_FUND');

-- CreateEnum
CREATE TYPE "EscrowState" AS ENUM ('PENDING_PAYMENT', 'HELD', 'HELD_DISPUTED', 'RELEASING', 'RELEASED', 'REFUNDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'EXPIRED', 'INSURANCE_PAYOUT');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MTN_MOMO', 'ORANGE_MONEY', 'WALLET');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRY_SCHEDULED');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL', 'STORE_CREDIT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "escrow_holds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "beneficiary_type" "EscrowBeneficiaryType" NOT NULL,
    "beneficiary_seller_id" TEXT,
    "beneficiary_driver_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_locked_fx" DECIMAL(10,2),
    "fx_rate_at_hold" DECIMAL(15,8),
    "state" "EscrowState" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "state_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_release_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "released_by_user_id" TEXT,
    "released_amount" DECIMAL(10,2),
    "refunded_amount" DECIMAL(10,2),
    "payment_id" TEXT,
    "payout_id" TEXT,
    "refund_id" TEXT,
    "dispute_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_state_transitions" (
    "id" TEXT NOT NULL,
    "escrow_hold_id" TEXT NOT NULL,
    "from_state" "EscrowState",
    "to_state" "EscrowState" NOT NULL,
    "actor_user_id" TEXT,
    "actor_system" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "audit_log_id" TEXT,
    "transitioned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_payment_id" TEXT,
    "provider_charge_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_customer_id" TEXT,
    "stripe_payment_method" TEXT,
    "momo_phone" TEXT,
    "momo_request_id" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorized_at" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "failure_code" TEXT,
    "risk_score" DOUBLE PRECISION,
    "risk_decision" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "beneficiary_type" "EscrowBeneficiaryType" NOT NULL,
    "beneficiary_seller_id" TEXT,
    "beneficiary_driver_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "payout_method" "PayoutMethod" NOT NULL,
    "payout_account" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "provider_payout_id" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "escrow_hold_ids" TEXT[],
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_type" "RefundType" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "provider_refund_id" TEXT,
    "authorized_by_user_id" TEXT NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "dispute_id" TEXT,
    "is_dispute_resolution" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escrow_holds_order_id_idx" ON "escrow_holds"("order_id");

-- CreateIndex
CREATE INDEX "escrow_holds_state_idx" ON "escrow_holds"("state");

-- CreateIndex
CREATE INDEX "escrow_holds_beneficiary_seller_id_idx" ON "escrow_holds"("beneficiary_seller_id");

-- CreateIndex
CREATE INDEX "escrow_holds_beneficiary_driver_id_idx" ON "escrow_holds"("beneficiary_driver_id");

-- CreateIndex
CREATE INDEX "escrow_holds_scheduled_release_at_idx" ON "escrow_holds"("scheduled_release_at");

-- CreateIndex
CREATE INDEX "escrow_state_transitions_escrow_hold_id_idx" ON "escrow_state_transitions"("escrow_hold_id");

-- CreateIndex
CREATE INDEX "escrow_state_transitions_to_state_idx" ON "escrow_state_transitions"("to_state");

-- CreateIndex
CREATE INDEX "escrow_state_transitions_transitioned_at_idx" ON "escrow_state_transitions"("transitioned_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_provider_payment_id_idx" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payouts_beneficiary_seller_id_idx" ON "payouts"("beneficiary_seller_id");

-- CreateIndex
CREATE INDEX "payouts_beneficiary_driver_id_idx" ON "payouts"("beneficiary_driver_id");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "payouts_next_retry_at_idx" ON "payouts"("next_retry_at");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_beneficiary_seller_id_fkey" FOREIGN KEY ("beneficiary_seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_state_transitions" ADD CONSTRAINT "escrow_state_transitions_escrow_hold_id_fkey" FOREIGN KEY ("escrow_hold_id") REFERENCES "escrow_holds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_beneficiary_seller_id_fkey" FOREIGN KEY ("beneficiary_seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
