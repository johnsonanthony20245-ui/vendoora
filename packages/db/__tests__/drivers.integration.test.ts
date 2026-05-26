import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(() => {
  execSync('pnpm prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: process.env,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Drivers + Logistics (Engineering_Spec §4.9)', () => {
  it('drivers table has key columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'drivers'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'driver_number',
        'background_check_status', 'onboarding_status', 'tier',
        'is_online', 'current_location_lat', 'current_location_lng',
        'created_at',
      ]),
    );
  });

  it('drivers.driver_number and drivers.user_id are both UNIQUE', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'drivers' AND indexdef LIKE '%UNIQUE%';
    `;
    const defs = indexes.map((r) => r.indexdef).join('\n');
    expect(defs).toMatch(/driver_number/);
    expect(defs).toMatch(/user_id/);
  });

  it('vehicles table has driver_id FK', async () => {
    const result = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'vehicles' AND kcu.column_name = 'driver_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.foreign_table_name).toBe('drivers');
  });

  it('deliveries has nullable driver_id (pending assignment)', async () => {
    const result = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'driver_id';
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.is_nullable).toBe('YES');
  });

  it('deliveries has the proof-of-delivery photo columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deliveries'
        AND column_name IN ('delivery_proof_photo_url', 'delivery_proof_photo_lat', 'delivery_proof_photo_lng', 'delivery_proof_photo_taken_at')
      ORDER BY column_name;
    `;
    expect(cols).toHaveLength(4);
  });

  it('deliveries.driver_fee is Decimal(10, 2)', async () => {
    const result = await prisma.$queryRaw<Array<{ numeric_precision: number; numeric_scale: number }>>`
      SELECT numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'driver_fee';
    `;
    expect(result[0]!.numeric_precision).toBe(10);
    expect(result[0]!.numeric_scale).toBe(2);
  });

  it('driver_ratings.delivery_id is UNIQUE (one rating per delivery)', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'driver_ratings' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%delivery_id%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('delivery_zones table has UNIQUE name', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'delivery_zones' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%name%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('all 5 driver/logistics enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('BackgroundCheckStatus', 'DriverOnboardingStatus', 'DriverTier', 'VehicleType', 'DeliveryStatus')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.BackgroundCheckStatus).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'EXPIRED']);
    expect(byType.DriverOnboardingStatus).toEqual(['SIGNUP', 'DOCUMENTS', 'BACKGROUND_CHECK', 'TRAINING', 'READY']);
    expect(byType.DriverTier).toEqual(['STANDARD', 'EXPERIENCED', 'PRO', 'ELITE']);
    expect(byType.VehicleType).toEqual(['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK', 'BICYCLE', 'ON_FOOT']);
    expect(byType.DeliveryStatus).toEqual([
      'PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED_BY_DRIVER',
      'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'PICKED_UP',
      'EN_ROUTE_TO_DROPOFF', 'ARRIVED', 'COMPLETED', 'FAILED',
      'CANCELLED', 'RETURNED',
    ]);
  });

  it('escrow_holds.beneficiary_driver_id now has FK to drivers (was bare String? in slice 3)', async () => {
    const result = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'escrow_holds' AND kcu.column_name = 'beneficiary_driver_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.foreign_table_name).toBe('drivers');
  });

  it('payouts.beneficiary_driver_id now has FK to drivers', async () => {
    const result = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'payouts' AND kcu.column_name = 'beneficiary_driver_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.foreign_table_name).toBe('drivers');
  });

  it('end-to-end: user → driver → vehicle → delivery linked to existing order', async () => {
    const buyer = await prisma.user.create({
      data: { clerk_id: 'clerk_drv_buyer', email: 'drvb@test.local', full_name: 'Drv Buyer' },
    });
    const sellerUser = await prisma.user.create({
      data: { clerk_id: 'clerk_drv_seller', email: 'drvs@test.local', full_name: 'Drv Seller' },
    });
    const seller = await prisma.seller.create({
      data: {
        user_id: sellerUser.id, business_name: 'Drv Co', business_slug: 'drv-co',
        business_email: 'b@drv.local', business_phone: '+231880099501',
        business_address: { street: '1', city: 'Monrovia', country: 'LR' },
        business_type: 'SOLE_PROPRIETOR',
      },
    });
    const driverUser = await prisma.user.create({
      data: { clerk_id: 'clerk_drv_user', email: 'drvu@test.local', full_name: 'Drv User' },
    });
    const driver = await prisma.driver.create({
      data: {
        user_id: driverUser.id,
        driver_number: 'VDR-DRV-E2E-' + Date.now(),
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        driver_id: driver.id,
        vehicle_type: 'MOTORCYCLE',
        license_plate: 'LR-1234',
      },
    });
    const cat = await prisma.category.create({
      data: { name: 'Drv Cat', slug: 'drv-cat', attributes_schema: {} },
    });
    await prisma.product.create({
      data: {
        seller_id: seller.id, category_id: cat.id,
        name: 'Drv Product', slug: 'drv-product', description: 'd',
        base_price: 30.0, attributes: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        order_number: 'VDR-DRV-' + Date.now(),
        buyer_user_id: buyer.id, buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name: 'Drv Buyer', buyer_email: 'drvb@test.local',
        delivery_address: { street: '1' }, delivery_city: 'Monrovia',
        delivery_country: 'LR', delivery_zone: 'sinkor',
        subtotal: 30.0, total_amount: 30.0, currency: 'USD',
        payment_method: 'MTN_MOMO',
      },
    });

    const delivery = await prisma.delivery.create({
      data: {
        order_id: order.id,
        driver_id: driver.id,
        pickup_address: { street: 'seller addr' },
        pickup_seller_id: seller.id,
        dropoff_address: { street: '1' },
        driver_fee: 5.0,
        driver_total: 5.0,
        status: 'PENDING_ASSIGNMENT',
      },
    });

    expect(delivery.driver_id).toBe(driver.id);
    expect(vehicle.driver_id).toBe(driver.id);
    expect(delivery.status).toBe('PENDING_ASSIGNMENT');
  });
});
