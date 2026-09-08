# Firmament Universe Authoring & Seed Pipeline Plan

Status: Active
Lifecycle: source-of-truth
Category: plan
Last updated: 2026-08-31
Owners: content authoring + gateway + replication runtime + engine architecture + client rendering
Scope: Grow /firmament from a baseline-authoring tool into the system that lays out the starting state of the whole game universe (systems, zones, layers, fields, placements, factions, quests, spawners), build the runtime seed pipeline that applies a universe baseline into a live world, and resolve DR-0054's reconcile-model design questions. Seed-first; reconcile later.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md
- docs/features/proposed/universe_baseline_seeding_proposal.md
- docs/decisions/dr-0052_destructible_voxel_asteroid_bodies.md
- crates/sidereal-game/src/asteroid_field.rs (existing deterministic member keys)
- crates/engine-content/src/{universe.rs,universe_write.rs,universe_load.rs,translate.rs}
- data/scripts/world/world_init.lua (the global render-layer + field config to generalize)

## 0. Implementation Status

- 2026-08-31: Firmament now edits `BaselinePlacement.component_overrides` through the
  generated component schema. Polygon and path boundaries support the same authored
  `falloff_width_m` smooth-edge fade as circles. `layout_seed` now rerolls field layout
  while retaining stable member keys. Native/WASM impact: the replicated zone-boundary
  payload changed and requires protocol v17; render math remains shared across targets.
- 2026-08-31: Starter planets and the starter asteroid field are baseline-owned in
  `data/content/universes/maw/`. `world_init.lua` retains engine-level render/rule and
  tactical defaults plus the pirate patrol until those have suitable generic baseline
  lanes. U6 three-way reconcile remains intentionally deferred while authoring stabilizes.
- 2026-08-31: The five global fullscreen backdrop instances and their generic
  `ShaderParameterSet` values are now authored by `maw.default_background`; they no longer
  come from `world_init.lua`. Firmament whole-baseline writes preserve this stack, and
  Shader Workshop publishes one baseline-owned layer's values with optimistic
  concurrency. Native/WASM impact: optional zone-layer parameter sets are replicated in
  protocol v17 and attached to client-derived composited layer entities on both targets.

## 1. Vision & scope

`/firmament` authors the **starting state of the universe** — the data-driven, dashboard-authored replacement for the hardcoded `world_init.lua`. It lays out systems, zones, planets, factions, ships/stations, and quests, using the Foundry's entity blueprints + assets. It can also author generic empty spaces (zones) and shaped fields (asteroid belts).

Founding principles (owner vision, 2026-06-20):
- **Firmament authors the starting state + quest publishing — not the full live population.** Some authored entities are *spawn points* (a pirate base spawns ships/fleets); the runtime sim expands from them. The baseline holds the seeds, not the millions of runtime-spawned ships.
- **Zones are first-class generic spaces.** Each zone has a **boundary** (usually a circle, but also polygon / vector-line / "banana" path), its own **background/foreground render layers** (and planetary layers), and optionally **is a field** (an asteroid/debris generator that fills the boundary shape — not necessarily circular).
- **Everything places Foundry blueprints/assets** (entity packages: planets, ships, stations, bases).
- **Quests** are authored as definitions + links (to placements/zones/factions); the runtime drives quest state.
- **Single-player future:** Firmament can author an SP world; a combined client+server executable loads it for a local single-player experience. The seed pipeline must be a reusable library so both the MMO server and a future SP build call the same code.
- **The map is WYSIWYG:** the `/firmament` map renders the real assets — planets via a single-frame shader render, ships/stations as their sprites, at relative scale + rotation + position.

## 2. Current state (recon 2026-06-20)

DONE — the **authoring + storage half** (GB0–GB2b):
- `UniverseBaseline` disk format (`engine-content/universe_{write,load}.rs`), disk-as-SoT under `data/content/universes/<id>/` (`universe.json` + `systems/*.json` + `placements/*.json`), on the `PackageWriter` machinery (atomic, confined).
- Gateway endpoints `/admin/dashboard/universes` (list/get/**publish**/validate); `/firmament` reads + writes real placements.
- Current schema is thin: `universe = {baseline_id, display_name}`; `system = {id, name, center, radius_m}`; `placement = {placement_id, blueprint_id, system_id, position}`.

MISSING — the **runtime half**:
- **No seed/apply pipeline.** Nothing in `bins/sidereal-replication` reads a universe baseline (verified by grep). `/firmament`'s placements spawn nothing in-game; `world_init.lua` is still the SOLE author of the live runtime world.
- No zones/boundaries/layers/fields/factions/quests/spawners in the format.
- No reconcile (DR-0054 questions unresolved — now resolved in §6).

