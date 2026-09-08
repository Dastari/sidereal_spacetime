# DR-0052: Asteroid Destruction via Generic 2D Destructible Voxel Bodies

Status: Proposed
Lifecycle: proposed
Category: decision
Last updated: 2026-06-16
Owners: gameplay simulation + engine architecture + client rendering + replication/persistence + content
Scope: Commit to replacing the asteroid V2 damage-driven Voronoi-cell fracture with arbitrary destruction of asteroids as 2D coarse-cell ("voxel") bodies, backed by a new project-agnostic destructible-body engine crate on the engine side of the DR-0045 boundary, with carving driven by any weapon damage, op-log replication, server-coarse/client-fine colliders, connected-component splitting, and timed heal.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/proposed/destructible_voxel_asteroids_proposal.md
- docs/features/active/asteroid_field_system_v2_contract.md
- docs/features/implemented/asteroid_damage_driven_fracture_implemented.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/decisions/dr-0050_block_based_ship_construction.md

## DR-0052: Asteroid Destruction via Generic 2D Destructible Voxel Bodies

- Status: Proposed
- Date: 2026-06-16
- Owners: gameplay simulation + engine architecture + client rendering + replication/persistence + content

- Context:
  - The shipped asteroid V2 destruction model (damage-driven 7-site latent Voronoi network + staged cell detachment; `asteroid_field_system_v2_contract.md` §6, `asteroid_damage_driven_fracture_implemented.md`, `crates/sidereal-game/src/asteroid_fracture_network.rs` + `asteroid_field.rs`) feels bad in play, and the causes are architectural, not tuning. Confirmed in code: (1) fragment colliders are Voronoi cells clipped to a bounding disc (`CELL_BOUND_RADIUS = 1.05`) so their AABB dwarfs the rendered chunk; (2) fragments spawn at the cell centroid inside the body with that oversized collider and only `STAGED_DETACH_IMPULSE_MPS = 1.6`, so the solver resolves the overlap inward and punches the chunk through the parent; (3) `fracture_child_sprite()` re-rolls a smaller *whole* asteroid sprite instead of a shard.
  - Root pathology: v1 keeps three representations that must agree but cannot — shader silhouette (visual), Voronoi polygon (collider), re-rolled child sprite (fragments). Every feel failure is two of them disagreeing.
  - The desired fantasy is arbitrary destruction: carve, explode, tunnel through, and split asteroids, with mining as literal carving, not break-into-N-children.
  - The asteroid field V2 authoring model itself (roots, members, deterministic keys, field-owned damage/resource/ambient state, server authority) is healthy and should be kept.
  - Feature owner decisions are locked: coarse cells (~4–8 px), fully physical (navigable tunnels + split into rigid bodies), a generic engine crate, hybrid timed-heal persistence, and "carving = damage applied geometrically" (any weapon carves; mining lasers are merely more efficient via per-material vulnerability).
  - The current arsenal is a single ballistic weapon (no beam/railgun/missile/mining tool); v2's initial carve driver is therefore the ballistic weapon's discrete impact (crater carves), and beam/mining-laser dwell carving is deferred with the mining tool. The carve model is weapon-agnostic, so future weapons register a delivery profile + damage type without engine changes. Planned weapon types are ballistic, laser, missile, and torpedo (plus the mining laser), with ammo variants doing different damage levels/types; each weapon and ammo variant registers a profile + `damage_type` + strength, never touching `engine-voxel2d`.

- Decision:
  - Replace the V2 Voronoi-cell fracture with **arbitrary coarse-cell destruction**: an asteroid under fire is a single 2D occupancy grid that is simultaneously the render mask, the collider source (marching-squares-traced), and the mass/fragment source. One grid as single source of truth, so the three §Context feel failures cannot exist.
  - Build a new **project-agnostic engine crate `engine-voxel2d`** (name provisional) holding the generic destructible-body core: `VoxelGrid2D` (solid + material + integrity layers), `CarveOp` vocabulary + deterministic apply, `CarveLog` (append/bake/snapshot), marching-squares→RDP→convex-decomposition collider regen, and union-find connected-component splitting. Place it on the engine side of DR-0045; keep all named space concepts (rock/ore/material names, weapon damage types, resource yields, vulnerability matrices) in content (`sidereal-game` + `data/scripts`). Same boundary discipline and deletion-test reasoning as DR-0051.
  - **Carving is damage, geometrically applied** through the existing combat pipeline (`ShotImpactResolvedEvent`), not a new system. A carve op is `(region, damage_type, raw_strength)`; per cell, `erosion += raw_strength × vulnerability[material][damage_type]` and the cell is removed at `erosion ≥ hardness`. The `damage_type` taxonomy and `vulnerability` matrix are content; mining-laser efficiency and ore-vein toughness fall out of per-cell material.
  - **Replicate operations, not pixels.** Stream carve ops on a dedicated AOI-gated delta message lane (per entity, append-only, tiny), in the spirit of `tactical.rs`; keep only the rarely-changing **baked baseline** as replicated/persisted state (chunk-encoded like `PlayerExploredCells`, `visibility = [Public]`). The grid is `pristine(seed)` + replayed ops, reconstructed identically on server and client — never sent as pixels.
  - **Server-coarse / client-fine colliders.** Server owns the authoritative `CarveLog` and a coarse collider regenerated on a debounce; client reconstructs the fine grid for rendering. Apply the existing motion authority split (server authoritative, client predicts, reconcile) to geometry. Server-authoritative per asteroid field V2 §3 — clients never split or create resource output.
  - **Lazy promotion / de-promotion.** Untouched asteroids keep the cheap procedural path (sprite + static convex collider, no grid). Promote to a voxel body on first carve (like the lazy `AsteroidMemberDamage` insert); de-promote when fully healed.
  - **Hybrid timed heal.** Persist only the carved delta + `last_carve_tick` on field-owned `AsteroidFieldDamageState`; heal by morphological dilation toward the known pristine mask when unobserved; de-promote on full heal; latch completed splits (no re-merge). This bounds persistent storage.
  - **Mining is carving:** removed cells of a material yield resources via `AsteroidResourceProfile`; mass tracks removed cells through the existing mass/inertia derivation.
  - **Migration:** build side-by-side behind a marker, keep the live Voronoi fracture untouched during development, cut over last (re-author starter fields, flip spawns, reset world, delete the Voronoi/disc-clip/centroid-spawn/`fracture_child_sprite` paths) — the DR-0050 pattern.
  - **Sequencing:** de-risk with a collider+split spike first (standalone Avian scene), whose pass bar is the three feel failures inverted, before any networking/content work.

