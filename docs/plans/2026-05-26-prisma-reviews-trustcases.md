# Vendoora — Prisma Slice 7a: Reviews + Trust Cases

> Inline execution per user preference.

**Goal:** Add the Reviews domain (§4.13) and Trust Cases domain (§4.14) from the May-2026 additions. Schema 38 → **44 tables**.

**Scope:**
- Reviews: `Review`, `ReviewReport`, `ReviewAggregate` + 4 enums (ReviewSubjectType, ReviewStatus, ReportReason, ReportStatus)
- Trust Cases: `TrustCase`, `TrustCaseNote`, `TrustCaseAction` + 5 enums (TrustSubjectType, TrustCaseStatus, TrustSeverity, TrustResolution, NoteVisibility, TrustActionType — actually 6 enums)
- Back-refs: User (author/reporter/reviewer/assignee), OrderItem (review back-ref via `Review.order_item_id`), Product (reviews via subject_id — no relation, polymorphic)

**Notes:**
- Review's `subject_type` + `subject_id` is polymorphic — no Prisma `@relation` to Product/Seller because Prisma doesn't support polymorphic FKs. Application-layer enforcement (P3 + P6).
- ReviewAggregate has `@unique([subject_type, subject_id])` so there's exactly one aggregate row per product/seller.
- TrustCase's `subject_type` (7 values) is similarly polymorphic.
- TrustCase has a self-referential `parent_case_id` for follow-up cases.

**Tasks:**
1. Reviews + 4 enums (RED → GREEN, ~6 tests)
2. Trust Cases + 6 enums (RED → GREEN, ~7 tests)
3. apps/web smoke + cold-state + commit + merge
