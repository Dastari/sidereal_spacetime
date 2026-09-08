# Destructible Voxel Asteroids

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-16
Owners: gameplay simulation + engine architecture + client rendering + replication/persistence + content
Scope: Replace the asteroid field V2 damage-driven Voronoi-cell fracture with arbitrary destruction of asteroids as 2D coarse-cell ("voxel") bodies — carve, explode, tunnel through, and split driven by any weapon damage — backed by a new project-agnostic destructible-body engine crate, with op-log replication, server-coarse/client-fine colliders, and timed heal, while keeping the asteroid field V2 authoring/root/member/resource/ambient model intact.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0052_destructible_voxel_asteroid_bodies.md
- docs/features/active/asteroid_field_system_v2_contract.md
- docs/features/implemented/asteroid_damage_driven_fracture_implemented.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md
- docs/decisions/dr-0050_block_based_ship_construction.md

## 0. Naming and relationship to existing docs

The user calls this the "v2 asteroid system", but `system.asteroid_field.v2`
(`docs/features/active/asteroid_field_system_v2_contract.md`) already owns that
name and that system is healthy. This proposal is **not** a new field system; it
is a **destruction-model successor**. It:

- **keeps** the asteroid field V2 model intact: `asteroid.field` roots,
  `AsteroidFieldMember` linkage, deterministic member/child keys,
  field-owned `AsteroidFieldDamageState`, `AsteroidResourceProfile`,
  `AsteroidFieldAmbient`, the procedural silhouette/seed, and the
  server-authoritative non-negotiables (contract §3);
- **supersedes at cutover** the fracture + fragment + collision subsystem: the
  damage-driven 7-site latent Voronoi network and staged cell detachment
  (`asteroid_field_system_v2_contract.md` §6 and
  `docs/features/implemented/asteroid_damage_driven_fracture_implemented.md`,
  implemented in `crates/sidereal-game/src/asteroid_fracture_network.rs` +
  `asteroid_field.rs`).

Decision rationale and the engine/content boundary call live in
`docs/decisions/dr-0052_destructible_voxel_asteroid_bodies.md`.

## 1. Motivation: why the shipped fracture cannot feel good

The current damage-driven fracture is structurally sound on paper but feels bad
in play for three reasons, all confirmed in code. They are not tuning problems —
they are the symptom of one architectural flaw.

1. **Oversized "pie-wedge" fragment colliders.** A detached fragment's collider
   is its Voronoi cell polygon clipped to a bounding disc
   (`CELL_BOUND_RADIUS = 1.05`, `asteroid_fracture_network.rs`), and its AABB is
   the bounding box of that wedge (`asteroid_field.rs` fragment-AABB path). The
   shader, meanwhile, `discard`s everything past the noisy silhouette radius. The
   collider is structurally larger than the rendered chunk.
2. **Fragments punch through the parent instead of fracturing outward.** The
   parent collider *does* correctly shrink on detach (`asteroid_field.rs`,
   `body_outline_from_attached_cells`), but the fragment spawns at its cell
   centroid — inside the remaining body — carrying the oversized wedge collider
   from (1), on the same collision layer, with only a small detach impulse
   (`STAGED_DETACH_IMPULSE_MPS = 1.6`). The solver resolves that overlap *inward*
   and shoves the chunk back through the rock. (1) is the cause of (2).
3. **Children look like smaller whole asteroids, not shards.** On terminal
   fracture, `fracture_child_sprite()` clones the parent `ProceduralSprite`,
   re-seeds, and merely attenuates the shape params (`lobe_amplitude`,
   `edge_noise`, `crater_count`). The child keeps the parent's lobe harmonic and
   renders as a smaller *whole* rock, not a jagged break.

**The single root pathology:** v1 maintains three representations of an asteroid
that are supposed to agree but cannot — the shader silhouette (what you see), the
Voronoi polygon (what physics uses), and the re-rolled child sprite (what
fragments become). Every "feels wrong" moment is two of those three disagreeing.

## 2. Design principle: one grid is the single source of truth

A destroyed asteroid is **one coarse-cell occupancy grid**. That grid is
simultaneously:

- the **render mask** (the client samples it per pixel/cell),
- the **collider source** (marching-squares-traced from the live solid cells),
- the **mass and fragment source** (cell count × density → mass; disconnected
  cell components → fragments).

When those cannot diverge — because there is only one of them — none of the three
§1 failures can exist. They are designed out, not tuned out (see §8).

## 3. Locked design decisions

Confirmed with the feature owner:

