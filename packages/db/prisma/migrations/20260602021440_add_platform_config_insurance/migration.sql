-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_payouts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "dispute_id" TEXT,
    "escrow_hold_id" TEXT,
    "buyer_user_id" TEXT NOT NULL,
    "seller_user_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance_after" DECIMAL(12,2) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_config_key_key" ON "platform_config"("key");

-- CreateIndex
CREATE INDEX "platform_config_category_idx" ON "platform_config"("category");

-- CreateIndex
CREATE INDEX "insurance_payouts_buyer_user_id_created_at_idx" ON "insurance_payouts"("buyer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "insurance_payouts_seller_user_id_created_at_idx" ON "insurance_payouts"("seller_user_id", "created_at");

-- CreateIndex
CREATE INDEX "insurance_payouts_order_id_idx" ON "insurance_payouts"("order_id");
