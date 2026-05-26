# Vendoora — Prisma Slice 6: Diaspora

> **For agentic workers:** Inline execution per user preference.

**Goal:** Add the diaspora data model — Recipient, GiftBundle, BundleItem, GroupGift, GroupGiftContributor, ScheduledGift + 3 enums. Wire up the deferred `Recipient` + `GroupGift` relations on Order. Schema 32 → **38 tables**.

**Architecture:** One auto-generated migration. The diaspora surface is the highest-emotional-touch part of the marketplace per the prototype HTMLs — recipient address books, occasion-based gift bundles, group-gift escrow pools, scheduled recurring gifts via RRULE. This slice lands the table shape only; the group-gift escrow pool logic and the RRULE recurrence worker land in P5 Diaspora Experience.

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P1 Foundation (Playbook §3.1.3, slice 6 of ~6)
**Estimated session time:** 3 hours

## Approach

Six models from Engineering_Spec §4.10:
- **Recipient** — diaspora sender's address book of recipients in Liberia
- **GiftBundle** — curated occasion-based bundles (Birthday, Christmas, Easter, Ramadan, etc.) with hero image + price
- **BundleItem** — products inside a bundle, with quantity + substitutability flag
- **GroupGift** — group-gift escrow: shareable code, target amount, deadline, status lifecycle
- **GroupGiftContributor** — who contributed how much, with optional message
- **ScheduledGift** — one-time or RRULE-recurring scheduled gifts with saved payment method

Three enums (BundleOccasion 11 values, GroupGiftStatus 5 values, ScheduleType 2 values).

**Upgrades 2 deferred FKs from slice 3:**
- `Order.recipient_id` → `@relation Recipient?`
- `Order.group_gift_id` → `@relation GroupGift?`

**Back-refs added:**
- User: `recipients Recipient[]` (sender side), `group_gift_contributions GroupGiftContributor[]`, `scheduled_gifts ScheduledGift[]`
- Recipient: `orders Order[]`
- GroupGift: `orders Order[]`
- Product: `bundle_items BundleItem[]`

## Out of scope

- **GiftBundle seed** — needs sample products to populate BundleItem rows; defer until pilot data lands
- **Group-gift escrow pool logic** — aggregating contributions, refund-all-on-deadline-miss: P5 Diaspora Experience
- **ScheduledGift recurrence worker** — RRULE parser + 48-hour-ahead firing: apps/worker (P5)
- **Voice message storage** — column `Order.voice_message_url` exists; R2 wiring is P1.3.7
- **Diaspora storefront UI** — P5

## Test cases (~12)

- [ ] `recipients` table with key columns (sender_user_id, name, phone, address, is_primary)
- [ ] `gift_bundles.slug` UNIQUE
- [ ] `bundle_items` table with bundle_id + product_id FKs
- [ ] `group_gifts.group_gift_code` UNIQUE (shareable invite)
- [ ] `group_gifts.target_amount` and `collected_amount` are Decimal(10, 2)
- [ ] `group_gift_contributors` composite UNIQUE on (group_gift_id, user_id)
- [ ] `scheduled_gifts.recurrence_rule` exists (nullable; only set when schedule_type=RECURRING)
- [ ] 3 enums exist with documented values (BundleOccasion, GroupGiftStatus, ScheduleType)
- [ ] `orders.recipient_id` now has FK to recipients
- [ ] `orders.group_gift_id` now has FK to group_gifts
- [ ] End-to-end: sender → recipient → place an order with `recipient_id` set
- [ ] End-to-end: sender starts a GroupGift, contributors join, contribution count tracked

apps/web smoke: `prisma.recipient.count()`, `prisma.giftBundle.count()`, `prisma.groupGift.count()` queryable.

---

## Tasks

### Task 1: Diaspora models + upgrades + tests (RED → GREEN)
Standard pattern.

### Task 2: apps/web smoke test extension + cold-state + commit + merge
Standard pattern.
