# ADR: First commit lands directly on `main` without a PR

**Date:** 2026-05-26
**Status:** Accepted
**Deciders:** Founder (Anthony)

## Context

Build_Prompt §7.5 mandates that all changes to `main` go through a pull request with the 10-stage CI/CD pipeline. At the moment of the very first commit of the project, no GitHub remote exists, no `.github/workflows/` directory has been authored, and there is no `main` on a remote against which to open a PR.

## Decision

The very first commit lands directly on local `main`. The PR-required rule activates as soon as the GitHub remote is configured and branch protection is enabled (planned in a near-term follow-up plan that adds `.github/workflows/` and remote setup).

## Consequences

**Positive:**
- The project starts. The scaffold can be reviewed in its entirety at the GitHub remote setup time.
- The audit trail is complete: this ADR is committed alongside the scaffold, so future readers see exactly what was bypassed and why.

**Negative:**
- One commit in project history did not pass the 10-stage pipeline. That commit's diff is auditable post-hoc by anyone reviewing the initial scaffold.

**Neutral:**
- Local pre-commit hooks, branch protection rules, and CI/CD all activate at the GitHub remote setup step. No further commits should bypass these gates.

## Alternatives Considered

- **Configure GitHub remote first, then commit empty scaffold via PR.** Rejected: requires GitHub repo creation + secrets + Actions setup *before* a single line of code exists locally. Doubles the bootstrap surface and creates a chicken-and-egg with secrets management.
- **Squash this scaffold into the first PR-gated commit later.** Rejected: rewrites git history; loses the discrete record of the bootstrap step.
