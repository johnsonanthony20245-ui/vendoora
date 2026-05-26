-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('NOT_RECEIVED', 'DAMAGED', 'WRONG_ITEM', 'COUNTERFEIT', 'QUALITY_ISSUE', 'IN_TRANSIT_DAMAGE', 'PAYMENT_ISSUE', 'FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('BUYER_INITIATED', 'SELLER_INITIATED', 'CHARGEBACK', 'FRAUD_DETECTED', 'SYSTEM_FLAGGED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'PENDING_BUYER', 'PENDING_SELLER', 'ESCALATED', 'RESOLVED_FAVOR_BUYER', 'RESOLVED_FAVOR_SELLER', 'RESOLVED_PARTIAL', 'RESOLVED_INSURANCE', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('FULL_REFUND_TO_BUYER', 'PARTIAL_REFUND_TO_BUYER', 'RELEASE_TO_SELLER', 'INSURANCE_PAYOUT', 'STORE_CREDIT', 'REPLACEMENT_SHIPPED');

-- CreateEnum
CREATE TYPE "DisputeMessageAuthorType" AS ENUM ('BUYER', 'SELLER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DisputeEvidenceType" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT', 'CHAT_TRANSCRIPT', 'DELIVERY_PROOF', 'RECEIPT', 'OTHER');

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "dispute_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "initiated_by_user_id" TEXT NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "DisputeCategory" NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to_admin_user_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "resolution" "DisputeResolution",
    "resolution_amount" DECIMAL(10,2),
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "sla_due_at" TIMESTAMP(3) NOT NULL,
    "sla_breached" BOOLEAN NOT NULL DEFAULT false,
    "escalated_at" TIMESTAMP(3),
    "buyer_response_at" TIMESTAMP(3),
    "seller_response_at" TIMESTAMP(3),
    "is_chargeback" BOOLEAN NOT NULL DEFAULT false,
    "chargeback_provider_case_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "author_type" "DisputeMessageAuthorType" NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_evidence" (
    "id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "description" TEXT,
    "evidence_type" "DisputeEvidenceType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disputes_dispute_number_key" ON "disputes"("dispute_number");

-- CreateIndex
CREATE INDEX "disputes_order_id_idx" ON "disputes"("order_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_assigned_to_admin_user_id_idx" ON "disputes"("assigned_to_admin_user_id");

-- CreateIndex
CREATE INDEX "disputes_sla_due_at_idx" ON "disputes"("sla_due_at");

-- CreateIndex
CREATE INDEX "disputes_initiated_at_idx" ON "disputes"("initiated_at");

-- CreateIndex
CREATE INDEX "dispute_messages_dispute_id_idx" ON "dispute_messages"("dispute_id");

-- CreateIndex
CREATE INDEX "dispute_messages_created_at_idx" ON "dispute_messages"("created_at");

-- CreateIndex
CREATE INDEX "dispute_evidence_dispute_id_idx" ON "dispute_evidence"("dispute_id");

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