- **Fidelity: coarse cells (~4–8 px).** Destruction is quantized to small cells,
  not single pixels. This is the decision that makes "fully physical" affordable:
  grid analysis (flood-fill, marching squares) on a ~64×64 grid is microseconds,
  so cost re-concentrates onto one operation — the Avian collider rebuild.
- **Physicality: fully physical.** Holes are navigable, tunnels can be flown
  through, and carving that disconnects a body splits it into independent rigid
  bodies. Requires dynamic concave/compound colliders + connected-component
  splitting.
- **Scope: generic engine crate.** The voxel/carve/collider/split core is
  project-agnostic engine machinery (DR-0045); asteroid material/resource/
  vulnerability semantics layer on top as content.
- **Persistence: hybrid timed heal.** Carved state persists for a while, then an
  unobserved asteroid slowly regenerates toward pristine; a fully healed body
  drops its voxel state entirely.
- **Driver: carving is damage, geometrically applied.** Every weapon that does
  damage carves — bullets chip, explosions blast craters, railguns penetrate,
  mining lasers carve sustained channels. Mining lasers are simply *more
  efficient* against rock because materials have per-damage-type vulnerability.
  The current arsenal is a single ballistic weapon; the others are future weapons
  the model already accommodates (see §19).

## 4. The engine crate: `engine-voxel2d`

A new project-agnostic crate (name provisional; alt: `engine-destructible`)
holding the generic 2D destructible-body core. It knows nothing about asteroids,
rock, ore, or weapons.

Responsibilities:

- `VoxelGrid2D` — chunked, bit-packed solid mask + a per-cell material layer + a
  per-cell integrity (accumulated-erosion) layer.
- `CarveOp` — the operation vocabulary (circle/crater, radial explosion,
  capsule/beam, polygon) and a **deterministic** apply.
- `CarveLog` — append, bake/compaction, snapshot encode/decode (reuse the
  RLE/sparse chunk encoding pattern from `PlayerExploredCells`).
- Collider regeneration — marching squares → simplify (existing RDP) → convex
  decomposition → Avian compound collider.
- Split — union-find / flood-fill connected components → per-component
  `SpawnDescriptor { sub_mask, centroid, mass_fraction, velocity }`.
- A **removed-mass hook/event** so content can account for what was destroyed.

Content (`sidereal-game` + `data/scripts/asteroids`) supplies: the initial solid
mask (from the existing procedural generator), the cell size per size tier, the
`material → hardness` mapping, the `vulnerability[material][damage_type]` matrix,
and the `material → resource yield` mapping. The crate never names "mining
laser", "rock", or "ore" — those are content (DR-0045 deletion-test discipline,
same reasoning as DR-0051).

## 5. Cell-grid data model

- **Cell** = a 4–8 px world-space quantum, authored per size tier. It is the
  atomic destructible unit.
- **Pristine grid** is derived deterministically from the asteroid seed (the same
  `seed_from_key` / `f32` lobe-phase derivation the silhouette and shader already
  share), so it is never sent over the wire. Each pristine cell carries a
  **material** (from the procedural generator: rock / carbonaceous / metallic /
  ore vein) and a derived **hardness** `H`.
- **Live grid** = `pristine(seed)` with the ordered `CarveLog` replayed on top.
  Server and client reconstruct an identical grid from ops alone.
- A typical actively-destroyed body is 48–96 cells across. A 64×64 grid is 4,096
  cells — a 512-byte solid bitmask, ~2 KB with a material nibble. Integrity is
  server-side simulation state derived from `(pristine material, ordered ops)`;
  it does not need to be on the wire.

## 6. Carving = damage, geometrically applied

Destruction is not a separate system. Every weapon already resolves to a damage
event (`ShotImpactResolvedEvent { impact_pos, .. }`, `combat.rs`). v2 gives that
event a **shape** and a **footprint** instead of a scalar, reusing the existing
pipeline rather than adding a new input path.

- **Shape** comes from the weapon's delivery profile (content): bullet → small
  crater, explosion → radial blast, railgun → deep penetrating capsule, mining
  laser → sustained narrow capsule along the beam, applied per tick of dwell.
  Today only the ballistic weapon exists, so the first cut uses the crater shape
  only; the remaining shapes are the model accommodating future weapons (§19).
  The `(shape, damage_type, raw_strength)` of a carve is selected by the **weapon
  and its loaded ammo/loadout**, not the chassis alone — so different rounds in the
  same gun (e.g. AP vs HE) carve at different levels, shapes, and damage types.
