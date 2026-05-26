-- CreateEnum
CREATE TYPE "BundleOccasion" AS ENUM ('BIRTHDAY', 'CHRISTMAS', 'EASTER', 'RAMADAN', 'GRADUATION', 'WEDDING', 'NEW_BABY', 'EVERYDAY_ESSENTIALS', 'MONTHLY_BOX', 'CONDOLENCES', 'OTHER');

-- CreateEnum
CREATE TYPE "GroupGiftStatus" AS ENUM ('OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateTable
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT NOT NULL,
    "phone_country_code" TEXT NOT NULL DEFAULT '+231',
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Liberia',
    "landmark" TEXT,
    "delivery_zone" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_bundles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occasion" "BundleOccasion" NOT NULL,
    "hero_image_url" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "contents_summary" TEXT NOT NULL,
    "is_customizable" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_items" (
    "id" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "is_substitutable" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_gifts" (
    "id" TEXT NOT NULL,
    "group_gift_code" TEXT NOT NULL,
    "initiator_user_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "bundle_id" TEXT,
    "target_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "collected_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "contributor_count" INTEGER NOT NULL DEFAULT 1,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "status" "GroupGiftStatus" NOT NULL DEFAULT 'OPEN',
    "completed_order_id" TEXT,
    "message_from_group" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "group_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_gift_contributors" (
    "id" TEXT NOT NULL,
    "group_gift_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "message" TEXT,
    "payment_id" TEXT,
    "contributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_gift_contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_gifts" (
    "id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "bundle_id" TEXT,
    "product_id" TEXT,
    "variant_id" TEXT,
    "schedule_type" "ScheduleType" NOT NULL,
    "fire_date" TIMESTAMP(3),
    "recurrence_rule" TEXT,
    "payment_method_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_fired_at" TIMESTAMP(3),
    "next_fire_at" TIMESTAMP(3),
    "fire_count" INTEGER NOT NULL DEFAULT 0,
    "max_fires" INTEGER,
    "personal_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipients_sender_user_id_idx" ON "recipients"("sender_user_id");

-- CreateIndex
CREATE INDEX "recipients_phone_idx" ON "recipients"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "gift_bundles_slug_key" ON "gift_bundles"("slug");

-- CreateIndex
CREATE INDEX "gift_bundles_occasion_idx" ON "gift_bundles"("occasion");

-- CreateIndex
CREATE INDEX "gift_bundles_is_active_idx" ON "gift_bundles"("is_active");

-- CreateIndex
CREATE INDEX "gift_bundles_is_featured_idx" ON "gift_bundles"("is_featured");

-- CreateIndex
CREATE INDEX "bundle_items_bundle_id_idx" ON "bundle_items"("bundle_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_gifts_group_gift_code_key" ON "group_gifts"("group_gift_code");

-- CreateIndex
CREATE INDEX "group_gifts_group_gift_code_idx" ON "group_gifts"("group_gift_code");

-- CreateIndex
CREATE INDEX "group_gifts_initiator_user_id_idx" ON "group_gifts"("initiator_user_id");

-- CreateIndex
CREATE INDEX "group_gifts_status_idx" ON "group_gifts"("status");

-- CreateIndex
CREATE INDEX "group_gifts_deadline_at_idx" ON "group_gifts"("deadline_at");

-- CreateIndex
CREATE INDEX "group_gift_contributors_user_id_idx" ON "group_gift_contributors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_gift_contributors_group_gift_id_user_id_key" ON "group_gift_contributors"("group_gift_id", "user_id");

-- CreateIndex
CREATE INDEX "scheduled_gifts_sender_user_id_idx" ON "scheduled_gifts"("sender_user_id");

-- CreateIndex
CREATE INDEX "scheduled_gifts_is_active_idx" ON "scheduled_gifts"("is_active");

-- CreateIndex
CREATE INDEX "scheduled_gifts_next_fire_at_idx" ON "scheduled_gifts"("next_fire_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_group_gift_id_fkey" FOREIGN KEY ("group_gift_id") REFERENCES "group_gifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "gift_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_gifts" ADD CONSTRAINT "group_gifts_initiator_user_id_fkey" FOREIGN KEY ("initiator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_gifts" ADD CONSTRAINT "group_gifts_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_gifts" ADD CONSTRAINT "group_gifts_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "gift_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_gift_contributors" ADD CONSTRAINT "group_gift_contributors_group_gift_id_fkey" FOREIGN KEY ("group_gift_id") REFERENCES "group_gifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_gift_contributors" ADD CONSTRAINT "group_gift_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_gifts" ADD CONSTRAINT "scheduled_gifts_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_gifts" ADD CONSTRAINT "scheduled_gifts_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_gifts" ADD CONSTRAINT "scheduled_gifts_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "gift_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
