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
// Sample sellers + products for dev / pilot demo
// Picsum.photos URLs are deterministic by seed; replace with R2 URLs when
// Cloudflare Images wiring lands (P1.3.7).
// ----------------------------------------------------------------------------

interface SampleSellerDef {
  clerk_id: string;
  email: string;
  full_name: string;
  business_slug: string;
  business_name: string;
  business_email: string;
  business_phone: string;
  business_address: Record<string, string>;
  business_type:
    | 'SOLE_PROPRIETOR'
    | 'LIMITED_LIABILITY'
    | 'CORPORATION'
    | 'COOPERATIVE'
    | 'INDIVIDUAL';
  kyc_tier: number;
  kyc_status: 'NOT_STARTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  saas_plan: 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
  rating_average: number;
  rating_count: number;
  total_orders: number;
}

const SAMPLE_SELLERS: SampleSellerDef[] = [
  {
    clerk_id: 'seed_clerk_konah',
    email: 'konah@konah-boutique.lr',
    full_name: 'Konah Tubman',
    business_slug: 'konah-boutique',
    business_name: 'Konah Boutique',
    business_email: 'hello@konah-boutique.lr',
    business_phone: '+231880100001',
    business_address: { street: '12 Tubman Blvd', city: 'Monrovia', county: 'Montserrado', country: 'Liberia' },
    business_type: 'SOLE_PROPRIETOR',
    kyc_tier: 3,
    kyc_status: 'APPROVED',
    saas_plan: 'GROWTH',
    rating_average: 4.8,
    rating_count: 142,
    total_orders: 287,
  },
  {
    clerk_id: 'seed_clerk_sundayma',
    email: 'sundayma@sundayma-foods.lr',
    full_name: 'Sundayma Williams',
    business_slug: 'sundayma-foods',
    business_name: 'Sundayma Foods',
    business_email: 'orders@sundayma-foods.lr',
    business_phone: '+231880100002',
    business_address: { street: '47 Old Road', city: 'Monrovia', county: 'Montserrado', country: 'Liberia' },
    business_type: 'LIMITED_LIABILITY',
    kyc_tier: 4,
    kyc_status: 'APPROVED',
    saas_plan: 'PRO',
    rating_average: 4.9,
    rating_count: 318,
    total_orders: 691,
  },
  {
    clerk_id: 'seed_clerk_mariama',
    email: 'mariama@mariamas-crafts.lr',
    full_name: "Mariama Kollie",
    business_slug: 'mariamas-crafts',
    business_name: "Mariama's Liberian Crafts",
    business_email: 'mariama@mariamas-crafts.lr',
    business_phone: '+231880100003',
    business_address: { street: '88 Sinkor 4th St', city: 'Monrovia', county: 'Montserrado', country: 'Liberia' },
    business_type: 'SOLE_PROPRIETOR',
    kyc_tier: 3,
    kyc_status: 'APPROVED',
    saas_plan: 'GROWTH',
    rating_average: 4.7,
    rating_count: 89,
    total_orders: 167,
  },
];

interface SampleProductDef {
  seller_slug: string;        // looked up against SAMPLE_SELLERS
  category_slug: string;      // looked up against CATEGORIES
  name: string;
  slug: string;
  description: string;
  short_description: string;
  base_price: number;
  compare_at_price?: number;
  condition: 'NEW' | 'LIKE_NEW' | 'USED_GOOD' | 'USED_FAIR' | 'REFURBISHED' | 'FOR_PARTS';
  authenticity_status?: 'UNCLAIMED' | 'CLAIMED' | 'PROOF_PROVIDED' | 'PLATFORM_VERIFIED';
  tags: string[];
  image_count: number;
}

