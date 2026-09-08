# DR-0044: Agent Instruction Layering — Lean AGENTS.md Core + Auto-Trigger Rule Packs

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-04
Owners: architecture
Scope: DR-0044: Agent Instruction Layering — Lean AGENTS.md Core + Auto-Trigger Rule Packs.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-30
Owners: agent workflow + docs

Primary references:
- `AGENTS.md`
- `.claude/skills/sidereal-*/SKILL.md`
- `docs/decision_register.md`

## 1. Context

`AGENTS.md` is the project operating contract, read by every human and AI
contributor. It had grown to a single flat `## 3. Non-Negotiable Technical Rules`
list of ~55 bullets (171 lines / ~2,940 words total). Most of those rules are
**domain-conditional** — they only matter when touching a specific area (dashboard
frontend, shaders, asset delivery, component authoring, BRP/observability) — yet
they were carried as always-on context for *every* task, including unrelated ones.

Two costs followed:

1. **Always-on weight.** A docs typo fix or a backend change still paid for the
   full dashboard/shader/asset rule text.
2. **Transitive read amplification.** `docs/` is 150+ files / ~50k lines with heavy
   cross-references (e.g. `sidereal_design_document.md` references ~10 further docs;
   `visibility_replication_contract.md` ~11). An agent that dutifully follows
   AGENTS.md's doc pointers can ingest enormous context before doing any work.

The harness was verified (fresh session) to **auto-trigger project skills under
`.claude/skills/`** based on their `description` and the code paths being touched.
The pre-existing `.agents/skills/` skills (bevy, rust, lua) are *not* surfaced by
the harness; they are used by explicit prompt file-path reference and are managed by
`skills-lock.json` external sync.

## 2. Decision

### 2.1 Lean always-on core

`AGENTS.md` keeps only genuinely cross-cutting invariants in its always-on body:

- §3.1 Authority and identity
- §3.2 Coordinates and motion
- §3.3 Shared code, naming, schema
- §3.4 Distribution (DR-0040 three questions)
- §3.5 Networking / Lightyear fork policy
- §5 Workflow, §6 Runtime/env, §7 Quality gates, §8 Doc standards/maintenance

### 2.2 Domain rule packs (auto-trigger)

Domain-conditional rule clusters move into six rule packs under `.claude/skills/`,
each a lean `SKILL.md` with `user-invocable: false`, a precise third-person trigger
`description`, and the one authoritative doc for its domain:

| Pack | Triggers when touching | Authoritative doc |
|---|---|---|
| `sidereal-components` | gameplay components, persistence/hydration, mass/inertia, scripting-connected components | `docs/guides/component_authoring_guide.md` |
| `sidereal-visibility-replication` | visibility/range, replication delivery, AOI, redaction, replication input routing | `docs/features/active/visibility_replication_contract.md` |
| `sidereal-client-wasm` | `bins/sidereal-client`, prediction/reconciliation, transport, client deps, native client UI | `docs/guides/ui_design_guide.md` |
| `sidereal-frontend` | `dashboard/` routes, forms, API handlers, UI, styling, bundling | `docs/guides/frontend_ui_styling_guide.md` |
| `sidereal-shaders-assets` | shaders/materials, Lighting V2, asset delivery/cache, Lua asset registry | `docs/features/active/asset_delivery_contract.md` |
| `sidereal-observability-net` | backend diagnostics/metrics, BRP, link conditioner, gateway admin/bootstrap auth | `docs/features/active/server_observability_metrics_contract.md` |

### 2.3 Authoritative fallback + navigation rule

- AGENTS.md §4 carries the index table above. The packs remain part of the contract
  even where auto-trigger is unavailable; an agent reading AGENTS.md follows the
  table to the matching pack.
- AGENTS.md §2 states the navigation rule: `docs/` is a reference map, not required
  reading — read the specific relevant section via targeted search; do not
  transitively read whole doc chains.

## 3. Alternatives considered

- **Keep one flat AGENTS.md** — rejected; this is the original always-on-cost problem.
- **Relocate clusters into existing feature contracts only (no skills)** — viable
  fallback, but skills add on-demand auto-loading at no extra cost and keep the rules
  named/discoverable.
- **Author packs under `.agents/skills/`** — rejected; that tree is external-sync
  managed (`skills-lock.json`) and not auto-surfaced by the harness.
- **Hook-injected packs** (`UserPromptSubmit`/`PreToolUse`) — deferred; auto-trigger
  skills proved sufficient. Remains the fallback if auto-trigger regresses.

## 4. Consequences

- Positive: AGENTS.md ~28% lighter (words); domain rules load only when relevant;
  every rule preserved in exactly one place; transitive-read risk mitigated.
- Negative: rules now span two surfaces (core + packs) requiring sync discipline;
  pack trigger `description`s must stay accurate to fire reliably.

## 5. Maintenance notes

- New enforceable area-specific rules go in the matching pack. If a new *area* is
  introduced, add a pack and a §4 table row (AGENTS.md §8.3).
- Do not fold the packs back into AGENTS.md's always-on body; that reintroduces the
  always-on cost this decision removed.
- Verify a pack still auto-triggers after editing its `description`.
