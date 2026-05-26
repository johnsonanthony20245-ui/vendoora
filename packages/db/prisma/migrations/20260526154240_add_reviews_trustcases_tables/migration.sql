-- CreateEnum
CREATE TYPE "ReviewSubjectType" AS ENUM ('PRODUCT', 'SELLER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'PENDING_REVIEW', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('FAKE_REVIEW', 'OFFENSIVE_LANGUAGE', 'OFF_TOPIC', 'COMPETITOR_ATTACK', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED_VALID', 'REVIEWED_INVALID', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "TrustSubjectType" AS ENUM ('SELLER', 'DRIVER', 'PRODUCT', 'ORDER', 'DISPUTE', 'KYC', 'USER');

-- CreateEnum
CREATE TYPE "TrustCaseStatus" AS ENUM ('NEW', 'HEALTHY', 'MONITORING', 'NEEDS_INFO', 'ESCALATED', 'RESTRICTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TrustSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TrustResolution" AS ENUM ('NO_ACTION_TAKEN', 'WARNING_ISSUED', 'SUSPENDED_TEMPORARY', 'SUSPENDED_PERMANENT', 'REFUND_ISSUED', 'INSURANCE_PAYOUT', 'RESTORED');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('INTERNAL', 'SHARED_WITH_SUBJECT');

-- CreateEnum
CREATE TYPE "TrustActionType" AS ENUM ('CASE_CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED', 'NOTE_ADDED', 'INFO_REQUESTED', 'ESCALATED', 'MARKED_MONITORING', 'MARKED_REVIEWED', 'FOLLOW_UP_CREATED', 'RESTRICTED', 'RESOLVED', 'REOPENED');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "subject_type" "ReviewSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "verified_purchase" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "seller_response" TEXT,
    "seller_response_at" TIMESTAMP(3),
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "reported_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "reporter_user_id" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_aggregates" (
    "id" TEXT NOT NULL,
    "subject_type" "ReviewSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_1_count" INTEGER NOT NULL DEFAULT 0,
    "rating_2_count" INTEGER NOT NULL DEFAULT 0,
    "rating_3_count" INTEGER NOT NULL DEFAULT 0,
    "rating_4_count" INTEGER NOT NULL DEFAULT 0,
    "rating_5_count" INTEGER NOT NULL DEFAULT 0,
    "last_review_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_cases" (
    "id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "subject_type" "TrustSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "TrustCaseStatus" NOT NULL DEFAULT 'NEW',
    "severity" "TrustSeverity" NOT NULL,
    "assigned_to_user_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution_summary" TEXT,
    "resolution_action" "TrustResolution",
    "auto_created" BOOLEAN NOT NULL DEFAULT false,
    "auto_creation_signal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "parent_case_id" TEXT,

    CONSTRAINT "trust_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_case_notes" (
    "id" TEXT NOT NULL,
    "trust_case_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_case_actions" (
    "id" TEXT NOT NULL,
    "trust_case_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action_type" "TrustActionType" NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_case_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_subject_type_subject_id_status_created_at_idx" ON "reviews"("subject_type", "subject_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reviews_author_user_id_idx" ON "reviews"("author_user_id");

-- CreateIndex
CREATE INDEX "reviews_order_item_id_idx" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "review_reports_review_id_idx" ON "review_reports"("review_id");

-- CreateIndex
CREATE INDEX "review_reports_reporter_user_id_idx" ON "review_reports"("reporter_user_id");

-- CreateIndex
CREATE INDEX "review_reports_status_idx" ON "review_reports"("status");

-- CreateIndex
CREATE INDEX "review_aggregates_subject_type_subject_id_idx" ON "review_aggregates"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_aggregates_subject_type_subject_id_key" ON "review_aggregates"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_cases_case_number_key" ON "trust_cases"("case_number");

-- CreateIndex
CREATE INDEX "trust_cases_subject_type_subject_id_idx" ON "trust_cases"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "trust_cases_status_due_date_idx" ON "trust_cases"("status", "due_date");

-- CreateIndex
CREATE INDEX "trust_cases_assigned_to_user_id_status_idx" ON "trust_cases"("assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "trust_cases_severity_due_date_idx" ON "trust_cases"("severity", "due_date");

-- CreateIndex
CREATE INDEX "trust_cases_created_at_idx" ON "trust_cases"("created_at");

-- CreateIndex
CREATE INDEX "trust_case_notes_trust_case_id_created_at_idx" ON "trust_case_notes"("trust_case_id", "created_at");

-- CreateIndex
CREATE INDEX "trust_case_actions_trust_case_id_created_at_idx" ON "trust_case_actions"("trust_case_id", "created_at");

-- CreateIndex
CREATE INDEX "trust_case_actions_actor_user_id_idx" ON "trust_case_actions"("actor_user_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_cases" ADD CONSTRAINT "trust_cases_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_cases" ADD CONSTRAINT "trust_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_cases" ADD CONSTRAINT "trust_cases_parent_case_id_fkey" FOREIGN KEY ("parent_case_id") REFERENCES "trust_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_case_notes" ADD CONSTRAINT "trust_case_notes_trust_case_id_fkey" FOREIGN KEY ("trust_case_id") REFERENCES "trust_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_case_notes" ADD CONSTRAINT "trust_case_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_case_actions" ADD CONSTRAINT "trust_case_actions_trust_case_id_fkey" FOREIGN KEY ("trust_case_id") REFERENCES "trust_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_case_actions" ADD CONSTRAINT "trust_case_actions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
