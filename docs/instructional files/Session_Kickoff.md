# Vendoora — Claude Code Session Kickoff

**What this is:** Paste the snippet below at the very top of every new Claude Code build session for Vendoora. It points Claude at the binding rules before it writes a single line, so you never have to re-explain the directive or fight drift/stubbing again.

---

## The snippet — copy everything in the box

```
Before doing anything, read these in this exact order and treat them as binding for this session:

1. Build_Fidelity_Directive.md — READ FIRST. Governs HOW you build. The prototype
   (Vendoora_App.html) is a binding spec for everything the user sees and the order
   things happen. Replace every prototype toast()/hardcoded array/placeholder with the
   REAL action, REAL data, and REAL integration behind it. No dead controls, no fake
   data, no TODO comments, no skipping escrow/code-verify/payments/KYC. Prove every
   feature done with both the Definition-of-Done checklist AND a passing end-to-end test
   that could NOT pass against a stub. If you genuinely can't build something for real,
   STOP and tell me exactly what you need (Build_Fidelity_Directive.md §5) — never
   silently substitute a stub and call it done.

2. Build_Prompt.md — the operational contract (Superpowers methodology §0.5, TDD §12.2,
   founder commitments §18.2).

3. Engineering_Spec.md — HOW it works underneath (schema, APIs, state machines).

4. Phased_Build_Playbook.md — the 8-phase build order. We are in Phase: [FILL IN].
   Today's goal: [FILL IN ONE FEATURE].

Rules for this session:
- Depth-first. Build ONE feature fully to Done before starting the next. Do not stub
  three things to "rough in the screen."
- End every completed feature with the DONE CERTIFICATION block from
  Build_Fidelity_Directive.md §3.3.
- If blocked, use the BLOCKED block from §5.2 and move to other real work or stop.
- Match the prototype exactly on layout, copy, navigation, flow order, and states.

Confirm you've read all four and restate today's ONE feature goal before you start.
```

---

## How to use it

1. **Fill in the two blanks** before pasting: the current Phase, and the ONE feature you want built this session. Be specific — "P3: build the escrow hold-on-payment state transition" beats "work on escrow."

2. **Paste it as your first message** in the Claude Code session, with the four `.md` files available in the project.

3. **Wait for the confirmation.** Claude should confirm it read all four and restate the one feature goal. If it doesn't restate the goal, or if it starts coding before confirming, stop it and re-paste — that's an early signal it's not anchored.

4. **At the end**, check for the DONE CERTIFICATION block (§3.3). No certification = not done, regardless of how finished it looks.

---

## Why "ONE feature" matters

The single biggest defense against stubbing is scope per session. When a session's goal is "build the seller dashboard" (broad), Claude rationalizes stubbing the hard parts to cover the surface. When the goal is "build the seller payout request flow, working end-to-end with a passing test" (one feature, depth-first), there's nowhere to hide an unfinished mechanism. Keep session goals narrow and the fidelity directive does the rest.

---

## Quick reference — the three gut-checks (from Directive §7)

Before accepting any "done," ask:
1. If I refresh / restart, is the result still there? (real persistence)
2. Would the test fail if the logic were replaced with a stub? (real logic)
3. Does what the user sees match the prototype exactly? (no drift)

Three yeses + the certification = done. Anything less = not done.
