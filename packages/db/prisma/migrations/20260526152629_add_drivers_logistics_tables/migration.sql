-- CreateEnum
CREATE TYPE "BackgroundCheckStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DriverOnboardingStatus" AS ENUM ('SIGNUP', 'DOCUMENTS', 'BACKGROUND_CHECK', 'TRAINING', 'READY');

-- CreateEnum
CREATE TYPE "DriverTier" AS ENUM ('STANDARD', 'EXPERIENCED', 'PRO', 'ELITE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'CAR', 'VAN', 'TRUCK', 'BICYCLE', 'ON_FOOT');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED_BY_DRIVER', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'PICKED_UP', 'EN_ROUTE_TO_DROPOFF', 'ARRIVED', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETURNED');

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "driver_number" TEXT NOT NULL,
    "drivers_license_url" TEXT,
    "drivers_license_number" TEXT,
    "drivers_license_expires_at" TIMESTAMP(3),
    "national_id_url" TEXT,
    "national_id_number" TEXT,
    "proof_of_address_url" TEXT,
    "vehicle_registration_url" TEXT,
    "background_check_status" "BackgroundCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "background_check_completed_at" TIMESTAMP(3),
    "background_check_notes" TEXT,
    "training_completed" BOOLEAN NOT NULL DEFAULT false,
    "training_completed_at" TIMESTAMP(3),
    "onboarding_status" "DriverOnboardingStatus" NOT NULL DEFAULT 'SIGNUP',
    "onboarded_at" TIMESTAMP(3),
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "last_online_at" TIMESTAMP(3),
    "current_location_lat" DOUBLE PRECISION,
    "current_location_lng" DOUBLE PRECISION,
    "current_zone" TEXT,
    "active_delivery_count" INTEGER NOT NULL DEFAULT 0,
    "max_concurrent_deliveries" INTEGER NOT NULL DEFAULT 3,
    "total_deliveries" INTEGER NOT NULL DEFAULT 0,
    "total_earnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "rating_average" DOUBLE PRECISION,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "on_time_rate" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "dispute_count" INTEGER NOT NULL DEFAULT 0,
    "tier" "DriverTier" NOT NULL DEFAULT 'STANDARD',
    "payout_method" "PayoutMethod" NOT NULL DEFAULT 'MTN_MOMO',
    "payout_account" TEXT,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "license_plate" TEXT,
    "color" TEXT,
    "insurance_url" TEXT,
    "insurance_expires_at" TIMESTAMP(3),
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "pickup_address" JSONB NOT NULL,
    "pickup_lat" DOUBLE PRECISION,
    "pickup_lng" DOUBLE PRECISION,
    "pickup_seller_id" TEXT NOT NULL,
    "pickup_eta" TIMESTAMP(3),
    "picked_up_at" TIMESTAMP(3),
    "dropoff_address" JSONB NOT NULL,
    "dropoff_lat" DOUBLE PRECISION,
    "dropoff_lng" DOUBLE PRECISION,
    "dropoff_eta" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "delivery_code_entered_at" TIMESTAMP(3),
    "delivery_code_attempts" INTEGER NOT NULL DEFAULT 0,
    "delivery_proof_photo_url" TEXT,
    "delivery_proof_photo_lat" DOUBLE PRECISION,
    "delivery_proof_photo_lng" DOUBLE PRECISION,
    "delivery_proof_photo_taken_at" TIMESTAMP(3),
    "distance_km" DOUBLE PRECISION,
    "estimated_duration_minutes" INTEGER,
    "actual_duration_minutes" INTEGER,
    "driver_fee" DECIMAL(10,2) NOT NULL,
    "driver_bonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "driver_tip" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "driver_total" DECIMAL(10,2) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_ratings" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "rated_by_user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "city" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "base_delivery_fee" DECIMAL(10,2) NOT NULL,
    "estimated_delivery_hours" INTEGER NOT NULL DEFAULT 24,
    "active_drivers_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_driver_number_key" ON "drivers"("driver_number");

-- CreateIndex
CREATE INDEX "drivers_is_online_idx" ON "drivers"("is_online");

-- CreateIndex
CREATE INDEX "drivers_current_zone_idx" ON "drivers"("current_zone");

-- CreateIndex
CREATE INDEX "drivers_tier_idx" ON "drivers"("tier");

-- CreateIndex
CREATE INDEX "drivers_is_suspended_idx" ON "drivers"("is_suspended");

-- CreateIndex
CREATE INDEX "vehicles_driver_id_idx" ON "vehicles"("driver_id");

-- CreateIndex
CREATE INDEX "deliveries_order_id_idx" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "deliveries_driver_id_idx" ON "deliveries"("driver_id");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE INDEX "deliveries_pickup_eta_idx" ON "deliveries"("pickup_eta");

-- CreateIndex
CREATE UNIQUE INDEX "driver_ratings_delivery_id_key" ON "driver_ratings"("delivery_id");

-- CreateIndex
CREATE INDEX "driver_ratings_driver_id_idx" ON "driver_ratings"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_name_key" ON "delivery_zones"("name");

-- CreateIndex
CREATE INDEX "delivery_zones_is_active_idx" ON "delivery_zones"("is_active");

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_beneficiary_driver_id_fkey" FOREIGN KEY ("beneficiary_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_beneficiary_driver_id_fkey" FOREIGN KEY ("beneficiary_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
