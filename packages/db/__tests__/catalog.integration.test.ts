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

describe('Catalog base tables (Engineering_Spec §4.5)', () => {
  it('creates the categories table with self-referential parent_id FK', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'categories';
    `;
    expect(result).toHaveLength(1);

    const fk = await prisma.$queryRaw<Array<{ column_name: string; foreign_table_name: string }>>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'categories' AND kcu.column_name = 'parent_id';
    `;
    expect(fk).toHaveLength(1);
    expect(fk[0]!.foreign_table_name).toBe('categories');
  });

  it('creates the products table with seller_id + category_id FKs', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products';
    `;
    expect(result).toHaveLength(1);

    const fks = await prisma.$queryRaw<Array<{ column_name: string; foreign_table_name: string }>>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'products' AND kcu.column_name IN ('seller_id', 'category_id')
      ORDER BY kcu.column_name;
    `;
    expect(fks).toHaveLength(2);
    expect(fks.map((r) => r.foreign_table_name).sort()).toEqual(['categories', 'sellers']);
  });

  it('creates the product_variants table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'product_variants';
    `;
    expect(result).toHaveLength(1);
  });

  it('creates the product_images table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'product_images';
    `;
    expect(result).toHaveLength(1);
  });

  it('enforces unique (seller_id, slug) on products', async () => {
    const user = await prisma.user.create({
      data: { clerk_id: 'clerk_test_catalog_1', email: 'cat1@test.local', full_name: 'Cat Test' },
    });
    const seller = await prisma.seller.create({
      data: {
        user_id: user.id,
        business_name: 'Catalog Test Co',
        business_slug: 'catalog-test-co',
        business_email: 'b@test.local',
        business_phone: '+231880000010',
        business_address: { street: '1', city: 'Monrovia', country: 'LR' },
        business_type: 'SOLE_PROPRIETOR',
      },
    });
    const cat = await prisma.category.create({
      data: { name: 'Test Cat', slug: 'test-cat', attributes_schema: {} },
    });

    await prisma.product.create({
      data: {
        seller_id: seller.id,
        category_id: cat.id,
        name: 'Test Product',
        slug: 'unique-slug-test',
        description: 'desc',
        base_price: 10.0,
        attributes: {},
      },
    });

    await expect(
      prisma.product.create({
        data: {
          seller_id: seller.id,
          category_id: cat.id,
          name: 'Duplicate Slug',
          slug: 'unique-slug-test',
          description: 'desc',
          base_price: 20.0,
          attributes: {},
        },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });
});

describe('Catalog May-2026 extensions (Polish_Phase_Addendum §1.16, Engineering_Spec §4.17)', () => {
  it('Product has the May-2026 extension columns', async () => {
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products'
      ORDER BY column_name;
    `;
    const cols = result.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining([
        'condition',
        'condition_note',
        'warranty_terms',
        'warranty_duration_days',
        'return_policy_type',
        'return_policy_terms',
        'return_window_days',
        'authenticity_status',
        'authenticity_proof_urls',
        'compare_at_price',
        'is_buyer_protection_eligible',
      ]),
    );
  });

  it('ProductCondition enum has all 6 documented values', async () => {
    const result = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'ProductCondition'
      ORDER BY enumsortorder;
    `;
    expect(result.map((r) => r.enumlabel)).toEqual([
      'NEW', 'LIKE_NEW', 'USED_GOOD', 'USED_FAIR', 'REFURBISHED', 'FOR_PARTS',
    ]);
  });

  it('AuthenticityStatus enum has all 4 documented values', async () => {
    const result = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'AuthenticityStatus'
      ORDER BY enumsortorder;
    `;
    expect(result.map((r) => r.enumlabel)).toEqual([
      'PLATFORM_VERIFIED', 'PROOF_PROVIDED', 'CLAIMED', 'UNCLAIMED',
    ]);
  });
});