- Alternatives considered:
  - Keep tuning the Voronoi fracture (bigger impulse, tighter cell clip): rejected — the three failures are architectural (three divergent truths), not reachable by tuning.
  - True per-pixel (Noita-style) fidelity: rejected — collider vertex counts and per-pixel state cost far more for marginal feel gain; coarse cells get the destruction fantasy at a fraction of the cost and make "fully physical" affordable.
  - Dense/chunked grid replication as the primary transport (like the fog `PlayerExploredCells` grid): rejected as primary — op-log + baked baseline matches the existing deterministic-procedural philosophy (replicate a seed, not a sprite) and is far cheaper on the wire; the chunk encoding is reused only for the occasional baked baseline.
  - Put the growing carve log inside a replicated component: rejected — generic components full-send on change, so a body under fire would re-broadcast its whole history every tick; stream ops on a delta lane instead.
  - Build the voxel core inside `sidereal-game` "for now": rejected — it is provably generic (terrain/debris/other bodies); engine-side from day one avoids a later extraction and keeps the deletion test green (same call as DR-0051).
  - Client-side destruction authority/prediction: rejected — server-authoritative per V2 §3; destruction is latency-tolerant (the crater appears when the op arrives), like existing combat.
  - Durable-forever carved state: rejected — unbounded persistent state; hybrid heal + de-promotion self-bounds storage.
  - A separate "carve" input path distinct from damage: rejected — every weapon already resolves to a damage event; reuse `ShotImpactResolvedEvent` and give it a shape + footprint.

- Consequences:
  - Positive:
    - The three confirmed feel failures (oversized AABB, punch-through, mini-asteroid children) are designed out: collider == visual == mass come from one grid.
    - Arbitrary destruction (carve/tunnel/explode/split) and a tactile "carve the ore out" mining loop the Voronoi model cannot express.
    - Generic destructible-body machinery lands on the correct boundary side, reusable for terrain/debris; the engine deletion test stays green.
    - Bandwidth stays in the v1 league (op-log + rarely-changing baseline + AOI); most asteroids never promote and pay nothing.
  - Negative:
    - Avian compound-collider regen + broadphase churn is a new server cost center that must be proven (spike) and contained (debounce, lazy promotion).
    - Splitting under bombardment and prediction near just-split asteroids need caps and reconciliation tolerance.
    - A new engine crate plus a carve-delta replication lane is real surface area; carve math must be bit-identical Rust↔WGSL.
    - Cutover deletes a shipped, tested subsystem and requires re-authoring starter fields and a world reset.

- Follow-up:
  - Accept this DR and write the implementation plan under `docs/plans/proposed/` following the proposal §15 sequencing (spike → engine core → replication → content → client render → cutover).
  - Run the §15.1 collider+split spike and record real per-carve / per-split cost and broadphase-churn numbers before committing further phases.
  - Resolved (§19): the arsenal is a single ballistic weapon today; v2's initial carve driver is the ballistic weapon (discrete crater carves), and beam/mining-laser dwell carving is deferred with the mining tool. The carve model stays weapon-agnostic for future weapons.
  - Resolve open questions (cell size default, client fine-collider for prediction, split heuristic, bake cadence, recursive fragment destructibility) in the plan.

- Decision doc:
  - `docs/decisions/dr-0052_destructible_voxel_asteroid_bodies.md`

- References:
  - `docs/features/proposed/destructible_voxel_asteroids_proposal.md`
  - `docs/features/active/asteroid_field_system_v2_contract.md`
  - `docs/features/implemented/asteroid_damage_driven_fracture_implemented.md`
  - `docs/decisions/dr-0045_engine_content_separation_achieved.md`
  - `docs/decisions/dr-0050_block_based_ship_construction.md`
  - `crates/sidereal-game/src/asteroid_fracture_network.rs`, `crates/sidereal-game/src/asteroid_field.rs`
  - `crates/sidereal-game/src/combat.rs` (`ShotImpactResolvedEvent`)
  - `crates/sidereal-game/src/components/asteroid_member_damage.rs`, `asteroid_field_damage_state.rs`
  - `crates/sidereal-game/src/components/player_explored_cells.rs` (chunk-encoding pattern)
  - `bins/sidereal-replication/src/replication/tactical.rs` (snapshot+delta lane pattern)
  - `crates/sidereal-game/src/procedural_sprite_generation.rs`, `data/shaders/asteroid.wgsl` (seed/parity)
