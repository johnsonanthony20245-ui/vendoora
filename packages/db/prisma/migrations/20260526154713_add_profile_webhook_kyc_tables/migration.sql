-- CreateEnum
CREATE TYPE "ProfileSubjectType" AS ENUM ('SELLER', 'DRIVER');

-- CreateEnum
CREATE TYPE "ProfileChangeType" AS ENUM ('BUSINESS_NAME', 'LEGAL_NAME', 'ADDRESS', 'BANK_ACCOUNT', 'MOMO_NUMBER', 'VEHICLE_DETAILS', 'SERVICE_ZONE', 'STORE_SLUG', 'TAX_ID', 'OWNER_NAME', 'OTHER');

-- CreateEnum
CREATE TYPE "ProfileChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFO', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApproverTier" AS ENUM ('TS_ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "WebhookDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'RETRYING', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "KycApplicantType" AS ENUM ('SELLER', 'DRIVER');

-- CreateEnum
CREATE TYPE "KycApplicationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_MORE_INFO', 'APPROVED', 'DENIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "KycDocType" AS ENUM ('GOVERNMENT_ID', 'SELFIE', 'PROOF_OF_ADDRESS', 'BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'BANK_STATEMENT', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "KycDocStatus" AS ENUM ('UPLOADED', 'REVIEWED_VALID', 'REVIEWED_INVALID', 'EXPIRED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "profile_change_requests" (
    "id" TEXT NOT NULL,
    "subject_type" "ProfileSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "change_type" "ProfileChangeType" NOT NULL,
    "field_changes" JSONB NOT NULL,
    "supporting_docs" JSONB,
    "reason" TEXT,
    "status" "ProfileChangeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "applied_at" TIMESTAMP(3),
    "required_approver_tier" "ApproverTier" NOT NULL DEFAULT 'TS_ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "direction" "WebhookDirection" NOT NULL,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "request_url" TEXT,
    "request_headers" JSONB,
    "request_body" JSONB NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "status" "WebhookStatus" NOT NULL,
    "external_event_id" TEXT,
    "idempotency_key" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "related_resource_type" TEXT,
    "related_resource_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "error_stack" TEXT,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "max_attempts" INTEGER NOT NULL DEFAULT 10,
    "destinations" JSONB NOT NULL,
    "dispatched_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_applications" (
    "id" TEXT NOT NULL,
    "applicant_type" "KycApplicantType" NOT NULL,
    "applicant_user_id" TEXT NOT NULL,
    "target_tier" INTEGER NOT NULL,
    "current_tier" INTEGER NOT NULL DEFAULT 0,
    "status" "KycApplicationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "risk_tier" "RiskTier",
    "reviewer_user_id" TEXT,
    "review_started_at" TIMESTAMP(3),
    "review_completed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "last_reminder_sent_at" TIMESTAMP(3),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "last_applicant_action_at" TIMESTAMP(3),
    "stale_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "kyc_application_id" TEXT NOT NULL,
    "doc_type" "KycDocType" NOT NULL,
    "storage_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "status" "KycDocStatus" NOT NULL DEFAULT 'UPLOADED',
    "reviewer_note" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_change_requests_subject_type_subject_id_idx" ON "profile_change_requests"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "profile_change_requests_status_created_at_idx" ON "profile_change_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "profile_change_requests_reviewed_by_user_id_idx" ON "profile_change_requests"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "webhook_logs_provider_direction_status_idx" ON "webhook_logs"("provider", "direction", "status");

-- CreateIndex
CREATE INDEX "webhook_logs_related_resource_type_related_resource_id_idx" ON "webhook_logs"("related_resource_type", "related_resource_id");

-- CreateIndex
CREATE INDEX "webhook_logs_received_at_idx" ON "webhook_logs"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_logs_provider_external_event_id_key" ON "webhook_logs"("provider", "external_event_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events"("created_at");

-- CreateIndex
CREATE INDEX "kyc_applications_applicant_type_applicant_user_id_idx" ON "kyc_applications"("applicant_type", "applicant_user_id");

-- CreateIndex
CREATE INDEX "kyc_applications_status_created_at_idx" ON "kyc_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "kyc_applications_reviewer_user_id_idx" ON "kyc_applications"("reviewer_user_id");

-- CreateIndex
CREATE INDEX "kyc_applications_stale_at_idx" ON "kyc_applications"("stale_at");

-- CreateIndex
CREATE INDEX "kyc_documents_kyc_application_id_idx" ON "kyc_documents"("kyc_application_id");

-- CreateIndex
CREATE INDEX "kyc_documents_doc_type_idx" ON "kyc_documents"("doc_type");

-- CreateIndex
CREATE INDEX "kyc_documents_status_idx" ON "kyc_documents"("status");

-- AddForeignKey
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_applications" ADD CONSTRAINT "kyc_applications_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_applications" ADD CONSTRAINT "kyc_applications_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kyc_application_id_fkey" FOREIGN KEY ("kyc_application_id") REFERENCES "kyc_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
