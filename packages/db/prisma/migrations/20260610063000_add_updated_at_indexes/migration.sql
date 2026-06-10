-- Indexes for the nightly trust-score recompute's active-buyer scan
-- (recomputeActiveBuyerTrustScores: WHERE updated_at >= since).
-- The composite on orders serves the DISTINCT buyer_user_id from the index.

-- CreateIndex
CREATE INDEX "orders_updated_at_buyer_user_id_idx" ON "orders"("updated_at", "buyer_user_id");

-- CreateIndex
CREATE INDEX "disputes_updated_at_idx" ON "disputes"("updated_at");