Key reuse insight: `world_init.lua` already expresses **layered rendering globally** (`world_defaults`: `fullscreen_background`/`foreground` phases, per-layer `shader_asset_id`/`order`/`parallax_factor`, `render_layer_rules`, a circular asteroid field). A `system` already has a circular boundary (`center`+`radius_m`). So most of the vision is **generalizing world_init's global config into per-zone, data-driven, authored config** + adding the seed pipeline — not a from-scratch build.

## 3. Data model (expanded universe baseline)

```
data/content/universes/<baseline_id>/
  manifest.json                       # files[], revision (existing PackageWriter manifest)
  universe.json                       # baseline_id, display_name, default_background (deep-space base layers)
  factions/<faction_id>.json          # NEW: id, name, color, relationships{faction_id: stance}
  systems/<system_id>.json            # id, name, center, radius_m (existing)
  zones/<zone_id>.json                # NEW: system_id, boundary, layers[], field?, display
  placements/<placement_id>.json      # blueprint_id, system_id, zone_id?, position, rotation_rad?,
                                       #   scale?, faction_id?, component_overrides?, spawner?
  quests/<quest_id>.json              # NEW: id, triggers[], objectives[] (links), rewards[]
```

**Boundary** (the circle/banana/vector-line abstraction):
```
boundary =
  | { kind: "circle",  center:{x,y}, radius_m, falloff_width_m? }
  | { kind: "polygon", points:[{x,y}, ...], falloff_width_m? }         # vector-line shapes
  | { kind: "path",    spline:[{x,y}, ...], width_m, falloff_width_m? } # belts / "banana" fields
```
A field zone is just a zone whose generator fills its boundary shape — a banana belt is "path boundary + asteroid generator," no special-casing.

**Layers** (per-zone; generalizes `world_init.world_defaults`):
```
layers = [ { layer_id, phase:"fullscreen_background"|"fullscreen_foreground"|"world",
             shader_asset_id?, order, parallax_factor, shader_parameter_set? }, ... ]
```

**Background layering — deep space vs. systems (compositing model).** Backgrounds COMPOSITE, they do not replace:
- The universe carries a **`default_background`** = the **deep-space base** (just stars — e.g. a starfield + plain space-background base). It renders **everywhere, always**, as the bottom of the stack. Empty space with no system/zone shows only this.
- A **system/zone's `layers`** are **additional** background layers that render **on top of** the deep-space default **when the camera is inside that zone's boundary** (e.g. a nebula in a particular system). Their `order` slots them above the deep-space base but below the world.
- So: deep space = `default_background` only; inside a system/zone = `default_background` + that zone's background layers, composited bottom-up by `order`.
- Client implication (the deferred render-scoping slice, now with semantics): the client always renders `default_background`; as the camera enters a zone it **adds** that zone's layers on top (and removes them on exit) — never swapping the base out. The `world_init` → baseline migration moves `world_init`'s current global layers into the universe `default_background` (the deep-space base), with any system-specific backdrops becoming per-zone layers.

**Distance fade — no hard snap at the boundary (owner requirement, 2026-06-20).** The canonical three-layer setup: (1) **stars** = the `default_background`, always full, everywhere (deep space = stars only); (2) **nebula** and (3) **non-hero planet decal** = **system layers** that must **fade in/out across a band near the system edge**, not pop on/off. So a system layer's opacity is a continuous function of the camera's distance `d` from the (circular) system center of radius `r`:
- `d ≤ r_core` → opacity **1.0**; `r_core < d < r` → **smoothstep(1 → 0)**; `d ≥ r` → **0**.
- One new authored knob: `r_core` (or equivalently a `falloff_width_m`) — the width of the fade band. Stars never enter this.