- **Per-cell erosion model.** A carve op is `(region, damage_type, raw_strength)`.
  For each cell in the region:
  `erosion += raw_strength × vulnerability[material][damage_type]`; the cell is
  removed when `erosion ≥ hardness`. This makes the "weakness" land **per vein**,
  not per asteroid:
  - mining laser on rock → high multiplier → carves fast;
  - railgun into a metallic vein → high raw strength, low multiplier → punches
    through but leaves the ore;
  - bullets chip gradually; a missile clears a crater instantly.
- The `damage_type` taxonomy and the `vulnerability[material][type]` matrix are
  **content** (Lua in the asteroid registry). `engine-voxel2d` only ever sees
  "apply this erosion to these cells".

This also makes veins *physically* tougher/softer, not just colored, which is
what makes "carve the ore out" tactile and rewards the right tool.

## 7. Collider and physics

The genuinely uncertain cost is collider regeneration, not grid analysis.

- **Boundary → collider.** Marching-squares the live solid cells (outer loop plus
  hole loops), simplify with the existing RDP pass, convex-decompose into an Avian
  compound collider. Concave holes/tunnels force compound colliders — a single
  convex hull cannot represent a tunnel.
- **Server-coarse / client-fine split.** The server owns the authoritative
  `CarveLog` and a *coarse* collider regenerated on a **debounce** (at most every
  N ticks, or when accumulated carve-area crosses a threshold); gameplay physics
  tolerates a slightly coarse boundary. The client reconstructs the *fine* grid
  for rendering and only needs a matching collider where tight predicted
  ship-vs-asteroid contact matters. This is the motion authority split (server
  authoritative, client predicts, reconcile on tolerance) applied to geometry.
- **Splitting.** After a carve that could disconnect (cheap heuristics: carve
  crosses a narrow neck, or touches two boundary arcs), run union-find over the
  grid. Each disconnected component becomes its own entity: a re-based sub-grid,
  centroid, conserved mass, inherited velocity + a gentle separation impulse.
  This replaces v1's "spawn 2–6 random children". Because the components partition
  the same space exactly (no shared cells), there is no overlap for the solver to
  fight — separation is a drift, not a penetration shove.

## 8. How this fixes the three §1 failures

- **Pie-wedge AABB → gone.** There is no separate collider polygon. The collider
  is marching-squares-traced from the actual solid cells, so its boundary *is* the
  rendered boundary and its AABB hugs the visible chunk by construction.
- **Punch-through → gone.** A split fragment is a disjoint connected component:
  its cells are cells the parent no longer has. The two grids partition the same
  space with zero shared cells, so there is no overlap to resolve inward.
  "Fracture outward" falls out of the geometry being honest.
- **Mini-asteroid children → gone.** A fragment has no generated sprite. It *is*
  the literal sub-grid of cells that broke off, so its silhouette is the jagged
  break edge. Nothing re-rolls a smaller whole rock.

## 9. Replication and authority

Server-authoritative, per asteroid field V2 §3 (clients never split or create
resource output).

- **Carve ops → a dedicated delta message lane**, keyed by entity, AOI-gated,
  append-only — tiny (~6–12 bytes/op), in the spirit of the existing
  `tactical.rs` snapshot+delta lane. **Do not** put the growing log inside a
  replicated component: generic components full-send on change, so a body under
  fire would re-broadcast its entire history every tick.
- **Baked baseline → the only "heavy" replicated/persisted state**, a
  chunk-encoded snapshot that changes *rarely* (on bake or split), with
  `visibility = [Public]`. Late joiners in AOI get `latest baseline + tail ops`
  and replay to the identical grid.
- **Lazy promotion.** Undamaged asteroids keep the cheap procedural path (sprite +
  static convex collider, no grid) and pay nothing. On first carve, promote to a
  voxel body — directly analogous to today's lazy insert of `AsteroidMemberDamage`
  on first hit.
- **Redaction.** The carve geometry is public; exact resource yields/depletion
  stay server-owned (resources contract). Routes through
  `system.visibility_replication.v1`.

## 10. Persistence and timed heal

Hybrid heal is the game-feel choice *and* the storage bound.

- Pristine is regenerable from seed, so it is never stored. Persist only the
  carved delta (baked baseline) + a `last_carve_tick`, via the existing
  graph-record/component path on the field-owned `AsteroidFieldDamageState`.
