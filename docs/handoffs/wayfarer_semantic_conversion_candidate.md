# Wayfarer semantic conversion candidate r001

Status: executable compiled candidate; functional integration incomplete; unpublished.
Updated: 2026-09-10. Owner: construction integration.

The current installed Wayfarer can be represented in the construction document without replacing its Blender surfaces or losing placed identities. This is a concrete first conversion, not a completed multi-deck ship, live refit, approved new art revision, or spawnable production template.

## Run and evidence

```sh
npx tsx scripts/prepare_wayfarer_conversion.ts
npx vitest run packages/sim/src/wayfarer-conversion-candidate.test.ts
```

The script reads the explicitly pinned installed source files and floor authoring specification, verifies each native GLB's SHA-256, and writes only `.runtime/wayfarer-semantic-candidate-r001/`:

- `document.json`: canonical construction document, compiler SHA-256 `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340` (hash excludes the output file's final newline).
- `placements.json`: all 262 original placed objects, unchanged transforms, current native visual metadata, proposed functional role and separate damage policy requirements.
- `report.json`: exact input pins, 28 verified native GLB hashes, current readiness, per-placement blockers, separate live migration requirements.

Six tests cover deterministic compilation/reload, all source identities and transforms, R006 legacy IDs and current roofs, every input pin's rejection on drift, failure before UUID allocation when collision is absent, and entity-health versus structural damage classification. Strict ES2022 focused typecheck passes. Final aggregate check/build belongs to the coordinating release owner because shared-world integration is concurrent. This slice has no server mutation or UI changes; no authority smoke or browser result is claimed for this candidate.

## What is preserved

The document contains 51 semantic native floor bindings (49 squares and two triangles) plus 211 original visual assembly placements. All 262 placed IDs are unique across the two representations. The 2 m nominal floor polygons come from the actual r002 authoring specification, then use the original placement's exact right-angle transform on the 1/32 m authority lattice. No AABB becomes a floor polygon. The two bow triangles and all current Y=9 cockpit joins remain in their existing positions.

The seven `pilot-r005-*` outer placed IDs are retained intentionally, along with `pilot-r004-airlock-frame-22`. Removed vestibule parts 19/20 and frame21 are absent. These names are historical placement identities; asset revisions come from exact current catalog metadata. A named airlock frame does not create a functional airlock.

The installed 73 roofs/collars are native r004 visuals. They are retained exactly. The document does not attach the incompatible older generic `roofKit`, and disables generic roof generation for its one existing deck. A missing generic roof flag does not mean the native roof objects were deleted. Their cutaway, underside, support and seal bindings remain required.

Original floor placements, including historical fitting/backing proxies, survive in the companion placement record. The semantic document selects the native mapped floor surfaces; it does not silently certify or instantiate the old under-deck proxies as structural support. That representation needs an explicit support/damage adapter before live conversion.

The 82-lattice-unit ceiling is a conservative DESIGN datum from the lowest current shoulder roof placement origin. It is not measured underside/headroom clearance. No native roof or beam clearance proof is asserted.

## Interfaces that must be completed next

1. **Per-object collision:** the current instance compiler requires explicit collision classification for all 211 visual objects. Most are walls, hull or equipment; empty obstacle arrays would be false evidence. `planWayfarerCandidateSpawn` deliberately reaches the existing gate and rejects absent bindings before allocating an instance UUID. A qualified binding must state exact native revision, deck(s), support/clearance and body-safe footprints, not infer collision from visual AABBs.
2. **Floor support and roof family:** qualify the preserved floor backing separately; bind the actual r004 roof footprints, underside/beam datums, ceiling support and cutaway layer. Keep native geometry. A structural shell must be closed by qualified interfaces rather than implied by appearance.
3. **Walls and pressure:** convert actual native wall runs and junctions into structural boundary and partition interfaces; identify opening spans and thickness. Add room labels only after this topology exists. The present document has no pressure compartments or claimed seals. The retained frame22 needs a real door/airlock assembly and exterior supported egress route.
4. **Armor and external mounts:** separate structural frame, penetrable armor and cosmetic trim. Qualify voxel-damage proxies and mount/exhaust/service interfaces; do not invent thrust, strength, health or mass from meshes. Current source category `superstructure` is ambiguous and deliberately marked unresolved where evidence is insufficient.
5. **Existing fittings and containers:** attach current authoritative fitting/entity-health and inventory definitions by stable identity. The 17 interior equipment and four cargo placements are entity-health requirements, not voxel deformation. Preserve actual installed cargo definitions. Template spawns allocate fresh empty container/item/fitting identities under authority; a live refit preserves existing identities, contents and gameplay state.
6. **Deliberate rebuild:** the current source has one deck. Author additional decks, stairs/elevator locations, external airlock, cargo-only supported stacking volumes and 3D utility routes intentionally. Do not manufacture additional decks or operational power/pressure by guessing from the visual source.

## Integration ownership and safe rollout

New files are `packages/content/src/wayfarer-conversion-candidate.ts`, `packages/sim/src/wayfarer-conversion-candidate.ts`, its test, and `scripts/prepare_wayfarer_conversion.ts`. No shared catalog, renderer, server schema, app, live assembly or publication manifest was changed. Add package subpath exports only when the integration owner is ready to consume this API; this isolated candidate is not wired into product menus.

The current compiler can compile and reload the complete visual/floor candidate. Its readiness remains geometry/native floor only; pressure, services, native damage and flight are false. The base candidate deliberately supplies no collision bindings. The subsequent exact-source walking qualifier now supplies all 211 bindings for isolated static review; see [Wayfarer walking integration](wayfarer_walking_integration.md). This does not establish functional equipment, complete clearances or live refit readiness.

Use two separate authoritative operations in the eventual integration:

- **Publish/spawn template:** validated immutable construction snapshot; allocate independent ship/deck/part/fitting/container UUIDs for every new instance. Never reuse a live container's contents or a source placement UUID as a new world's entity UUID.
- **Live refit:** expected revision plus operation ID; map existing stable placed identities and actual ship/item/fitting/container rows; preserve inventory, crew, resources, damage, audit and receipts. Do not replace the entire live assembly from this historical candidate snapshot. Reconcile any source changes explicitly and re-pin after review.

Neither passing geometry checks nor the conversion script confers final art approval. Exact native sources remain unchanged; any required cockpit adaptation should receive its own Blender revision and independent fitting evidence.
