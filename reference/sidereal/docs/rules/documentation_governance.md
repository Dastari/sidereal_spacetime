# Documentation Governance

Status: Active
Lifecycle: source-of-truth
Category: rule
Last updated: 2026-06-04
Owners: documentation + agent workflow
Scope: Documentation Governance.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 1. Folder Roles

Documentation is organized by role and lifecycle:

1. `docs/architecture/`: project-wide architecture and implementation trackers.
2. `docs/systems/`: cross-cutting system catalogs.
3. `docs/guides/`: contributor and UI/component guides.
4. `docs/decisions/`: stable decision records and `docs/decision_register.md`.
5. `docs/features/active/`: current implementation contracts and partial implementation specs.
6. `docs/features/proposed/`: broad future features, mechanics, resources, and content ideas that must remain separate until implementation starts.
7. `docs/features/deferred/`: parked feature ideas.
8. `docs/features/reference/`: feature references and playbooks that are not sole source-of-truth contracts.
9. `docs/features/implemented/`: implemented feature notes retained for traceability.
10. `docs/plans/*`: implementation plans grouped by lifecycle.
11. `docs/reports/*`: dated outputs grouped by report type.
12. `docs/prompts/*`: reusable prompts and open/completed handoff prompts.
13. `docs/rules/`: documentation and contributor-governance rules.

## 2. Lifecycle Rules

- Active source-of-truth docs must be concise enough to use during implementation.
- Historical, completed, and superseded docs must say `Source of truth: no`.
- Broad future mechanics and resource ideas must not be consolidated into generic umbrella documents. Keep them as standalone proposed feature docs.
- When implementation starts for a proposed feature, move the document to `docs/features/active/` or create an active contract and link back to the proposal.

## 3. Decision Records

Decision IDs are stable and unique. Duplicate IDs are not allowed in filenames or in `docs/decision_register.md`.

If a collision is found, keep the earliest intended ID and renumber the conflicting later decision to the next available ID. Update all links in the same change.

## 4. Naming

Markdown filenames use lowercase letters, numbers, underscores, and hyphens only. Keep decision IDs as `dr-XXXX_<slug>.md`, dated plans as `<topic>_plan_YYYY-MM-DD.md`, reports as `<topic>_<report_type>_YYYY-MM-DD.md`, and prompts as `<topic>_prompt.md` or `<topic>_handoff_YYYY-MM-DD.md`.

## 5. Validation

Run:

```bash
scripts/siderealctl docs-check
```

The checker enforces fixed headers, filename conventions, duplicate decision IDs, moved-link coverage, index coverage, and active-doc stale-reference rules.

2026-09-06: generated Playwright failure traces and HTML report attachments in
`dashboard/test-results/` and `dashboard/playwright-report/` are build/test output,
not source documentation, and are excluded from the Markdown header checker.