- **Heal = morphological dilation toward the known pristine mask** while the body
  is unobserved: empty cells that are solid-in-pristine and adjacent to current
  solid regrow at a content-authored rate. Tunnels fill from their walls inward.
- **De-promotion.** When an unobserved body heals all the way back, drop the voxel
  state and revert to the cheap procedural path. Storage self-cleans; only
  actively contested rocks carry heavy state. (Promote on first carve, de-promote
  on full heal — the lifecycle closes.)
- **Split fragments latch:** a completed separation does not heal back together
  (a severed chunk drifting back looking re-fused is worse than the alternative).

## 11. Mass, mining, and resource coupling

- Mass tracks removed cells: `mass = solid_cell_count × cell_area × density`,
  recomputed through the existing mass/inertia derivation on a meaningful carve.
- **Mining is carving.** Removed cells of material `M` yield resources from the
  asteroid `AsteroidResourceProfile` (`item_id`, yield weights), so extraction is
  literally "carve the ore out" — material veins are both visually and physically
  where the value is. This resolves the shipped fracture doc's open question on
  whether mining adds stress vs only depletes: mining *is* destruction. No mining
  tool exists yet, and field V2 §9 already states mining gameplay need not be
  finished — so the first cut wires the removed-cell → yield hook while the
  ballistic weapon is the only carve source; the dedicated mining loop arrives
  with the mining tool.

## 12. Determinism and parity invariants

- **Geometry is deterministic** from `(seed, content_version)` for the pristine
  grid (material + hardness), and the live grid is a pure function of that plus the
  ordered `CarveLog`. Reproducible, persistable, parity-checkable.
- **Carve math must be bit-identical** across the Rust↔WGSL boundary already
  guarded by the silhouette-parity contract, or server and client grids diverge.
  A parity test asserts server grid == client/shader grid for a sample of
  `(seed, op-sequence)` pairs, following the existing silhouette-parity test
  pattern.
- **Realized destruction** (which cells are gone) is legitimate server game-state,
  persisted in `AsteroidFieldDamageState`; on reload the body rehydrates with its
  carved cells already removed.

## 13. Content authoring (Lua)

`data/scripts/asteroids/registry.lua` gains content knobs; Rust owns schema,
deterministic generation, carve/erosion/collider/split resolution, resource
transactions, persistence, and replication (consistent with field V2 §8):

- cell size and grid coarseness per size tier;
- `material → hardness` and the `vulnerability[material][damage_type]` matrix;
- `material → resource item_id` yield mapping;
- heal rate; carve-op shape/strength/`damage_type` per weapon **and ammo** profile;
- collider regen debounce thresholds and split heuristics tuning.

## 14. Relationship to existing systems and rules

- **Keeps** asteroid field V2 authoring/root/member/resource/ambient and all of
  §3's server-authoritative non-negotiables.
- **Supersedes at cutover** the V2 §6 fracture contract, the
  `asteroid_damage_driven_fracture_implemented` model, and the
  `asteroid_fracture_network.rs` Voronoi network + staged detachment + child
  sprite re-roll. Deletes the disc-clipping, centroid-spawn, and
  `fracture_child_sprite` paths.
- **Engine/content boundary:** the voxel core is engine (`engine-voxel2d`), the
  asteroid semantics are content (DR-0045). New machinery lands engine-side from
  day one to keep the deletion test green (same call as DR-0051).
- **Migration shape:** build side-by-side behind a marker, keep the live Voronoi
  fracture untouched during development, and cut over last (re-author, flip,
  reset, delete the old path) — the DR-0050 block-construction migration pattern.

## 15. Phased delivery

1. **Collider + split spike (de-risk first).** A standalone Avian scene: one body,
   a 64×64 integrity grid, carve circles/capsules, debounced compound-collider
   rebuild, union-find split on disconnect. No networking, no content. Pass bar =
   the three §1 failures inverted: collider AABB hugs the visible chunk, a severed
   piece drifts cleanly apart with no interpenetration, the piece is a jagged
   shard. **If this is cheap, the feature is viable; if not, rethink before any
   further work.**
2. **Engine core:** `engine-voxel2d` grid + integrity + carve-ops + deterministic
   replay + bake + marching-squares collider + union-find split, with parity and
   conservation tests.
3. **Replication:** carve-delta lane + baked-baseline snapshot + lazy promotion +
   AOI + redaction.
4. **Content:** asteroid mask generation feeding the grid, the
   material/vulnerability/yield matrices in Lua, mass/mining coupling. The
   ballistic weapon's impact is wired as the initial (and currently only) carve
   driver — a crater carve per `ShotImpactResolvedEvent`.
