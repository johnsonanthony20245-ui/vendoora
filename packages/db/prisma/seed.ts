/**
 * Vendoora — database seed.
 *
 * Seeds the 40 permissions explicitly enumerated in Engineering_Spec §4.3
 * plus the 8 system admin roles + 4 marketplace roles.
 *
 * Idempotent: re-running the seed updates existing rows rather than failing
 * on unique-constraint violations.
 *
 * The remaining ~80 permissions implied by "~120 permissions" in the spec
 * are seeded by the plans that build the admin surfaces consuming them.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ----------------------------------------------------------------------------
// Permission catalog — 40 permissions across 10 categories (Engineering_Spec §4.3)
// ----------------------------------------------------------------------------

interface PermissionDef {
  name: string;
  category: string;
  description: string;
}

const PERMISSIONS: PermissionDef[] = [
  // auth (3)
  { name: 'auth.login_as_other_user',  category: 'auth', description: 'Impersonate another user for support purposes' },
  { name: 'auth.force_password_reset', category: 'auth', description: 'Force a password reset for any user' },
  { name: 'auth.disable_mfa',          category: 'auth', description: 'Disable MFA for a user (support recovery)' },

  // user (5)
  { name: 'user.read',         category: 'user', description: 'Read any user record' },
  { name: 'user.suspend',      category: 'user', description: 'Suspend a user account' },
  { name: 'user.delete',       category: 'user', description: 'Hard-delete a user (GDPR)' },
  { name: 'user.role.assign',  category: 'user', description: 'Assign roles to users' },
  { name: 'user.role.revoke',  category: 'user', description: 'Revoke roles from users' },

  // seller (5)
  { name: 'seller.kyc.review',    category: 'seller', description: 'Review seller KYC submissions' },
  { name: 'seller.kyc.promote',   category: 'seller', description: 'Promote a seller to a higher KYC tier' },
  { name: 'seller.kyc.demote',    category: 'seller', description: 'Demote a seller to a lower KYC tier' },
  { name: 'seller.suspend',       category: 'seller', description: 'Suspend a seller account' },
  { name: 'seller.payout.manual', category: 'seller', description: 'Manually trigger a seller payout' },

  // product (4)
  { name: 'product.read.all',  category: 'product', description: 'Read all products including DRAFT/ARCHIVED' },
  { name: 'product.moderate',  category: 'product', description: 'Moderate (approve/reject/take-down) products' },
  { name: 'product.delete',    category: 'product', description: 'Soft-delete a product' },
  { name: 'product.feature',   category: 'product', description: 'Mark a product as featured' },

  // order (3)
  { name: 'order.read.all',         category: 'order', description: 'Read any order' },
  { name: 'order.cancel',           category: 'order', description: 'Cancel an order' },
  { name: 'order.status.override',  category: 'order', description: 'Override order status (support)' },

  // escrow (4)
  { name: 'escrow.read.all',      category: 'escrow', description: 'Read any escrow hold' },
  { name: 'escrow.force_release', category: 'escrow', description: 'Force-release an escrow hold' },
  { name: 'escrow.force_refund',  category: 'escrow', description: 'Force-refund an escrow hold' },
  { name: 'escrow.freeze',        category: 'escrow', description: 'Freeze an escrow hold pending investigation' },

  // dispute (4)
  { name: 'dispute.read.all',  category: 'dispute', description: 'Read any dispute' },
  { name: 'dispute.assign',    category: 'dispute', description: 'Assign disputes to T&S admins' },
  { name: 'dispute.resolve',   category: 'dispute', description: 'Resolve disputes' },
  { name: 'dispute.escalate',  category: 'dispute', description: 'Escalate a dispute to senior T&S' },

  // refund (3)
  { name: 'refund.authorize.under_500', category: 'refund', description: 'Authorize refunds under $500' },
  { name: 'refund.authorize.over_500',  category: 'refund', description: 'Authorize refunds over $500 (step-up auth)' },
  { name: 'refund.deny',                category: 'refund', description: 'Deny a refund request' },

  // finance (4)
  { name: 'payout.execute',     category: 'finance', description: 'Execute a queued payout' },
  { name: 'payout.delay',       category: 'finance', description: 'Delay a queued payout' },
  { name: 'reconciliation.run', category: 'finance', description: 'Run reconciliation jobs' },
  { name: 'fx_rate.override',   category: 'finance', description: 'Override the daily FX rate' },

  // system (5)
  { name: 'feature_flag.toggle', category: 'system', description: 'Toggle feature flags' },
  { name: 'permission.create',   category: 'system', description: 'Create new permissions (superadmin only)' },
  { name: 'role.create',         category: 'system', description: 'Create custom roles' },
  { name: 'audit_log.read',      category: 'system', description: 'Read the audit log' },
  { name: 'audit_log.export',    category: 'system', description: 'Export the audit log' },
];

// ----------------------------------------------------------------------------
// Role catalog — 8 system admin roles + 4 marketplace roles
// ----------------------------------------------------------------------------

interface RoleDef {
  name: string;
  display_name: string;
  description: string;
  is_system_role: boolean;
  permissions: string[];
}

const ALL_PERMISSION_NAMES = PERMISSIONS.map((p) => p.name);

const ROLES: RoleDef[] = [
  {
    name: 'superadmin',
    display_name: 'Superadmin',
    description: 'All permissions including permission.create and role.create',
    is_system_role: true,
    permissions: ALL_PERMISSION_NAMES,
  },
  {
    name: 'finance_admin',
    display_name: 'Finance Admin',
    description: 'Finance category + escrow read + refund + reconciliation',
    is_system_role: true,
    permissions: [
      'payout.execute', 'payout.delay', 'reconciliation.run', 'fx_rate.override',
      'escrow.read.all',
      'refund.authorize.under_500', 'refund.authorize.over_500', 'refund.deny',
    ],
  },
  {
    name: 'ts_admin',
    display_name: 'Trust & Safety Admin',
    description: 'Dispute, KYC review, product moderation, user suspension',
    is_system_role: true,
    permissions: [
      'dispute.read.all', 'dispute.assign', 'dispute.resolve', 'dispute.escalate',
      'seller.kyc.review', 'seller.kyc.promote', 'seller.kyc.demote',
      'product.moderate',
      'user.suspend',
      'refund.authorize.under_500',
    ],
  },
  {
    name: 'support_admin',
    display_name: 'Support Admin',
    description: 'Read-mostly + password resets + order status overrides',
    is_system_role: true,
    permissions: [
      'user.read',
      'order.read.all', 'order.status.override',
      'auth.force_password_reset',
    ],
  },
  {
    name: 'operations_admin',
    display_name: 'Operations Admin',
    description: 'Driver management + delivery zone configuration',
    is_system_role: true,
    permissions: ['order.read.all'],
  },
  {
    name: 'marketing_admin',
    display_name: 'Marketing Admin',
    description: 'Promo codes + featured products + bundle curation',
    is_system_role: true,
    permissions: ['product.feature'],
  },
  {
    name: 'catalog_admin',
    display_name: 'Catalog Admin',
    description: 'Category + attribute schema + seller onboarding queue',
    is_system_role: true,
    permissions: ['seller.kyc.review', 'product.read.all'],
  },
  {
    name: 'analytics_admin',
    display_name: 'Analytics Admin',
    description: 'Read-only access to all dashboards + export',
    is_system_role: true,
    permissions: [
      'user.read', 'order.read.all', 'escrow.read.all', 'dispute.read.all',
      'product.read.all', 'audit_log.read', 'audit_log.export',
    ],
  },
  // Marketplace roles
  { name: 'buyer',         display_name: 'Buyer',         description: 'Standard marketplace buyer', is_system_role: false, permissions: [] },
  { name: 'seller',        display_name: 'Seller',        description: 'Verified marketplace seller', is_system_role: false, permissions: [] },
  { name: 'seller_staff',  display_name: 'Seller Staff',  description: 'Staff member of a seller account', is_system_role: false, permissions: [] },
  { name: 'driver',        display_name: 'Driver',        description: 'Verified delivery driver', is_system_role: false, permissions: [] },
];

// ----------------------------------------------------------------------------
// Category catalog — 12 top-level Liberian-marketplace categories
// ----------------------------------------------------------------------------

interface CategoryDef {
  name: string;
  slug: string;
  description: string;
  icon_name: string;
  display_order: number;
}

interface DeliveryZoneDef {
  name: string;
  county: string;
  city: string | null;
  base_delivery_fee: number;
  estimated_delivery_hours: number;
  is_active: boolean;
}

// 8 Monrovia-area + outer-city zones per Polish_Phase_Addendum §2B.6.
// Beta zones are launched but with reduced SLA; PLANNED zones (buchanan) are
// seeded but is_active=false so they don't appear in checkout yet.
const DELIVERY_ZONES: DeliveryZoneDef[] = [
  { name: 'sinkor',         county: 'Montserrado', city: 'Monrovia',  base_delivery_fee: 3.00, estimated_delivery_hours: 4,  is_active: true  },
  { name: 'paynesville',    county: 'Montserrado', city: 'Paynesville', base_delivery_fee: 3.50, estimated_delivery_hours: 6,  is_active: true  },
  { name: 'bushrod-island', county: 'Montserrado', city: 'Monrovia',  base_delivery_fee: 4.00, estimated_delivery_hours: 6,  is_active: true  },
  { name: 'old-road',       county: 'Montserrado', city: 'Monrovia',  base_delivery_fee: 3.50, estimated_delivery_hours: 6,  is_active: true  },
  { name: 'congo-town',     county: 'Montserrado', city: 'Monrovia',  base_delivery_fee: 4.00, estimated_delivery_hours: 6,  is_active: true  },
  { name: 'caldwell',       county: 'Montserrado', city: 'Caldwell',  base_delivery_fee: 6.00, estimated_delivery_hours: 12, is_active: true  },
  { name: 'gbarnga',        county: 'Bong',        city: 'Gbarnga',   base_delivery_fee: 12.00, estimated_delivery_hours: 36, is_active: true  },
  { name: 'buchanan',       county: 'Grand Bassa', city: 'Buchanan',  base_delivery_fee: 10.00, estimated_delivery_hours: 24, is_active: false },
];

const CATEGORIES: CategoryDef[] = [
  { name: 'Fashion',          slug: 'fashion',          description: 'Clothing, fabrics, accessories, footwear',                       icon_name: 'shirt',         display_order: 1 },
  { name: 'Food & Drink',     slug: 'food-drink',       description: 'Foodstuffs, beverages, pantry, fresh produce',                   icon_name: 'utensils',      display_order: 2 },
  { name: 'Beauty',           slug: 'beauty',           description: 'Cosmetics, hair care, skincare, fragrances',                     icon_name: 'sparkles',      display_order: 3 },
  { name: 'Electronics',      slug: 'electronics',      description: 'TVs, audio, appliances, accessories',                            icon_name: 'tv',            display_order: 4 },
  { name: 'Mobile & Tech',    slug: 'mobile-tech',      description: 'Phones, tablets, chargers, SIM cards, data bundles',             icon_name: 'smartphone',    display_order: 5 },
  { name: 'Home & Garden',    slug: 'home-garden',      description: 'Furniture, decor, kitchenware, garden supplies',                 icon_name: 'home',          display_order: 6 },
  { name: 'Children',         slug: 'children',         description: 'Kids clothing, toys, school supplies, baby goods',               icon_name: 'baby',          display_order: 7 },
  { name: 'Arts & Crafts',    slug: 'arts-crafts',      description: 'Liberian art, traditional crafts, fabrics, handmade goods',      icon_name: 'palette',       display_order: 8 },
  { name: 'Books',            slug: 'books',            description: 'Books, magazines, stationery, educational materials',            icon_name: 'book-open',     display_order: 9 },
  { name: 'Pharmacy',         slug: 'pharmacy',         description: 'OTC medicines, vitamins, health products (regulated)',           icon_name: 'pill',          display_order: 10 },
  { name: 'Tools & Hardware', slug: 'tools-hardware',   description: 'Hand tools, power tools, building materials',                    icon_name: 'wrench',        display_order: 11 },
  { name: 'Other',            slug: 'other',            description: 'Everything else',                                                icon_name: 'package',       display_order: 12 },
];

// ----------------------------------------------------------------------------
// Seed runner
// ----------------------------------------------------------------------------

async function main() {
  console.log(`Seeding ${PERMISSIONS.length} permissions...`);
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: p.name },
      update: { category: p.category, description: p.description },
      create: p,
    });
  }

  console.log(`Seeding ${ROLES.length} roles...`);
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: {
        display_name: r.display_name,
        description: r.description,
        is_system_role: r.is_system_role,
      },
      create: {
        name: r.name,
        display_name: r.display_name,
        description: r.description,
        is_system_role: r.is_system_role,
      },
    });

    // Reset the role's permissions to exactly the seeded set (idempotent).
    await prisma.rolePermission.deleteMany({ where: { role_id: role.id } });
    if (r.permissions.length > 0) {
      const perms = await prisma.permission.findMany({
        where: { name: { in: r.permissions } },
      });
      if (perms.length !== r.permissions.length) {
        const found = perms.map((p) => p.name);
        const missing = r.permissions.filter((n) => !found.includes(n));
        throw new Error(`Role ${r.name}: missing permissions ${missing.join(', ')}`);
      }
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ role_id: role.id, permission_id: p.id })),
      });
    }
  }

  console.log(`Seeding ${CATEGORIES.length} categories...`);
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        description: c.description,
        icon_name: c.icon_name,
        display_order: c.display_order,
      },
      create: {
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon_name: c.icon_name,
        display_order: c.display_order,
        attributes_schema: {},
      },
    });
  }

  console.log(`Seeding ${DELIVERY_ZONES.length} delivery zones...`);
  for (const z of DELIVERY_ZONES) {
    await prisma.deliveryZone.upsert({
      where: { name: z.name },
      update: {
        county: z.county,
        city: z.city,
        base_delivery_fee: z.base_delivery_fee,
        estimated_delivery_hours: z.estimated_delivery_hours,
        is_active: z.is_active,
      },
      create: {
        name: z.name,
        county: z.county,
        city: z.city,
        base_delivery_fee: z.base_delivery_fee,
        estimated_delivery_hours: z.estimated_delivery_hours,
        is_active: z.is_active,
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
