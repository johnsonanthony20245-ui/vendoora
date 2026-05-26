# Vendoora — Prisma Slice 7b: Profile Change Requests + Webhook/Outbox + KYC Application

> Inline execution. Final May-2026 additions slice.

**Goal:** Add `ProfileChangeRequest`, `WebhookLog`, `OutboxEvent`, `KycApplication`, `KycDocument` + 12 enums. Schema 44 → **49 tables**.

**After this slice the entire Engineering_Spec §4.2-4.10 + §4.13-4.16 + §4.18 data model is implemented.** (§4.11 Operations Domain enrichments — Notification, PlatformConfig, expanded AuditLog — and §4.17 Product extensions reconciliation (DISPUTED + RETURN_POLICY_CUSTOM enum cleanup) are the remaining schema work.)

**Scope:**
- §4.15 Profile Change Request — 1 model + 4 enums (ProfileSubjectType, ProfileChangeType, ProfileChangeStatus, ApproverTier)
- §4.16 Webhook & Outbox — 2 models + 4 enums (WebhookDirection, WebhookStatus, OutboxStatus + we don't introduce a new "OutboxEventType" since it's free String)
- §4.18 KYC Application — 2 models + 4 enums (KycApplicantType, KycApplicationStatus, RiskTier, KycDocType, KycDocStatus = 5 enums actually)

Total: 5 new tables + 13 new enums.

**Back-refs on User:**
- `profile_change_requests_created` (requested_by_user_id)
- `profile_change_requests_reviewed` (reviewed_by_user_id)
- `kyc_applications` (applicant_user_id)
- `kyc_applications_reviewed` (reviewer_user_id)

**Tests** (~10):
- ProfileChangeRequest: structure, enums, FK to User
- WebhookLog: UNIQUE (provider, external_event_id) for idempotency, structure
- OutboxEvent: status enum, dispatch tracking columns
- KycApplication: structure, enums, document relation
- KycDocument: doc_type + status enums
- End-to-end: create KycApplication → attach KycDocument → query with relation