5. **Client render:** extend `asteroid.wgsl` from cell-scissor to a real
   cell-grid sample.
6. **Cutover:** re-author starter fields, flip spawns, reset world, delete the
   Voronoi fracture path.

## 16. Performance

- Grid analysis (flood-fill, marching squares) on coarse cells is microseconds;
  the cost center is the Avian compound-collider rebuild and broadphase churn —
  contained by debounced regen and lazy promotion.
- Most asteroids in a field are never touched and stay on the cheap procedural
  path (zero grid), so cost is incurred only on engaged rocks.
- Carve ops are tiny on the wire; the baked baseline changes rarely; AOI gates
  delivery to nearby clients.

## 17. Risks

1. **Compound-collider churn in Avian** — frequent compound recreation can thrash
   the broadphase/islands. The §15.1 spike measures this first.
2. **Split cost under bombardment** — many bodies splitting in one tick. Cap
   splits/tick; debounce.
3. **Prediction edge cases** — a split changing collision an instant before the
   client hears about it; expected acceptable with reconciliation, but combat near
   asteroids is exactly where it shows.
4. **Replay determinism** — carve math must be bit-identical Rust↔WGSL or grids
   diverge; cover with parity tests.
5. **Heal correctness** — dilation toward pristine must not re-merge latched
   splits or thrash promote/de-promote near the heal boundary.

## 18. Open questions

1. Cell size: start at the coarser end (8 px) and tighten, or author per tier from
   the outset?
2. Does the client maintain a fine collider for predicted ship-vs-asteroid
   contact, or accept the server coarse collider with reconciliation?
3. Split heuristic: how cheaply can we decide "this carve might disconnect" to
   avoid running union-find on every carve?
4. Bake cadence: op-count threshold, area threshold, or time — and how to bound
   per-client snapshot resends at bake time.
5. Do split fragments remain fully destructible recursively (they are just smaller
   voxel bodies — likely yes), bounded by what (min cell count)?
6. Resolved from the shipped fracture doc: re-fracturable fragments → yes (smaller
   grids); mining adds stress vs depletes → mining *is* destruction (§11).

## 19. Current weapon reality (resolved)

The arsenal today is a **single ballistic weapon**; there is no beam, railgun,
missile, or mining tool. This resolves the prior open integration question and
sets the initial scope:

- v2's **first and only carve driver is the ballistic weapon**: each discrete
  `ShotImpactResolvedEvent` becomes a small **crater** carve. No beam/dwell
  plumbing is needed for the first cut.
- The weapon→carve-shape table in §6 (explosion blast, penetrating railgun
  capsule, sustained mining-laser channel) is **forward-looking**. Planned weapon
  types include **ballistic, laser, missile, and torpedo** (plus the mining laser),
  and ammo variants within a weapon will do different damage levels/types. The
  carve model is deliberately weapon-agnostic: each weapon *and each ammo variant*
  only registers a delivery profile + `damage_type` + strength. Nothing in
  `engine-voxel2d` or the carve pipeline needs to change to add them.
- **Mining-laser efficiency / sustained-beam carving is deferred** with the mining
  tool itself. When a beam weapon lands it adds a per-tick beam-damage tick
  emitting a stream of small capsule carves; until then the vulnerability matrix
  has a single meaningful `damage_type` (ballistic), and per-material hardness
  still differentiates how fast rock vs. ore vein erodes under it.

## 20. Tests

- Deterministic pristine grid: same `(seed, content_version)` → same material +
  hardness.
- Carve replay parity: server grid == client/shader grid for sampled
  `(seed, op-sequence)`.
- Per-cell erosion: `vulnerability[material][damage_type]` removes the right cells;
  mining-laser-vs-rock vs railgun-vs-metal behave as specified.
- Collider: marching-squares boundary hugs the solid cells; compound collider has
  the holes; AABB is tight.
- Split: union-find produces disjoint components; mass/velocity conserved within
  retention; no parent/fragment overlap; latched (no re-merge).
- Heal: dilation regrows toward pristine; full heal de-promotes; latched splits do
  not re-merge.
- Replication: carve-delta lane + baked baseline; lazy promote/de-promote; AOI
  gating; redaction of exact yields.
- Persistence/rehydration of a partially carved body across restart.
- Mass/mining: removed cells → resource yield via `AsteroidResourceProfile`.
- Native + WASM (`wasm32-unknown-unknown`, `bevy/webgpu`) build checks; native
  client visual validation.
