# Exact50-ID wall candidate: installation readiness

Status: offline source/geometry/authority-gate investigation completed; no model, runtime asset, catalog, world or client changes. This supplements [the native wall handoff](usable_boundary_wall_integration.md); it does not approve art or claim an installed replacement.

## Confirmed against the actual canonical ship

The candidate still matches canonical `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. All50 replacement source IDs and transforms match, and all262 original IDs remain. The mapping combines28side +18end +4shoulder/collar bindings; the original six cabinets, all floors, cargo, cockpit doorway, fittings and state remain unchanged.

The exact per-placement old/new native bounds, current obstacle polygons, positive-height native projections, equipment intersections and source pins are in [geometry-comparison.json](../releases/usable-wall-readiness-20260910/geometry-comparison.json). No catalog AABB was substituted for native geometry.

Example at unchanged port locker bay:

| Source ID | Old native bounds min → max (m) | Candidate bounds min → max (m) |
| --- | --- | --- |
| `wall--2--3` | (−5,−7,0) → (−4.375,−5,2.6875) | (−5.049,−6.988,0.1875) → (−5.001,−5.012,2.64) |
| `wall--3--3` | (−5.25,−7,0) → (−5,−5,2.6875) | (−5.25,−7,0) → (−4.9375,−5,2.75) |

The exterior body's inward bearing lip exists only in its explicit floor/roof contact intervals. Its positive standing-height footprint consumes zero supported floor area. The inner-facing replacement removes the old wall intrusion; all six complete cabinet intersections are zero at their original transforms. The broader check also finds zero positive native overlap between **any canonical-template** interior equipment/cargo and the new50parts. Extra live fuel attachments are outside this canonical audit and must retain their own refit qualification. This is geometry clearance, not a health, interaction-range, structural-load or pressure qualification.

## Actual blockers and bounded remedies

1. **Native mesh selection is incompatible as currently specified.**46 candidate `nodePrefix` values end in `--`; their native children are named, for example, `GEO-bay00-interior--native-00`. The current authored assembly loader accepts exact names, prefix+`_`, or prefix+`.` and selects zero meshes. Every candidate GLB is a dedicated export: auditing its entire mesh set proves that omitting `nodePrefix` selects exactly the intended surfaces for all50bindings. The minimal remedy is a candidate catalog entry without a prefix for these exact SHA-pinned dedicated files. No generic loader relaxation is necessary.

2. **A direct clone installation increases mesh count substantially.** The same50 current placements contain152native mesh groups; the candidate contains570, an increase of418. These are actual native groups, not measured draw calls or hardware FPS. The current authored-assembly loader clones selected groups individually; it has no automatic per-placement geometry batching. Before a normal release, qualify material-preserving batching within each immutable placed object, or a surface-equivalent export consolidation. Preserve material slots, normals, tangents, emission, roof roles and independent placed UUIDs. Do not merge equipment with structural walls or erase authored detail. This is an integration/performance task; the surfaces need no redesign.

3. **The authority source pins must be versioned deliberately.** Current walking bindings reject any canonical SHA except362f. `inspect_usable_wall_authority.ts` actually compiles a proposed50-asset-ID/revision delta and verifies the old binding function rejects it with `exact canonical source required`. The document's `layout.assembly.revisions` must change with the asset IDs; changing IDs alone fails assembly validation. New native files are not automatically valid authoritative colliders. All old template paths must remain available to older instances.

4. **Current full-ship pressure is absent and the roof remains demonstrably open.** Canonical362f has zero semantic openings/partitions/rooms and no native pressure-room/airlock binding. The existing qualified standalone airlock is a separate fixture, not part of these50replacements. Four40mm roof-junction coupons at(−3,−7), (−1,−5), (1,−3), (3,1) contain positive-volume void paths fromZ2.55 to3.45m with all relevant candidate structural roles included. The center-panel control at(0,0) has no through path. The positive gaps belong to unchanged roof panels; the wall candidate cannot be called a sealed ship. Requalify the separately authored roof-closure kit against these corrected walls, then derive actual finite volumes and room/door topology. Do not install old diagnostic caps or invent an airtight flag.

## What collision evidence permits—and does not

The comparative audit includes the actual native low-step jamb override, not the obsolete whole-doorframe obstacle. In the current supported-floor union, every candidate positive standing-height native footprint is contained by the existing accepted obstacle union: uncovered area0m². This means keeping the old walking obstacles is conservative for this exact pose/body/supported-floor contract; it does **not** justify blindly assigning old source hashes to new art.

A separately reported draft native-slab octagonal cover adds0m² of planar blocking and removes12.0055584m² of old blocking cover. This is raw XY obstacle coverage, **not**12m² of guaranteed walkable character-center space. Actor-radius clearance, floor edges, remaining equipment, sweeps, headroom, interaction approaches and accepted occupants still need the ordinary compiled collision tests. The draft polygons are evidence only and are never emitted into runtime content.

The current6cabinet visual correction could therefore be staged as an explicitly conservative presentation qualification while retaining old collision restrictions; that would leave invisible old collision margins and is not the finished usable-floor rebuild. The preferred completed integration is a versioned template with independently pinned conservative slab/component collision bindings, followed by actual walking tests. Whole-ship pressure work can remain an explicitly absent feature during a scoped wall rendering release; it must not be reported as completed merely to remove a cabinet intersection.

The immutable threshold frame `pilot-r004-airlock-frame-22` is outside the50-ID set. Its measured step support, jambs and header remain unchanged. Both changed roof collars retain category`roof` and their old overall bounds; preserve existing roof/cutaway gates. Existing local source-pinned side/end/shoulder checks establish302specific contacts, including the two explicit buttress overlaps. Those narrow contact permissions do not grant general armor/equipment overlap exemptions or qualify all retained partial-height room partitions.

## Minimal safe integration map

1. Publish only the existing48unique native exports represented by the50-ID map to a new immutable runtime namespace, with exact manifest SHA/materials. The50oldplacements share41oldasset IDs, and some now need distinct exports: do not collapse this into a global old-asset-ID replacement. Resolve each stable placed identity. Omit the prefix only after retaining the dedicated-file selection check. Preserve old files/catalog entries. Do not also install the full representative wall prototypes or obsolete outer strips.
2. Qualify per-placement material batching and compare mesh/submesh/triangle costs and actual Deck/Flight rendering against the152group baseline. Keep both roof collars separately controllable.
3. Create a new trusted template revision by changing only those50placed asset bindings plus their assembly revision entries. Preserve all262source IDs,51floor placements and every frame. Regenerate separate walking bindings for the new canonical hash; keep362f supported. Rebind the unchanged exact threshold proof through a source-qualified new-template path rather than disabling its hash guard. Preserve both revisions across starter/access, cargo, seat/light, pilot and refit qualification; replacing a singleton source hash globally would invalidate older ships. The proposed catalog ID/namespace for each source placement is recorded in the comparison JSON, explicitly unpublished.
4. For existing ships, resolve source IDs through the private authoritative instance identity map and perform an expected-revision/idempotent refit. Preserve current actor, inventory, container, fitting, state and any accepted extra fuel attachment. Verify each occupied/support location against the new compiled frame; reject stale/edited source frames. Do not reuse the original legacy-to-native conversion as a full-snapshot overwrite.
5. Run isolated two-instance/spawn/refit/reconnect authority tests, cabinet/doorway walking and cargo/sofa/pilot approaches, then an actual installed browser Deck/Flight/roof review and cost comparison. A new template also needs the normal client/world compatibility release gates. No install is authorized by a successful offline report alone; parent controls the already-authorized coordinated release.

The new collision/source qualification, batching, runtime publication and refit adapter are the immediate bounded implementation tasks. Roof closure/pressure and voxel damage bindings remain separate incomplete construction systems. No new art redesign is required to start these integration tasks.

## Executable evidence

```sh
.runtime/construction-enclosure-python/bin/python scripts/inspect_usable_wall_readiness.py
.runtime/construction-enclosure-python/bin/python -m unittest discover -s scripts/geometry_tests -p test_usable_wall_readiness.py
npx tsx scripts/inspect_usable_wall_authority.ts
```

The Python test environment is the already-declared geometry environment. The four tests retain genuine holes, detect a positive thin crossing, check the exact loader-prefix behavior, and exercise the real50-ID comparison including the roof negative controls. Output goes only under`.runtime/`. The recorded authority evidence is [authority-gates.json](../releases/usable-wall-readiness-20260910/authority-gates.json). Full model art approval, whole-ship pressure and installed performance are not implied by these checks.