// 18 products distributed across 8 of 12 categories.
const SAMPLE_PRODUCTS: SampleProductDef[] = [
  // Fashion (4) — Konah Boutique
  { seller_slug: 'konah-boutique', category_slug: 'fashion', name: 'Vlisco Wax Print Wrapper — 6 yards', slug: 'vlisco-wax-print-6yd', description: 'Authentic Dutch Vlisco wax-print fabric, 6 yards. Earth Red colorway, perfect for traditional wrappers, suits, and statement pieces.', short_description: 'Authentic Vlisco, 6yd, Earth Red', base_price: 65.0, compare_at_price: 80.0, condition: 'NEW', authenticity_status: 'PROOF_PROVIDED', tags: ['vlisco', 'wax-print', 'fabric'], image_count: 3 },
  { seller_slug: 'konah-boutique', category_slug: 'fashion', name: 'Ankara Print Maxi Dress', slug: 'ankara-maxi-dress', description: 'Hand-tailored Ankara maxi dress, available in M/L/XL. Bold geometric pattern, fully lined.', short_description: 'Hand-tailored, sizes M/L/XL', base_price: 48.0, condition: 'NEW', tags: ['ankara', 'dress'], image_count: 2 },
  { seller_slug: 'konah-boutique', category_slug: 'fashion', name: "Men's Embroidered Senegalese Boubou", slug: 'senegalese-boubou', description: 'Premium Senegalese boubou with hand-embroidered neckline. Pure cotton, breathable for Liberian climate.', short_description: 'Hand-embroidered cotton boubou', base_price: 85.0, condition: 'NEW', tags: ['boubou', 'menswear'], image_count: 2 },
  { seller_slug: 'konah-boutique', category_slug: 'fashion', name: 'Leather Sandals — Handmade', slug: 'leather-sandals', description: 'Locally handmade leather sandals. Tan and dark brown available.', short_description: 'Locally handmade, sizes 36-43', base_price: 32.0, condition: 'NEW', tags: ['leather', 'sandals'], image_count: 2 },

  // Food & Drink (4) — Sundayma Foods
  { seller_slug: 'sundayma-foods', category_slug: 'food-drink', name: 'Country Rice — 25kg bag', slug: 'country-rice-25kg', description: 'Premium Liberian country rice, 25kg. Locally grown in Lofa County. Cooks fluffy and aromatic.', short_description: 'Lofa-grown, 25kg', base_price: 42.0, condition: 'NEW', authenticity_status: 'PLATFORM_VERIFIED', tags: ['rice', 'staple'], image_count: 2 },
  { seller_slug: 'sundayma-foods', category_slug: 'food-drink', name: 'Palm Butter Paste — 500g', slug: 'palm-butter-500g', description: 'Traditional palm butter paste, slow-cooked from fresh palm nuts. Ready for soup. 500g jar.', short_description: 'Slow-cooked, traditional', base_price: 14.0, condition: 'NEW', tags: ['palm-butter', 'cooking'], image_count: 2 },
  { seller_slug: 'sundayma-foods', category_slug: 'food-drink', name: 'Bitterball & Eggplant Mix — 1kg fresh', slug: 'bitterball-eggplant-1kg', description: 'Fresh bitterball and African eggplant from local farms. 1kg combo, vacuum-packed for shipping.', short_description: '1kg fresh combo, vacuum-packed', base_price: 9.0, condition: 'NEW', tags: ['vegetables', 'fresh'], image_count: 2 },
  { seller_slug: 'sundayma-foods', category_slug: 'food-drink', name: 'Liberian Pepper Sauce — 250ml', slug: 'liberian-pepper-sauce-250ml', description: 'Homemade Liberian pepper sauce — habanero, ginger, garlic. Hot. 250ml glass jar.', short_description: 'Habanero-ginger-garlic, 250ml', base_price: 7.0, condition: 'NEW', tags: ['hot-sauce', 'pepper'], image_count: 1 },

  // Beauty (2) — Konah
  { seller_slug: 'konah-boutique', category_slug: 'beauty', name: 'Shea Butter — Raw, Unrefined 500g', slug: 'shea-butter-500g', description: 'Raw, unrefined shea butter from Ghanaian women cooperatives. 500g, no additives.', short_description: 'Raw, unrefined, 500g', base_price: 18.0, condition: 'NEW', authenticity_status: 'CLAIMED', tags: ['shea', 'skincare'], image_count: 2 },
  { seller_slug: 'konah-boutique', category_slug: 'beauty', name: 'Black Soap Bar — Hand-cut', slug: 'black-soap-bar', description: 'Traditional African black soap, hand-cut, 250g bar. Plantain ash + cocoa pod ash + shea butter base.', short_description: 'Hand-cut 250g bar', base_price: 9.0, condition: 'NEW', tags: ['black-soap', 'skincare'], image_count: 1 },

  // Electronics (2) — Sundayma (operates a mini-mart side)
  { seller_slug: 'sundayma-foods', category_slug: 'electronics', name: 'Solar-Powered LED Lantern', slug: 'solar-led-lantern', description: 'Reliable solar LED lantern with USB phone-charging port. 8-hour battery, weather-resistant.', short_description: 'Solar + USB charge port, 8hr battery', base_price: 28.0, condition: 'NEW', tags: ['solar', 'lantern'], image_count: 2 },
  { seller_slug: 'sundayma-foods', category_slug: 'electronics', name: 'Power Bank — 20000mAh', slug: 'power-bank-20000', description: 'High-capacity 20000mAh power bank. Two USB-A + one USB-C. Charges phones 5+ times.', short_description: '20000mAh, dual-USB + USB-C', base_price: 22.0, condition: 'NEW', tags: ['power-bank', 'mobile'], image_count: 1 },

  // Arts & Crafts (4) — Mariama
  { seller_slug: 'mariamas-crafts', category_slug: 'arts-crafts', name: 'Hand-Woven Country Cloth Throw', slug: 'country-cloth-throw', description: 'Traditional Liberian country cloth, hand-woven on a loom in Bong County. Approx 5ft x 7ft.', short_description: 'Bong County hand-woven, ~5ft x 7ft', base_price: 95.0, condition: 'NEW', authenticity_status: 'PLATFORM_VERIFIED', tags: ['country-cloth', 'handmade'], image_count: 3 },
  { seller_slug: 'mariamas-crafts', category_slug: 'arts-crafts', name: 'Carved Wooden Mask — Dan Tribe', slug: 'dan-tribe-mask', description: "Traditional Dan tribe carved wooden ceremonial mask. Approximately 14 inches tall. Each piece is unique.", short_description: '14-inch traditional Dan mask', base_price: 145.0, condition: 'NEW', authenticity_status: 'PROOF_PROVIDED', tags: ['mask', 'sculpture'], image_count: 3 },
  { seller_slug: 'mariamas-crafts', category_slug: 'arts-crafts', name: 'Beaded Necklace — Wax Print Beads', slug: 'beaded-necklace-wax', description: 'Hand-strung necklace using wax-print fabric beads. Adjustable length 18-22 inches.', short_description: 'Hand-strung, adjustable 18-22"', base_price: 22.0, condition: 'NEW', tags: ['jewelry', 'beads'], image_count: 2 },
  { seller_slug: 'mariamas-crafts', category_slug: 'arts-crafts', name: 'Bamboo Basket — Large', slug: 'bamboo-basket-large', description: 'Hand-woven bamboo storage basket with lid. Large size, approx 16in diameter.', short_description: 'Hand-woven, 16in diameter', base_price: 38.0, condition: 'LIKE_NEW', tags: ['basket', 'home'], image_count: 2 },

  // Home & Garden (1) — Mariama
  { seller_slug: 'mariamas-crafts', category_slug: 'home-garden', name: 'Clay Cooking Pot — Medium', slug: 'clay-cooking-pot-medium', description: 'Traditional clay cooking pot, fire-hardened, medium size suitable for soups and stews.', short_description: 'Fire-hardened, traditional', base_price: 32.0, condition: 'NEW', tags: ['clay-pot', 'cookware'], image_count: 1 },

  // Children (1) — Konah
  { seller_slug: 'konah-boutique', category_slug: 'children', name: "Kids' Ankara Shirt + Shorts Set", slug: 'kids-ankara-set', description: 'Matching Ankara shirt and shorts set for kids. Sizes 2T-8. Bold print.', short_description: 'Matching set, sizes 2T-8', base_price: 26.0, condition: 'NEW', tags: ['kids', 'ankara'], image_count: 2 },
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

  console.log(`Seeding ${SAMPLE_SELLERS.length} sample sellers...`);
  const sellersBySlug = new Map<string, { id: string }>();
  for (const s of SAMPLE_SELLERS) {
    const user = await prisma.user.upsert({
      where: { clerk_id: s.clerk_id },
      update: { email: s.email, full_name: s.full_name },
      create: {
        clerk_id: s.clerk_id,
        email: s.email,
        full_name: s.full_name,
        is_email_verified: true,
        account_status: 'ACTIVE',
      },
    });
    const seller = await prisma.seller.upsert({
      where: { business_slug: s.business_slug },
      update: {
        business_name: s.business_name,
        business_email: s.business_email,
        business_phone: s.business_phone,
        business_address: s.business_address,
        business_type: s.business_type,
        kyc_tier: s.kyc_tier,
        kyc_status: s.kyc_status,
        saas_plan: s.saas_plan,
        rating_average: s.rating_average,
        rating_count: s.rating_count,
        total_orders: s.total_orders,
      },
      create: {
        user_id: user.id,
        business_name: s.business_name,
        business_slug: s.business_slug,
        business_email: s.business_email,
        business_phone: s.business_phone,
        business_address: s.business_address,
        business_type: s.business_type,
        kyc_tier: s.kyc_tier,
        kyc_status: s.kyc_status,
        saas_plan: s.saas_plan,
        rating_average: s.rating_average,
        rating_count: s.rating_count,
        total_orders: s.total_orders,
      },
    });
    sellersBySlug.set(s.business_slug, { id: seller.id });
  }

  console.log(`Seeding ${SAMPLE_PRODUCTS.length} sample products...`);
  const categoriesBySlug = new Map<string, { id: string }>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.findUnique({ where: { slug: c.slug } });
    if (row) categoriesBySlug.set(c.slug, { id: row.id });
  }

  for (const p of SAMPLE_PRODUCTS) {
    const seller = sellersBySlug.get(p.seller_slug);
    const category = categoriesBySlug.get(p.category_slug);
    if (!seller || !category) {
      throw new Error(`Missing seller (${p.seller_slug}) or category (${p.category_slug}) for product ${p.slug}`);
    }

    const product = await prisma.product.upsert({
      where: { seller_id_slug: { seller_id: seller.id, slug: p.slug } },
      update: {
        name: p.name,
        description: p.description,
        short_description: p.short_description,
        base_price: p.base_price,
        compare_at_price: p.compare_at_price ?? null,
        condition: p.condition,
        authenticity_status: p.authenticity_status ?? 'UNCLAIMED',
        tags: p.tags,
        status: 'PUBLISHED',
        moderation_status: 'APPROVED',
        published_at: new Date(),
      },
      create: {
        seller_id: seller.id,
        category_id: category.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        short_description: p.short_description,
        base_price: p.base_price,
        compare_at_price: p.compare_at_price ?? null,
        condition: p.condition,
        authenticity_status: p.authenticity_status ?? 'UNCLAIMED',
        tags: p.tags,
        attributes: {},
        status: 'PUBLISHED',
        moderation_status: 'APPROVED',
        published_at: new Date(),
      },
    });

    // Replace images idempotently: clear then re-create
    await prisma.productImage.deleteMany({ where: { product_id: product.id } });
    for (let i = 0; i < p.image_count; i++) {
      await prisma.productImage.create({
        data: {
          product_id: product.id,
          url: `https://picsum.photos/seed/${p.slug}-${i}/800/800`,
          alt_text: `${p.name} — image ${i + 1}`,
          display_order: i,
          is_primary: i === 0,
        },
      });
    }
  }

  // --------------------------------------------------------------------------
  // Sample product reviews — feeds the PDP's reviews section + rating histogram
  // + product.rating_average / rating_count summary fields. Deterministic
  // selection (same products + reviewers + bodies on every reseed).
  // --------------------------------------------------------------------------
  console.log('Seeding sample product reviews...');

  const REVIEW_AUTHORS = [
    { email: 'fatu.kollie@vendoora.test',     name: 'Fatu Kollie',     diaspora: false },
    { email: 'james.williams@vendoora.test',  name: 'James Williams',  diaspora: true },
    { email: 'konah.bryant@vendoora.test',    name: 'Konah Bryant',    diaspora: false },
    { email: 'mariama.koroma@vendoora.test',  name: 'Mariama Koroma',  diaspora: false },
    { email: 'sarah.tubman@vendoora.test',    name: 'Sarah Tubman',    diaspora: true },
    { email: 'amos.bestman@vendoora.test',    name: 'Amos Bestman',    diaspora: false },
  ];

  const REVIEW_BODIES = [
    `Exactly as described — arrived in 36 hours, packaging perfect. The driver waited while I inspected before I gave him the code. That's the part I love most.`,
    `Sent this to my mother in Paynesville. Got the photo of her holding it the same day. Going to be a regular for me.`,
    `Quality is excellent. Vendoora's escrow saved me last month on a different order — they refunded within 48 hours when something arrived broken. Trust earned.`,
    `Good product, fast delivery to Sinkor. The seller messaged when the driver picked up. Code came by SMS as promised.`,
    `Honest review: small scuff on the package corner but the item itself is perfect. 4 stars because of packaging, not the product.`,
    `Best purchase from Vendoora so far. I've ordered six times — every single one delivered as described. Telling my whole family.`,
  ];

  // Ensure the 6 review-author users exist (idempotent upsert).
  const authorIds: string[] = [];
  for (const a of REVIEW_AUTHORS) {
    const u = await prisma.user.upsert({
      where: { email: a.email },
      update: { full_name: a.name },
      create: {
        clerk_id: `seed_review_author_${a.email}`,
        email: a.email,
        full_name: a.name,
        is_email_verified: true,
      },
    });
    authorIds.push(u.id);
  }

  // For each seeded product, write a deterministic spread of 5-6 reviews so
  // the rating histogram has a real shape. Star distribution (per product):
  //   five 5★, one 4★, one 3★ — average ≈ 4.6.
  // Wipe + re-create so reseeds don't accumulate duplicates.
  const allProducts = await prisma.product.findMany({ select: { id: true } });
  await prisma.review.deleteMany({
    where: { subject_type: 'PRODUCT', subject_id: { in: allProducts.map((p) => p.id) } },
  });

  let reviewCount = 0;
  for (const product of allProducts) {
    const ratings = [5, 5, 5, 5, 4, 3]; // 6 reviews per product, avg ≈ 4.5
    for (let i = 0; i < ratings.length; i++) {
      const rating = ratings[i] ?? 5;
      const authorId = authorIds[i % authorIds.length];
      const body = REVIEW_BODIES[i % REVIEW_BODIES.length];
      if (!authorId || !body) continue;
      await prisma.review.create({
        data: {
          subject_type: 'PRODUCT',
          subject_id: product.id,
          author_user_id: authorId,
          verified_purchase: i < 4,
          rating,
          body,
          status: 'PUBLISHED',
          helpful_count: 18 - i * 3,
        },
      });
      reviewCount++;
    }

    // Update product's rating_average + rating_count denormalised fields.
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
    await prisma.product.update({
      where: { id: product.id },
      data: { rating_average: avg, rating_count: ratings.length },
    });
  }
  console.log(`  ${reviewCount} reviews across ${allProducts.length} products.`);

  // Platform configuration — insurance fund (Engineering_Spec §7.5).
  // The balance is the money-of-record: stored as a fixed-2dp STRING (no JSON
  // float drift) and protected on re-seed (`protectOnReseed`) so an already-debited
  // fund is never clobbered back to the seed value. Caps/threshold re-seed their
  // value so config tweaks propagate to existing envs.
  console.log('Seeding platform config (insurance fund)...');
  const insuranceConfig: Array<{
    key: string;
    value: number | string;
    description: string;
    protectOnReseed?: boolean;
  }> = [
    { key: 'insurance_fund.balance', value: '5000.00', description: 'Insurance fund balance (USD).', protectOnReseed: true },
    { key: 'insurance_fund.currency', value: 'USD', description: 'Insurance fund currency.' },
    { key: 'insurance_fund.max_per_incident', value: 500, description: 'Max insurance payout per incident (USD).' },
    { key: 'insurance_fund.max_per_buyer_year', value: 2000, description: 'Max insurance payout per buyer per year (USD).' },
    { key: 'insurance_fund.max_per_seller_year_incidents', value: 10, description: 'Max insurance incidents per seller per year.' },
    { key: 'insurance_fund.replenish_threshold', value: 2000, description: 'Balance below which Finance Admin is alerted (USD).' },
  ];
  for (const cfg of insuranceConfig) {
    await prisma.platformConfig.upsert({
      where: { key: cfg.key },
      update: cfg.protectOnReseed ? {} : { value: cfg.value, description: cfg.description },
      create: { key: cfg.key, value: cfg.value, category: 'insurance', description: cfg.description },
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