This refines Uc's BINARY containment (`ZoneBoundary::contains` → on/off) into a **continuous fade factor**. Implementation decision (Uc was on/off): prefer applying the fade as a **render-layer / fullscreen-pass opacity** the compositing system sets per frame (no per-shader changes; "fade" becomes a property of any system layer) over feeding a fade uniform into each layer's material+schema+shader. Circles first; distance-to-edge for polygon/path "banana" zones is a follow-up. Open: whether system backgrounds are authored at the **system** level (the system's `radius` drives the fade — "the Maw has a nebula" is one act) or stay per-**zone** (finer-grained) — resolve in Ud.

**Field generator** (a zone that IS a field):
```
field = { generator:"asteroid_field", seed, density|count, member_blueprint,
          distribution:"fill_boundary", ... }
# members get keys via the EXISTING asteroid_member_key scheme (§6.1), spatially derived
```

**Placement** (instance of a Foundry blueprint), with the author-vs-spawn marker:
```
{ placement_id, blueprint_id, system_id, zone_id?, position:{x,y}, rotation_rad?, scale?,
  faction_id?, component_overrides?:{kind: payload}, spawner?:{...} }
```

**Spawner** (the seed, not the population — §4):
```
spawner = { kind:"fleet_spawner", faction_id, ship_blueprints[], cadence, max, ... }
```

## 4. The author-vs-spawn boundary (the core scoping principle)

Firmament authors the **starting state + spawner config + quests**; the **runtime sim drives dynamic expansion**. A pirate base is an authored placement carrying a *spawner* component (a Foundry-authored behavior/hook). The seed places the base; the runtime sim expands fleets from it. Consequences:
- The baseline stays small, authorable, deterministic (seeds, not live population).
- Re-seeding never reconciles the runtime-spawned ships — they were never in the baseline.
- Quests follow the same shape: Firmament authors quest *definitions* + *links*; the runtime quest system drives state.

## 5. Single-player constraint (honor now, cheap)

Build the seed as a **reusable library**: `seed_world_from_baseline(baseline, &mut World) -> GraphRecords` in a shared crate (extend `engine-content`, or a new `engine-universe`), operating on a Bevy `World` + graph-records (the same shape `world_init` + hydration already emit). The MMO replication server calls it on boot; a future single-process SP build calls the identical function in-process. Do **not** bolt seed logic into the replication binary. Cheap now, expensive to retrofit.

## 6. Resolved design decisions (DR-0054 reconcile model)

These govern **re-publishing a changed baseline onto an already-evolved live world**. For a fresh seed or SP author-once, reconcile is skipped (just seed). Owner decisions locked 2026-06-20:

### 6.1 Generator member key → deterministic spatial-hash key (REUSE asteroid V2)
Generated members (asteroids, debris) get a key that is a pure function of the generator's stable inputs + the member's **world-space spatial sample**, never a global array index or a freshly-minted GUID. **Reuse the existing scheme** (`crates/sidereal-game/src/asteroid_field.rs`): `asteroid_member_key(field, cluster_key, member_index)` = `"{field}:{cluster}:{index:04}"`, and `asteroid_member_uuid(member_key)` derives a deterministic GUID — so the reconcile gets stable identity for free. Voxel-destruction state (DR-0052) lives **below** this granularity (`AsteroidFieldDamageState`, keyed by `member_key`; `/cNN` splits, `#cellNN` cells) and is evolved runtime state the reconcile preserves at the member level — Firmament never touches voxel internals. **Refinement:** when Firmament reshapes a field boundary, `cluster_key` MUST be a world-space spatial function so members inside the edited boundary keep their key.

### 6.2 Merge-base materialization → hybrid
3-way merge needs the old baseline (ancestor) + new baseline + evolved world. Store a **full snapshot of the authored content** (placements, zones, systems, factions, quests — few; precise field-level merges) and **regenerate generated members from the old generator params + stable keys** (don't snapshot a million asteroid rows). Leans on §6.1.

### 6.3 Canonical-hash field set → explicit per-component allowlist
Hash **only** the authored fields the author can set in Firmament, per component type. Exclude by default: provenance (`created_at`/`updated_at`/`revision`), runtime-only (current velocity/health, runtime `Entity` id, shard/AOI/visibility), derived (mass-from-modules, bbox-from-sprite). Per-component nuance: a planet's position is authored (hashed); a patrolling ship's *current* position is evolved (excluded — only its authored start position is canonical). An allowlist (not denylist) means new runtime fields can't later poison the hash. This allowlist IS the "what Firmament owns vs. what the runtime owns" contract.

## 7. Phased plan (seed-first)

- **U1 — Seed core + minimal seed (highest value, no reconcile).** `seed_world_from_baseline` in a shared crate; seed placements (blueprint at position/rotation/scale/faction) into the runtime via the existing `blueprint_to_graph_records` + `PlacementContext.placement_components`; replication calls it on boot. Proves "Firmament placements appear in-game." One-way; reseed = blow-away-and-reseed.
- **U2 — Zones + boundaries + per-zone layers.** Add zones (boundary shapes + layers) to the format; seed applies per-zone render layers (generalize `world_init.world_defaults`); `/firmament` authors zones + boundaries. (DONE: backend format/seed/endpoints. Client render-scoping → Uc.)
- **U3 — Fields (generators).** Zone-as-field (asteroid generator filling a non-circular boundary); reuse asteroid V2 member keys (§6.1); seed spawns generated members (lazy/procedural).
- **Uc — Background compositing (client render-scoping).** Client always renders the universe `default_background` (deep-space stars); composites a zone's background layers ON TOP when the camera enters its boundary, removing them on exit (never swaps the base). Implements the §3 deep-space-vs-system layering model. Needs a `default_background` field on the universe baseline + the client per-zone layer activation by boundary containment. (DONE — binary activation.)
- **Ud — Distance-faded system backgrounds (DONE).** Refines Uc's binary on/off into a smooth **distance fade** (§3): a zone's background layers fade in/out across a soft-edge band toward its boundary; the deep-space base stays always-on. `falloff_width_m` is available on circle, polygon, and path boundaries; absent/`<=0` preserves hard containment. Circle distance is radial, polygon distance is the minimum distance to a ring edge after containment, and path distance is the swept half-width minus minimum centerline distance. All of a zone's background layers fade together. A runtime, non-authored `layer_alpha` rides each fullscreen material's `runtime_layer.x`; default-background/global layers carry no `ZoneLayerFade` and stay fully opaque. Native + wasm/webgpu share the render implementation; DR-0041 shader ABI snapshots remain unchanged.
- **U4 — Factions + spawners + quests.** Faction defs + assignment; spawner placements (runtime expansion, §4); quest defs + links + publishing.
- **U5 — Asset-rendering map + placement overrides (DONE).** Planets use the shader-preview draw path and ships/stations use authored sprites at relative scale, rotation, and position. The placement detail rail also edits `component_overrides` through Foundry's generated schema editor, including searchable component add/remove.
- **Ui — Iteration loop: re-apply on restart (DONE).** The cheap version of U6 (blow-away-and-reseed, no merge) that turns author→see into a fast loop without a full `pg-reset`. Every record a universe seed persists is stamped with a `universe_baseline_id` provenance tag (`engine_content::tag_seed_records_with_baseline`, applied in `apply_scripted_world_init_blocking`); the baseline's on-disk `manifest.revision` is recorded per baseline in a `universe_baseline_seed_revision` table. On boot, `apply_universe_seed_once` compares the recorded revision to the on-disk one: **unchanged or never-seeded** → the existing marker-gated path (skip / first seed); **changed** → delete every entity carrying this baseline's tag (`remove_entities_by_property`, catching even placements the author REMOVED), clear the baseline's one-shot markers + recorded revision, then let the aspect seeds rewrite the edited baseline. The delete is scoped strictly to the one baseline's tagged entities — never accounts, the player, or other world state. **Operator loop:** edit + Save in `/firmament` (revision bumps) → `siderealctl restart replication`. Boot ordering makes a short-lived direct DB connection safe (the wipe completes before the aspect writes and before the post-seed graph read that hydrates the world — all sequential). **Caveat (v1):** scoped to the single-shard dev setup — the delete-by-tag is not shard-partitioned, so a multi-shard re-apply still falls back to `pg-reset` (shard-safe re-apply is a follow-up). Pure decision (`should_reapply_universe_baseline`) + provenance-tag + Cypher/marker shape are unit-tested.
- **U6 — Reconcile (later).** The smart 3-way merge using §6; until then, reseed is the blow-away-and-reseed of **Ui** (valid for a world still being designed).
- **world_init migration (IN PROGRESS).** Starter planets, the starter asteroid field, and the five global fullscreen layers (including their per-instance shader values) are authored by the `maw` baseline. The generic `main_world`/`midground_planets` definitions and rule, tactical/lighting defaults, and pirate patrol remain in world-init until suitable generic baseline lanes exist. A world reset completes each cutover without retaining obsolete world-init-owned entities.

## 8. Risks / guardrails
- Seed reuses the existing graph-records/hydration spawn path + `PlacementContext` override-merge — do NOT fork a parallel spawn path.
- Reuse the asteroid V2 deterministic member keys — do NOT invent a parallel generator key.
- SP constraint: seed lives in a shared crate operating on `World`; no replication-binary coupling.
- Voxel/carve state is evolved-below-Firmament; reconcile at the member level only.
- Migration is side-by-side behind a marker; never break the live world; world reset on cutover.
- Disk-as-SoT + atomic/confined writes (the universe baseline already rides `PackageWriter`).

## 9. Out of scope / future
- Per-instance hook-override (the treasure-hunt scenario) depends on a future override-resolution runtime (`super` chain).
- Procedural *system/galaxy* generation (beyond per-zone fields) is future.
- The combined SP executable itself is future; U1–U6 only keep the seed library SP-callable.
