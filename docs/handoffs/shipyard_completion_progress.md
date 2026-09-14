# Shipyard completion progress

## Adopted boundary-treatment architecture — owner confirmation 2026-09-11

The owner explicitly confirmed adoption of `reference/sidereal_ship_editor_structural_envelope.md` with the reviewed corrections. Floor polygon union generates structural boundaries; each boundary resolves a treatment, which may be a wall, glazed/sill assembly, opening, interface or deliberate open edge. Independent internal partitions use the same geometric vocabulary. Authored intent, compiled boundaries, native geometry, collision, seal coverage and runtime state remain distinct.

Corrections governing the reference: structural wall thickness is 250 mm **inward** of the fixed tile edge; the 2 m module and supported subdivisions remain; navigation is separate from structural floor coverage; physical properties derive from qualified adapters and server state rather than editor booleans; native Blender families provide supported geometry; edge splits/merges retain explicit lineage and report attachment conflicts; labels remain independent from pressure compartments; A/B/C1 minimum completion retains multi-deck traversal, rooms and pressure before later contracts.

The standard vertical profile is now **owner-approved**: 0.1875 m floor + 3 m clear height + 0.125 m roof + 0.1875 m service void = 3.5 m pitch. Standard opaque wall heights are 0.75/1.5/2.25/3 m. Smaller deck/space profiles must be representable explicitly for ducts, connecting bridges and small craft, with their own native interfaces and actor-clearance qualification. Earlier statements that these dimensions are pending are historical and superseded.

This confirmation resumes implementation after the owner's requested pause. It does not approve new art or change existing live native/collision pins. The straight-wall request remains a bounded initial treatment-family task, not the architecture for every boundary.


Takeover: 2026-09-11T02:22:59.281326+00:00

Status: Adopted boundary-treatment architecture and vertical dimensions frozen by owner. Contract A native families and independent B1 semantic integration underway. New art remains unapproved. No contract complete; no normal-game publication or live refit.

## Owner wall-convention override — 2026-09-11

The owner superseded the earlier outward-wall requirement during the completion
phase 0 check-in: “Interior walls need to sit INSIDE the tile.. So a 1x1 meter floor
tile should have a 250mm inside wall.” The tile/floorplan perimeter is therefore
the fixed **outer construction boundary**, not an advertised unobstructed walking
edge. New boundary-wall geometry occupies **250 mm (8 lattice units) inward** of
that boundary. Its exterior mating plane remains on the nominal tile edge, so
external hull/armor pieces have repeatable dimensions for ships and stations.
Smaller object placement increments and actual wall-volume exclusion determine
interior fit; the grid does not grant permission to intersect a wall. All body,
trim and frame geometry must fit its declared reservation.

This supersedes references below to outward-only walls, preserving the full floor
polygon as usable space, and fixing old intersections specifically by shifting
walls outside the floor boundary. Existing native revisions, measured audit results
and live installations remain historical evidence and are not rewritten or approved
by this direction. Actual contacts, collision, support and seals still require
qualification. A shared internal divider must have one explicit reservation/side
binding, not two accidentally overlapping room-perimeter walls.

The owner suggested quarter-, half- and three-quarter-height wall variants for the
Wayfarer bow. Treat height as an explicit family parameter with matching sill,
glazing/frame and roof interfaces; never stretch an unrelated mesh. Keep the floor
polygon continuous and model standing-clearance/navigation restrictions separately.
A partial-height opaque wall is not an airtight full-height boundary: its qualified
upper infill and closure must be accounted for. Preserve the existing swept-cockpit
visual target through explicit span bindings; do not replace it with opaque walls.

**Vertical dimensions remain pending.** The owner has not approved the earlier
3.5 m pitch / 2.8125 m clear-height proposal. A new proposal is 3 m clear height
with 0.75/1.5/2.25/3 m wall variants; 3.5 m pitch comprising 0.1875 m floor,
3 m clear height, 0.125 m roof and 0.1875 m service void. These all fit the existing
1/32 m lattice. They are a question to the owner, not permission to author dependent
native pieces. Keep the 2 m structural module and its supported 1 m subdivisions;
the owner's 1 m example does not remove the 2 m module.

## Historical phase 0 check-in status (superseded by adoption above)

Phase 0 report is ready for owner dimensional decisions; A0 is not closed until those decisions are frozen. No contract is marked complete. No native authoring, publication, live refit or database restart was performed.

- HEAD remains `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`; original dirty list/native pins were recorded before code. No staging/reset/clean/restore was performed.
- Normal game: https://sidereal.dastari.net/ — client `c2cb7dad161399f307b169347313a9c5e01748e5109cbfaeec9361a87eb6d03e`, actual world module `8afe80944ba6aaf47f997f8b1de2736d2b88568c1f3cf44753a54ecb82f9fe9a`.
- Dashboard: https://sidereal.tail7a58a6.ts.net:8445/shipyard — independent managed source review server.
- Independent B1 primitive: 5 focused tests passed; all 1,557 tests in 276 files passed with two workers, typecheck passed, 78 document/provenance checks passed, `art:check` passed, scoped ESLint/Prettier passed.
- Initial `npm run check` hit the known 20-second planet-terrain timeout during concurrent build (1,556 passed). The complete equivalent sequence with `npm test -- --maxWorkers=2` passed without changing tests or tolerances.
- Full `npm run build` passed in an isolated source snapshot, preserving shared generated bindings. Root apps/packages/scripts matched all 1,358 snapshot source hashes after build. Logs: `.runtime/shipyard-completion/phase0-check-initial.log`, `phase0-tests-bounded.log`, `phase0-build-final.log`.
- Browser/game/F3 candidate evidence is still pending. Helpers do not alter runtime behavior; neither tests nor old screenshots certify A/B/C1.
- State-conservation status: no player state mutated; no live conservation comparison claimed. Required inventory/character/refit reconciliation remains at its later gate.
- Owner question sent with section 1a proposed defaults. Native dimensions and dependent work remain held; no C2–C4 or D implementation begun.

## Ownership

Integration root owns this progress document and shared integration acceptance. Existing character/inventory/login/rendering changes remain externally owned. Historical domain ownership in coordination-current.md must be reconciled before shared-file edits. No subagents assigned yet.

## Historical owner-decision proposal (subsequently superseded by adoption above)

| Decision | Proposed default | Dependent hold |
| --- | --- | --- |
| Exterior wall family/thickness | **Owner decided: 250 mm inward, inside the tile; fixed exterior mating plane at tile perimeter.** Retain r004 as legacy. This supersedes the earlier outward proposal. | Height/profile qualification still pending |
| Deck pitch/clear height/service void | **Pending:** propose 3.5 m pitch = .1875 m floor + 3 m clear height + .125 m roof + .1875 m service void. Quarter-height variants .75/1.5/2.25/3 m fit the lattice. Earlier 2.8125 m proposal is not approved. | Native vertical interfaces/traversal generalization |
| Hull envelope/overhang | Preserve current Wayfarer XY [-5,5] × [-9,13] m; retain existing legacy height; new multi-deck height explicitly derived from approved deck count/pitch. No speculative balance classes; propose 0 m unqualified overhang for new designs, with separately declared qualified wall/armor/mount reservations. Existing legacy installations remain unchanged. Exact numeric limits for those external families still require owner freeze. | Hull qualification |
| Live collision/native pins before D | No changes; preserve installed pins and collision revision. | Live migration |
| Validator relaxation | None; fix nonconforming geometry/contracts. Escalate a specific proposal if necessary. | Any future relaxation |
| New art approval | All new revisions remain unapproved until owner signs exact deliverables. | Final art sign-off |
| Non-additive schema | Additive changes only; escalate any specific incompatible migration before execution. | Schema activation |

## Current versus needed / deliverables

| Contract/deliverable | Owner/files | Source pins/current state | Check/evidence | Next action / blocker |
| --- | --- | --- | --- | --- |
| A0 audit and migration map | Root; this file | Baseline and runtime pins verified; boundary model/inward wall/vertical dimensions owner-frozen | Phase0 matrix and decision package delivered | Preserve existing hull envelope; qualify new external allowances only after explicit decision |
| A1 machine-readable tileset and authoring guide | Root; content/spec generators and generated guides | Inward wall, roof125 and convex-corner requests derive approved shared dimensions | Spec hashes pinned; twelve convex footprint reservations audited | Complete internal/concave/opening/glazing requests and assembled qualification |
| A1 navigation/boundary variants | Root; structural v2/resolver | Boundary intents and separate convex clearance reservations admitted | Focused tests, browser import/reopen; unqualified pressure marked incomplete | Editable treatments and qualified native cockpit closure |
| A2 native walls/joins | inset_wall_author straight study; orientation_audit convex family | New inward250 straight r005 delivered; convex profiles being authored; legacy r004 retained | Straight export/manifold/material checks and root render review pass; unapproved | Native convex/concave/internal junctions, assembled browser/game seam evidence |
| A2 floor/roof/cockpit/airlock interfaces | Roof125 by inset_wall_author; root integration | New 125mm roof r000 twelve shapes delivered; existing floors retained; cockpit mappings audited | Roof native/material/seam checks pass; root underside review; gameplay unqualified | Combined walls/roof/floor and cockpit/door/airlock closure |
| B1 finite placement/migration | Root; content/sim/layout-assembly | 72-step helpers, loss-preserving migration report, legacy edit and secondary-proxy guards | Focused tests + prior combined checks; exact starter SHA retained | Finish finite orientation admission/persistence/render/collision integration and whole-body fit adapters |
| B3 editor workflow | Root; apps/dashboard | Blank drafts, floorplans, native wall preview, room overlay exist | Historical browser review only | Coherent UI, smaller snaps, reopen/edit, exact-candidate browser gate |
| B3 publish/spawn | Root; existing construction reducers/tables | Existing save/publish/spawn paths | Source and isolated verification pending | Reuse authority; two independent instances |
| C1 stairs/ladders | Root; existing traversal/stair adapters | Bounded fixtures exist | Historical isolated gameplay evidence | Generalize qualified placement; real movement/restart gate after B freeze |
| C1 doors/pressure/airlock | Root; existing door/atmosphere adapters | Draft topology overlay is not live gas; native fixtures exist | Generic layout seals unproven | Qualified compartments, finite state, two-account game evidence |
| C2 utilities/mounts | Deferred | Pure bounded service rules, partial integrations | Not current-candidate verified | Do not start before A/B/C1 minimum |
| C3 cargo grids/stacks | Deferred; external inventory work preserved | Cargo/container foundations and carrier work exist | Not current-candidate verified | Do not start before minimum |
| C4 lifts/damage | Deferred | Incomplete adapters; untracked elevator work externally owned | No completion claim | Do not start before minimum |
| D semantic Wayfarer | Deferred | 51 floors/retained native reference; no semantic partitions/openings/labels | Canonical starter pinned above | After earlier gates; preserve live state |
| D conservation/refit/release | Root integration, deferred | Existing revision-checked refit foundation | No live reads/writes or conservation comparison this session | Owner conservation check-in before refit |
| All contract evidence/performance | Root | Historical RTX 4080 baseline in plan; fresh F3 pending | No current-candidate browser/game evidence yet | Exact hashes, browser/game screenshots, counters, receipts per gate |

## Deployment and conservation

No deployment or live state mutation performed. Current normal game/world pair and dashboard mode are being verified against managed runtime records, not inferred from stale coordination entries. No acceptance gate passed; no current-candidate state-conservation claim.

## Assigned bounded audit ownership

- `orientation_audit`: read-only Contract B placement/rotation consumer and migration audit; reports to root; owns no shared source edits.
- `authority_audit`: read-only A0/B existing authority registration and minimum-viable gap audit; reports to root; no world/schema/binding edits.
Root retains progress, deployment inspection and dimensional decisions.

## Verified running deployment baseline

Read-only verification using managed CLI SQL `SELECT program_bytes FROM st_module` (hash only; no private player rows) and current immutable client metadata/link.

```json
{
  "worldSha256": "8afe80944ba6aaf47f997f8b1de2736d2b88568c1f3cf44753a54ecb82f9fe9a",
  "client": {
    "origin": "https://sidereal.dastari.net",
    "sha256": "c2cb7dad161399f307b169347313a9c5e01748e5109cbfaeec9361a87eb6d03e",
    "release": "/root/sidereal_spacetime/.runtime/public-client/releases/20260911-121749-c2cb7dad1613"
  },
  "currentLinkMatches": true,
  "dashboardMode": "managed Vite source review on 5174; HTTPS :8445/shipyard",
  "pins": {
    "assembly/wayfarer.json": "1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb",
    "assembly/catalog.json": "f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac",
    "construction/boundary-r004/kit.glb": "568d491623f03df932a9c5c120a94e4a60b00bd0fd421ae3cf928c89543505db",
    "crew/components/manifest.json": "a845c9687d7d952686e5c9da5e276a5d40459de73fee9092197e4095ae65d2a6"
  },
  "dashboardCommand": [
    "node",
    "node_modules/vite/bin/vite.js",
    "--config",
    "apps/dashboard/vite.config.ts",
    "--host",
    "0.0.0.0",
    "--port",
    "5174",
    "--strictPort"
  ],
  "public-clientCommand": [
    "node",
    "node_modules/vite/bin/vite.js",
    "preview",
    "--config",
    "/root/sidereal_spacetime/.runtime/public-client/delivery-releases/20260910-120119-520de12b8dad/public_client_preview.mjs",
    "--host",
    "0.0.0.0",
    "--port",
    "5183",
    "--strictPort",
    "--outDir",
    "/root/sidereal_spacetime/.runtime/public-client/releases/20260911-121749-c2cb7dad1613"
  ]
}
```

Current hull preset is exactly 320 × 704 × 96 lattice units = 10 × 22 × 3 m, origin (-5,-9,0) m. No overhang limit is currently declared by HullEnvelope. All four editor mockups were opened during phase 0.

## Independent B1 implementation assignment

`orientation_audit` now owns only new `packages/content/src/placement-orientation.ts` and `packages/content/src/placement-orientation.test.ts`: finite yaw admission, exact legacy classification and rotation helpers with negative/roundtrip tests. No existing schema, reader, assembly, catalog, exports, UI or authority changes. This is a building block, not integrated fine-angle support or a contract gate pass. Root reviews before any integration.

## Phase 0 source audit findings

Audit date: 2026-09-11. No contract is complete; owner dimension freeze is pending.
The current-versus-needed matrix above is supplemented by these inspected code paths:

| Deliverable | Verified implementation | Required next change |
| --- | --- | --- |
| A/B shared interfaces | `packages/content/src/tileset-interfaces.ts` already defines versioned nominal polygons, datums, profiles, native pins and role-specific proxies. | Extend this existing contract, not a parallel dimensional system. Missing complete reservations, swept regions, chosen outward family and spec provenance need explicit versions. |
| B semantic admission | `packages/sim/src/layout-structure-admission.ts` admits structure v1 only: hull/grid/wallFaces/tileStyles/armor. | Explicit version dispatch for boundary variants and navigation masks; legacy v1 remains readable and byte-preserved. |
| B rotation persistence | `packages/content/src/layout-assembly.ts:101` rounds radians to quarters; `assembly.ts:148` rounds trig; its AABB uses two corners. | Separate finite yaw/continuous reservations from exact lattice structure; no global replacement of quarterTurns. |
| B publish/spawn | `packages/world/src/construction.ts` and `construction-instances.ts` implement permission/revision/receipt checks, immutable publication and UUID-remapped installation. | Reuse transactions, extend qualified version admission, prove two independent candidate instances. |
| C1 doors | `construction-doors.ts:84` skips door installation for boundary r004. | New family needs its own qualified door/jamb installation adapter. Visible openings do not prove operating doors. |
| C1 pressure | `construction-pressure-document.ts:84–113` requires exact single-deck/eight-cell/one-door fixture and rejects mixed kits. | Separately qualified composition/topology adapter; do not remove fixture restrictions. |
| C1 stairs/ladder | Existing native validators fix two decks and prohibit rooms, partitions, openings, fittings and mixed kits. Stair fixture has 36 floor bindings, ladder 17. | Reuse authoritative motion/reservations after qualifying composition. Current fixture rise is 3.1875 m and ceiling field 3 m, distinct from proposed new family dimensions. |
| C1 airlock | `construction-airlock-document.ts` validates exactly 70 native parts, 16 tiles, one deck and two doors. | Qualify attachment to an authored enclosure; standalone acceptance does not transfer automatically. |
| Privacy | No public base table declarations found in construction table files; instance access checks workspace/game access, and projections redact actor/audit data. | Preserve these paths and demonstrate actual two-account permissions in candidate. |

### Migration sequence and file boundaries

1. Retain v1 documents, canonical hashes, source assets and all legacy installed fixture validators. Never auto-convert login or old draft loading.
2. Implement dimension-independent finite orientation primitives, then explicit document/structure version dispatch with retained raw original bytes and a reviewed migration candidate.
3. Version boundary bindings (opaque/glazed/doorway) by exact source spans/pins and navigation masks independently of structural floor union. The five cockpit spans and two named bow triangles in the cockpit handoff are migration inputs, not authority changes now.
4. After dimensional freeze, extend the existing tileset schema and generate its authoring guide. Assign native families by exact spec hash, mating profiles and output reservations; keep all new art unapproved.
5. Qualify native composition and keep asset geometry, collision, bearing, seal, damage and ports separate. Only then admit the new compiler through existing publish/spawn.
6. A2 assembled native evidence and owner check-in; B3 desktop/small browser and reopen evidence and owner check-in; C1 gameplay, two-instance/restart/pressure evidence and owner check-in. No C2–C4 or D work before minimum viable completion.

### Native authoring gaps queued, not started

- Outward straight/diagonal/end/convex/concave/T/cross family with matching internal junctions, jamb/setback and roof profiles: wall/deck owner decisions pending.
- Missing matching diagonal spans/cutbacks must be authored, not stretched from shorter r004 panels.
- Five cockpit sill/glazing/frame boundaries require exact collision/roof/seal coverage; low sill alone is not airtight. Preserve current optical materials and source transforms.
- Floor/roof footprint companions, true shaft apertures, closures and matching stair/ladder landings depend on approved datums.
- Armor mating/spacer and complete external airlock attachment require measured interfaces. Existing six locker intersections must be fixed by authored wall interfaces, not moving lockers.
- Required assets remain unsupported until exported-mesh and assembled/browser/game evidence passes. No new art approval is inferred.

### Phase 0 check-in package

- Progress/baseline: this document, recorded before implementation; full dirty list and native bindings above.
- Deployed locations/pins: verified current normal client c2cb7dad / world 8afe8094 above; dashboard remains independent source review at HTTPS :8445/shipyard.
- Acceptance evidence: source audit, actual managed process metadata and actual module-byte hash; all four mockup references viewed. Historical browser/game evidence is not exact-candidate acceptance.
- State conservation: no live player rows mutated, no deployment, restart or refit performed. No before/after inventory comparison claimed.
- Open owner decisions: section 1a table above; proposed new pitch remains 3.5 m, while existing 3.1875 m traversal fixtures are explicitly recorded as legacy qualification.
- Current hold: dimensional native work awaits owner decisions; dimension-independent B1 contract primitives may proceed. A0 decision-freeze exit gate remains open.
- Fresh single/two-ship F3 measurements remain pending; no performance gate passes on historical numbers.

## Independent B1 primitive checkpoint

Implemented only `packages/content/src/placement-orientation.ts` and its test. Strict persisted yaw IDs 0–71, safe integer command normalization, quarter mapping, legacy radian classification retaining supplied original bytes, capability rejection and continuous mirror-before-yaw transforms are available as an unintegrated building block. Existing production readers, canonical schemas, catalogs, UI, exports, collision validators and native pins are unchanged.

Focused tests: 5 passed, covering all 72 yaw IDs, negative/wrapped input, arbitrary-radian preservation, invalid numbers, capability/reflection rejection and continuous socket transforms. Legacy classification tolerance is floating encoding only: 32 scaled machine epsilons capped at 1e-10 radians; larger uncertainty remains unresolved. Full migration UI must still report anchor/reservation displacement.

Validation commands run: `npm run check` on current shared source, and `npm run build` in `.runtime/shipyard-completion/phase0-candidate` to avoid regenerating another owner's bindings in the shared tree. Candidate source inventory: 1,358 files; manifest SHA-256 `387421512f3cf7db1cfd596909d2534de505db312182fede3a84bb5836217abf`. Candidate reuses existing assets read-only; no art-library copies or new native sources. This checkpoint does not complete A or B and has no browser/game acceptance claim.

## Takeover evidence appendix

## Baseline recorded before implementation

HEAD: `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`

```text
1da95ec1 R15: retain ice and gas transitions and document planet authoring contract
a1043417 R15: move Cinder LOD preparation to worker and verify Observe selection
6f1d940e Stabilize dashboard HMR and record database availability recovery
bafc0ced Define complete Shipyard implementation and Blender interface handoff
fe8d62b3 R15: move layered planet LOD builds to worker and retain ready levels
```

### Dirty files at takeover

Every entry below predates implementation. Preserve all other owners' work; no staging/reset/clean/restore. Directory entries use Git short-status grouping.

```text
 M AGENTS.md
 M apps/client/src/App.tsx
 M assets/art-library/designs/shipyard.structure.stair-dogleg/DESIGN.html
 M assets/art-library/designs/shipyard.structure.stair-dogleg/DESIGN.md
 M assets/runtime/crew/components/base-female.glb
 M assets/runtime/crew/components/base-female.png
 M assets/runtime/crew/components/base-male.glb
 M assets/runtime/crew/components/base-male.png
 M assets/runtime/crew/components/hair-bob.glb
 M assets/runtime/crew/components/hair-bob.png
 M assets/runtime/crew/components/hair-braids.glb
 M assets/runtime/crew/components/hair-braids.png
 M assets/runtime/crew/components/hair-bun.glb
 M assets/runtime/crew/components/hair-bun.png
 M assets/runtime/crew/components/hair-crest.glb
 M assets/runtime/crew/components/hair-crest.png
 M assets/runtime/crew/components/hair-cropped.glb
 M assets/runtime/crew/components/hair-cropped.png
 M assets/runtime/crew/components/hair-ponytail.glb
 M assets/runtime/crew/components/hair-ponytail.png
 M assets/runtime/crew/components/hair-scientist.glb
 M assets/runtime/crew/components/hair-scientist.png
 M assets/runtime/crew/components/hair-swept.glb
 M assets/runtime/crew/components/hair-swept.png
 M assets/runtime/crew/components/manifest.json
 M assets/runtime/crew/components/modular-crew.glb
 M docs/handoffs/coordination-current.md
 M docs/handoffs/shipyard_completion_agent_prompt_20260911.md
 M docs/handoffs/shipyard_completion_plan_20260911.md
 M packages/canvas-ui/src/appearance-controls.ts
 M packages/canvas-ui/src/diagnostics.test.ts
 M packages/canvas-ui/src/diagnostics.ts
 M packages/canvas-ui/src/ground-loot.ts
 M packages/canvas-ui/src/index.ts
 M packages/canvas-ui/src/inventory-windows.test.ts
 M packages/canvas-ui/src/inventory.ts
 M packages/canvas-ui/src/pointer.test.ts
 M packages/canvas-ui/src/toolkit.ts
 M packages/content/src/appearance.ts
 M packages/content/src/character-components.json
 M packages/content/src/equipment-poses.ts
 M packages/net/src/generated/own_ground_items_table.ts
 M packages/net/src/generated/types.ts
 M packages/render/src/combat-aim.ts
 M packages/render/src/construction-authored-assembly.test.ts
 M packages/render/src/construction-authored-assembly.ts
 M packages/render/src/crew/appearance.ts
 M packages/render/src/crew/equipment-pose.ts
 M packages/render/src/crew/index.ts
 M packages/render/src/crew/modular-equipment-pose.test.ts
 M packages/render/src/crew/pose-review-config.ts
 M packages/render/src/crew/pose-state.ts
 M packages/render/src/crew/pose-system.test.ts
 M packages/render/src/debug-features.test.ts
 M packages/render/src/debug-features.ts
 M packages/render/src/diagnostics.ts
 M packages/render/src/ground-items.ts
 M packages/render/src/index.ts
 M packages/world/src/inventory-operations.test.ts
 M packages/world/src/inventory-operations.ts
 M packages/world/src/inventory.ts
 M scripts/art_catalog.py
 M scripts/art_library/annotations.py
 M scripts/check_art.py
 M scripts/inventory-smoke.ts
 M scripts/persistence-smoke.ts
?? apps/client/src/ground-items.test.ts
?? apps/client/src/ground-items.ts
?? assets/art-library/CARGO_COLLECTION.md
?? assets/art-library/CURRENT_EQUIPMENT.md
?? assets/art-library/FACIAL_REFERENCE_INDEX.md
?? assets/art-library/INDEX.md
?? assets/art-library/SOURCE_AUDIT.md
?? assets/art-library/STYLE_AND_PIPELINE.md
?? assets/art-library/WORKFLOW.md
?? assets/art-library/assets/
?? assets/art-library/cargo-collection/
?? assets/art-library/catalog.json
?? assets/art-library/character-components/
?? assets/art-library/current-equipment.json
?? assets/art-library/designs/cargo.fluid-chemical.medium/
?? assets/art-library/designs/cargo.fluid-cryo.medium/
?? assets/art-library/designs/cargo.fluid-fuel.medium/
?? assets/art-library/designs/cargo.fluid-gas.medium/
?? assets/art-library/designs/cargo.fluid-water.medium/
?? assets/art-library/designs/cargo.fluid.large/
?? assets/art-library/designs/cargo.fluid.medium/
?? assets/art-library/designs/cargo.high-value.medium/
?? assets/art-library/designs/cargo.high-value.small/
?? assets/art-library/designs/cargo.medical.medium/
?? assets/art-library/designs/cargo.medical.small/
?? assets/art-library/designs/cargo.refrigerated.large/
?? assets/art-library/designs/cargo.refrigerated.medium/
?? assets/art-library/designs/cargo.reinforced.large/
?? assets/art-library/designs/cargo.reinforced.medium/
?? assets/art-library/designs/cargo.reinforced.oversized/
?? assets/art-library/designs/cargo.salvage.large/
?? assets/art-library/designs/cargo.salvage.oversized/
?? assets/art-library/designs/cargo.standard.large/
?? assets/art-library/designs/cargo.standard.medium/
?? assets/art-library/designs/cargo.standard.narrow/
?? assets/art-library/designs/cargo.standard.oversized/
?? assets/art-library/designs/cargo.standard.small/DESIGN.html
?? assets/art-library/designs/cargo.standard.small/DESIGN.md
?? assets/art-library/designs/cargo.standard.small/design.json
?? assets/art-library/designs/cargo.standard.small/revisions/r001/
?? assets/art-library/designs/cargo.standard.small/revisions/r002/
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/blender-close.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/blender-source.blend
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/blender-top.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/comparison.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/cutout.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/materials.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/recipe.py
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/runtime-capture.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/runtime-close.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/runtime-top.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/specification.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/validation-blender.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/appearances/standard-small-red/validation.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/blender-close.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/blender-half-open.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/blender-open.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/blender-source.blend
?? assets/art-library/designs/cargo.standard.small/revisions/r003/blender-stack-carrier.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/blender-top.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/blender-underside.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/capture-record.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/cargo_mechanics_fix.py
?? assets/art-library/designs/cargo.standard.small/revisions/r003/comparison.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/cutout.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/fit.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/independent-final-review.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/materials.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/recipe.py
?? assets/art-library/designs/cargo.standard.small/revisions/r003/review.md
?? assets/art-library/designs/cargo.standard.small/revisions/r003/runtime-close.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/runtime-top.png
?? assets/art-library/designs/cargo.standard.small/revisions/r003/source-selection-audit.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/specification.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/stack-carrier.blend
?? assets/art-library/designs/cargo.standard.small/revisions/r003/validation-blender.json
?? assets/art-library/designs/cargo.standard.small/revisions/r003/validation.json
?? assets/art-library/designs/cargo.standard.tiny/
?? assets/art-library/designs/cargo.vacuum.large/
?? assets/art-library/designs/cargo.vacuum.medium/
?? assets/art-library/designs/construction.base.utility/
?? assets/art-library/designs/construction.corner.service/
?? assets/art-library/designs/construction.floor.quad-panel/
?? assets/art-library/designs/construction.hull.service-cube/
?? assets/art-library/designs/construction.roof.vented/
?? assets/art-library/designs/construction.wall.service-cyan/
?? assets/art-library/designs/crew.alien/
?? assets/art-library/designs/crew.animation.aim/DESIGN.html
?? assets/art-library/designs/crew.animation.aim/DESIGN.md
?? assets/art-library/designs/crew.animation.aim/design.json
?? assets/art-library/designs/crew.animation.aim/publications/
?? assets/art-library/designs/crew.animation.aim/revisions/r001/
?? assets/art-library/designs/crew.animation.aim/revisions/r003/
?? assets/art-library/designs/crew.animation.cheer/
?? assets/art-library/designs/crew.animation.crouch/
?? assets/art-library/designs/crew.animation.die/
?? assets/art-library/designs/crew.animation.directional-review/
?? assets/art-library/designs/crew.animation.hurt/
?? assets/art-library/designs/crew.animation.idle/
?? assets/art-library/designs/crew.animation.melee/
?? assets/art-library/designs/crew.animation.pick-up-interact/
?? assets/art-library/designs/crew.animation.point/
?? assets/art-library/designs/crew.animation.run/
?? assets/art-library/designs/crew.animation.shoot/
?? assets/art-library/designs/crew.animation.sit/
?? assets/art-library/designs/crew.animation.thumbs-up/
?? assets/art-library/designs/crew.animation.use-repair/
?? assets/art-library/designs/crew.animation.walk/
?? assets/art-library/designs/crew.animation.wave/
?? assets/art-library/designs/crew.base-and-outfits/
?? assets/art-library/designs/crew.cyborg/
?? assets/art-library/designs/crew.equipment.armor/
?? assets/art-library/designs/crew.equipment.attachments/
?? assets/art-library/designs/crew.equipment.backpack/
?? assets/art-library/designs/crew.equipment.belt/
?? assets/art-library/designs/crew.equipment.boot/
?? assets/art-library/designs/crew.equipment.chest/
?? assets/art-library/designs/crew.equipment.gauntlet/
?? assets/art-library/designs/crew.equipment.glove/
?? assets/art-library/designs/crew.equipment.hair/
?? assets/art-library/designs/crew.equipment.head/
?? assets/art-library/designs/crew.equipment.headwear/
?? assets/art-library/designs/crew.equipment.helmet/
?? assets/art-library/designs/crew.equipment.jetpack/
?? assets/art-library/designs/crew.equipment.legs/
?? assets/art-library/designs/crew.equipment.mask/
?? assets/art-library/designs/crew.equipment.oxygen-pack/
?? assets/art-library/designs/crew.equipment.rebreather/
?? assets/art-library/designs/crew.equipment.shield-pack/
?? assets/art-library/designs/crew.equipment.shoulder/
?? assets/art-library/designs/crew.equipment.visor/
?? assets/art-library/designs/crew.faces.accessories/
?? assets/art-library/designs/crew.faces.age-variations/
?? assets/art-library/designs/crew.faces.base-faces/
?? assets/art-library/designs/crew.faces.details/
?? assets/art-library/designs/crew.faces.expressions/
?? assets/art-library/designs/crew.faces.eye-colors/
?? assets/art-library/designs/crew.faces.facial-hair/
?? assets/art-library/designs/crew.faces.hairstyles-female/
?? assets/art-library/designs/crew.faces.hairstyles-male/
?? assets/art-library/designs/crew.faces.skin-tones/
?? assets/art-library/designs/crew.faces.specialty-looks/
?? assets/art-library/designs/crystalline-alien.console.standard/
?? assets/art-library/designs/crystalline-alien.floor.floor/
?? assets/art-library/designs/crystalline-alien.hull.standard/
?? assets/art-library/designs/crystalline-alien.machine.stasis/
?? assets/art-library/designs/crystalline-alien.mount.standard/
?? assets/art-library/designs/crystalline-alien.pipe.standard/
?? assets/art-library/designs/crystalline-alien.plant.standard/
?? assets/art-library/designs/crystalline-alien.reactor.standard/
?? assets/art-library/designs/crystalline-alien.resource.crystal/
?? assets/art-library/designs/crystalline-alien.roof.standard/
?? assets/art-library/designs/crystalline-alien.room.assembly/
?? assets/art-library/designs/crystalline-alien.room.bio-lab/
?? assets/art-library/designs/crystalline-alien.room.bridge/
?? assets/art-library/designs/crystalline-alien.room.hatchery/
?? assets/art-library/designs/crystalline-alien.room.stasis/
?? assets/art-library/designs/crystalline-alien.wall.standard/
?? assets/art-library/designs/environment.asteroids/
?? assets/art-library/designs/environment.background/
?? assets/art-library/designs/environment.planet.crystal/
?? assets/art-library/designs/environment.planet.desert/
?? assets/art-library/designs/environment.planet.gas-giant/
?? assets/art-library/designs/environment.planet.ice/
?? assets/art-library/designs/environment.planet.ocean/
?? assets/art-library/designs/environment.planet.rocky/
?? assets/art-library/designs/environment.planet.temperate/
?? assets/art-library/designs/environment.planet.toxic/
?? assets/art-library/designs/environment.planet.unspecified/
?? assets/art-library/designs/environment.planet.volcanic/
?? assets/art-library/designs/environment.wreckage/
?? assets/art-library/designs/historical-baseline.bed.standard/
?? assets/art-library/designs/historical-baseline.bunk.standard/
?? assets/art-library/designs/historical-baseline.console.standard/
?? assets/art-library/designs/historical-baseline.engine.engine/
?? assets/art-library/designs/historical-baseline.hull.standard/
?? assets/art-library/designs/historical-baseline.hydroponics.standard/
?? assets/art-library/designs/historical-baseline.roof.standard/
?? assets/art-library/designs/historical-baseline.sofa.standard/
?? assets/art-library/designs/historical-baseline.wall.standard/
?? assets/art-library/designs/industrial-mining.crate.cargo/
?? assets/art-library/designs/industrial-mining.crate.standard/
?? assets/art-library/designs/industrial-mining.engine.engine/
?? assets/art-library/designs/industrial-mining.hull.standard/
?? assets/art-library/designs/industrial-mining.machine.crusher/
?? assets/art-library/designs/industrial-mining.machine.drill/
?? assets/art-library/designs/industrial-mining.machine.refinery/
?? assets/art-library/designs/industrial-mining.machine.standard/
?? assets/art-library/designs/industrial-mining.mount.standard/
?? assets/art-library/designs/industrial-mining.pipe.standard/
?? assets/art-library/designs/industrial-mining.room.assembly/
?? assets/art-library/designs/industrial-mining.sensor.antenna/
?? assets/art-library/designs/industrial-mining.sensor.mast/
?? assets/art-library/designs/industrial-mining.tank.fuel/
?? assets/art-library/designs/industrial-mining.tractor.standard/
?? assets/art-library/designs/pale-studless.battery.standard/
?? assets/art-library/designs/pale-studless.bed.standard/
?? assets/art-library/designs/pale-studless.bunk.standard/
?? assets/art-library/designs/pale-studless.chair.standard/
?? assets/art-library/designs/pale-studless.console.standard/
?? assets/art-library/designs/pale-studless.corner.standard/
?? assets/art-library/designs/pale-studless.crate.cargo/
?? assets/art-library/designs/pale-studless.crate.data/
?? assets/art-library/designs/pale-studless.crate.medical/
?? assets/art-library/designs/pale-studless.crate.medkit/
?? assets/art-library/designs/pale-studless.crate.pallet/
?? assets/art-library/designs/pale-studless.crate.refrigerated/
?? assets/art-library/designs/pale-studless.crate.reinforced/
?? assets/art-library/designs/pale-studless.crate.salvage/
?? assets/art-library/designs/pale-studless.crate.standard/
?? assets/art-library/designs/pale-studless.crate.tech/
?? assets/art-library/designs/pale-studless.crate.vacuum/
?? assets/art-library/designs/pale-studless.decal.standard/
?? assets/art-library/designs/pale-studless.door.airlock/
?? assets/art-library/designs/pale-studless.door.blast/
?? assets/art-library/designs/pale-studless.door.door/
?? assets/art-library/designs/pale-studless.door.exterior-airlock/
?? assets/art-library/designs/pale-studless.door.hatch/
?? assets/art-library/designs/pale-studless.door.interior-airlock/
?? assets/art-library/designs/pale-studless.door.sliding/
?? assets/art-library/designs/pale-studless.engine.engine/
?? assets/art-library/designs/pale-studless.engine.ion/
?? assets/art-library/designs/pale-studless.engine.large/
?? assets/art-library/designs/pale-studless.engine.maneuver/
?? assets/art-library/designs/pale-studless.engine.medium/
?? assets/art-library/designs/pale-studless.engine.rcs/
?? assets/art-library/designs/pale-studless.engine.small/
?? assets/art-library/designs/pale-studless.engine.vtol/
?? assets/art-library/designs/pale-studless.engine.warp/
?? assets/art-library/designs/pale-studless.floor.carpet/
?? assets/art-library/designs/pale-studless.floor.exterior/
?? assets/art-library/designs/pale-studless.floor.floor/
?? assets/art-library/designs/pale-studless.floor.grate/
?? assets/art-library/designs/pale-studless.floor.hazard/
?? assets/art-library/designs/pale-studless.floor.hex/
?? assets/art-library/designs/pale-studless.floor.reinforced/
?? assets/art-library/designs/pale-studless.floor.standard/
?? assets/art-library/designs/pale-studless.handgun.standard/
?? assets/art-library/designs/pale-studless.hull.standard/
?? assets/art-library/designs/pale-studless.hydroponics.standard/
?? assets/art-library/designs/pale-studless.light.standard/
?? assets/art-library/designs/pale-studless.locker.standard/
?? assets/art-library/designs/pale-studless.machine.air-filter/
?? assets/art-library/designs/pale-studless.machine.cloaking/
?? assets/art-library/designs/pale-studless.machine.coolant/
?? assets/art-library/designs/pale-studless.machine.drone/
?? assets/art-library/designs/pale-studless.machine.fuel-processor/
?? assets/art-library/designs/pale-studless.machine.gravity/
?? assets/art-library/designs/pale-studless.machine.jump/
?? assets/art-library/designs/pale-studless.machine.refinery/
?? assets/art-library/designs/pale-studless.machine.standard/
?? assets/art-library/designs/pale-studless.machine.teleport/
?? assets/art-library/designs/pale-studless.mount.standard/
?? assets/art-library/designs/pale-studless.ordnance.cluster/
?? assets/art-library/designs/pale-studless.ordnance.emp/
?? assets/art-library/designs/pale-studless.ordnance.guided/
?? assets/art-library/designs/pale-studless.ordnance.heavy-torpedo/
?? assets/art-library/designs/pale-studless.ordnance.incendiary/
?? assets/art-library/designs/pale-studless.ordnance.interceptor/
?? assets/art-library/designs/pale-studless.ordnance.kinetic/
?? assets/art-library/designs/pale-studless.ordnance.payload/
?? assets/art-library/designs/pale-studless.ordnance.plasma/
?? assets/art-library/designs/pale-studless.ordnance.proximity/
?? assets/art-library/designs/pale-studless.pipe.coolant/
?? assets/art-library/designs/pale-studless.pipe.corner/
?? assets/art-library/designs/pale-studless.pipe.cross/
?? assets/art-library/designs/pale-studless.pipe.data/
?? assets/art-library/designs/pale-studless.pipe.elbow/
?? assets/art-library/designs/pale-studless.pipe.flexible/
?? assets/art-library/designs/pale-studless.pipe.power/
?? assets/art-library/designs/pale-studless.pipe.riser/
?? assets/art-library/designs/pale-studless.pipe.standard/
?? assets/art-library/designs/pale-studless.pipe.t-junction/
?? assets/art-library/designs/pale-studless.pipe.tray/
?? assets/art-library/designs/pale-studless.pipe.vertical/
?? assets/art-library/designs/pale-studless.plant.standard/
?? assets/art-library/designs/pale-studless.reactor.standard/
?? assets/art-library/designs/pale-studless.resource.ingot/
?? assets/art-library/designs/pale-studless.rifle.beam/
?? assets/art-library/designs/pale-studless.rifle.carbine/
?? assets/art-library/designs/pale-studless.rifle.rail/
?? assets/art-library/designs/pale-studless.rifle.rifle/
?? assets/art-library/designs/pale-studless.rifle.shotgun/
?? assets/art-library/designs/pale-studless.rifle.smg/
?? assets/art-library/designs/pale-studless.rifle.standard/
?? assets/art-library/designs/pale-studless.roof.standard/
?? assets/art-library/designs/pale-studless.room.airlock/
?? assets/art-library/designs/pale-studless.room.assembly/
?? assets/art-library/designs/pale-studless.room.bridge/
?? assets/art-library/designs/pale-studless.room.cargo/
?? assets/art-library/designs/pale-studless.room.corridor/
?? assets/art-library/designs/pale-studless.room.crew/
?? assets/art-library/designs/pale-studless.room.engineering/
?? assets/art-library/designs/pale-studless.room.hydroponics/
?? assets/art-library/designs/pale-studless.room.lounge/
?? assets/art-library/designs/pale-studless.room.medbay/
?? assets/art-library/designs/pale-studless.room.science/
?? assets/art-library/designs/pale-studless.room.storage/
?? assets/art-library/designs/pale-studless.sanitation.standard/
?? assets/art-library/designs/pale-studless.sensor.antenna/
?? assets/art-library/designs/pale-studless.sensor.beacon/
?? assets/art-library/designs/pale-studless.sensor.dish/
?? assets/art-library/designs/pale-studless.sensor.dome/
?? assets/art-library/designs/pale-studless.sensor.mast/
?? assets/art-library/designs/pale-studless.sensor.radar/
?? assets/art-library/designs/pale-studless.sensor.standard/
?? assets/art-library/designs/pale-studless.shield.standard/
?? assets/art-library/designs/pale-studless.sofa.standard/
?? assets/art-library/designs/pale-studless.table.standard/
?? assets/art-library/designs/pale-studless.tank.chemical/
?? assets/art-library/designs/pale-studless.tank.cryo/
?? assets/art-library/designs/pale-studless.tank.fuel/
?? assets/art-library/designs/pale-studless.tank.gas/
?? assets/art-library/designs/pale-studless.tank.liquid/
?? assets/art-library/designs/pale-studless.tank.oxygen/
?? assets/art-library/designs/pale-studless.tank.water/
?? assets/art-library/designs/pale-studless.tool.baton/
?? assets/art-library/designs/pale-studless.tool.cutter/
?? assets/art-library/designs/pale-studless.tool.data-pad/
?? assets/art-library/designs/pale-studless.tool.flashlight/
?? assets/art-library/designs/pale-studless.tool.grapple/
?? assets/art-library/designs/pale-studless.tool.medgun/
?? assets/art-library/designs/pale-studless.tool.multi-tool/
?? assets/art-library/designs/pale-studless.tool.repair/
?? assets/art-library/designs/pale-studless.tool.scanner/
?? assets/art-library/designs/pale-studless.tool.welder/
?? assets/art-library/designs/pale-studless.tool.wrench/
?? assets/art-library/designs/pale-studless.tractor.standard/
?? assets/art-library/designs/pale-studless.turret.autocannon/
?? assets/art-library/designs/pale-studless.turret.breaching/
?? assets/art-library/designs/pale-studless.turret.drone/
?? assets/art-library/designs/pale-studless.turret.flak/
?? assets/art-library/designs/pale-studless.turret.gauss/
?? assets/art-library/designs/pale-studless.turret.ion/
?? assets/art-library/designs/pale-studless.turret.laser/
?? assets/art-library/designs/pale-studless.turret.mine/
?? assets/art-library/designs/pale-studless.turret.missile/
?? assets/art-library/designs/pale-studless.turret.plasma/
?? assets/art-library/designs/pale-studless.turret.point-defense/
?? assets/art-library/designs/pale-studless.turret.pulse-beam/
?? assets/art-library/designs/pale-studless.turret.railgun/
?? assets/art-library/designs/pale-studless.turret.rocket/
?? assets/art-library/designs/pale-studless.turret.standard/
?? assets/art-library/designs/pale-studless.turret.torpedo/
?? assets/art-library/designs/pale-studless.wall.standard/
?? assets/art-library/designs/pale-studless.weapon-part.standard/
?? assets/art-library/designs/pale-studless.window.canopy/
?? assets/art-library/designs/pale-studless.window.force-field/
?? assets/art-library/designs/pale-studless.window.glass-floor/
?? assets/art-library/designs/pale-studless.window.large-window/
?? assets/art-library/designs/pale-studless.window.window/
?? assets/art-library/designs/raider.bunk.standard/
?? assets/art-library/designs/raider.corner.standard/
?? assets/art-library/designs/raider.crate.cargo/
?? assets/art-library/designs/raider.engine.engine/
?? assets/art-library/designs/raider.hull.standard/
?? assets/art-library/designs/raider.machine.drone/
?? assets/art-library/designs/raider.machine.jammer/
?? assets/art-library/designs/raider.machine.standard/
?? assets/art-library/designs/raider.pipe.standard/
?? assets/art-library/designs/raider.roof.standard/
?? assets/art-library/designs/raider.room.assembly/
?? assets/art-library/designs/raider.room.bridge/
?? assets/art-library/designs/raider.room.cargo/
?? assets/art-library/designs/raider.room.crew/
?? assets/art-library/designs/raider.shield.standard/
?? assets/art-library/designs/raider.turret.scrap/
?? assets/art-library/designs/raider.turret.standard/
?? assets/art-library/designs/ship.aurelian/
?? assets/art-library/designs/ship.exploration-frigate/
?? assets/art-library/designs/ship.helix/
?? assets/art-library/designs/ship.prospector/
?? assets/art-library/designs/ship.razor/
?? assets/art-library/designs/ship.riftjack/
?? assets/art-library/designs/ship.wayfarer/
?? assets/art-library/designs/shipyard.equipment.bridge-bank/
?? assets/art-library/designs/shipyard.equipment.command-console/
?? assets/art-library/designs/shipyard.equipment.crew-bunk/
?? assets/art-library/designs/shipyard.equipment.hydroponics/
?? assets/art-library/designs/shipyard.equipment.lounge-sofa/
?? assets/art-library/designs/shipyard.equipment.medical-bed/
?? assets/art-library/designs/shipyard.equipment.pilot-seat/
?? assets/art-library/designs/shipyard.equipment.reactor/
?? assets/art-library/designs/shipyard.equipment.wall-locker/
?? assets/art-library/designs/shipyard.floor.mapped-deck-kit/
?? assets/art-library/designs/shipyard.hull.pilot-section/
?? assets/art-library/designs/shipyard.hull.side-armor/
?? assets/art-library/designs/shipyard.roof.frontier/
?? assets/art-library/designs/shipyard.structure.boundary-kit/DESIGN.html
?? assets/art-library/designs/shipyard.structure.boundary-kit/DESIGN.md
?? assets/art-library/designs/shipyard.structure.boundary-kit/HANDOFF.md
?? assets/art-library/designs/shipyard.structure.boundary-kit/design.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/HANDOFF.md
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/author_joint_study.py
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/delivery-manifest.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/derive_diagonal_interfaces.py
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/diagonal-interface-inventory.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/diagonal-joint-study.blend
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/joint-interfaces-study.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/joint-study-oblique.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/joint-study-top.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/HANDOFF.md
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/T-contact-exploded.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/T-contact-installed.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/T-junction-before.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/T-junction-contact-close.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/T-wall-base-installed.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/all12-contact-board.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/author_contact_inserts.py
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/boundary-kit.blend
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/capture-record.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/contact-plan.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/delivery-manifest.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/derive_contact_inserts.py
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/diagonal-contact-exploded.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/interfaces.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/kit.glb
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/native-contact-cutout.png
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/native-report.json
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/reframe_wall_evidence.py
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/validate_contact_inserts.py
?? assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/validation.json
?? assets/art-library/designs/shipyard.structure.external-airlock/DESIGN.html
?? assets/art-library/designs/shipyard.structure.external-airlock/DESIGN.md
?? assets/art-library/designs/shipyard.structure.roof-kit/DESIGN.html
?? assets/art-library/designs/shipyard.structure.roof-kit/DESIGN.md
?? assets/art-library/designs/shipyard.structure.roof-kit/HANDOFF.md
?? assets/art-library/designs/shipyard.structure.roof-kit/design.json
?? assets/art-library/designs/shipyard.structure.usable-boundary-wall/DESIGN.html
?? assets/art-library/designs/shipyard.structure.usable-boundary-wall/DESIGN.md
?? assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/DESIGN.html
?? assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/DESIGN.md
?? assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/whole-ship-gap-witnesses-a001.json
?? assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/whole-ship-gap-witnesses-a002.json
?? assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/whole-ship-gap-witnesses-a003.json
?? assets/art-library/designs/stepped-environment.resource.copper/
?? assets/art-library/designs/stepped-environment.resource.crystal/
?? assets/art-library/designs/stepped-environment.resource.exotic/
?? assets/art-library/designs/stepped-environment.resource.gold/
?? assets/art-library/designs/stepped-environment.resource.ice/
?? assets/art-library/designs/stepped-environment.resource.iron/
?? assets/art-library/designs/ui.bars-gauges/
?? assets/art-library/designs/ui.buttons/
?? assets/art-library/designs/ui.character-status-and-equipment/
?? assets/art-library/designs/ui.feedback/
?? assets/art-library/designs/ui.frames-panels/
?? assets/art-library/designs/ui.icons/
?? assets/art-library/designs/ui.inputs/
?? assets/art-library/designs/ui.inventory-slots/
?? assets/art-library/designs/ui.item-thumbnails/
?? assets/art-library/designs/ui.lists-tables/
?? assets/art-library/designs/ui.miscellaneous/
?? assets/art-library/designs/ui.radar-map/
?? assets/art-library/designs/ui.reticles/
?? assets/art-library/designs/ui.tabs/
?? assets/art-library/designs/vfx.armor-spark-hit/
?? assets/art-library/designs/vfx.beam-lance/
?? assets/art-library/designs/vfx.blue-energy-projectile/
?? assets/art-library/designs/vfx.blue-shield-arc/
?? assets/art-library/designs/vfx.contrail/
?? assets/art-library/designs/vfx.debris-burst/
?? assets/art-library/designs/vfx.destruction-breakup/
?? assets/art-library/designs/vfx.emp-burst/
?? assets/art-library/designs/vfx.fiery-blast/
?? assets/art-library/designs/vfx.foreground-explosion/
?? assets/art-library/designs/vfx.healing-beam/
?? assets/art-library/designs/vfx.impact-spark/
?? assets/art-library/designs/vfx.ion-arc/
?? assets/art-library/designs/vfx.large-explosion/
?? assets/art-library/designs/vfx.laser-bolt/
?? assets/art-library/designs/vfx.loot-chest-glow/
?? assets/art-library/designs/vfx.medium-explosion/
?? assets/art-library/designs/vfx.missile-trail/
?? assets/art-library/designs/vfx.muzzle-flash/
?? assets/art-library/designs/vfx.pickup-glow/
?? assets/art-library/designs/vfx.plasma-bolt/
?? assets/art-library/designs/vfx.plasma-burst/
?? assets/art-library/designs/vfx.reactor-vent-flare/
?? assets/art-library/designs/vfx.red-laser-projectile/
?? assets/art-library/designs/vfx.repair-sparks/
?? assets/art-library/designs/vfx.ricochet-spark/
?? assets/art-library/designs/vfx.scan-pulse/
?? assets/art-library/designs/vfx.scanning-pulse/
?? assets/art-library/designs/vfx.shield-bubble-impact/
?? assets/art-library/designs/vfx.shield-bubble/
?? assets/art-library/designs/vfx.shield-hit-splash/
?? assets/art-library/designs/vfx.shrapnel-cloud/
?? assets/art-library/designs/vfx.small-explosion/
?? assets/art-library/designs/vfx.smoke-puff/
?? assets/art-library/designs/vfx.smoke-trail/
?? assets/art-library/designs/vfx.teleport-arrival/
?? assets/art-library/designs/vfx.teleport-effect/
?? assets/art-library/designs/vfx.thruster-glow/
?? assets/art-library/designs/vfx.tracer-round/
?? assets/art-library/designs/vfx.tractor-beam/
?? assets/art-library/designs/vfx.warning-beacon-flash/
?? assets/art-library/designs/vfx.warp-charge/
?? assets/art-library/facial-reference-coverage.json
?? assets/art-library/facial-reference-validation-20260910.json
?? assets/art-library/index.html
?? assets/art-library/planet-geology-studies/
?? assets/art-library/prompts/
?? assets/art-library/review-context/
?? assets/art-library/ship-layout-editor/
?? assets/art-library/shipyard-equipment/
?? assets/art-library/shipyard-floor/README.md
?? assets/art-library/shipyard-floor/r002/blender-top.png
?? assets/art-library/shipyard-floor/r002/browser-validation.json
?? assets/art-library/shipyard-floor/r002/capture.json
?? assets/art-library/shipyard-floor/r002/component-board.png
?? assets/art-library/shipyard-floor/r002/components.json
?? assets/art-library/shipyard-floor/r002/floor-kit.blend
?? assets/art-library/shipyard-floor/r002/index.html
?? assets/art-library/shipyard-floor/r002/kit.glb
?? assets/art-library/shipyard-floor/r002/maps/
?? assets/art-library/shipyard-floor/r002/placement-migration-preview.json
?? assets/art-library/shipyard-floor/r002/placement-validation.json
?? assets/art-library/shipyard-floor/r002/runtime/
?? assets/art-library/shipyard-floor/r002/validation.json
?? assets/art-library/shipyard-floor/r002/variants/
?? assets/art-library/shipyard-hull/
?? assets/art-library/shipyard-roof/
?? assets/art-library/shipyard-side-hull/
?? assets/art-library/sources.json
?? assets/art-library/sources/
?? assets/art-library/status.json
?? assets/runtime/crew/poses/r003/
?? assets/source/airlock.blend
?? assets/source/airlock_voxel.blend
?? assets/source/approved-cargo/
?? assets/source/approved-equipment/
?? assets/source/archive/
?? assets/source/brushed_metal.blend
?? assets/source/bulkhead.blend
?? assets/source/bulkhead_voxel.blend
?? assets/source/crew-astra.blend
?? assets/source/crew-frontier.blend
?? assets/source/engine_pod.blend
?? assets/source/engine_pod_voxel.blend
?? assets/source/equipment-kit.blend
?? assets/source/interior_hydroponics.blend
?? assets/source/modular_parts.blend
?? assets/source/native-planets/
?? assets/source/published-hull/
?? assets/source/published-roof/
?? assets/source/published-side-hull/
?? assets/source/reflection_workshop.blend
?? assets/source/review-floor-r002/
?? assets/source/ship_wall_fixture.blend
?? assets/source/voxel_asteroid.blend
?? assets/source/voxel_wayfarer.blend
?? assets/source/voxel_wayfarer_legacy_finish.blend
?? docs/active_agent_ownership.md
?? docs/art_asset_library.md
?? docs/art_reference_guide.md
?? docs/blender_asset_migration.md
?? docs/canvas_iteration.md
?? docs/cargo_storage_fit_audit.md
?? docs/character_component_authoring.md
?? docs/character_persistence.md
?? docs/character_reference_fidelity.md
?? docs/character_reference_pass.md
?? docs/combat_authority.md
?? docs/crew_astra_iteration.md
?? docs/crew_combat_visuals.md
?? docs/crew_equipment_iteration.md
?? docs/crew_visuals.md
?? docs/dust_iteration.md
?? docs/equipment_assets.md
?? docs/f3_deck_flight_cost_audit.md
?? docs/geometry_iteration.md
?? docs/graphics_system_menu.md
?? docs/handoffs/2026-09-08_astra_visual_iteration.md
?? docs/handoffs/2026-09-08_voxel_canvas_resume.md
?? docs/handoffs/authored_ship_game_delivery.md
?? docs/handoffs/backpack_pickup_swap_r009.md
?? docs/handoffs/character_components.md
?? docs/handoffs/character_equipment_pose_prompt.md
?? docs/handoffs/character_f3_public_release_20260910.md
?? docs/handoffs/character_face_r009_runtime.md
?? docs/handoffs/character_faces_r009_authority.md
?? docs/handoffs/character_faces_r009_live_release.md
?? docs/handoffs/character_faces_r009_reference_review.md
?? docs/handoffs/character_pose_live_release.md
?? docs/handoffs/character_pose_modular_compatibility.md
?? docs/handoffs/character_reference_review_r007_diagnostic.md
?? docs/handoffs/character_reference_review_stage1.md
?? docs/handoffs/character_reference_review_stage2.md
?? docs/handoffs/character_reference_review_stage2_1.md
?? docs/handoffs/character_reference_review_stage2_2.md
?? docs/handoffs/character_reference_review_stage3.md
?? docs/handoffs/character_reference_review_stage4.md
?? docs/handoffs/character_ui_refresh.md
?? docs/handoffs/checkpoint_resume_audit.json
?? docs/handoffs/combat_pose_integration.md
?? docs/handoffs/combat_pose_integration.patch
?? docs/handoffs/combat_pose_parent_acceptance.md
?? docs/handoffs/combat_pose_patch_inputs.json
?? docs/handoffs/combat_pose_r003_integration.md
?? docs/handoffs/combat_pose_r003_review.md
?? docs/handoffs/construction_boundaries.md
?? docs/handoffs/construction_boundary_artifact_checkpoint.json
?? docs/handoffs/construction_boundary_source_checkpoint.json
?? docs/handoffs/construction_cargo.md
?? docs/handoffs/construction_collision.md
?? docs/handoffs/construction_contacts_resume.md
?? docs/handoffs/construction_services.md
?? docs/handoffs/construction_topology.md
?? docs/handoffs/current_cockpit_construction_audit.json
?? docs/handoffs/debug_native_material_registration.md
?? docs/handoffs/elevator_pure_rules.md
?? docs/handoffs/holographic_portrait.md
?? docs/handoffs/integration_continuation_2026-09-09.md
?? docs/handoffs/integration_continuation_worklist.md
?? docs/handoffs/inventory_qol.md
?? docs/handoffs/inventory_qol_review.md
?? docs/handoffs/inventory_tetris_and_polish.md
?? docs/handoffs/item_frames.md
?? docs/handoffs/main_integration_status.md
?? docs/handoffs/planet_native_ice_review.md
?? docs/handoffs/public_login_verification.md
?? docs/handoffs/render_light_budget.md
?? docs/handoffs/render_performance_resume.md
?? docs/handoffs/ship_construction_asset_audit.json
?? docs/handoffs/ship_construction_authority_plan.md
?? docs/handoffs/ship_layout_editor_hull_objects.md
?? docs/handoffs/ship_layout_editor_implementation_prompt.md
?? docs/handoffs/ship_layout_editor_stages_0_2.md
?? docs/handoffs/shipyard_workspace_redesign_20260910.md
?? docs/handoffs/ui_reference_review.md
?? docs/handoffs/wall_depth_review.md
?? docs/hull_markings.md
?? docs/ice_material_iteration.md
?? docs/ifcs_integration.md
?? docs/ifcs_iteration.md
?? docs/interior_prop_iteration.md
?? docs/inventory_authority.md
?? docs/inventory_ui_iteration.md
?? docs/native_catalog_browser_acceptance.md
?? docs/native_hull_finish_study.md
?? docs/native_ship_collision.md
?? docs/object_details_ui_iteration.md
?? docs/object_interactions.md
?? docs/pilot_fixture_alignment.md
?? docs/planet_generator_iteration.md
?? docs/planet_glow_occlusion.md
?? docs/planet_goal_acceptance.md
?? docs/planet_lab_catalog.md
?? docs/planet_lighting_followup.md
?? docs/planet_native_composition.md
?? docs/planet_next_passes.md
?? docs/planet_visual_correction.md
?? docs/r006_collision_boundary_audit.md
?? docs/releases/bridge-bed-fix/
?? docs/releases/construction-walking-2026-09-09.json
?? docs/releases/native-ship-2026-09-08/
?? docs/releases/roof-r004/
?? docs/releases/side-hull-r003/
?? docs/render_debug_controls.md
?? docs/render_debugging.md
?? docs/ship_art_study.md
?? docs/ship_construction.md
?? docs/ship_layout_editor_design.md
?? docs/ship_lighting_occlusion.md
?? docs/ship_plastic_iteration.md
?? docs/ship_plastic_status_2026-09-09.md
?? docs/ship_surface_iteration.md
?? docs/space_dust_iteration.md
?? docs/space_environment.md
?? docs/visual_debug_controls.md
?? docs/visual_theme.md
?? docs/voxel_construction.md
?? ops/keycloak/configure-game-origin.py
?? ops/keycloak/npm-game-host.mjs
?? packages/canvas-ui/src/appearance-controls.test.ts
?? packages/canvas-ui/src/combat-cursor.ts
?? packages/content/src/character-face-options.ts
?? packages/render/src/combat-aim.test.ts
?? packages/render/src/crew/combat-r003.test.ts
?? packages/render/src/crew/face-materials.test.ts
?? packages/render/src/crew/face-materials.ts
?? packages/render/src/debug-collision-geometry.ts
?? packages/render/src/debug-collision-source.test.ts
?? packages/render/src/debug-collision-source.ts
?? packages/render/src/debug-indirect-lighting.ts
?? packages/render/src/debug-light-geometry.ts
?? packages/render/src/debug-overlays.test.ts
?? packages/render/src/debug-overlays.ts
?? packages/render/src/scene-material-registration.ts
?? packages/sim/src/backpack-swap.ts
?? packages/sim/src/construction-elevator.test.ts
?? packages/sim/src/construction-elevator.ts
?? packages/sim/src/ground-placement.ts
?? packages/world/src/character-face-appearance.test.ts
?? packages/world/src/inventory-ground-access.test.ts
?? packages/world/src/inventory-ground-access.ts
?? packages/world/src/inventory-ground.ts
?? reference/Astra_Voxel_Space_Game_Art_Technical_Design.md
?? reference/PLANET_RENDERING_DESIGN.md
?? reference/art/
?? reference/combat-poses-update.md
?? scripts/art_library/audit_native_ice_edges.py
?? scripts/art_library/basalt_forms_lod_study.py
?? scripts/art_library/basalt_forms_study.py
?? scripts/art_library/build_basin_corner_ice_kit.py
?? scripts/art_library/build_basin_ice_kit.py
?? scripts/art_library/build_basin_sealed_ice_kit.py
?? scripts/art_library/build_cargo.py
?? scripts/art_library/build_cargo_finishes.py
?? scripts/art_library/build_cargo_r002.py
?? scripts/art_library/build_cargo_r003.py
?? scripts/art_library/build_clustered_glacier_kit.py
?? scripts/art_library/build_connected_ice_kit.py
?? scripts/art_library/build_construction.py
?? scripts/art_library/build_equipment_review.py
?? scripts/art_library/build_faceted_ice_kit.py
?? scripts/art_library/build_floor_review.py
?? scripts/art_library/build_glacial_geography_kit.py
?? scripts/art_library/build_glacial_ice_kit.py
?? scripts/art_library/build_glacial_interior_kit.py
?? scripts/art_library/build_glacial_repaired_ice_kit.py
?? scripts/art_library/build_hull_review.py
?? scripts/art_library/build_ice_patch_kit.py
?? scripts/art_library/build_ice_shelf_review.py
?? scripts/art_library/build_pilot_r002.py
?? scripts/art_library/build_pilot_r003.py
?? scripts/art_library/build_pilot_r004.py
?? scripts/art_library/build_pilot_r005.py
?? scripts/art_library/build_pilot_r006.py
?? scripts/art_library/build_planet_crust_review.py
?? scripts/art_library/build_planet_review.py
?? scripts/art_library/build_roof_review.py
?? scripts/art_library/build_side_hull_review.py
?? scripts/art_library/build_stepped_ice_kit.py
?? scripts/art_library/build_volcanic_geology_kit.py
?? scripts/art_library/capture_cargo_batch.py
?? scripts/art_library/capture_cargo_extra_batch.py
?? scripts/art_library/capture_character_activation.js
?? scripts/art_library/capture_character_compact.js
?? scripts/art_library/capture_character_desktop.js
?? scripts/art_library/capture_character_final.js
?? scripts/art_library/capture_character_frame_gallery.js
?? scripts/art_library/capture_character_inventory.js
?? scripts/art_library/capture_character_isolated.js
?? scripts/art_library/capture_character_refined.js
?? scripts/art_library/capture_character_states.js
?? scripts/art_library/capture_character_ui.js
?? scripts/art_library/capture_floor_interactions.js
?? scripts/art_library/capture_floor_review.js
?? scripts/art_library/capture_floor_supplement.js
?? scripts/art_library/cargo_boards.py
?? scripts/art_library/cargo_collection_checkpoint.py
?? scripts/art_library/cargo_current_manifest.py
?? scripts/art_library/cargo_fit_evidence.py
?? scripts/art_library/cargo_fluid_extension_build.py
?? scripts/art_library/cargo_fluid_extension_collection_audit.py
?? scripts/art_library/cargo_fluid_extension_document.py
?? scripts/art_library/cargo_fluid_extension_loose_build.py
?? scripts/art_library/cargo_fluid_extension_loose_document.py
?? scripts/art_library/cargo_fluid_extension_loose_run.py
?? scripts/art_library/cargo_fluid_extension_mapping.py
?? scripts/art_library/cargo_fluid_extension_run.py
?? scripts/art_library/cargo_fluid_extension_support_audit.py
?? scripts/art_library/cargo_fluid_extension_variants.py
?? scripts/art_library/cargo_mechanics_fix.py
?? scripts/art_library/cargo_reference_reuse.py
?? scripts/art_library/cargo_report.py
?? scripts/art_library/cargo_review_acceptance.py
?? scripts/art_library/cargo_source_editing_note.py
?? scripts/art_library/check_bridge_duplicate.ts
?? scripts/art_library/check_equipment_fit.ts
?? scripts/art_library/check_floor_review.ts
?? scripts/art_library/check_hull_review.ts
?? scripts/art_library/check_pilot_context.ts
?? scripts/art_library/check_pilot_palette_geometry.py
?? scripts/art_library/check_pilot_r002.ts
?? scripts/art_library/check_pilot_r003.ts
?? scripts/art_library/check_pilot_r004.ts
?? scripts/art_library/check_pilot_r005.ts
?? scripts/art_library/check_pilot_r006.ts
?? scripts/art_library/check_roof_lights.ts
?? scripts/art_library/check_roof_placement.ts
?? scripts/art_library/check_roof_review.ts
?? scripts/art_library/check_side_hull_lights.ts
?? scripts/art_library/check_side_hull_placement.ts
?? scripts/art_library/check_side_hull_publication.ts
?? scripts/art_library/compose_native_planet_review.ts
?? scripts/art_library/cook_equipment_review.py
?? scripts/art_library/crop_corrections.json
?? scripts/art_library/diagnose_roof_normals.py
?? scripts/art_library/document_cargo.py
?? scripts/art_library/document_cargo_extras.py
?? scripts/art_library/document_hull_review.py
?? scripts/art_library/document_pilot_r003.py
?? scripts/art_library/document_pilot_r005.py
?? scripts/art_library/document_pilot_r006.py
?? scripts/art_library/equipment_review_index.py
?? scripts/art_library/evidence_pilot_r002.py
?? scripts/art_library/evidence_pilot_r003.py
?? scripts/art_library/evidence_pilot_r004.py
?? scripts/art_library/evidence_pilot_r005.py
?? scripts/art_library/evidence_pilot_r006.py
?? scripts/art_library/extract_aim_samples.py
?? scripts/art_library/finalize_equipment_detail.py
?? scripts/art_library/finalize_hull_source.py
?? scripts/art_library/finish_pilot_r002.py
?? scripts/art_library/fix_bunk_posts.py
?? scripts/art_library/gallery.py
?? scripts/art_library/hull_maps.py
?? scripts/art_library/inspect_pose_source.py
?? scripts/art_library/mesh_construction.ts
?? scripts/art_library/mesh_equipment_review.ts
?? scripts/art_library/nameplate_pilot_r005.py
?? scripts/art_library/native_planet_browser_review.ts
?? scripts/art_library/package_floor_review.py
?? scripts/art_library/package_roof_review.py
?? scripts/art_library/package_side_hull_review.py
?? scripts/art_library/palette_evidence_pilot_r006.py
?? scripts/art_library/palette_pilot_r006.py
?? scripts/art_library/pose_contact_sheets.py
?? scripts/art_library/prepare_cargo.py
?? scripts/art_library/prepare_cargo_capture.py
?? scripts/art_library/prepare_cargo_extra_capture.py
?? scripts/art_library/prepare_cargo_finishes.py
?? scripts/art_library/prepare_cargo_r002.py
?? scripts/art_library/prepare_equipment.py
?? scripts/art_library/prepare_equipment_capture.py
?? scripts/art_library/prepare_floor_review.py
?? scripts/art_library/prepare_hull_capture.py
?? scripts/art_library/prepare_roof_review.py
?? scripts/art_library/prepare_side_hull_review.py
?? scripts/art_library/profiles.py
?? scripts/art_library/record_equipment_review.py
?? scripts/art_library/record_hull_review.py
?? scripts/art_library/record_pilot_iteration.py
?? scripts/art_library/refine_equipment_surfaces.py
?? scripts/art_library/refine_floor_review.py
?? scripts/art_library/render_equipment_pose.py
?? scripts/art_library/render_floor_review.py
?? scripts/art_library/render_hull_review.py
?? scripts/art_library/render_native_ice_hero.py
?? scripts/art_library/render_native_planet_composition.py
?? scripts/art_library/render_pilot_context.py
?? scripts/art_library/render_roof_complete_board.py
?? scripts/art_library/render_roof_review.py
?? scripts/art_library/render_side_hull_review.py
?? scripts/art_library/render_voxel_review.py
?? scripts/art_library/repair_pilot_r003_uv.py
?? scripts/art_library/repair_roof_export_origin.py
?? scripts/art_library/repair_roof_r001_names.py
?? scripts/art_library/requirements.txt
?? scripts/art_library/retain_pilot_placement_ids.py
?? scripts/art_library/roof_example_decals.py
?? scripts/art_library/run_cargo.py
?? scripts/art_library/run_cargo_evidence.py
?? scripts/art_library/run_cargo_finishes.py
?? scripts/art_library/run_construction.py
?? scripts/art_library/run_equipment.py
?? scripts/art_library/run_equipment_poses.py
?? scripts/art_library/run_floor.py
?? scripts/art_library/run_hull.py
?? scripts/art_library/run_pilot_r002.py
?? scripts/art_library/run_pilot_r003.py
?? scripts/art_library/run_pilot_r004.py
?? scripts/art_library/run_pilot_r005.py
?? scripts/art_library/run_pilot_r006.py
?? scripts/art_library/run_planet_review.py
?? scripts/art_library/run_roof.py
?? scripts/art_library/run_side_hull.py
?? scripts/art_library/run_stairs.py
?? scripts/art_library/seed_roof_decals.py
?? scripts/art_library/serve.py
?? scripts/art_library/ship_finish_r006_bevel_study.py
?? scripts/art_library/ship_finish_r006_major_edge_study.py
?? scripts/art_library/ship_finish_r006_study.py
?? scripts/art_library/ship_finish_study.py
?? scripts/art_library/socket_pilot_r006.py
?? scripts/art_library/source_pilot_identity_r006.py
?? scripts/art_library/stage_equipment_poses.py
?? scripts/art_library/stage_pose_foregrips_r003.py
?? scripts/art_library/stage_pose_handhelds.py
?? scripts/art_library/test_catalog.py
?? scripts/art_library/tsconfig.json
?? scripts/art_library/validate_equipment_poses.py
?? scripts/art_library/validate_equipment_review.py
?? scripts/assembly_thumbnails.ts
?? scripts/backpack-smoke.ts
?? scripts/build_assembly.ts
?? scripts/build_bulkhead_source.py
?? scripts/build_crew_animation.py
?? scripts/build_crew_archetypes.py
?? scripts/build_crew_source.py
?? scripts/build_crew_variants.py
?? scripts/build_engine_source.py
?? scripts/build_equipment_source.py
?? scripts/build_interior_prop_source.py
?? scripts/build_inventory_icons.py
?? scripts/build_metal_materials.py
?? scripts/build_ship_fixture_source.py
?? scripts/build_voxel.ts
?? scripts/character_components/
?? scripts/export_sampled_asset.py
?? scripts/export_voxel_blender.py
?? scripts/layout_benchmark.ts
?? scripts/mesh_interior_prop_review.ts
?? scripts/mesh_sampled_asset.ts
?? scripts/pose_capture_state.ts
?? scripts/pose_crowd_audit.ts
?? scripts/pose_fit_search.ts
?? scripts/pose_grid_audit.ts
?? scripts/pose_pistol_fit_search.ts
?? scripts/pose_review_audit.ts
?? scripts/pose_review_metadata.ts
?? scripts/pose_rifle_fit_search.ts
?? scripts/pose_rig_audit.ts
?? scripts/pose_scope_fit_search.ts
?? scripts/pose_transition_audit.ts
?? scripts/publish_pose_r003.py
?? scripts/publish_pose_runtime.py
?? scripts/record_native_release.py
?? scripts/render_crew_looks.py
?? scripts/render_interior_prop_comparison.py
?? scripts/restore_bridge_surround.py
?? scripts/ship_materials.py
?? scripts/stage_pose_integration_patch.py
?? scripts/test_art_owner_signoff.py
?? scripts/test_character_publication.py
?? scripts/test_faces_installer.py
?? scripts/test_installed_component_identity.py
?? scripts/test_pose_publication_namespace.py
?? scripts/test_pose_r002_successor.py
?? scripts/test_ship_materials.py
?? scripts/validate_installed_poses.py
?? scripts/validate_installed_poses_r002_successor.py
?? scripts/validate_installed_poses_r003.py
?? scripts/voxel_visual_surface.py
?? scripts/voxelize_blender.py
```

### Native pins

- `assets/runtime/assembly/wayfarer.json` SHA-256 `1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb`
- `assets/runtime/assembly/catalog.json` SHA-256 `f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac`
- `packages/content/src/wayfarer-starter-r001.json` SHA-256 `53a636ea9905e9ec953268e65b54ed7c59ed8e0f97158dac914958ad38f1e21b`
- `assets/runtime/construction/boundary-r004/kit.glb` SHA-256 `568d491623f03df932a9c5c120a94e4a60b00bd0fd421ae3cf928c89543505db`

Starter canonical document pin: `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. File-byte hash and canonical JSON hash are distinct.

Exact catalog native bindings captured before code changes:

```json
[
  {
    "assetId": "part-c0b6b036f5b3dd8bd2f3",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-c0b6b036f5b3dd8bd2f3/glb.glb",
    "sha256": "da38770d060f4c5397b2d0ae8ab01258d42ea1f12884cac3ed628c3b110c5a9c",
    "designId": "shipyard.equipment.pilot-seat",
    "revision": 3,
    "bounds": {
      "min": [
        -0.550000011920929,
        -0.4950000047683716,
        0
      ],
      "max": [
        0.550000011920929,
        0.4950000047683716,
        1.3100000619888306
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-d9f37a5f7ea6e8d13254",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-d9f37a5f7ea6e8d13254/glb.glb",
    "sha256": "713d8a83c902d24bb59e278eb2436b087ebdf06fbbbbbd5daa7d2340fc782a49",
    "designId": "shipyard.equipment.command-console",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -0.375,
        0
      ],
      "max": [
        1,
        0.375,
        1.625
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-c03ec0260cd7329050a8",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-c03ec0260cd7329050a8/glb.glb",
    "sha256": "f527af1e44fc1570355c2268055b7b31343c45849a807b40993cf516c263093a",
    "designId": "shipyard.equipment.wall-locker",
    "revision": 5,
    "bounds": {
      "min": [
        -0.25,
        -0.75,
        0
      ],
      "max": [
        0.25,
        0.75,
        1.3125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-18280ba6cc037eb433dc",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.6200000047683716,
        -1,
        0
      ],
      "max": [
        0.1875,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-18280ba6cc037eb433dc--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a754ceb1ebef9f1395d9",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.4950000047683716,
        -1,
        0
      ],
      "max": [
        0.3125,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-a754ceb1ebef9f1395d9--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-3da4aef9b526b104b324",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.5575000047683716,
        -1,
        0
      ],
      "max": [
        0.25,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-3da4aef9b526b104b324--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e21a69be0c5b6a98e812",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.6549999713897705,
        -1,
        0
      ],
      "max": [
        0.1875,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-e21a69be0c5b6a98e812--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-91c8f3d728f25c968810",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.6200000047683716,
        -1,
        0
      ],
      "max": [
        0.1875,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-91c8f3d728f25c968810--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0fe602115d20ec950357",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.4950000047683716,
        -1,
        0
      ],
      "max": [
        0.3125,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-0fe602115d20ec950357--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0ac1e39dec34655a366f",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.6200000047683716,
        -1,
        0
      ],
      "max": [
        0.1875,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-0ac1e39dec34655a366f--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-dd83177cdf0e1d968cb7",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.4950000047683716,
        -1,
        0
      ],
      "max": [
        0.3125,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-dd83177cdf0e1d968cb7--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b351480b6386fb131dc0",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.6200000047683716,
        -1,
        0
      ],
      "max": [
        0.1875,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-b351480b6386fb131dc0--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-7b28f47930a6f7cbdf10",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.1875,
        -1,
        0
      ],
      "max": [
        0.6200000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-7b28f47930a6f7cbdf10--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-3cb4b658b677f06829b6",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.25,
        -1,
        0
      ],
      "max": [
        0.5575000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-3cb4b658b677f06829b6--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0558bcda4ab0cb8c9f70",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.25,
        -1,
        0
      ],
      "max": [
        0.5575000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-0558bcda4ab0cb8c9f70--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-8ddb637a40bd23dfd03a",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.1875,
        -1,
        0
      ],
      "max": [
        0.6549999713897705,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-8ddb637a40bd23dfd03a--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-1c0570cdd9d7bc9d67da",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.1875,
        -1,
        0
      ],
      "max": [
        0.6200000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-1c0570cdd9d7bc9d67da--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-505abaccb2279cad2d0f",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.25,
        -1,
        0
      ],
      "max": [
        0.5575000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-505abaccb2279cad2d0f--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-f307639bad50377eba7b",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.1875,
        -1,
        0
      ],
      "max": [
        0.6200000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-f307639bad50377eba7b--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-66a37b7990899a620125",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.25,
        -1,
        0
      ],
      "max": [
        0.5575000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-66a37b7990899a620125--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-2143e7c0fcb3b5b3270f",
    "field": "visual",
    "url": "/assets/assembly/side-hull/r003/kit.glb",
    "sha256": "eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7",
    "designId": "shipyard.hull.side-armor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.1875,
        -1,
        0
      ],
      "max": [
        0.6200000047683716,
        1,
        2.9375
      ]
    },
    "nodePrefix": "GEO-part-2143e7c0fcb3b5b3270f--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-77728ecc8ad36b0ff45f",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-77728ecc8ad36b0ff45f/glb.glb",
    "sha256": "02ada2cf811e7893ffd98d8b6231974d111238e2dddf0ecd96739ff6b68a2cd3",
    "designId": "shipyard.equipment.reactor",
    "revision": 3,
    "bounds": {
      "min": [
        -0.75,
        -1.3093699216842651,
        0
      ],
      "max": [
        0.75,
        1.375,
        1.5700000524520874
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-acbbef7209c4ef100693",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-acbbef7209c4ef100693/glb.glb",
    "sha256": "1e96a18539191ea08d48b4134c2820043674f2c3b0960ce583ae1620ba5a81a8",
    "designId": "shipyard.equipment.hydroponics",
    "revision": 4,
    "bounds": {
      "min": [
        -0.75,
        -0.3125,
        0
      ],
      "max": [
        0.75,
        0.3125,
        1.7000000476837158
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-c41467ac46f6b350df24",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-c41467ac46f6b350df24/r006/glb.glb",
    "sha256": "a5b58c4707df1e37aa70fa40e7d052e63be141df7703cd75337abe0e7610b4c7",
    "designId": "shipyard.equipment.crew-bunk",
    "revision": 6,
    "bounds": {
      "min": [
        -0.6700000166893005,
        -1.333125114440918,
        0
      ],
      "max": [
        0.6700000166893005,
        1.333125114440918,
        1.9900000095367432
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-cc610ba071b8eb38ab8c",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-cc610ba071b8eb38ab8c/glb.glb",
    "sha256": "a8e5d2fa478e42723ffc82a845b223051a8f8878ece3c9ea80eb75e4a5021a3b",
    "designId": "shipyard.equipment.medical-bed",
    "revision": 3,
    "bounds": {
      "min": [
        -0.6700000166893005,
        -1.3009999990463257,
        0
      ],
      "max": [
        0.6700000166893005,
        1.28000009059906,
        1.8949999809265137
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-73df516feb786d73fc5e",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-73df516feb786d73fc5e/glb.glb",
    "sha256": "3692ffd29f75026ef856af18a0a59538814b4836e8315d98c48e3c76d00735a8",
    "designId": "shipyard.equipment.lounge-sofa",
    "revision": 3,
    "bounds": {
      "min": [
        -0.75,
        -1.375,
        0
      ],
      "max": [
        0.75,
        1.375,
        1.2899999618530273
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-75910d7a0d27dfc17aaf",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-75910d7a0d27dfc17aaf/glb.glb",
    "sha256": "be3a73faed7b4a2c9e4c7b89477df3c1424284dd3e71ca84438fb049a8b3b5a8",
    "designId": "shipyard.equipment.bridge-bank",
    "revision": 4,
    "bounds": {
      "min": [
        -0.25,
        -0.4375,
        0
      ],
      "max": [
        0.3125,
        0.4375,
        1.25
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0f14bf002f4c11854337",
    "field": "visual",
    "url": "/assets/assembly/equipment/part-0f14bf002f4c11854337/glb.glb",
    "sha256": "5bbe40f3637bc640bc26557c3c20e3d9e452587395b0ca7c05d45793ef5e014a",
    "designId": "shipyard.equipment.bridge-bank",
    "revision": 4,
    "bounds": {
      "min": [
        -0.25,
        -0.4375,
        0
      ],
      "max": [
        0.3125,
        0.4375,
        1.25
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-50898252a921c7be50b3",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -0.125,
        -0.25,
        0
      ],
      "max": [
        0.125,
        0.25,
        0.2199999988079071
      ]
    },
    "nodePrefix": "GEO-edge-short--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5c53af159a14e3454da7",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -0.25,
        0
      ],
      "max": [
        1,
        0.25,
        0.2199999988079071
      ]
    },
    "nodePrefix": "GEO-stern-strip--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-05049180a0e5eceefc12",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -0.125,
        -1,
        0
      ],
      "max": [
        0.125,
        1,
        0.2199999988079071
      ]
    },
    "nodePrefix": "GEO-edge-long--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b86fe448a0cdd955e88b",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.6800000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-712235769fd1db178911",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -0.25,
        0
      ],
      "max": [
        1,
        0.25,
        0.2199999988079071
      ]
    },
    "nodePrefix": "GEO-stern-strip--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-d5a958cd5c64f788d607",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.2350000143051147
      ]
    },
    "nodePrefix": "GEO-transition-service-aft-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ccf7c8d305f71dc5f596",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1.024999976158142,
        0
      ],
      "max": [
        1,
        1.024999976158142,
        1.2750000953674316
      ]
    },
    "nodePrefix": "GEO-center-service-aft--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-3a18bc76a2d47e563b4b",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.2350000143051147
      ]
    },
    "nodePrefix": "GEO-transition-service-aft-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-1d5c3e6be30e7f2cda99",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -0.25,
        0
      ],
      "max": [
        1,
        0.25,
        0.2199999988079071
      ]
    },
    "nodePrefix": "GEO-stern-strip--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-acb9d36d47113a25ad84",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.6800000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-34accc51ea8752a66670",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8749999403953552
      ]
    },
    "nodePrefix": "GEO-shoulder-red--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e188bf92bb905027d600",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.2350000143051147
      ]
    },
    "nodePrefix": "GEO-transition-service-fore-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-06fe670dace09ce26bdf",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1.024999976158142,
        0
      ],
      "max": [
        1,
        1.024999976158142,
        1.2750000953674316
      ]
    },
    "nodePrefix": "GEO-center-service-fore--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e14864df3df74006207a",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.2350000143051147
      ]
    },
    "nodePrefix": "GEO-transition-service-fore-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-df744c52b2f4f085efc3",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8749999403953552
      ]
    },
    "nodePrefix": "GEO-shoulder-red--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-834cca417ad1520fb91b",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.6800000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-06c58ee456dae94b1772",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.0699999332427979
      ]
    },
    "nodePrefix": "GEO-transition-break-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-2760976b04d38507b400",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.0099999904632568
      ]
    },
    "nodePrefix": "GEO-center-crossbreak--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a4eed62e70496db38a2a",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.0699999332427979
      ]
    },
    "nodePrefix": "GEO-transition-break-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-8ca6ba766169b463abbf",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.6800000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-9c1ccfb3902a1e19de44",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.9035106897354126
      ]
    },
    "nodePrefix": "GEO-shoulder-lamp--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-2353952b313ac7582770",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-transition-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e7f6d59dd9f860ed57d6",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-center-quiet--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ca1cbb89761ec5c604b8",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-transition-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-196967a04cc184797d72",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.9035106897354126
      ]
    },
    "nodePrefix": "GEO-shoulder-lamp--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-9fe552c6f9293ec26860",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.5199999809265137
      ]
    },
    "nodePrefix": "GEO-shoulder-plain--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-61e4ccf651374ea0d773",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-transition-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-701ca6e3c7861c04acbf",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-center-quiet--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a87c82cebb4bbbf8db11",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-transition-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ae18e82003fce6d677bc",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.5199999809265137
      ]
    },
    "nodePrefix": "GEO-shoulder-plain--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-229a43bbe1eb96367621",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.6800000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5838f5816573759b23e7",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-transition-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-4c52da8cda73444f19d3",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-center-quiet--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-771b73697fcd1af0ffe1",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8600000143051147
      ]
    },
    "nodePrefix": "GEO-transition-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-4a4b34fe2247bfa2ed2a",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.6800000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-12e80210cf3fd09756c0",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.9035106897354126
      ]
    },
    "nodePrefix": "GEO-shoulder-lamp--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-d4a9faaa669f3ecc29fd",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.0699999332427979
      ]
    },
    "nodePrefix": "GEO-transition-break-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-8f65f9fd39b16b2bec9e",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.0099999904632568
      ]
    },
    "nodePrefix": "GEO-center-crossbreak--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b5a08afd6c5d6c897d51",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.0699999332427979
      ]
    },
    "nodePrefix": "GEO-transition-break-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ecfd7775a5086626cd96",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.9035106897354126
      ]
    },
    "nodePrefix": "GEO-shoulder-lamp--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-63ee593f180a4f4c4c7a",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8749999403953552
      ]
    },
    "nodePrefix": "GEO-shoulder-red--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-16c015c4cd41f2332a37",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.2350000143051147
      ]
    },
    "nodePrefix": "GEO-transition-service-port--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-c15a5229e466c6057639",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1.024999976158142,
        0
      ],
      "max": [
        1,
        1.024999976158142,
        1.2750000953674316
      ]
    },
    "nodePrefix": "GEO-center-service--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-f4692a493f2aa4f6dddf",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        1.2350000143051147
      ]
    },
    "nodePrefix": "GEO-transition-service-starboard--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5db85939e66f62926062",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0
      ],
      "max": [
        1,
        1,
        0.8749999403953552
      ]
    },
    "nodePrefix": "GEO-shoulder-red--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-eeb15021768e26d40156",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -0.125,
        -1,
        0
      ],
      "max": [
        0.125,
        1,
        0.2199999988079071
      ]
    },
    "nodePrefix": "GEO-edge-long--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-1eeda7c71b6b49c4d10f",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0.125
      ],
      "max": [
        1,
        1,
        0.8050000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent-fore-datum--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-4d7f7db485619f1df26b",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -1,
        -1,
        0.125
      ],
      "max": [
        1,
        1,
        0.8050000071525574
      ]
    },
    "nodePrefix": "GEO-shoulder-vent-fore-datum--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ff627f158a6d1ecfb097",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        -0.125,
        -1,
        0
      ],
      "max": [
        0.125,
        1,
        0.2199999988079071
      ]
    },
    "nodePrefix": "GEO-edge-long--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5adddce8ec67610eb184",
    "field": "visual",
    "url": "/assets/assembly/hull/part-5adddce8ec67610eb184/clean.glb",
    "sha256": "77ef8fb7d2ccea9b4f6f534bccb5033d54f2bbb3580ad5808dfc86a742066b2a",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        2,
        0.1875
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-4d0b42d4ad4a5f878bf4",
    "field": "visual",
    "url": "/assets/assembly/hull/part-4d0b42d4ad4a5f878bf4/clean.glb",
    "sha256": "c4eabf4560373f53bdf705d469c9f75fbb9d62803788d0032c35bd2c712fb859",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        1.9943431615829468,
        1.9943431615829468,
        0.1875
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-9f076369bde5b227829a",
    "field": "visual",
    "url": "/assets/assembly/hull/part-9f076369bde5b227829a/clean.glb",
    "sha256": "784dd8b2c80ac94890d6a6b47d27953d8139d092f7184c116f9fdbd999f3f8fb",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        0.375,
        1.125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-4a8eab4b82796b19ebfe",
    "field": "visual",
    "url": "/assets/assembly/hull/part-4a8eab4b82796b19ebfe/clean.glb",
    "sha256": "2ff3e7f77b87867191ab8bd4be8fe800f4df27c687b49e452c43b6337ba8118b",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0,
        0.012727920897305012,
        0
      ],
      "max": [
        1.987272024154663,
        2,
        1.125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e8c0c4395f2521c47b20",
    "field": "visual",
    "url": "/assets/assembly/hull/part-e8c0c4395f2521c47b20/clean.glb",
    "sha256": "f3aef2e608c5e41b1699e0764d060365f8fd6f518a8dd332b84bd40c794fecca",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0,
        0.008049843832850456,
        0
      ],
      "max": [
        3.983900308609009,
        2,
        1.125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-9211fc86e04c4b23402b",
    "field": "visual",
    "url": "/assets/assembly/hull/part-9211fc86e04c4b23402b/clean.glb",
    "sha256": "01b77863ca3da67edcd24968f80f6e128ef42f7d32d4750e86bb72b2574295cd",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        0.375,
        1.125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-1c7076c89e3593dd5587",
    "field": "visual",
    "url": "/assets/assembly/hull/part-1c7076c89e3593dd5587/clean.glb",
    "sha256": "357305e4dc637db8413fe995e77475019598153b16d6044ee2d7a3b68590f172",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0.0024999892339110374,
        0.10749999433755875,
        -0.02750004455447197
      ],
      "max": [
        1.9975000619888306,
        0.29850003123283386,
        1.340000033378601
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-d244db24147e2f1a4b9a",
    "field": "visual",
    "url": "/assets/assembly/hull/part-d244db24147e2f1a4b9a/clean.glb",
    "sha256": "7116019f1c974f46a1c131cdf6e257584b7dd49a3babe84c6b4aca9f04015b8c",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0.015260929241776466,
        0.20124998688697815,
        -0.02750009298324585
      ],
      "max": [
        1.7787500619888306,
        1.9862500429153442,
        1.340000033378601
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-14404bc85f3a72ad3ab8",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        2,
        0.30000001192092896
      ]
    },
    "nodePrefix": "GEO-vestibule-name--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a71041f7edfcbbd17fd1",
    "field": "visual",
    "url": "/assets/assembly/hull/part-a71041f7edfcbbd17fd1/clean.glb",
    "sha256": "c35d35d0ebb83f83868780b7024a1301f77e4b8cf36556114afcf8d3214194c7",
    "designId": "shipyard.hull.pilot-section",
    "revision": 1,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        1.987272024154663,
        1.987272024154663,
        0.1875
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-04c2fbf8cdd53d6bf70f",
    "field": "visual",
    "url": "/assets/assembly/hull/r006/part-04c2fbf8cdd53d6bf70f/clean.glb",
    "sha256": "2a443848a642a1a3ddc26cb7f53369bda56c1c2d1603f5cf3f075cd067b6dbcc",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        1.9943431615829468,
        1.9943431615829468,
        0.1875
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-1d133c308abd8b172d95",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        0.625,
        0,
        0
      ],
      "max": [
        5.375,
        3.375,
        0.28999999165534973
      ]
    },
    "nodePrefix": "GEO-pilot-roof--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-437732483fa4d7acbcbc",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-437732483fa4d7acbcbc/clean.glb",
    "sha256": "6992c7d5fb25376f3d12d881f66ab002108ed275a63661ca84025968ca3cadfe",
    "designId": "shipyard.hull.pilot-section",
    "revision": 6,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        4.024903774261475,
        2.075246572494507,
        1.5499999523162842
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-48cf8b9cf29d0b226ec4",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-48cf8b9cf29d0b226ec4/clean.glb",
    "sha256": "65195aefcb5bf72da62839db8fec6123188af9f5ac17024cbe7d6d2cf8959b79",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        -0.06499999761581421,
        0.09198706597089767,
        -0.0700000450015068
      ],
      "max": [
        2.0061984062194824,
        0.8948594927787781,
        1.3825000524520874
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-4a1d28344c5ee632b249",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-4a1d28344c5ee632b249/clean.glb",
    "sha256": "d6859439499041ad474afd3d07b4fa1a67512eb7d90fb99720edfbfe5301a5f4",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        -0.0061983224004507065,
        0.09198706597089767,
        -0.07000003755092621
      ],
      "max": [
        2.0061984062194824,
        0.8948594927787781,
        1.382500171661377
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-4c25a5fd9da0bce537f5",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-4c25a5fd9da0bce537f5/clean.glb",
    "sha256": "59dd466fd25f5555fd8d29bd4183c2e5c7dd99884586bc7f251a2736fbe396d1",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        -0.03700000420212746,
        0
      ],
      "max": [
        2,
        0.375,
        1.125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-540c83fc49ee792d9a4a",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-540c83fc49ee792d9a4a/clean.glb",
    "sha256": "118f1f2406b0c699517be811d77e585f49d5b9c7d650013f873885dbe74329a5",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        0.0176776684820652,
        0
      ],
      "max": [
        1.982322335243225,
        2,
        1.125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-624989ddf1192dceee75",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-624989ddf1192dceee75/clean.glb",
    "sha256": "9dcf37d5a749a152be66657b100a8d83c59856b4c3b4dc967387bf000723e792",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        -0.0061983224004507065,
        0.09198712557554245,
        -0.0700000450015068
      ],
      "max": [
        2.065000057220459,
        0.8948594331741333,
        1.3825000524520874
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-63a0c40bbb71cfeba4dd",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-63a0c40bbb71cfeba4dd/clean.glb",
    "sha256": "3d0fd05cf021b3b5badf68e2e9f1011b5b621e64355390f61508a18a5e4cf61d",
    "designId": "shipyard.hull.pilot-section",
    "revision": 6,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        4,
        0.6324999928474426,
        1.5499999523162842
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-70c422bca2d395c35ecb",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-70c422bca2d395c35ecb/clean.glb",
    "sha256": "825a836cb96f74363c83c1d5be4efc1a11df0ef71bbdafff8b2abb222cebdad6",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        -0.0820000022649765,
        0
      ],
      "max": [
        2,
        0.375,
        2.4375
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-7a1a34a2a908f8ff455b",
    "field": "visual",
    "url": "/assets/assembly/hull/r006/part-7a1a34a2a908f8ff455b/clean.glb",
    "sha256": "3a621b356eee87d25e7e7691829aaf52bf68d64af80d2a8bd375be21239a3ac2",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        2,
        0.1875
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-9f79f3a40a72f9b7ad4a",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-9f79f3a40a72f9b7ad4a/clean.glb",
    "sha256": "1b787888f92e9a7691337c02b297a8895703544003ddcec8eb655ff1ffe91af3",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2.115000009536743,
        2.115000009536743,
        2.7200000286102295
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b3a1decd8a0336ac2030",
    "field": "visual",
    "url": "/assets/assembly/roof/r004/kit.glb",
    "sha256": "8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f",
    "designId": "shipyard.roof.frontier",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        0,
        2.59375
      ],
      "max": [
        0.375,
        0.5,
        3.3125
      ]
    },
    "nodePrefix": "GEO-outer-roof-collar--surface",
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b70713e9836547941e3f",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-b70713e9836547941e3f/clean.glb",
    "sha256": "9495f6771dbeafaa24530562acd95a744414674853d7a13e45d2866f59e42526",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        -0.4204133152961731,
        0.1051405593752861,
        -0.07000010460615158
      ],
      "max": [
        1.8948595523834229,
        2.4204132556915283,
        1.3825000524520874
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e7dddd4628bd6be8efb7",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-e7dddd4628bd6be8efb7/clean.glb",
    "sha256": "53d58e142047665409aadeb232a83f0c5a1901da705234f2ffc8bda4f211e5c9",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        -0.00800000037997961,
        0
      ],
      "max": [
        1.625,
        0.382999986410141,
        2.4375
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e965a5502d9fe4c25406",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-e965a5502d9fe4c25406/clean.glb",
    "sha256": "e34ba9c660088550058053cf9dff5a93bdc1b198d9262ba9f6f3acc05644a2fa",
    "designId": "shipyard.hull.pilot-section",
    "revision": 6,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        0.8140870332717896,
        2,
        2.9375
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ecd751f76e602db806a3",
    "field": "visual",
    "url": "/assets/assembly/hull/finish-r004/part-ecd751f76e602db806a3/clean.glb",
    "sha256": "29ef84b9b36290094d9053f7635fe160ca5a1767af14eecc2d965ae7405f5f1d",
    "designId": "shipyard.hull.pilot-section",
    "revision": 4,
    "bounds": {
      "min": [
        0,
        -0.03199999779462814,
        0
      ],
      "max": [
        2,
        0.375,
        1.125
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-c06e4f5f6f6dace38e41",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-c06e4f5f6f6dace38e41/glb.glb",
    "sha256": "2c7f3a8a9c39ed54af84b5a42694188db99fd94c706071384dec3bf8c394e5bf",
    "designId": "cargo.standard.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.28049999475479126,
        0
      ],
      "max": [
        0.3305000066757202,
        0.20500001311302185,
        0.5114999413490295
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-abb5fe4af40225b7eae4",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-abb5fe4af40225b7eae4/glb.glb",
    "sha256": "b206e9ca51fff669848037ab6288882df033293d535c4f31e96034e1bde7db2c",
    "designId": "cargo.standard.medium",
    "revision": 3,
    "bounds": {
      "min": [
        -0.5304999947547913,
        -0.4505000114440918,
        0
      ],
      "max": [
        0.5304999947547913,
        0.34584999084472656,
        0.9514999985694885
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-f12452ef26700fa33271",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-f12452ef26700fa33271/glb.glb",
    "sha256": "c5327211a125e711f907a41691a5bacf5253f9dc9398ed1484891f947691ced8",
    "designId": "cargo.standard.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -0.7270000576972961,
        0
      ],
      "max": [
        0.9704999923706055,
        0.5891000032424927,
        1.7200000286102295
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b3ba935a9fdc172d4b05",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-b3ba935a9fdc172d4b05/glb.glb",
    "sha256": "cabf3570fc40613b8476ade9627f78033963e691ddd385a996bcf548ce7a5985",
    "designId": "cargo.standard.oversized",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -2.0269999504089355,
        0
      ],
      "max": [
        0.9704999923706055,
        1.8890999555587769,
        1.9199999570846558
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-7b3c579c1281fc95571e",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-7b3c579c1281fc95571e/glb.glb",
    "sha256": "d0c38b77acee4430c023a003a1e8bc536d39a401064724fd586f9499c2fe5bb6",
    "designId": "cargo.reinforced.medium",
    "revision": 3,
    "bounds": {
      "min": [
        -0.5304999947547913,
        -0.46299999952316284,
        0
      ],
      "max": [
        0.5304999947547913,
        0.34584999084472656,
        0.9514999985694885
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-7c2f338895b10331d945",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-7c2f338895b10331d945/glb.glb",
    "sha256": "662494d06bd0bb22b221f171e5c154808fdcf2e7198aea086b234755fc833188",
    "designId": "cargo.reinforced.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -0.8220000267028809,
        0
      ],
      "max": [
        0.9704999923706055,
        0.5891000032424927,
        1.7200000286102295
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-988451da35483981368a",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-988451da35483981368a/glb.glb",
    "sha256": "f1120e09b195eae7c347c77c529c53dd2df448431c79cd8e50640e62f02e79ae",
    "designId": "cargo.reinforced.oversized",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -2.122000217437744,
        0
      ],
      "max": [
        0.9704999923706055,
        1.8890999555587769,
        1.9199999570846558
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ba8af622916752a9337b",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-ba8af622916752a9337b/glb.glb",
    "sha256": "0119364ddd193ae12fa5288498d3dadbc34809d63ff0bf5d1f6062e82e94e886",
    "designId": "cargo.refrigerated.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.4580000042915344,
        -0.7324999570846558,
        0
      ],
      "max": [
        0.4580000042915344,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a35ecc5e892707a10931",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-a35ecc5e892707a10931/glb.glb",
    "sha256": "1abde7fc69cb70837bcbfa31a3c92e76020bc2d545739ddf10ea88455c37afe6",
    "designId": "cargo.refrigerated.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.6980000138282776,
        -1.0325000286102295,
        0
      ],
      "max": [
        0.6980000138282776,
        0.8999999761581421,
        1.159999966621399
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-3e4990bfd3cff3c322a6",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-3e4990bfd3cff3c322a6/glb.glb",
    "sha256": "c8fc1355219f88600dd3391a2b805ae25100d4bdf08f2f09b3b4fdda4949bb2f",
    "designId": "cargo.vacuum.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.43050000071525574,
        -0.7639999985694885,
        0
      ],
      "max": [
        0.43050000071525574,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-78c27f9eba15730f6e16",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-78c27f9eba15730f6e16/glb.glb",
    "sha256": "978718994a5323bb1b794065029bf2f9f6b50a9a50534bc8502a7acf3e85a4c3",
    "designId": "cargo.vacuum.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.6704999804496765,
        -1.063999891281128,
        0
      ],
      "max": [
        0.6704999804496765,
        0.8999999761581421,
        1.159999966621399
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b9296fc370e00c573edb",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-b9296fc370e00c573edb/glb.glb",
    "sha256": "bc35466888b7ef8fbd077aeb4656ee9591aba7c5bfffae40f258582ff3d443f1",
    "designId": "cargo.salvage.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.6704999804496765,
        -1.0325000286102295,
        0
      ],
      "max": [
        0.6704999804496765,
        0.8999999761581421,
        1.2540000677108765
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-6bb94c053cd8cf77c986",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-6bb94c053cd8cf77c986/glb.glb",
    "sha256": "034bc87366c86c39589d5a05754205c5c44b17164849572fe7c54b9c1fd90238",
    "designId": "cargo.salvage.oversized",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -2.0325000286102295,
        0
      ],
      "max": [
        0.9704999923706055,
        1.9000000953674316,
        1.8540000915527344
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-91ea0f7d9a898641e10a",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-91ea0f7d9a898641e10a/glb.glb",
    "sha256": "98a665e309e5b136f7658b0a7588b15971f94f9d82af85075f50d8253eeb5998",
    "designId": "cargo.medical.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.28049999475479126,
        0
      ],
      "max": [
        0.3305000066757202,
        0.20500001311302185,
        0.3915000259876251
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-30f4da34f1916e0c5c3f",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-30f4da34f1916e0c5c3f/glb.glb",
    "sha256": "e73ec71e8699877088c1ee182106e1738d737159f97a960650b2cdf7c032be5e",
    "designId": "cargo.medical.medium",
    "revision": 3,
    "bounds": {
      "min": [
        -0.5304999947547913,
        -0.4505000114440918,
        0
      ],
      "max": [
        0.5304999947547913,
        0.34584999084472656,
        0.6315000057220459
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a4d1c1ae60720fcbe403",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-a4d1c1ae60720fcbe403/glb.glb",
    "sha256": "91962c400f4cfd41907a0b8702f772d394e976b4f5f7cbc0a50b3759e4a03c89",
    "designId": "cargo.high-value.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.4104999899864197,
        0
      ],
      "max": [
        0.3305000066757202,
        0.24500000476837158,
        0.4714999794960022
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-73d0f3a802c4cb9166c1",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-73d0f3a802c4cb9166c1/glb.glb",
    "sha256": "35a4471f701d9882797a53c43efa9ab1a46dce8fca2c0d45da640184517b92d0",
    "designId": "cargo.high-value.medium",
    "revision": 3,
    "bounds": {
      "min": [
        -0.5304999947547913,
        -0.640500009059906,
        0
      ],
      "max": [
        0.5304999947547913,
        0.4458500146865845,
        0.7914999723434448
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-3b7ca37c50e723c351a6",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-3b7ca37c50e723c351a6/glb.glb",
    "sha256": "93def67d6bdde3e7c7062995a8086063b26eb9c42a44c74b6692c2bb9bb97b35",
    "designId": "cargo.fluid.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.43050000071525574,
        -0.5800000429153442,
        0
      ],
      "max": [
        0.43050000071525574,
        0.5800000429153442,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e925d94b0d7fa47fbedb",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-e925d94b0d7fa47fbedb/glb.glb",
    "sha256": "3a27abd17b594b46f58c68d5b983a35974dcbb088090785677b7589e545e1f40",
    "designId": "cargo.fluid.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.6704999804496765,
        -0.8799999952316284,
        0
      ],
      "max": [
        0.6704999804496765,
        0.8799999952316284,
        1.159999966621399
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-fbd7255612b311847eb2",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-fbd7255612b311847eb2/glb.glb",
    "sha256": "c63384726bd7b7891283bc72fbfab66de94e803618bd6d0a9ef9b8d093d51c66",
    "designId": "cargo.fluid-cryo.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.3400000035762787,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.3400000035762787,
        0.3400000035762787,
        1.3600000143051147
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-81d226967abf2efefc20",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-81d226967abf2efefc20/glb.glb",
    "sha256": "a2f9fca902c7df08f3e8bad348d09034df8f26d9c248d0d912558886aa2eecf6",
    "designId": "cargo.fluid-fuel.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.2760000228881836,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.2760000228881836,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-392d51c57ab75c82dc9c",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-392d51c57ab75c82dc9c/glb.glb",
    "sha256": "23d36657b742c2148682a6fd15e7e76e31434f997f1c7d51881b98fc0d579357",
    "designId": "cargo.fluid-chemical.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.27399998903274536,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.27399998903274536,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-9e3dbcbc867202b08b48",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-9e3dbcbc867202b08b48/glb.glb",
    "sha256": "c3752988956571beaba2e3ee3e520c823bb040e5923a6c103191a33fc75eb484",
    "designId": "cargo.fluid-gas.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.8999999761581421
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-66a83f73eef38512fd34",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-66a83f73eef38512fd34/glb.glb",
    "sha256": "5dcd32b998180c78bb842c5e68e7bdb24a23a0f97dbab95de1e4e4be4db7b8f5",
    "designId": "cargo.fluid-water.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3490000069141388,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.9070000052452087
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-bcd15c0ae99c611cd840",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-bcd15c0ae99c611cd840/glb.glb",
    "sha256": "b7706350f40b5da148da8bf14cc3d5b11066bdabc930ceb879f4ae5e2990e5c7",
    "designId": "cargo.standard.narrow",
    "revision": 1,
    "bounds": {
      "min": [
        -0.12099999934434891,
        -0.12399999797344208,
        0
      ],
      "max": [
        0.12099999934434891,
        0.12700000405311584,
        0.44200000166893005
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ddbf6661871ea40b586b",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-ddbf6661871ea40b586b/glb.glb",
    "sha256": "37765969cf2ac4d760dd189f718dc794ce923ecbeea0adac4a2914f2b3be6a2f",
    "designId": "cargo.standard.tiny",
    "revision": 1,
    "bounds": {
      "min": [
        -0.09099999815225601,
        -0.10799999535083771,
        0
      ],
      "max": [
        0.10099999606609344,
        0.11100000143051147,
        0.17100000381469727
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a0cc41ad3cc80d2c07a4",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-a0cc41ad3cc80d2c07a4/glb.glb",
    "sha256": "ab75deb1463f719934339f6029fb1b4260d54e26719ced47d1ab9937ed81280d",
    "designId": "cargo.standard.oversized",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -2.0269999504089355,
        0
      ],
      "max": [
        0.9704999923706055,
        1.8890999555587769,
        1.9199999570846558
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e7e053b614f1a2ab5ef1",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-e7e053b614f1a2ab5ef1/glb.glb",
    "sha256": "11d154af0b54789610d2f1b4be5dce3331c2e89bbf7e8995c4a0ba40575a7674",
    "designId": "cargo.standard.oversized",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -2.0269999504089355,
        0
      ],
      "max": [
        0.9704999923706055,
        1.8890999555587769,
        1.9199999570846558
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-41d3f8bf61743df8e351",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-41d3f8bf61743df8e351/glb.glb",
    "sha256": "2850e09c7d07c04ac7ba2d0c2f5ac6c1932704e20928278810c6ecbbf51fa3c1",
    "designId": "cargo.standard.oversized",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -2.0269999504089355,
        0
      ],
      "max": [
        0.9704999923706055,
        1.8890999555587769,
        1.9199999570846558
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-f897d81e4c69384df03b",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-f897d81e4c69384df03b/glb.glb",
    "sha256": "e601361679b0fe9deafe4caa0a863c53fceb9ce53840430a48106777789191df",
    "designId": "cargo.standard.oversized",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -2.0269999504089355,
        0
      ],
      "max": [
        0.9704999923706055,
        1.8890999555587769,
        1.9199999570846558
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-12743466dc1eeca3e482",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-12743466dc1eeca3e482/glb.glb",
    "sha256": "ae395110aef810c6c0119aa7c149f8055cd35112178fdec1ad98a18c581cde75",
    "designId": "cargo.reinforced.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -0.8220000267028809,
        0
      ],
      "max": [
        0.9704999923706055,
        0.5891000032424927,
        1.7200000286102295
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-6c94a694e1a91110e76f",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-6c94a694e1a91110e76f/glb.glb",
    "sha256": "5fb50d1445e011342f8ef5fe994f8f27c7e8bf01518b902e65b1a56111fd74df",
    "designId": "cargo.reinforced.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.9704999923706055,
        -0.8220000267028809,
        0
      ],
      "max": [
        0.9704999923706055,
        0.5891000032424927,
        1.7200000286102295
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a82fc07c0f2cf57ffef8",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-a82fc07c0f2cf57ffef8/glb.glb",
    "sha256": "b9bced5b170f7035d0efc2fb50af90e4935c328e8aac2065978d9c034e330746",
    "designId": "cargo.refrigerated.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.4580000042915344,
        -0.7324999570846558,
        0
      ],
      "max": [
        0.4580000042915344,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-be4057636f5003ee5fed",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-be4057636f5003ee5fed/glb.glb",
    "sha256": "a0b28cf785212fb719ea3eee2e388b516804299c84374c9f069be4ab3501174e",
    "designId": "cargo.refrigerated.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.4580000042915344,
        -0.7324999570846558,
        0
      ],
      "max": [
        0.4580000042915344,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-45eba046115a3166e3e6",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-45eba046115a3166e3e6/glb.glb",
    "sha256": "6729889a462e3a276c9975ade4c80769c2aa3fab43b76b0f8d2f0f5545453ef0",
    "designId": "cargo.refrigerated.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.4580000042915344,
        -0.7324999570846558,
        0
      ],
      "max": [
        0.4580000042915344,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-648c1308e0a5ccd4c749",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-648c1308e0a5ccd4c749/glb.glb",
    "sha256": "afe864ebafda474e0ffedeb3c58e3aba426661ef467fcf7c779cf47a911f0195",
    "designId": "cargo.vacuum.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.43050000071525574,
        -0.7639999985694885,
        0
      ],
      "max": [
        0.43050000071525574,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-f54c717c38a363f7e658",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-f54c717c38a363f7e658/glb.glb",
    "sha256": "9a3450840436ff9f70c3844973e41cf9924dbd175b5f59b5a8cb780b963a1867",
    "designId": "cargo.vacuum.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.43050000071525574,
        -0.7639999985694885,
        0
      ],
      "max": [
        0.43050000071525574,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-c1ebb67dff29784e301a",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-c1ebb67dff29784e301a/glb.glb",
    "sha256": "0ae108878ae42ad84468a0552acd2c5569f8932f4230e7154dae8b2aa8a0b9bc",
    "designId": "cargo.vacuum.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.43050000071525574,
        -0.7639999985694885,
        0
      ],
      "max": [
        0.43050000071525574,
        0.6000000238418579,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a09eeadccb5c9982cac6",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-a09eeadccb5c9982cac6/glb.glb",
    "sha256": "5d8c3aab6482782cbfbac5cf0cc6f5d11fd2946e89613f5afc2d7d37e6c98bf1",
    "designId": "cargo.salvage.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.6704999804496765,
        -1.0325000286102295,
        0
      ],
      "max": [
        0.6704999804496765,
        0.8999999761581421,
        1.2540000677108765
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b2141c33d215edfc9f69",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-b2141c33d215edfc9f69/glb.glb",
    "sha256": "df714234a94dd90e898e2568289f8d254f79d1eb8384cadc66f0c494a10c6891",
    "designId": "cargo.salvage.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.6704999804496765,
        -1.0325000286102295,
        0
      ],
      "max": [
        0.6704999804496765,
        0.8999999761581421,
        1.2540000677108765
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5ec11cd63618cfba9ee6",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-5ec11cd63618cfba9ee6/glb.glb",
    "sha256": "ea53a010cc578989dd6f6e7a274cc3a928116eaa9f842ff706770f52fb92f090",
    "designId": "cargo.salvage.large",
    "revision": 2,
    "bounds": {
      "min": [
        -0.6704999804496765,
        -1.0325000286102295,
        0
      ],
      "max": [
        0.6704999804496765,
        0.8999999761581421,
        1.2540000677108765
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0c13b0afa67118c11465",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-0c13b0afa67118c11465/glb.glb",
    "sha256": "30adaac760feaf192873f432b87ffe7655565947d35e0858d257a8fbe537dbc7",
    "designId": "cargo.medical.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.28049999475479126,
        0
      ],
      "max": [
        0.3305000066757202,
        0.20500001311302185,
        0.3915000259876251
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-75a256627549b94938af",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-75a256627549b94938af/glb.glb",
    "sha256": "313c58343a48b364378fc40fa89f87db0f012ab194ee9b24f19949290a4a8bc1",
    "designId": "cargo.medical.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.28049999475479126,
        0
      ],
      "max": [
        0.3305000066757202,
        0.20500001311302185,
        0.3915000259876251
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-70124a17eeed22f9fdf8",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-70124a17eeed22f9fdf8/glb.glb",
    "sha256": "597dd4786249d9c853901d07791e9525c6fc8bc7106b57573a2f4b6582411211",
    "designId": "cargo.medical.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.28049999475479126,
        0
      ],
      "max": [
        0.3305000066757202,
        0.20500001311302185,
        0.3915000259876251
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-41d39cecfe513b1a0885",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-41d39cecfe513b1a0885/glb.glb",
    "sha256": "153c745e10390599a7bbd372bca850e466a3524bc4b0056083bc487e22fcced9",
    "designId": "cargo.high-value.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.4104999899864197,
        0
      ],
      "max": [
        0.3305000066757202,
        0.24500000476837158,
        0.4714999794960022
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-47640f88de2e1065b623",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-47640f88de2e1065b623/glb.glb",
    "sha256": "bd671de55b8c0b1e97012cbd53996388cef0b5d49a522896f3613c5c2ab7a879",
    "designId": "cargo.high-value.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.4104999899864197,
        0
      ],
      "max": [
        0.3305000066757202,
        0.24500000476837158,
        0.4714999794960022
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0fbeb32a435ded59a627",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-0fbeb32a435ded59a627/glb.glb",
    "sha256": "8fe6602f055114b8c30c36672c9e1e7807b3aec96f2d694b98b7cedc62ad6547",
    "designId": "cargo.high-value.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.4104999899864197,
        0
      ],
      "max": [
        0.3305000066757202,
        0.24500000476837158,
        0.4714999794960022
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b447c4118a56a63180a8",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-b447c4118a56a63180a8/glb.glb",
    "sha256": "9491b1f773ae848b2c5d3f434ae4da4d56f2a627bc739350070493e8a5e91646",
    "designId": "cargo.fluid.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.43050000071525574,
        -0.5800000429153442,
        0
      ],
      "max": [
        0.43050000071525574,
        0.5800000429153442,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e9c7d5963786d1fec3e3",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-e9c7d5963786d1fec3e3/glb.glb",
    "sha256": "87c6c3b90dc447e6fd0bf18d6fc346bd6f15a334e80100364253bd97f5cbdf14",
    "designId": "cargo.fluid.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.43050000071525574,
        -0.5800000429153442,
        0
      ],
      "max": [
        0.43050000071525574,
        0.5800000429153442,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-d0db8fa035dfee89aab0",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-d0db8fa035dfee89aab0/glb.glb",
    "sha256": "186d101731c12f314cd7f5fbc324ba59519272fea1cd74a2073a7133c817f00b",
    "designId": "cargo.fluid.medium",
    "revision": 2,
    "bounds": {
      "min": [
        -0.4490000009536743,
        -0.5800000429153442,
        0
      ],
      "max": [
        0.4490000009536743,
        0.5800000429153442,
        0.6800000071525574
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5382f8dbbeb54e663d33",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-5382f8dbbeb54e663d33/glb.glb",
    "sha256": "9c3e1914626d0149e298d7cdcfe70fe88c64f68df36a761994f4f9dc97453cd6",
    "designId": "cargo.standard.small",
    "revision": 3,
    "bounds": {
      "min": [
        -0.3305000066757202,
        -0.28049999475479126,
        0
      ],
      "max": [
        0.3305000066757202,
        0.20500001311302185,
        0.5114999413490295
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0e982ae6b34746506f67",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-0e982ae6b34746506f67/glb.glb",
    "sha256": "2219fbab29ca11caeda8036cdf4727af9bc072db6c9071a633de2682cdaaf010",
    "designId": "cargo.standard.medium",
    "revision": 3,
    "bounds": {
      "min": [
        -0.5304999947547913,
        -0.4505000114440918,
        0
      ],
      "max": [
        0.5304999947547913,
        0.34584999084472656,
        0.9514999985694885
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5d5d4a34049e170b1040",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-5d5d4a34049e170b1040/glb.glb",
    "sha256": "cd894cff32132f45da2073749af3f79dab0d285ef5eb05567aa751b24711e611",
    "designId": "cargo.fluid-cryo.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.3400000035762787,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.3400000035762787,
        0.3400000035762787,
        1.3600000143051147
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5d103ad6aa3172180976",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-5d103ad6aa3172180976/glb.glb",
    "sha256": "1b19771dd577a05f23ff65f1feca4f39946e8ad0cf4c42b35b51d7320f6dd435",
    "designId": "cargo.fluid-cryo.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.3400000035762787,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.3400000035762787,
        0.3400000035762787,
        1.3600000143051147
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-8f848965775db332ad3b",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-8f848965775db332ad3b/glb.glb",
    "sha256": "77e593e7453f0b0c16d3b61c6cbcdd6c7be53fb86fef0fe04a88ba8110033c47",
    "designId": "cargo.fluid-cryo.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.3400000035762787,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.3400000035762787,
        0.3400000035762787,
        1.3600000143051147
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-e8b348082816c379c3ad",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-e8b348082816c379c3ad/glb.glb",
    "sha256": "583a056b96b1459e3861eba33f46c52327a1ac5eb127ec80a5aa754598bf1db5",
    "designId": "cargo.fluid-cryo.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.3400000035762787,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.3400000035762787,
        0.3400000035762787,
        1.3600000143051147
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-3cc2aaa47b61c3695a01",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-3cc2aaa47b61c3695a01/glb.glb",
    "sha256": "88b545da34d02be1a0697e4a61949e4ab073191eeb2bd599425c5a98549dae64",
    "designId": "cargo.fluid-fuel.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.2760000228881836,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.2760000228881836,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-ff4c81d16308982b5556",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-ff4c81d16308982b5556/glb.glb",
    "sha256": "b08fd66f120a2bca68053a75cc4f295e2513ca0ad8bbfde41fd8a4e16926c0a2",
    "designId": "cargo.fluid-fuel.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.2760000228881836,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.2760000228881836,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-8963649e2154815c6e0a",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-8963649e2154815c6e0a/glb.glb",
    "sha256": "60bacc18625011c465412692f01611064dd79e413a2224ea78b20548048779cf",
    "designId": "cargo.fluid-fuel.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.2760000228881836,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.2760000228881836,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-355fd132ec5fadfb1f66",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-355fd132ec5fadfb1f66/glb.glb",
    "sha256": "6323a87028232d82ee01a7f350ba478659794024d4149f76a1d3ff9c168a095d",
    "designId": "cargo.fluid-fuel.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.2760000228881836,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.2760000228881836,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-0f76eb112155db5b4e8b",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-0f76eb112155db5b4e8b/glb.glb",
    "sha256": "eb59a94d0bd940d80736d002acd896c4653514c625032c93fe4f68cf7a400e0d",
    "designId": "cargo.fluid-chemical.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.27399998903274536,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.27399998903274536,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-84891c854514b15139aa",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-84891c854514b15139aa/glb.glb",
    "sha256": "73c3930e2deda3541bcc5046c760ba0729cbca998a27eb5784a0aceed16fc05f",
    "designId": "cargo.fluid-chemical.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.27399998903274536,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.27399998903274536,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-b215126fd8b9f5447d00",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-b215126fd8b9f5447d00/glb.glb",
    "sha256": "edcab4ad0d252c3f05823cab7489c3c6b0ac0fa38b4539e06009a4f1a5f3f7f1",
    "designId": "cargo.fluid-chemical.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.27399998903274536,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.27399998903274536,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-5377949ed91bc9fc3973",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-5377949ed91bc9fc3973/glb.glb",
    "sha256": "152c548e2fcefc35a11fe7dc99ebb9405014c986ef90635cd835717fade2bf25",
    "designId": "cargo.fluid-chemical.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.27399998903274536,
        -0.27399998903274536,
        0
      ],
      "max": [
        0.27399998903274536,
        0.27399998903274536,
        0.8639999628067017
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-8bcf56f5a154cbb954de",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-8bcf56f5a154cbb954de/glb.glb",
    "sha256": "3a00c3838ead1c808c70e4fb1b1832bfc8945ae18ce7588a402866f70f6dad13",
    "designId": "cargo.fluid-gas.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.8999999761581421
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-74fd36d0f31a11c97535",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-74fd36d0f31a11c97535/glb.glb",
    "sha256": "bd4daafa7b5a43ac052a526f9efdf14453c895bb8692e47fd31585a0eb4a98a3",
    "designId": "cargo.fluid-gas.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.8999999761581421
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-96aa76d51e89c5278c25",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-96aa76d51e89c5278c25/glb.glb",
    "sha256": "8a0a7f8a075c2aabfc2dd8c01786afb88ac314ecb3bcc28ed569c3ee787bc677",
    "designId": "cargo.fluid-gas.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.8999999761581421
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a8c9ac9eb43a547c76a7",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-a8c9ac9eb43a547c76a7/glb.glb",
    "sha256": "40042759b8028894914c0edb6c30ad2d68e01e208da6c02b6a3a55bc41257ea0",
    "designId": "cargo.fluid-gas.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3400000035762787,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.8999999761581421
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-38b95e9ee2941d12d072",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-38b95e9ee2941d12d072/glb.glb",
    "sha256": "3c64e8b882606fa0131f0da467a0cdcf44af0f299262805a2bed5fc9fac877ca",
    "designId": "cargo.fluid-water.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3490000069141388,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.9070000052452087
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-2b4c94f694595ac8fd1d",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-2b4c94f694595ac8fd1d/glb.glb",
    "sha256": "5deea8cf44e1a75776dc388207f034fbbd61fe6fe4eb7b73f8ea888b476484bb",
    "designId": "cargo.fluid-water.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3490000069141388,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.9070000052452087
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-7858296690991b13320c",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-7858296690991b13320c/glb.glb",
    "sha256": "6b3c29b0472a072325cf72a1c138e6585b7b287cff1df124a5adbcb887b2571b",
    "designId": "cargo.fluid-water.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3490000069141388,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.9070000052452087
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-9d84eacfac58c57c012b",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-9d84eacfac58c57c012b/glb.glb",
    "sha256": "a95d0bcdb784c857be886a9437c788c5d4785179eb8de6733c041b9cc25f2d09",
    "designId": "cargo.fluid-water.medium",
    "revision": 1,
    "bounds": {
      "min": [
        -0.4399999976158142,
        -0.3490000069141388,
        0
      ],
      "max": [
        0.4399999976158142,
        0.3400000035762787,
        0.9070000052452087
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-091a05481726fc7ccac0",
    "field": "visual",
    "url": "/assets/assembly/cargo/part-091a05481726fc7ccac0/glb.glb",
    "sha256": "7a7ba27e84e4895e4b801c5fc578a1936620bfd14533fe4195218b76d016578c",
    "designId": "cargo.standard.narrow",
    "revision": 1,
    "bounds": {
      "min": [
        -0.12099999934434891,
        -0.12399999797344208,
        0
      ],
      "max": [
        0.12099999934434891,
        0.12700000405311584,
        0.44200000166893005
      ]
    },
    "damagePreview": "unsupported"
  },
  {
    "assetId": "part-a3f5c1c3caa171a94d6c",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        2,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-a3f5c1c3caa171a94d6c--floor"
  },
  {
    "assetId": "part-926a2afada18f96d51a3",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        1,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-926a2afada18f96d51a3--floor"
  },
  {
    "assetId": "part-0b833a4f3016609e9b96",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        1,
        1,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-0b833a4f3016609e9b96--floor"
  },
  {
    "assetId": "part-baa2e4a6cbe886a5c292",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        4,
        1,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-baa2e4a6cbe886a5c292--floor"
  },
  {
    "assetId": "part-771cc318e835d7a08abd",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        1.998000144958496,
        1.998000144958496,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-771cc318e835d7a08abd--floor"
  },
  {
    "assetId": "part-79328356071c674a2c8b",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        3.9977800846099854,
        1.998445987701416,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-79328356071c674a2c8b--floor"
  },
  {
    "assetId": "part-e0dde5e97e9bed05b4b6",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0.0022194599732756615,
        0,
        0
      ],
      "max": [
        4,
        1.9984462261199951,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-e0dde5e97e9bed05b4b6--floor"
  },
  {
    "assetId": "part-cf72797120e52d05662c",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        3.997692108154297,
        0.9990298748016357,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-cf72797120e52d05662c--floor"
  },
  {
    "assetId": "part-e315cf681838afff216e",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0.002308165654540062,
        0,
        0
      ],
      "max": [
        4,
        0.9990298748016357,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-e315cf681838afff216e--floor"
  },
  {
    "assetId": "part-94474fb38b16d77e6429",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        2,
        2,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-94474fb38b16d77e6429--floor"
  },
  {
    "assetId": "part-73f48194371a682af29c",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0.0004961389931850135,
        0,
        0
      ],
      "max": [
        1.9995038509368896,
        4,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-73f48194371a682af29c--floor"
  },
  {
    "assetId": "part-7902f7617fb23eb8abe3",
    "field": "visual",
    "url": "/assets/assembly/floor/r002/kit.glb",
    "sha256": "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
    "designId": "shipyard.floor.mapped-deck-kit",
    "revision": 2,
    "bounds": {
      "min": [
        0,
        0,
        0
      ],
      "max": [
        0.9980000257492065,
        0.9980000257492065,
        0.1875
      ]
    },
    "damagePreview": "unsupported",
    "nodePrefix": "GEO-part-7902f7617fb23eb8abe3--floor"
  }
]
```


## Reviewed source hashes for independent B1 primitive

- `packages/content/src/placement-orientation.ts` SHA-256 `9cd538144aa812bf4a659cfb437825f1827ca1c42588492e6d9f9e3ae07f5f89`.
- `packages/content/src/placement-orientation.test.ts` SHA-256 `727ed78b8553d37d5c60f79a96303ff5c798524ad0ba86e028c3c374ab9ab690`.

Isolated full `npm run build` passed (world, generated bindings, client, dashboard); existing large-chunk advisory only. Initial isolated build omitted docs/public due to snapshot filtering; corrected snapshot and full build rerun passed. No shared generated bindings were rewritten. New helper files pass Prettier and ESLint. Final aggregate validation passed with bounded concurrency; see Latest check-in status.

## B1 continuation: explicit orientation migration review

Previous goal turn classified as progress (baseline, source audit, tested primitives). Owner decisions remain pending. Root owns new `packages/sim/src/layout-orientation-migration.ts` and its tests, plus the narrow package subpath exports for the orientation primitive/review. This read-only migration review preserves raw input and classifies exact versus proposed transforms, reports bounding-envelope displacement and missing catalog pins, and never applies a draft/runtime edit. Existing readers/validators remain unchanged.

`authority_audit` is assigned a read-only review of the new orientation migration module/test for byte preservation, pinned catalog handling, frame errors and qualification overclaims. It owns no edits. Root retains all implementation files.

## B1 migration review implementation and native evidence

`reviewLayoutOrientations` is exported from `@sidereal/sim/layout-orientation-migration`; finite primitives are exported from `@sidereal/content/placement-orientation`. The API returns a versioned review, retaining exact original source text and SHA-256, per-placement exact/conversion-required/unresolved classification, explicit legacy frame, finite yaw and integer anchor proposal, angular/origin deltas and maximum eight-corner native bounding-envelope displacement. No apply operation, v2 runtime admission or automatic draft migration is introduced.

Native source audit: all 262 current Wayfarer placements are mathematically representable without substantive movement; maximum encoding difference 2.220446049250313e-16 m. The imported review document has source SHA-256 `86d8d776236b11b4bc9cbe61db21626097e2d4d64a9321978c805855b9d31a52`; exact evidence is `.runtime/shipyard-completion/b1-native-orientation-review.json`. This is an imported inspection document hash, not the canonical starter blueprint pin. Every entry explicitly records qualification as not evaluated; mathematical representation grants no collision, support, mount or pressure approval.

Independent review found and resolved missing proxy revision checks and malformed fitting-bound crashes. Tests preserve unknown-schema/malformed input bytes, reject stale primary/proxy dependencies, retain semantic anchors for non-lattice model bounds, measure asymmetric mirrored displacement, and audit the actual native 262-placement source. Missing dependency pins remain rejected by unchanged v1 admission. All 13 focused orientation/migration tests pass.

The initial and final `npm run check` runs for this continuation passed. The final count and full build result are recorded below. Scoped ESLint passed. Build uses a fresh isolated candidate `.runtime/shipyard-completion/b1-candidate`, whose 1,360-file source manifest has SHA-256 `2d38eb32d43b1307c7d1df8d16116d10e0408b2aaec7cca5018a9cd1cd26c36d`. The earlier phase0 candidate remains intact.

Native work still awaits the pending owner decisions. No new UI, art, live state, schema registration, generated bindings or release activation was changed. Contract B remains incomplete until v2 document/placement validation, migration confirmation/recovery and editor-to-game roundtrips are implemented and evidenced.

- `packages/sim/src/layout-orientation-migration.ts` SHA-256 `a052a596977f9c8dfa376aeef3c7181cb11abe98131c0c677eae626e809cb618`.
- `packages/sim/src/layout-orientation-migration.test.ts` SHA-256 `43a275a38add45cb72e9f9ffe6cc9964f6a72d818aee81442b72e6a65822f2c7`.
- `packages/content/package.json` SHA-256 `3d08a50daac5574739f7321cc394959e30b962bcd01ce8623b760be4e51dbd63`.
- `packages/sim/package.json` SHA-256 `ed1240021916e88cc4720bb17692f8e4466c553f2bbfa06671841612fb0c716f`.

## B1 continuation final validation

`npm run check` passed 1,565 tests across 277 files, typecheck and 78 document checks. Isolated full `npm run build` passed, with existing large-chunk advisory only; log `.runtime/shipyard-completion/b1-migration-build.log`. The new review path remains unintegrated into UI/authority and is not a completed contract.

Owner wall correction arrived after this build. Updated the outcome contract and existing tileset contract with the explicit superseding direction while preserving their historical text. No native source or runtime changed. The next native gate awaits the revised vertical decision; inward wall thickness and fixed outer tile plane are now decided. Quarter/half/three-quarter heights are recorded as the owner's requested design direction, with exact datums still pending.

Isolated world bundle comparison: byte-identical to the earlier phase0 source build. No authoritative integration change was activated. Brief now points to the owner wall override as well as the plan.

## A1 continuation: decided inward-wall contract

Previous goal turn was progress: implemented/tested migration review and recorded the owner wall override. Root now owns the additive wall-convention export in `packages/content/src/tileset-interfaces.ts`, new `packages/sim/src/tile-wall-reservation.ts` and tests, and generated `docs/ship_tileset_authoring_requirements.md` with its generator. This extends the existing lattice/interface contract. Wall thickness is owner-decided 8 units inward; vertical datums are required inputs, not assumed approval. No native revisions or existing fixture validators change.

## Owner vertical freeze — 2026-09-11

Owner explicitly confirmed: “I concur with those dimentions, lock them in.” Standard deck is now frozen: 3.5 m pitch = 0.1875 m floor + 3 m clear height + 0.125 m roof + 0.1875 m service void. Standard wall heights are 0.75, 1.5, 2.25 and 3 m. Owner additionally requires support for explicitly shorter deck/space profiles (service vents, joining bridges, small fighters). This is a dimensional/planning requirement, not proof of new crawling/seated traversal behavior.

Root generated the first exact straight-wall request from the existing tileset interface contract: `packages/content/src/ship-tileset-wall-spec.v1.json`, SHA-256 `c7c8fadc1f6a33f2f4a0338902f3c84e85040f7689dda67b9736d3040b3d89d2`; guide `docs/ship_tileset_authoring_requirements.md`. Eight variants: 1/2 m runs × 0.75/1.5/2.25/3 m height. Body X0…length, Y0…0.25 inward, local Z0…height; origin outer-edge start at bottom, standard placement Z0.1875. This is a narrow initial native request, not the full A conformance suite.

### Assigned native author ownership (before start)

`inset_wall_author` exclusively owns new `assets/art-library/designs/shipyard.structure.inset-boundary-wall/` (new design, first revision r000) and `scripts/art_library/build_inset_boundary_wall.py`. Task: author the eight straight height variants against the exact request hash, preserving material/source references, editable blend, GLB, separate interface/proxy metadata, hashes, native renders and all-node containment. It may update only its own design ledger; root owns global art index/catalog/spec integration. No deployed runtime assets, shared catalogs, schema/bindings or live state changes. No final art approval. Any spec mismatch returns to root before changing dimensions.

## Resume file ownership

Root owns the shared boundary-treatment contract and integration. `inset_wall_author` assignment above is now authorized to start against spec SHA c7c8fadc1f6a33f2f4a0338902f3c84e85040f7689dda67b9736d3040b3d89d2. Root additionally owns `packages/content/src/layout-boundary-treatments.ts`, focused shared resolution/validation modules and tests under packages/sim, and integration into the existing structure contract. Schema registration/generated bindings/catalog activation remain root-only. No agent may modify those files or deploy independently.

## Boundary-treatment integration ownership and review

Root owns the opt-in structural v2 content/admission/resolver and narrow treatment guards in `layout-native-walls.ts` / `layout-structural-guides.ts`. Existing rendering work remains owned by its original authors. Durable construction draft reading may preserve the new intent, but publication/installation must reject it until qualified native adapters exist; a native reference never supplies client-authored physical truth.

`authority_audit` is assigned a read-only review of this v2 admission/resolution/publication boundary and its focused tests. No shared-file edits, runtime mutation or publication are delegated.


## Current verified checkpoint — boundary-treatment contract, 2026-09-11

- Owner decisions now locked: floor-derived boundary treatments, 250 mm inward walls, 3 m clear height, 3.5 m standard pitch with 6/96/4/6 lattice-unit components, and explicit smaller-space profiles. Reference section 31 outward treatment is superseded. Preserve current Wayfarer footprint/native/collision revisions until D; no new hull class or numeric overhang allowance has been invented. Final artistic approval and incompatible schema changes still require explicit owner decisions.
- Added opt-in structural v2 authored intent, exact source/span treatment matching, conflict/orphan diagnostics, bounded interval work, explicit deck profiles and convex navigation reservations. Physics flags supplied as client JSON are rejected. Reservations cannot occupy an empty floor hole, even when their edges coincide with its boundary. Existing v1 canonical starter SHA remains unchanged.
- Existing construction draft storage can preserve v2. Installation/publication rejects v2 until qualified native adapters exist. Legacy r004 wall previews cannot silently substitute for new treatments. This is partial B contract integration, not a completed editor or gameplay path. Existing minimum ceiling admission remains 1 m measured from deck bottom; smaller authored profiles below that need an explicit versioned admission decision/qualification rather than silently weakening v1.
- Combined `npm run check` passed 1,580 tests / 279 files, typecheck and 79 document/provenance checks. Isolated `npm run build` passed; existing chunk advisories. Initial source manifest: 1,369 files, SHA `a13263fb3d87e5aad6b1f37977511769f3b8f1d3f65971f43bb34a87110a50fa`, at `.runtime/shipyard-completion/boundary-candidate`. Latest extraction of the existing exact segment-support helper into geometry removes a newly introduced import cycle; final candidate refresh/check remains required after that extraction.
- Exact initial candidate world bundle `08a0f5518a165764eb9808787c341d2d244f3910814e9aceea4ff6c07a02c764` passed fresh isolated authority smoke on `sidereal-spacetime-dev-shipyard-boundary-r0001-smoke`; no normal DB reset/restart/publication. Smoke covers authority/privacy, movement, inventory/equipment, interaction/combat and construction denial regressions. It is not generic v2 construction or restart proof.
- Browser contract evidence: dedicated collaborative hardware tab `tab_f` on https://sidereal.tail7a58a6.ts.net:8445/shipyard imported and reopened a v2 2 × 2 m floor, full standard deck profile, 2.25 m glazed-bow intent and separate bow-clearance reservation, with zero compiler errors and native legacy-wall fallback withheld. Screenshots: `output/playwright/shipyard-boundary/import-v2.png`, `reopened-v2-3d.png`. Application/package source matched the isolated candidate; only the active native builder changed during capture. Imported draft received its own UUID and did not overwrite another draft. Tab is verified blank. Existing software browser sessions were inspected read-only and left untouched; their slot was not taken.
- Native straight family current study r005: eight 1/2 m × quarter-height pieces; editable blend `ace164e457aa433cc161f318c09f627ae0633c542d41f7d384c5b976707e4b4a`. Eight GLBs byte-identical to r004; all-node containment, manifold, material/roughness/normal checks pass. Root inspected full-height joined two1m and equivalent2m opaque captures. r000–r004 preserved. The earlier transparent joined capture displayed blank to root but was not reproducibly empty; r005 removes display ambiguity. **Unapproved**, not installed, browser/game native evidence pending.
- Source/native logs are in `.runtime/shipyard-completion/boundary-*.log`; art ledger remains under the new design. Shared index regeneration includes current ledgers without replacing other owners' source art.
- Remaining A families: join/end/corner/diagonal/T/cross profiles, matching roof reservation, glazed/sill/door/airlock interfaces and assembled conformance fixtures. Remaining B: treatment/deck/clearance editing, full finite-orientation persistence/integration and qualified publish/spawn. No A/B/C1 exit gate or minimum viable completion claim; no C2–C4/D work started. Normal game and player state remain unchanged by this work; no live conservation comparison or F3 acceptance claimed.

## Assigned native roof companion ownership

`inset_wall_author` resumes with exclusive NEW `assets/art-library/designs/shipyard.structure.roof125/` and `scripts/art_library/build_roof125.py`. Root owns `scripts/generate_ship_tileset_roof_spec.ts` / `packages/content/src/ship-tileset-roof-spec.v1.json`, generated from the approved dimensional constant and exact existing twelve floor footprints. The complete roof extrusion is 4 lattice units (0.125 m), origin at underside, standard placement at 102 units; all visual trim stays inside. Existing r001 roof includes a six-unit visual envelope and is not silently squeezed into this new reservation. Author preserves and adapts native Blender references; no live catalogs, runtime assets, bindings, renderer or schema edits delegated. All new roof art remains unapproved.

`orientation_audit` is assigned a bounded read-only junction-geometry review: derive compatible inward250 corner/end-cut reservations for the existing twelve floor footprints and explicitly centered internal T/cross reservations. It owns no files and cannot freeze dimensions, author native meshes or publish. Root will turn reviewed math into the next shared versioned request before assigning a junction author.

## Assigned convex boundary native ownership

`orientation_audit` may now author exclusively NEW `assets/art-library/designs/shipyard.structure.convex-inset-boundary/` and `scripts/art_library/build_convex_inset_boundary.py`, after completing its read-only math review. Root's frozen shared request is `packages/content/src/ship-tileset-corner-spec.v1.json`, SHA `3c94dbaba8dfa33c466c23eb83b6b2a10637d27683b8ce055327000e94be2ac4`, with 37 reusable corner/residual-span profiles and twelve standalone floor-loop fixtures. All cutbacks are derived from the 250 mm inward offset intersection and rounded upward along the ray to 1/32 m; no floor edge is moved. Small acute tips retain positive residuals. Root audited all nominal profile vertices inside their floor polygons; full native face containment, disjointness and closure remain the author's required evidence. Concave unions/internal junctions/openings remain separate, unsupported families. Only root may update shared catalogs/specs/bindings or publish.


## Subsequent source and native validation notes

The second default-worker combined check hit the previously observed planet-terrain 20-second timeout during concurrent native rendering (1,584 passed, one timeout). All 1,585 tests then passed with two workers. Installed Vitest supports `VITEST_MAX_WORKERS`; subsequent combined checks use this concurrency control without changing test tolerances or repository configuration.

Root additionally fixed the legacy semantic fitting edit path to reject unrepresentable yaw, sub-lattice translation and ignored vertical movement instead of silently rounding/discarding them. Assembly mismatch checks now include the secondary fitting-proxy pin. Focused migration/edit tests passed15. Whole-body inward-wall intrusion checks passed4, including a6.25cm-snap body whose origin clears the wall but near face intrudes, rotated corners and exact top contact. These guards are not yet the complete finite-yaw editor/publish path.

The resolver now also bounds source-coverage scans and diagnostic output, alongside interval/output/navigation work. The exact segment support routine moved unchanged into geometry with its old compiler re-export retained; the introduced runtime import cycle is removed.

Roof125 r000 is delivered at `assets/art-library/designs/shipyard.structure.roof125/revisions/r000/`, source blend SHA `419a617a17a77b471190a1cfccbaab14d24fdaa78786363620828ddd95e9aa6c`:12 GLBs,42 opaque captures, all-node polygon/height containment and material checks, three complete seam contact checks with1mm gap rejection. Root inspected underside-square-2m. Art remains unapproved and installation/browsers/game pending. Convex corner authoring is ongoing against the separately pinned37-profile request.

Read-only module-byte queries confirm normal world remains `8afe80944ba6aaf47f997f8b1de2736d2b88568c1f3cf44753a54ecb82f9fe9a`, and the first isolated smoke world exactly equals candidate `08a0f5518a165764eb9808787c341d2d244f3910814e9aceea4ff6c07a02c764`. Normal client remains `c2cb7dad161399f307b169347313a9c5e01748e5109cbfaeec9361a87eb6d03e`. Latest source edits require refreshed final candidate/check/browser evidence before any later gate claim.

## Assigned explicitly centered internal native ownership

`inset_wall_author` next owns exclusively NEW `assets/art-library/designs/shipyard.structure.internal250/` and `scripts/art_library/build_internal250.py`. Root owns the shared generated internal request/guide. This is an explicitly centered internal partition family, not a change to the inward exterior convention: ±125mm body, one250mm square orthogonal core,125mm branch cuts, endpoint caps that stop at the authored endpoint. Reusable cap/core and six residual straight lengths cover the requested1m/2m capped, corner, T and cross fixtures at four heights. Left/right unilateral reservations, exterior ties and angled internal junctions remain separate. No existing wall/roof sources, shared catalogs/bindings or runtime assets are delegated.

Root owns `scripts/shipyard_native_boundary_review.ts`, `scripts/build_shipyard_native_boundary_review.py` and NEW `assets/art-library/shipyard-completion/native-r000/` for a source-pinned Babylon assembly review on the existing configured art-library server. This is an explicit authoring-review artifact; it does not install runtime assets or grant physical qualification. Existing dashboard FS denials remain unchanged. Hardware tab `tab_f` can access configured art-review port5175 through the collaborative environment target; directLAN10.0.1.200 timed out and was not used further.

## Native assembly review design

The review page puts the actual assembled floor and inward wall silhouette first, with one left-aligned control strip for footprint, wall height and roof visibility. Palette: slate canvas #263747, pale enamel text #e5ebe8, blue-grey controls #405466, cyan focus #74cbd0 and burgundy warning #b77d8a; these echo the native material roles. System humanist sans typography keeps controls quiet. Layout: `[title + status] / [footprint | height | roof | view] / [large native viewport] / [collapsed source pins]`. No animation or unrelated product navigation. Critique: a generic metric-card dashboard would obscure the geometry; remove those cards and keep the full silhouette as the defining visual. Technical pins belong in expandable evidence because this is an authoring review, not gameplay UI.

Convex r004 delivery:148GLBs/48loops, source704b7d2717fde79f507f0e584148b98f591141bbdd40573512ed35e8b1eb5860; internal250 r000:32GLBs/20fixtures/88contacts, source880cb9d6b6a9a495e993504f276dca432e4c821818038e1a425f02e9c2b0fc1e. Authors report strict native gates passed with existing tolerances unchanged. Root browser/assembly inspection follows; neither family is approved or installed.

`orientation_audit` receives a bounded read-only follow-up on remaining A geometry: derive concave inward boundary and exterior-to-centered-internal T contact reservations for unions of the existing fixed floor polygons. It may inspect native delivered interfaces and propose exact profiles, residual lengths, failure cases and qualification fixtures, but owns no new files and may not freeze dimensions or author pieces. Root continues browser evidence and shared contract integration.

The browser loaded all48 convex wall-loop height/footprint combinations with verified GLB hashes. Actual square full/quarter, square roof and slim-triangle roof captures were inspected; r001 review bundles the authoring-review sources, and its compiledJS is byte-identical to r000 (SHA3db0cf5720d3ae7597ea309c68ecfd2a79e180c2ac75121288504a8d78fe67d8). Review URL is configured port5175 `/shipyard-completion/native-r001/`; native floor remainsr002, convexr004, roofr000. Evidence is `output/playwright/shipyard-native/`. This is not game/F3/pressure qualification. Combinedcheck passed1587tests281files/typecheck82docs before the subsequent explicit-partition-side change; focused boundarytests10 pass after it.

Internal v2 treatment intent now optionally records left/right/center relative to authored endpoints. Missing physical side on a non-open partition is a compiler error, with source preserved. Resolved left/right flips when span direction reverses, so geometry stays on the same physical side; perimeter overrides cannot supply this field. Explicit centered native internal250 remains the only authored internal family; unilateral choices do not gain qualification.

Root next owns `scripts/generate_ship_tileset_union_junction_spec.ts`, `packages/content/src/ship-tileset-union-junction-spec.v1.json` and its generated guide. Frozen dimensions remain unchanged. Read-only audit confirms ordinary recessed panel sides cannot provide full T contacts: dedicated concave90/exterior-T connectors and four centered residual spans are required. `inset_wall_author` will own only NEW `assets/art-library/designs/shipyard.structure.union-junction250/` and `scripts/art_library/build_union_junction250.py` after root emits the exact request hash. No shared catalog/schema/runtime/bindings ownership is delegated.

Union-junction request is now frozen at SHA46b06de54bfd81993716e0acea0d840ded94a6bcf45a0cc13a610ba0bddac6c4. It pins every retained GLB dependency and supplies all piece transforms for five fixtures: concave L, opposing exterior Ts at1/2m, capped inward branches at1/2m. Root exact cardinal cell-arrangement audit proves nominal expected wall-band/internal union coverage with no duplicate area for all five; actual native export/contact/transformed checks remain the author task. No validator tolerance changed.

`authority_audit` receives a read-only follow-up of the latest explicit partition-side semantic change and its publication guard. It owns no files. Review source/direction normalization, malformed input and old v1 preservation; report concrete findings while root refreshes candidate validation.

`orientation_audit` next performs a read-only native door/glazing dependency inventory: exact current door/frame/opening datums, animated swept volumes, existing qualified adapters and native glass material sources relevant to new inward250 standard-height openings. It may recommend reuse versus explicitly new families but owns no files and cannot freeze new dimensions. This prepares the remaining A opening/glazing request while root handles B validation.

`authority_audit` may now implement a bounded presentational v2 boundary-treatment editor, exclusively NEW `apps/dashboard/src/shipyard/layout/BoundaryTreatmentPanel.tsx`. Root owns shared pure edit functions, existing inspector wiring, schema, tests and browser acceptance. Component accepts the selected resolved wall, deck clear height, current override and a typed patch callback; edits treatment, height and explicit internal side. It does not infer physical qualification or modify source directly. Use existing editor controls/styles; read React performance skill. No unrelated inspector redesign, authority or publication.

Root owns NEW `apps/dashboard/src/shipyard/layout/boundary-treatment-edits.ts` and focused tests plus the narrow v2 inspector wiring in existing `LayoutInspector.tsx`. Changes use normal `commit` history/storage; retained v1 drafts are not silently converted. Native pins in authored overrides remain preserved and unqualified until a matching adapter checks them.

The inspector's v2 selection now resolves exact compiled spans and exposes treatment, quarter/full height and explicit internal side through normal commit/history. Existing overrides edit their authored span (stated in UI); partial split selection is explicit. Native pins remain retained/unqualified. The v2 palette/selection copy now says floor-generated boundaries rather than automatic opaque walls. Root owns these narrow `LayoutPalette.tsx` text changes too. Focused edit tests3, typecheck and scoped lint pass. Browser changed cockpit-glass height72→48 and Undo returned72 without errors; reopen/redo checks continue.

Fresh `boundary-native-candidate` snapshot has1,385files, source-manifest SHAfa203093c4ec334d163e2f37406e3eb4e1c267415897770337f33d7c3468cc24. Full build passed. First check passed1588tests but snapshot omitted linked ops/output inputs needed by docs; supplying the unchanged inputs fixed it, and rerun combinedcheck passed1588tests281files/typecheck83docs. Fresh isolated smoke DBsidereal-spacetime-dev-shipyard-native-r0001-smoke ran; final result/pins will be recorded after completion. This snapshot precedes inspector UI edits; no claim that its UI build includes those later files.

Root extends existing `panel-deletion.ts` narrowly so explicitly deleting an internal partition also removes its attached v2 treatment overrides in the same undoable checkpoint. Keyboard/toolbar deletion already delegates to this helper. Exterior attachments remain preserved for explicit remapping after floor edits; no unrelated authored data is cleaned up.

Root next owns `scripts/generate_ship_tileset_window_spec.ts`, `packages/content/src/ship-tileset-window-spec.v1.json` and generated window guide. `orientation_audit` will own only NEW `assets/art-library/designs/shipyard.structure.window250/` and `scripts/art_library/build_window250.py` once that request is pinned. This is a new straight fixed-window study within the approved inward250/full3m reservation, not a substitute for the retained swept Wayfarer canopy. No new pressure/material-strength rating or art approval is implied.

Internal inspector browser evidence: dedicated imported draftd4f03280-feeb-4f0f-85a5-d79e307e6e2d initially reports missing physical side; selectingcenter clears that error and reload preserves treatment33ca4303-b1ef-42af-a918-341d7d221359 and exact partition endpoints. No normal player data changed. `boundary-inspector-candidate`1,391-file manifest SHA6c7bc2157dbf9dfeaf1dd34e06cfbdb67fc28622cc07c9524406de4e3783a27b; combinedcheck passed1591tests282files/typecheck84docs. Build running. Prior native candidate smoke passed with actual isolated module SHAade112cbb192490a8e8990b3228bf1d07bd937466eab4279d20d0fd90eb120b0 exactly matching bundle; normal world8afe80944ba6aaf47f997f8b1de2736d2b88568c1f3cf44753a54ecb82f9fe9a and normal clientc2cb7dad161399f307b169347313a9c5e01748e5109cbfaeec9361a87eb6d03e remain unchanged.

Root owns next `scripts/generate_ship_tileset_doorway_spec.ts`, `packages/content/src/ship-tileset-doorway-spec.v1.json` and generated doorway guide. After the request is pinned, `inset_wall_author` owns only NEW `assets/art-library/designs/shipyard.structure.doorway250/` and `scripts/art_library/build_doorway250.py`. New250mm full-height frame retains existing1.25×2.25m clear opening and mechanism dimensions, with an explicitly reflected/rebased inward swing. This is a new versioned native adapter study, not reuse of legacy pressure qualification. Actual floor/threshold contact failures must be reported for a separately frozen correction, not hidden by an ideal floor or tolerance increase.

Window r000 preflight is preserved at `assets/art-library/designs/shipyard.structure.window250/revisions/r000/preflight.json`, SHA49bb4df9385df3e8cc3ff5a38aee40e77551f33c6f2ca7c781a884ef5de01110. Native r002 square top cap is[.004,1.996]²: outer bevel and the shared module seam leave0.009967987756587582m² of the0.5m² frame contact missing. Native roof contact passes. This is a genuine qualification gap, not grounds to change export tolerance. Window and doorway authors continue independent geometry while floor contact remains pending.

Root owns `scripts/generate_ship_tileset_floor_contact_spec.ts`, `packages/content/src/ship-tileset-floor-contact-spec.v1.json` and guide. `authority_audit` will own only NEW `assets/art-library/designs/shipyard.structure.floor-contact250/` and `scripts/art_library/build_floor_contact250.py`, after exact request hash is emitted. The adapter fills only measured native voids below the floor-top plane within the tile's inward250 perimeter band. Existing floor meshes are preserved; no overlapping cap plate or idealized base surface is permitted. New fillers are unapproved/native-contact studies, not installation or pressure authorization.

Request amendments preserve prior frozen JSON under `docs/handoffs/shipyard_spec_history/`. Floor-contact current revisionr001-corner-continuation SHAa9b8f3a2b9d361ff9084e953666a66b3cd99ab907c946b8f0f02a866a0b14d33 explicitly permits thin continuation over absent rounded-corner columns from each measured adjacent upper-bevel start, with connected native side contact and no overlapping base volume. Root adopted the author's minimal continuation proposal; no full-height corner posts or bearing ratings. Doorway current revisionr001-connected-hinge-correction SHA8f3aa7166354efacabb47068e60a9713dc10c4ec16360e861d7a123fa486c13e replaces only the penetrating hinge straps with connected native hardware and allows a bounded jamb pocket; exact slab, gasket/seat and hinge axis remain unchanged. All pressure/collision qualification remains pending; no tolerance change.

The inherited door defect is recorded in doorway250/r001/feasibility-native-intersections.json: closed hinge straps penetrate retained fixed seats about3.58594e-5m³ each, through21° of opening. A shared translation cannot fix their relative overlap. Independent strap translation clears the seat but leaves a22mm mounting gap, hence the explicitly new connected derivative; original assets remain intact. Door native floor also fails jamb and bottom-gasket contact, awaiting the same floor filler.

Window250 r004 delivered: sixGLBs, source742b0914d79afb25549cdc84b50b12cdc8e1055265923d4ef44fe1ff5a9f121b, manifest675809afe548438de351166f660f14f98c151419790cd513b398afda692b5478. Glass/material, manifold, pane/wall-end and roof contact checks pass; actual whole-room floor contact2.698128331862888/2.75m² remains failing. Root inspected frame-pane-exterior, unionr001 opposingT2mquarter assembly and roofr000 diagonal seam. None is artistically approved or installed.

`orientation_audit` next owns only NEW `scripts/native_boundary_review_manifest.py`, a bounded local-review manifest builder for root's existing native gallery. Root retains `shipyard_native_boundary_review.ts`, `build_shipyard_native_boundary_review.py` and artifact publication. No shared runtime catalog or application import is involved.

## Resumed native ownership

On owner continuation, prior agent sessions are no longer active. Replacement `floor_contact_finish` owns only the existing new floor-contact250 design directory and build_floor_contact250.py; replacement `doorway_finish` owns only the existing new doorway250 design directory and build_doorway250.py. They must inspect/preserve partial revisions and finish against the current frozen requests; no shared catalog/schema/runtime/publication edits. Root completes the gallery helper integration and exact-candidate review.

`cockpit_binding_audit` owns no files: read-only review of exact retained cockpit native bindings and current v2 renderer substitution path. It will identify a bounded A-phase conformance fixture that preserves all existing live pins and exposes unsupported pressure explicitly. Root owns any subsequent integration.

Root owns new pure `apps/dashboard/src/shipyard/layout/deck-profile-edits.ts` and focused tests plus a narrow existing inspector ceiling-field correction: v2 clear-height edits update ceiling and profile pitch together, preserving other deck placements and exposing envelope/overlap diagnostics. Existing v1 admission limits remain unchanged. No automatic resize, deck shift or new native qualification.

Native gallery r002 built with manifest c3cf393daba17fdb3c2ead582a90a7646747c4ab95b84dff36596666b3e222aa and JS67446e4d2f6ddacaaa3104dc5219032ff474250363aecad348b24ac3f29b8554. Browser loaded69 supported combinations with verified GLB hashes and zero fixture errors; exact results and inspected concave/window images in output/playwright/shipyard-native/. Window floor-contact failure remains visible. Standalone TypeScript check and Python compilation pass; ESLint has no matching scripts config, so its ignored-file warning is not counted as lint acceptance. Inspector candidate full build also finished successfully.

`cockpit_binding_audit` may now create only NEW `scripts/native_cockpit_review_manifest.py`: a pure retained-native review manifest helper returning exact fixture placements/pins and explicit source-to-review copy instructions. No app/compiler/authority mutation, template migration or source asset change. Root owns gallery integration and artifact creation. Legacy cockpit dimensions are explicitly separate from the new inward250 family.

## Clear-height and retained cockpit continuation evidence

- V2 clear-height editing now updates the old ceiling datum and explicit pitch in one normal history edit. It preserves other deck elevations, hull size and authored attachments; compiler diagnostics expose overlaps. Existing ceiling admission remains unchanged (with6-unit floor, minimum clear height is26units/.8125m); .75m clear spaces remain unsupported under this inherited admission. No actor-crawl or native-height qualification is implied.
- Focused3 tests cover smaller profile serialization/checkpoint preservation, overlap reporting without moving decks, malformed/lattice/subminimum rejection. Scoped UI lint and typecheck pass. Browser draftd4f03280-feeb-4f0f-85a5-d79e307e6e2d changed3m→1m clear, saved ceiling38/pitch48units, reload retained values, Undo restored102/112 and Redo returned38/48. Screenshot output/playwright/shipyard-boundary/deck-clear-height-reopened.png. No unrelated draft or player state was changed.
- Combined check passed1594tests283files and86docs. Fresh boundary-height-candidate snapshot1402files, source manifest53ab99faf0b27606425da04f90d725352b78d95fb44a91cd229cb2f678a912e2; full build passed. All current app/package source hashes match its prebuild manifest. Its world bundle SHAade112cbb192490a8e8990b3228bf1d07bd937466eab4279d20d0fd90eb120b0 is byte-identical to the prior successful isolated smoke module; no new authority mutation required another smoke. Build regenerated only isolated candidate bindings.
- Native gallery r003 manifest7265996f9a10707072354e7041618e79f56d46c979cd64944d7383b1e17b6071 adds17 retained cockpit placements with9 verified GLBs, exact native selectors/transforms/PBR. Root inspected glazing with roof off and on; screenshots output/playwright/shipyard-native/cockpit-open-roof-r003.png and cockpit-roof-r003.png. Native roof underside2.625m/top2.9149999916553497m are explicit legacy datums, not silently changed to the new family. Rear edge deliberately open, native pressure/generalized collision/damage unqualified; no opaque duplicate and no live template change. Retained Wayfarer/catalog file hashes still1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb/f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac.
- Floor-contact final transformed/material/render audit and doorway final actual native assembly audit continue. No A/B/C1 completion or game/F3 acceptance claim. Remaining A gate includes full corrected native assembly qualification and exact candidate game evidence; remaining B includes native installation planner, complete orientation and semantic editor paths. No C2–C4/D work started.

`cockpit_binding_audit` next performs read-only integration analysis of a generic inward250 native planner using frozen corner/internal/union requests. No files owned. Determine exact supported perimeter/internal junction matching and deterministic native placement composition, preserving unsupported diagnostics rather than stretching geometry. Root retains shared catalogs and renderer integration.

`cockpit_binding_audit` may implement exclusively NEW packages/sim/src/layout-inset-native-plan.ts and its .test.ts: bounded pure orthogonal visual-placement planning against frozen corner/internal/union requests. Output is family/profile/quarter-height and exact lattice placement, plus diagnostics; no native loader/catalog/schema exports or physical/publish grant. Root owns trusted asset-pin mapping and renderer integration. Supported initial scope is opaque orthogonal inward perimeter and explicitly centered internal partitions; unsupported openings, mixed heights, arbitrary diagonals and other treatments fail visibly.

Root owns NEW scripts/generate_inset_planner_review.ts and its review artifacts: build explicit v2 semantic fixture documents, compile actual floor boundaries/partitions, run the bounded native planner and map only delivered exact native profiles. This connects drawn-layout semantics to native conformance without native runtime installation or pressure claims. Root also adds three narrow content-package exports for the already frozen corner/internal/union JSON requests.

`doorway_finish` continues within its existing doorway250 ownership for whole-fixture native enclosure analysis, using exact delivered frame/leaf/gasket/seat/floor/filler/roof/neighbor triangles and existing strict native-room validation methods. This is geometry qualification work only; it may not invent flow ratings, grant authoritative pressure capability or edit existing published audits/validators. Root retains any future server registration.

Whole doorway-room CSG enclosure analysis reports no bounded interior cavity at raw coordinates or the existing six-decimal canonical precision. Passing individual contacts are not whole enclosure proof. `floor_contact_finish` may add a bounded comparative opaque-room CSG audit only within its existing floor-contact250 directory, coordinating exact methods with doorway_finish, to localize whether shared floor/wall/roof geometry causes the failure. No geometry/validator corrections or pressure grant are authorized by this audit assignment.

`cockpit_binding_audit` next owns no files: read-only mapping of the existing construction publish/spawn, native assembly and authoritative movement paths for an additive opt-in inward250 kit. Identify narrow integration points and blockers; no code, registration or deployment delegated. Root continues exact native qualification and candidate evidence.

Root owns NEW scripts/build_inset_native_package.py, packages/content/src/construction-inset-visuals.ts and construction-inset-visuals.json plus additive assets/runtime/construction/inset250-r000/. This prepares a separate immutable visual kit for local candidate integration, preserving every existing catalog/native pin and normal release. No blanket v2 admission or collision/pressure grant accompanies asset packaging; those require explicit adapters/tests.

Local kit packaging also owns only NEW apps/client/public/assets/construction/inset250-r000/ and apps/dashboard/public/assets/construction/inset250-r000/. It copies validated native bytes into these separate local candidate namespaces; the immutable normal public-client release remains untouched.

`cockpit_binding_audit` may author exclusively NEW packages/render/src/inset-native-visuals.ts and meaningful loader tests. A bounded loader consumes only trusted construction-inset-visuals registry keys and explicit placements, hashes every GLB, preserves world matrices/materials, marks roof/wall roles and disposes cancelled loads. No authority/collision/pressure grant, shared exports or existing renderer wiring delegated. Root owns integration.

Root owns NEW packages/render/src/layout-inset-preview.ts and narrow existing packages/render/src/layout-hull.ts / apps/dashboard/src/shipyard/layout/HullWorkspace.tsx wiring for opt-in v2 native preview. `cockpit_binding_audit` owns NEW packages/render/src/layout-inset-visual-plan.ts and its tests: pure mapping from exact document/compiler output to trusted visual requests; root handles async lifecycle and existing UI integration. These remain local previews with physical readiness false and no change to construction publication admission.

`cockpit_binding_audit` owns only NEW packages/render/src/layout-inset-preview.test.ts for async preview lifecycle tests (stale completion, disposal, visibility/origin changes without rebuilding). Root owns the implementation and existing viewport wiring. These tests do not confer physical qualification.

Root also owns narrow packages/render/src/layout-assembly-preview.ts wiring: Structure/Rooms use this separate viewport adapter and must receive the same v2 native preview input as Hull/Objects.

`cockpit_binding_audit` next owns only NEW packages/sim/src/construction-inset-boundaries.ts and .test.ts: bounded pure exact-pin inward250 installation/collision adapter for full-height orthogonal opaque fixtures. Root owns qualification review, identity remapping, shared publication registration and runtime integration. The adapter must reject unsupported features rather than infer pressure, navigation clearances or material ratings. No deployment delegated.

`floor_contact_finish` next owns only NEW scripts/validate_inset_native_reservations.py and NEW assets/art-library/shipyard-completion/inset-collision-audit-r000/: read-only verification that every packaged wall native triangle lies inside its declared nominal reservation under unchanged export allowance, preserving exact package/GLB/source pins and shifted negative controls. This qualifies conservative proxy containment only; no art approval or pressure/rating claims. Root owns any registration.

## Inward native editor candidate

Exact local visual kit:228 GLBs, construction-inset-visuals manifest SHA6b75192961d960c57559c0136d141b1a3de47a2a592c084b21a7b33562625dd3; separate inset250-r000 namespaces in runtime/client/dashboard. Byte-check passes. No current Wayfarer or normal immutable client release replacement. Native gallery r005 manifest09abc2135483e636c7b2d981fb2e09f2dcc41c778a374e635e7d2cd0826d6e5d and JS2f734eed882b921c10e969f4ecd9affce9232818303009e7a1560a1ab90f04eb:100 combinations pass browser loading, including compiled semantics; one transient fetch failure retained with successful exact retry in output/playwright/shipyard-native/all-100-r005.json. Native art remains unapproved.

Doorway250 r003 sourcefc6870a05af1b42061989070437611243e622473902d70975449490671fb1e3b; r004 audit-only qualification60f6de22bfdef6fa1b0542bdd82900b6958e4411174ed0e56195f7b974c1f515. Unperturbed raw/canonical CSG failures retained. Exact threshold contact passes with no finite gap witness; the pre-existing documented10nm gasket contact convention yields one16.428733183137073m³ bounded cavity, with open/retracted/unseated negative controls venting to exterior. Root accepts this bounded native geometry evidence under unchanged existing convention, not pressure authority/art approval. Floor-contact r011 source053cf6e1f32e1d686144e88d5cadc643b00d0384b40bc958f2aabad33705f1c7; r012 opaque-room audit164d9e4eb87d069c0b8bacac629ea6952a8f2a44afce06dd4541226c3eae2284 proves native opaque cavity15.852294855518267m³ without replacing structural surfaces. Window actual contact with fillers2.75m²; old failure retained.

Editor integration uses the same bounded mapper/hashed loader in Structure/Rooms and Hull/Objects. Unsupported intent remains recoverable, never substituted with centered legacy walls. Loader5, mapping4 and async lifecycle3 tests pass. Browser own draftd4f03280-feeb-4f0f-85a5-d79e307e6e2d:1m unsupported→3m full supported15pieces53meshes→1.5m smaller supported; save/reload retains ceiling54/pitch64 and roof layer. Normal player state untouched. This is local preview evidence only.

boundary-inset-preview-candidate:1414source files, manifestdb60edbaee9143da2b1f7ddce194af57e7eb9a88789b3e8eb6e127a95cb85348. Combinedcheck1631tests287files/typecheck86docs and fullbuild pass in isolated snapshot, preserving shared bindings. Subsequent authority adapter work is not covered by this candidate.

Root owns narrow existing construction-transactions.ts, construction-instance.ts, world/construction-doors.ts and render/construction-instance.ts integration plus NEW construction-inset-instance.test.ts. Exact new pin admission will remain dependent on reviewed native reservation audit and pure collision adapter. Remap every supported v2 identity and recompile the remapped candidate before inserting instance rows; unsupported domains stay blocked. No normal deployment or live refit planned in this step.

Native reservation audit8b4a4eb4d837a39b3f82e13e74d9cc48fcc610124fe01d9f38dcdae9cf2e0c85 passes204wall GLBs/816orientations/3264shifted negative controls, full triangles and hierarchy under unchanged1um allowance. Root reviewed the exact recipe and accepts these declared conservative structural reservations for bounded static walking candidate integration, with game acceptance pending and pressure/flight/damage false. Only the exact inset250-r000 pin is admitted; unsupported v2 remains rejected. `cockpit_binding_audit` now exclusively owns NEW packages/sim/src/construction-inset-instance.test.ts (transferred from root) to verify two independent spawns, remapped treatment/partition/deck/floor IDs, exact native preservation and rejected incompatible adapters. Root owns all shared implementation.

`cockpit_binding_audit` owns NEW scripts/inset-boundary-smoke.ts only: isolated provider-backed publication/spawn/walking test with exact candidate document, two distinct accounts, ordinary explicit workspace grants, private identity/state summaries and negative collision checks. It may author the script but must not run it or assign provider roles. Root owns credentials, managed isolated publication, temporary test-role cleanup and browser candidate review. No normal world/client activation or live refit.

Actual game candidate0f8b0ae76f697d5f6aeae7907b36114992b18fec1453d8f59b8124f2cafaba58 on5186 loaded exact26inset native placements. First hardware-tab load warmed slowly and expired its5minreview session; retry reachedready withno newconsoleerrors. Full-height nearwalls obscure the actor in4×4testroom atfixedRPG elevation. `cockpit_binding_audit` owns NEW packages/render/src/inset-wall-cutaway.ts and .test.ts: presentation-only camera-ray occlusion fade using trusted native footprints and existing cutaway material mechanism, preserving cameraangle and allauthority. Root owns existing game loader wiring and final acceptance.

## Isolated inward250 game and restart continuation

HEAD remains1da95ec173fe81e81b3fa005889ec7dbbc93e97e; shared dirty tree preserved. Authority candidate boundary-inset-game-candidate source manifest a7c963d44cbb363ce774f2fd0bff1613922916d723a5bc771fbef8e79dcb4534 passed combined1641tests289files/86docs and fullbuild. Exact world module caf8c5d22a6f113960422a468b4e19d2fb3dfa7a04b67ce873e2eaba6f4ceb40; isolated generic smoke and two provider-account native spawn/walking/reconnect tests passed on named smoke databases. Fixture document62e806247f2c2ee4458629bba0b6d94df549381a016aa933b69dee1b84bba2e7; exterior wall stops actor at.5500001m and centered partition at1.5749999m. Normal world/client and Wayfarer pins retained.

Separate managed server127.0.0.1:3191 (candidate-owned data) restarted PID606836→610625 without republishing. Database sidereal-spacetime-dev-shipyard-inset-restart-r0001-smoke retained independent instances d70775dd-556d-4b83-a853-3d0203290eeb and d544673e-98ff-4018-b8ff-327deedfaff4. Provider postrestart verification passed exact documents, instance identities, locations and actor positions. Temporary provider review role revoked after test setup; verification used renewed ordinary PKCE sessions without role changes. Tokens remain private.

Broader generic restart assertion failed: moving asteroid not discovered with positive momentum. Original failure preserved in inset-isolated-postrestart.log; no validator/test alteration. Existing persistent-rows-only mode separately passed ship/receipt, inventory/equipment, combat balances, and both appearance/item/container/hotbar snapshots; this narrower result does not establish transient asteroid discovery/momentum. Logs in .runtime/shipyard-completion/.

Root integrated the delivered presentation-only inset wall cutaway into the existing construction instance view callback. Focused11loader/cutaway tests and scoped lint pass. Fresh boundary-inset-cutaway-candidate contains1421source files, manifest cbad0a08fe36b76648bfe52fecad0f7fd6ada181ec13d335c8319aceb6ec3908. Initial combinedcheck had3missing-public-asset errors because this snapshot excludes generated app assets, plus an unrelated planet terrain20s timeout under full parallel load. Preserved failure; preparing assets via fullbuild before rerunning unchanged checks. Candidate-only configuration uses server3191, client5187 and its matching review origin. No normal service activation or art approval.

Cutaway candidate fullbuild passed; world bundle remains caf8c5d22a6f113960422a468b4e19d2fb3dfa7a04b67ce873e2eaba6f4ceb40. Prepared-asset combinedcheck resolved all loader errors but retained planet timeout. Its unchanged test passed alone in15.18s, then VITEST_MAX_WORKERS=2 npm run check passed all1647tests290files/typecheck/86docs. No timeout/assertion/config edits. Logs inset-cutaway-{build,check-prepared,planet-focused,check-bounded}.log preserve results.

Read-only isolated owner SQL confirms the allegedly missing asteroid persists at y1614.1805802595818 with vy2.3263888883711976 and server_tick35782147717. Existing discovery radius400m and current observer positions explain why the moving fixture is no longer returned to the original observer. Preserved original generic failure; persistent-row and construction-specific restart proofs remain distinct. Evidence inset-postrestart-{asteroid-row,observer-rows}.log; no movement/reset/discovery relaxation performed.

Exact cutaway client3fdc3e793017651b2c89344b79d01e6ca8f0ad096e499203627ab39c7c6c38e2 staged from prebuilt verified artifact and activated only at http://sidereal.tail7a58a6.ts.net:5187/, proxy3191/restart smoke database. Immutable release in candidate/.runtime/public-client/releases/20260911-161536-3fdc3e793017. Existing tab_f had changed to dashboard, so root preserved it and created dedicated review tab_1. Hardware browser review underway. No A/B/C1 gate acceptance or normal publication claim.

## Owner steering: accessible, consolidated Shipyard UI

Owner reports normal Shipyard looks like old tools and requests removal of legacy clutter, unnecessary subtitles, duplicate controls, and misplaced context controls. Inspection confirms8445 serves current working-tree Vite dashboard; only specially prepared v2 drafts exposed new boundary controls, while ordinary New created v1. The earlier statement that editor code was isolated was corrected immediately; only the game candidate is isolated.

Root owns new-design entry activation, DocumentBar/NewLayoutDialog/LayoutEditor/HullWorkspace and associated styles, plus narrow redesign-document edits/tests. Palette cleanup may be delegated only to LayoutPalette.tsx; inspector cleanup only to LayoutInspector.tsx. Preserve existing draft bytes, legacy recovery/import capability and all current authority. New blank designs should use inward250 profiles; no silent conversion of retained assemblies or approval of new art. UI work remains independent Contract B continuation explicitly requested by owner; phase2 check-in does not claim Contract A acceptance.

Owner explicitly permits wiping existing drafts. Root additionally owns a narrowly scoped one-time local Shipyard draft reset helper/tests and useLayout boot integration; preserve auth tokens, identity, preferences, all other application storage, server blueprints and live world. Reset applies only existing local layout recovery/active/pending-import and old assembly draft data on this UI migration. Future new drafts persist normally. Root also owns ShipSummary.tsx copy cleanup and local styles. Current normal dashboard serves these edits via managed Vite; separate game release remains unchanged.

Root additionally owns narrow LayoutCanvas.tsx and LayoutToolbar.tsx cleanup: remove duplicate canvas title/help/status decoration; retain error reporting and selection-context actions. No gesture/geometry changes.

Root owns BoundaryTreatmentPanel.tsx and PressureAreas.tsx copy-only simplification: shorten repeated qualification text and keep detailed assumptions in the existing disclosure. No pressure semantics or treatment options changed.

Root takes completed LayoutPalette.tsx back for moving its existing publication panel into a single document-level Publish dialog accessible from all editing modes. Owns NEW PublicationDialog.tsx. No construction reducer or publication semantics change.

## Normal Shipyard UI cleanup delivered

Normal URL https://sidereal.tail7a58a6.ts.net:8445/shipyard serves current managed dashboard Vite on5174. Root corrected the initial deployment diagnosis: new editor code was served there already, but ordinary New produced v1 and hid the boundary controls. New and first boot now produce inward250 v2 with the approved6/96/4/6/112units profile. New dialog exposes envelope height; smaller envelopes keep explicit profiles under unchanged minimum admission. Existing new draft IDs persist normally.

Owner-authorized one-time reset removes only this browser authoring profile's local recovery/active/pending/quarantine data and old assembly draft. It preserves auth, other profiles, preferences, published blueprints and live ships. Test verifies scope and that subsequent drafts survive another boot. Original tree baseline/other owners' uncommitted files remain untouched.

UI changes: document actions once at top; Import/Export under File; publication moved from mode-specific palette to one global Publish dialog; duplicate template/source banner and bottom projection switch removed; one active deck selector in viewport; creation tools left, selected boundary/object fields right; room/door/stamp settings appear only in relevant tool contexts. Redundant deletion/select/save controls, disabled future controls and repeated model/help/status subtitles removed. Native limitations remain available in contextual fit/pressure information. Legacy saved-art imports remain an explicit secondary route, not the primary workflow. No geometry, runtime publication admission or provider policy changed by this cleanup.

V2 Add deck uses approved pitch and explicit profiles, deriving the design envelope height for the added deck. Browser created two decks at0/112units, both ceiling102/pitch112, hullheight224. Existing v1 addition behavior retained for explicit imports.

Exact final validation snapshot boundary-editor-cleanup-final-candidate:1424source files, manifest65b4e3dd504880850b05a813190314c4138f14ce016e3c957957de0ae3ba6b7b. Fullbuild and VITEST_MAX_WORKERS=2 npm run check pass1648tests291files/typecheck/86docs; scoped lint passes. All live working-tree app/package/script source bytes match this prebuild manifest. World bundle remainscaf8c5d22a6f113960422a468b4e19d2fb3dfa7a04b67ce873e2eaba6f4ceb40, already isolated-smoke/restart tested; no new authority publication needed.

Real normal-URL browser: blank startup→Rectangle click→one native floor/10native pieces; Rooms edge click exposes Boundary treatment and0.75/1.5/2.25/3m heights. Changed1.5m edge persisted and correctly exposed unsupported mixed-height native notes, then restored full height. Reload retained draft8aaa2c43-7a9b-465e-b0f2-15edb9ae6a37 and its v2 profile. Ordinary New→Create floorplan created independent8f47ee06-78c2-44eb-a2ac-d296b8faed70; Add deck produced correct profiles/envelope. Publish dialog opened with existing sign-in requirement; no publication performed. No console errors or horizontal overflow at1683×1051. Screenshots output/playwright/shipyard-boundary/clean-editor-boundary-controls.png and clean-editor-publish-dialog.png. Collaborative browser resize timed out twice and retained desktop size; smaller-viewport acceptance is not claimed. Existing software browser sessions were listed but not disturbed or duplicated.

This is an accessible UI cleanup and independent Contract B progress, not Contract A/B/C1 completion. Phase2 package remains docs/handoffs/shipyard_phase2_checkin_20260911.md; required single-Wayfarer/two-ship performance evidence, native sign-off and remaining semantic/gameplay paths remain open. No C2–C4/D work started.

## Full floor palette and duplicate envelope correction

Owner requests the full existing native floor catalogue in ordinary palette, then reports two blue size-limit outlines. HEAD remains1da95ec173fe81e81b3fa005889ec7dbbc93e97e, prior dirty tree/pins unchanged. Root owns new app-only floor-stamps.ts/tests and narrow shape-selection/placement/ghost/fill plumbing in LayoutEditor/LayoutPalette/LayoutCanvas/panel-context/state/layout-gestures/LayoutInspector. Persist existing semantic shape/revision schema; use exact native footprint geometry, no validator relaxation. Boundary-fit limitations remain visible.

cockpit_binding_audit owns only packages/render/src/layout-assembly-preview.ts and any NEW targeted projection test/helper if needed, for duplicate envelope diagnosis/fix; read LayoutCanvas and related renderer freely but coordinate root-owned edits. Determine which outline matches actual hull origin/width/length and fix projection/duplicate rendering, not size enforcement. No native/runtime/catalog/deploy changes delegated.

Owner additionally reports odd-shaped room leaves wireframe walls and missing floors. floor_contact_finish owns read-only diagnosis of current native visual planner versus delivered diagonal/convex profiles, and may implement ONLY packages/sim/src/layout-inset-native-plan.ts and its existing .test.ts after identifying bounded exact-native composition. No authority adapter change or geometric scaling. Root owns floor rendering/catalog integration; unsupported whole-layout suppression must be diagnosed, not bypassed with fake geometry. Root will integrate and validate exact supported native profiles.

Owner reports whole-page flicker while orbiting. Extend cockpit_binding_audit ownership narrowly to LayoutCanvas projection-effect section (currently around130–178) and existing projection renderer scope; root retains other LayoutCanvas floor-stamp changes. Investigate projective SVG clipping/near-plane behavior and one true hull-limit outline; no guessed geometry deletion. doorway_finish owns read-only canvas lifecycle/CSS compositor audit, no files until coordinated findings.

Root owns narrow renderer wiring in layout-inset-visual-plan.ts and inset-native-visuals.ts/tests for boundary-derived finite yaw. Diagonal native planning is explicitly visual-only opt-in; default planner stays orthogonal for existing static collision admission. Floor/roof geometry stays exact; no mesh scaling or native source mutation.

## Native floor palette, diagonal editor composition and orbit projection fix

Root also owns floor-fit diagnostics in layout-assembly-preview.ts and the WallFitNotes.tsx label. Unmatched native floor geometry now appears in Native fit instead of silently disappearing. The twelve catalogue floor stamps use exact footprints, support quarter turns/reflection and fill spacing, and preserve existing serialized shape/dependency contracts. No new generated visual art or native pin changes.

The duplicate blue outline and orbit flashing were traced to the perspective SVG plane crossing behind the camera. There is one WebGL canvas, one actual hull-size SVG rectangle, and separate plan/gesture overlays. Clip the finite plane in homogeneous coordinates to the forward visible viewport before applying its CSS perspective transform. The actual limit remains the hull origin/width/length shown under Edit sizes. Camera orbit retains canvas identity. This addresses a reproduced projection/compositor defect; screenshots alone cannot guarantee absence of every hardware-specific flicker.

Visual-only diagonal planner now composes existing exact native corners/spans with boundary-derived yaw. All12 native footprints cover384 height/rotation/reflection combinations, including256 diagonal cases. Connected four-clipped octagon compiles as one component and produces24 wall placements plus8 floor-contact pieces. Default authority/collision planning still rejects diagonals; unsupported junctions, residuals and support gaps retain diagnostics. This is editor composition, not new diagonal gameplay qualification.

Frozen candidate floor-palette-final-candidate contains1428 source files, source manifest62fad08b95060d4c878d6f5b1155a7ed4533b6dece758f66f1b5fc9f77604b11. All live app/package/script files match its prebuild hashes. Full npm run build and bounded npm run check pass1754tests293files/typecheck/86docs; scoped ESLint passes. Native package check preserves228parts and manifest6b75192961d960c57559c0136d141b1a3de47a2a592c084b21a7b33562625dd3. World bundle d036fce2dca042277592252bba8d4ab16cbb3b9a9a280affaad5211c8bb5f59a is used only for a fresh named isolated smoke database on3191; normal world/client pins remain unchanged.

Normal8445 real-browser evidence: twelve palette choices all rendered in a deliberately disconnected catalogue fixture; connected octagon reload retains4floors/32native pieces/128wall meshes, no native fit issues and0validation errors. Screenshot output/playwright/shipyard-boundary/floor-palette-octagon-final.png shows populated floors and diagonal walls after orbit. One canvas remains identical across orbit; finite clipped overlays. Fresh reload at07:31:57UTC has no subsequent console errors. Earlier07:21:45UTC transient Vite failures during a partial planner edit are preserved in browser history and resolved before the frozen candidate. No further code writes during final review.

No Contract A/B/C1 completion claimed. Existing isolated game evidence belongs to the earlier exact orthogonal candidate; it is not relabelled as evidence for diagonal gameplay. Required owner art/performance gates and remaining minimum gameplay work stay open.

Fresh isolated smoke passed (exit0) for world d036fce2dca042277592252bba8d4ab16cbb3b9a9a280affaad5211c8bb5f59a on sidereal-spacetime-dev-shipyard-floor-palette-final-r0001-smoke at3191, including two-account appearance/inventory/equipment reconnect. Log floor-palette-final-smoke.log preserves exact scope and existing native armory limitation. No normal database publication or live asset activation.


## Owner-requested live Shipyard repair

Entry HEAD1da95ec173fe81e81b3fa005889ec7dbbc93e97e; git status and git log -5 read before code. Exact dirty file list preserved in .runtime/shipyard-completion/repair-entry-status.txt (1144 entries). Current pins: {'assets/runtime/assembly/wayfarer.json': '1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb', 'assets/runtime/assembly/catalog.json': 'f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac', 'packages/content/src/construction-inset-visuals.json': '6b75192961d960c57559c0136d141b1a3de47a2a592c084b21a7b33562625dd3'}. Existing later projection edits are preserved. Root owns narrow render package exports correction and any verified editor regression fixes; no staging/reset/clean/restore. Owner explicitly authorizes making these Shipyard fixes live.

Live repair result: missing @sidereal/render/layout-plane-projection package export caused Vite resolve failures and the workspace error boundary. Added only the missing public export; preserved the later existing viewport-sized overlay/3D scene grid and envelope implementation. Restarted only the managed dashboard via scripts/dev.py stop-dashboard/up-dashboard to clear cached package resolution. Normal https://sidereal.tail7a58a6.ts.net:8445/shipyard now serves these source changes; no alternate review URL required.

Exact repair candidate1432source files, manifest95ce371d2b4b42fb034f7171bdca39a7df888f047d6771941248d0e3105a3294. Live source hashes match. Full npm run build and bounded npm run check pass1764tests295files/typecheck/86docs. World bundle remainsd036fce2dca042277592252bba8d4ab16cbb3b9a9a280affaad5211c8bb5f59a, already isolated-smoke tested; no authority edits or normal world/client activation.

Real live browser restored saved draft, placed fifth native floor, undo4/redo5, and reload retained5. Connected fifth floor exposes unsupported concave native junction notes rather than silently bypassing qualification. Review copy undo restores the four-clipped octagon with4native floors,32native pieces,128wall meshes,0fit issues. Orbit to beta1.2129 uses one canvas and an untransformed viewport-sized SVG; no perspective CSS raster in tilted view. Screenshot output/playwright/shipyard-boundary/display-repair-orbit.png shows native room and bounded scene grid. Earlier display-repair-live.png shows the intentionally extended floor fixture and its honest fit notes. Hardware-tab snapshot tool repeatedly failed, so actual screenshots used a dedicated Playwright Chromium session against the same normal HTTPS URL; no other browser sessions were disturbed. Fresh Playwright console has0errors. No full Shipyard contract or native game qualification claimed.

## Complex floorplan completion continuation

Entry HEAD1da95ec173fe81e81b3fa005889ec7dbbc93e97e; status and log-5 read, dirty list recorded in /tmp/complex-status.txt before code. Root owns native wall planner/visual integration and final verification. Floor matcher delegate owns packages/render/src/layout-native-floors.ts/tests and packages/sim/src/layout-native-floor.ts/tests only, to diagnose exact catalogue reflection/rotation matches without changing native geometry or authority admission. Existing live pins preserved; native additions remain unapproved.

complex_native_family owns NEW additive complex-perimeter interface JSON, Blender recipe and immutable art revision under shipyard.structure.complex-perimeter, plus NEW sim complex-native-plan helper/tests. Root retains existing planner/renderer/package integration. Dimensional contract:250mm inward, floor top.1875m, quarter heights.75/1.5/2.25/3m; lattice-derived native direction vocabulary, no runtime visual scaling or TS-generated mesh. Existing r000 stays immutable. Native authoring may run offline through managed Blender wrapper, never deployment. Agent must validate exact mating, inward support and unsupported tiny edges; no weakened validation.

complex_legacy_floor owns NEW offline Blender recipe and immutable art revision shipyard.structure.legacy-trapezoid-floor, matching exact historic footprint [[0,0],[64,0],[64,64],[32,64]] in lattice units with floor bottom0/top6. Preserve native finish/detail style; no scaling existing source mesh or edits to approved floor pin. Root owns additive preview registration and matching. This exact legacy shape cannot tile with existing native floor sources (its1×2m diagonal is smaller than the existing2×4m long triangle).

Root additionally owns app-only deliberate tile shape/mirror override reconciliation helper/tests and narrow state/Inspector wiring. Preserve arbitrary saved overrides on load; clear only an incompatible override after a deliberate geometry edit, retaining identity/material/other style fields.

Root also owns new additive preview packager/registry and supplemental floor matcher, complex loop adapter/tests, existing render mapper/loader integration, and a narrow footer wording change from errors to layout errors so native fit is not confused with geometry validity. Incompatible explicit floor model pins are reconciled only after deliberate shape/mirror edits; imports remain untouched. New floor and wall assets stay presentation-only and unapproved; base floor/collision/native authority pins do not change.

## Complex floorplan fixes delivered — 2026-09-12

Entry dirty list retained in .runtime/shipyard-completion/complex-entry-status.txt; HEAD remains 1da95ec173fe81e81b3fa005889ec7dbbc93e97e. Shared unrelated work remains unstaged and untouched. Native base inset250/r000 manifest remains 6b75192961d960c57559c0136d141b1a3de47a2a592c084b21a7b33562625dd3; base floor, normal Wayfarer, collision and live world pins remain unchanged.

Fixed deliberate shape/mirror edits retaining incompatible floor model overrides. The edit clears only an incompatible override, preserving tile identity/material/other style fields; existing imported/saved overrides are not silently discarded. Full original catalogue render coverage now exercises all 192 rotation/mirror combinations against exact native footprints. The missing historical trapezoid needs a new native source: its 1×2 m diagonal cannot be filled by the existing 2×4 m long triangle without scaling. Additive r001 left/right native floors and r002 matching roofs now cover that exact historic footprint at floor thickness .1875 m and roof .125 m, including all rotations/reflections. Default deck roof creation no longer withholds otherwise valid walls on a roof-only missing-piece diagnostic.

New complex-perimeter r005 native delivery 2cf754aec0f81431f448a12f1b541a52c98bdee0e5178314e6f7660d121054b8 includes 240 convex/concave corner profiles and 35 exact spans at four quarter heights: 1100 GLBs, preserving editable Blender meshes, native surface courses and pinned material textures. The vocabulary covers all 32 primitive directions derived from the existing floor palette. r000–r004 failed/intermediate authoring and review evidence retained. Every delivered source/export passes manifold, containment, nondegenerate triangle and material checks at unchanged 1 um export allowance. r005 includes actual imported-GLB assembled user-pattern renders; new art remains unapproved.

Additive authoring-preview package has 1104 parts, manifest 81ccd3920812c548d5829b6d183270c12f86200e854a8cea13e87bbdd55a835a, independently reproducible with scripts/build_complex_preview_package.py --walls-revision r005 --check. Registry merging is render-only. Existing native boundary planner/collision admission stays unchanged; the new pure complex helper is called only from the editor render adapter after compiler validation. It requires a closed opaque perimeter, supported native directions and consistent join heights, and rejects self-touch/intersection, too-short edges, reservations outside the floorplan and overlaps. Holes, internal partitions in a complex diagonal loop, mixed join heights and incompatible explicit treatments are not newly qualified. No geometric scaling, shader-cut replacement walls or client authority claims.

First exact candidate passed 1772 tests and full build, but real browser exposed default roof=true requiring companion roofs; that failed review is retained in complex-live-diagnostics.log and complex-floorplan-initial.png. Completed final candidate complex-floorplan-roof-final-candidate contains 1448 source files, manifest c47a84aa2054cad793d3b3e670c518caed23daf0ffdffce234db9a0d91f5d72f. Live app/package/script bytes match. Full npm run build and bounded npm run check pass 1772 tests / 299 files / typecheck / 86 docs. Scoped lint, additive package check and immutable base package check pass. Snapshot art:check rejected its deliberate assets symlink as escaping the snapshot root; unchanged npm run art:check from the actual workspace passes. World bundle remains d036fce2dca042277592252bba8d4ab16cbb3b9a9a280affaad5211c8bb5f59a, already isolated-smoke tested; no new authority publication.

Normal live URL https://sidereal.tail7a58a6.ts.net:8445/shipyard was reviewed with a dedicated Playwright Chromium session. Imported review draft e98dd157-4452-4f54-96b1-e595d6210ff8 through the ordinary draft file input: one square plus two handed historic trapezoids forming a concave diagonal join. Saved/reloaded three tiles, one base native floor plus two supplemental floors, 35 preview requests / 141 native meshes, no native fit issues, no structural fallback guides and 0 layout errors. Middle-mouse orbit remains functional, no distorted CSS raster, no console errors. Roof layer on shows all three matching caps; off restores interior inspection. Evidence: output/playwright/shipyard-boundary/complex-floorplan-final.png and complex-floorplan-roof.png, and .runtime/shipyard-completion/complex-final-browser-loaded.log. The footer now says layout errors to distinguish valid floor geometry from native fit diagnostics.

These are live editor fixes, not Contract A/B/C1 completion, art approval, or new complex-diagonal gameplay/collision qualification. Earlier exact game evidence is not attributed to these new native revisions. The phase2 check-in's performance, physical integration and owner art-review gates remain open; no C2–C4/D work started.


## Owner-requested semantic Wayfarer rebuild — 2026-09-12

Owner now explicitly requests reconstructing Wayfarer as closely as possible in the new system and making it the actual game ship. This steers priority to the Wayfarer candidate and required gameplay integration; it does not approve an unseen conservation report or new artistic revision. Before code: git status and log-5 read, HEAD1da95ec173fe81e81b3fa005889ec7dbbc93e97e; dirty list .runtime/shipyard-completion/wayfarer-redesign-entry-status.txt; pins {"assets/runtime/assembly/wayfarer.json": "1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb", "assets/runtime/assembly/catalog.json": "f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac", "packages/content/src/wayfarer-starter-r001.json": "53a636ea9905e9ec953268e65b54ed7c59ed8e0f97158dac914958ad38f1e21b", "packages/content/src/construction-inset-visuals.json": "6b75192961d960c57559c0136d141b1a3de47a2a592c084b21a7b33562625dd3", "packages/content/src/construction-complex-visuals.json": "81ccd3920812c548d5829b6d183270c12f86200e854a8cea13e87bbdd55a835a"}. Root owns integration and isolated/live deployment; preserve shared work and player state. Rebuild delegate owns NEW review-only candidate files under .runtime/shipyard-completion/wayfarer-rebuild and NEW audit handoff only; authority delegate read-only gameplay/refit gap audit. Neither delegate deploys or alters existing source.

Owner floor-model refinement during Wayfarer rebuild: floor plates should be solid blocks following the requested shapes with interchangeable bump/normal-mapped textures. Adopt floor structural polygon as slab geometry and separate authored finish maps, rather than require a catalogue GLB footprint match for floor visibility. This explicit floor-only direction supersedes the exact pre-authored floor-mesh dependency for presentation; it does not change authority floor support/qualification or authorize replacement of other native art. Valid individual floors must remain visible even when the whole layout has unrelated connectivity/wall errors. floor_slab_preview owns NEW render slab/finish helper/tests and narrow layout-assembly-preview integration only; root owns final cross-app/game integration and any UI finish selector.


### 2026-09-12 floor slab correction — live dashboard checkpoint

Owner refinement implemented for floor presentation: each valid floor polygon renders as a closed 0.1875 m slab. Diagonal/concave geometry and disconnected islands no longer depend on matching a legacy GLB or on whole-layout wall validity. Native structural floor duplicates/contact meshes are suppressed. Native walls, retained assembly, authority validation and existing game installation pins are unchanged by this correction.

Finish selection uses `FloorStyle.material`; Pale panel and Graphite panel share the existing authored r002 basecolor/normal/ORM maps, with a graphite tint. Maps are separate from slab geometry and additional finish descriptors may supply independent maps. Unknown imported material/model values are preserved. This is not new art approval or arbitrary-shape game qualification.

Live location: https://sidereal.tail7a58a6.ts.net:8445/shipyard (managed dashboard5174 restarted). Exact candidate `.runtime/shipyard-completion/floor-slabs-final-candidate`; 1451 source pins, manifest SHA256 `c7ecba1ffe55f416ca007ee09629ebbcea8b19af9fef8cc895b5893d736891b4`. Candidate source hashes rechecked against the served tree without differences. Build, typecheck, all1775 tests across300 files,86-document checks and root art:check passed; logs retained in candidate. No authority changes: no world publication or live ship/state mutation.

Real Chromium review at the normal HTTPS location: one canvas; connected three-tile concave layout has3 slabs and35 native wall requests/141 loaded meshes, zero fit issues. Wall layer toggle preserves floors. Three disconnected square/trapezoid islands have3 slabs and zero floor issues while connectivity validation correctly remains an error. Graphite selection survives ordinary Save draft/reload. Screenshots: `output/playwright/shipyard-boundary/floor-slabs-visible.png`, `floor-slabs-graphite.png`, `floor-slabs-disconnected.png`. Dedicated browser fixtures only; no user drafts wiped. No game evidence is claimed for this presentation-only change; no contract gate is marked complete.

Wayfarer work remains active at the concrete design checkpoint: see `docs/handoffs/wayfarer_semantic_rebuild_audit_20260912.md` and `.runtime/shipyard-completion/wayfarer-rebuild/`. Candidate compiles with51 floors,12 partitions,8 passages,10 room labels and a full262-identity placement map. Actual game replacement remains unimplemented: native cockpit substitution, combined perimeter/internal/opening support, replacement roofs, qualified collision/door/fitting/flight adapters and authored-to-authored conservation refit are still needed. No validator relaxation proposed, no live pin changes or artistic sign-off assumed. The owner-requested live replacement requires a concrete conservation report before the live refit; that report cannot yet claim verified runtime conservation.

### 2026-09-12 resumed game integration

Owner explicitly requested proceeding with game integration. Entry HEAD `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`; git status and git log -5 read before code. Full shared dirty list preserved in `.runtime/shipyard-completion/wayfarer-game-entry-status.txt`.
- `assets/runtime/assembly/wayfarer.json`: `1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb`
- `assets/runtime/assembly/catalog.json`: `f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac`
- `packages/content/src/wayfarer-starter-r001.json`: `53a636ea9905e9ec953268e65b54ed7c59ed8e0f97158dac914958ad38f1e21b`
- `packages/content/src/construction-complex-visuals.json`: `81ccd3920812c548d5829b6d183270c12f86200e854a8cea13e87bbdd55a835a`

Delegation under explicit task brief authorization: native_plan owns NEW `packages/sim/src/wayfarer-rebuild-native-plan.ts` and its tests plus NEW audit outputs under `.runtime/shipyard-completion/wayfarer-rebuild/native-plan/`; no catalog/renderer/deployment writes. walking_adapter owns NEW `packages/sim/src/wayfarer-rebuild-walking.ts` and tests plus audit outputs under `.runtime/shipyard-completion/wayfarer-rebuild/walking/`; no shared existing-file edits. Root owns integration, additive schema/content/source qualification, world/refit/render and deployment. All live native pins remain unchanged until exact candidate qualification/conservation check-in.

Additional delegated bounded task: `refit_identity` owns NEW `packages/sim/src/construction-refit-identities.ts` and tests only. Pure source/instance identity-conservation planning and report, no world transaction, qualification, generated bindings or deployment writes. Root remains owner of all integration and live changes.

Native task ownership: `cockpit_transition` owns NEW `assets/art-library/designs/shipyard.structure.wayfarer-transition/` and NEW `scripts/build_wayfarer_transition.py` only. Audit/author the main-roof-to-retained-cockpit transition without changing existing cockpit sources. Shared catalog/publication remains root-owned. Approved dimensions6/96/4/6/112; actual retained cockpit datums must be measured, never stretched. All new art remains unapproved.

Native validation correction: a proposed125mm passage offset solves nominal span residuals but violates the existing opening-slot validator. Rejected and reverted; no validator relaxation. Original1m passage slots retained. `cockpit_transition` native pack scope additionally includes a reusable125mm-long ×250mm-wide ×3m internal straight spacer with two proper mating ends, required by the unchanged passage geometry. `native_plan` may consume that exact new profile only once exported/audited.

Additional world task ownership: existing `refit_identity` agent may own NEW `packages/world/src/wayfarer-rebuild-refit.ts` and NEW tests only, implementing inactive adapter with server-provided qualified target hooks. It must not register reducers/tables or deploy. Root owns registration after geometry/game qualification and conservation review.

Narrow additional ownership granted to `native_plan`: `packages/sim/src/layout-inset-native-plan.ts` may accept an explicit bounded per-call additional native span definition, without mutating base shapes or admitting it into existing authority kits. Root alone supplies new exported/audited metadata to the exact rebuilt Wayfarer adapter. Existing callers and validators remain unchanged.

`native_plan` follow-up ownership: NEW `packages/sim/src/wayfarer-rebuild-game.ts` and tests only, composing exact source guard, real spacer/transition metadata, native wall collision, retained-native walking/pilot/cargo proof and main roof placements. Root owns compiler/world/render integration; no shared-file or deployment edits by this follow-up.

`walking_adapter` follow-up owns NEW `packages/sim/src/wayfarer-rebuild-fuel.ts` and tests only. Qualify the conserved legacy fuel tank at unchanged(-3,7,.1875) against exact new geometry, retaining original native/load certificate for unchanged tank and retained-object subset while independently proving new wall/roof/approach separation. Root owns existing mount/transfer/render dispatch. No fuel/liquid state edits or deployment by agent.

`refit_identity` smoke ownership: NEW `scripts/wayfarer-rebuild-smoke.ts` only. Two ordinary provider accounts on explicit isolated *-smoke database: create original trusted starter, read owner-only rebuilt conservation offer, perform expected-revision refit, verify state/replay/privacy/controls/walking/reconnect and verify-only restart mode. No credential handling, role changes, service startup or running the smoke by agent. Root owns execution and source/generated bindings publication.

- Delegated native rendering optimization ownership (2026-09-12): native_plan owns new `packages/render/src/inset-native-batches.ts` and tests, plus narrow integration in `inset-native-visuals.ts` and `inset-wall-cutaway.ts`. Exact native geometry/material bytes remain unchanged. Opaque same-prototype batching with independent per-placement fade fallback is under review; root owns exact-candidate browser/game performance evidence and deployment.

Root additionally owns NEW apps/client/src/ShipRebuildPanel.tsx, narrow ShipRefitPanel dispatch and additive generated SDK definitions for ownWayfarerRebuildOffer/refitRebuiltWayfarer only. Existing shared generated changes were compared to candidate; only these new schema definitions differ. The offer subscription is panel-local so older running worlds retain their ordinary game subscription.

### Game integration checkpoint, 2026-09-12

Exact rebuilt source canonical SHA `56e485c9a9d49b5aa0c5e44a47f88916296896717df386b7240baf408e28ae44`. World module `1cca4fad05b0220e952037b64541e5c0304516ca688aa7692b2dbb0394b5e5d3` passed actual two-account ordinary-provider refit, conservation, private-table/cross-owner denial, wall/passage walking, cockpit/piloting, remote motion observation, unseated-input denial, reconnect and managed isolated restart verification. Evidence/check-in is `docs/handoffs/wayfarer_game_integration_checkin_20260912.md`; raw private identity/state report stays in `.runtime/shipyard-completion/wayfarer-rebuild/game-smoke-summary.json` (no credentials in that report).

Final render/UI candidate source manifest `ffab02a037e55e19e43e42b936cf2f852f4180d3ba645a62d1471644c7cfca14` (1476 files), directory `.runtime/shipyard-completion/wayfarer-game-r003-candidate`. Full build and check passed: 1824 tests/308 files, typecheck, 86-document/provenance check. Its module bytes equal the restart-tested module. Generic isolated smoke also passed on `sidereal-spacetime-dev-wayfarer-rebuild-generic-r0001-smoke`. Root source files exactly match the final candidate manifest; other owners' changes remain unstaged.

The first actual game capture exposed a rendering regression (1887 draws,2146 meshes). This was not accepted for release. Native opaque thin instancing now shares repeated exact primitives, preserves independently faded cutaway clones and roof toggles, and includes native batch metadata in game picking/role paths. Disabled fallback meshes remain allocated. Five new batching regressions plus existing cutaway/preview tests pass; final measured game counters are pending in the check-in.

The native design/index was regenerated after correcting string-shaped review metadata in the two task-owned design ledgers; review meaning and lack of approval were preserved. `npm run art:check` passes. The separate global art-library reference inventory check reports the pre-existing unregistered `reference/art/editor-mockup-5.png`; no reference was silently removed or marked inspected.

Production client candidate staged only: `7934f8e7d7a493ecf5b1ba859a4c63958de6bffcb25e7865af7b0035f4f6f6e3`. Normal live client still `c2cb7dad161399f307b169347313a9c5e01748e5109cbfaeec9361a87eb6d03e` at this checkpoint. The new panel uses a local optional offer subscription; the old world remains usable. Live ship refit and final art approval remain separate owner check-ins, as required by the brief. No contract is marked complete.

- Delegated follow-up render optimization ownership (2026-09-12): native_plan owns `inset-native-batches.ts` and its tests, narrow `inset-native-visuals.ts` integration, and new `inset-native-materials.ts`/tests. Exact material signatures must include all glTF semantics and embedded texture bytes/samplers/transforms. Only this native view may merge compatible opaque geometry; per-placement faded meshes and triangle identity ranges remain separate. Root owns browser comparison, final checks and publication.

Root owns the additive rebuilt-template content export and narrow NewLayoutDialog/useLayout integration: New → Import an existing design → Open rebuilt Wayfarer creates a distinct draft through existing preservation/CAS behavior. No user's current draft or legacy template is replaced. Publication audit also compared the complete staged asset tree to live `c2cb7d…`: every non-construction non-code asset is byte-identical, including current crew/equipment; all1340 added/changed asset paths are construction assets from this task.

### Final material batching and flight-presentation audit — 2026-09-12

Agent writes are frozen. r005 source manifest `fa63c7e120ade01fe3e690d6a8ef97320050500647384bdd767d749ff6e75c84` passed build/check (1832 tests/309 files), world `ffae9acadf56420a8e8dff0d68dc3857b26f7ed72998466e6fcdca674660ee91` identical to the repeated two-account/restart tests. Normal client remains unchanged; staged r005 only. Non-construction non-code assets have zero changes/removals relative to the live client.

Real Shipyard New → Import an existing design → Open rebuilt Wayfarer succeeds with 51 tiles, zero errors/native notes (`wayfarer-r005-preset.png`, viewed). Real stationary game material batches measure 772 draws, 356 active /2095 total meshes, 12.40 ms Render CPU on software Chromium960×640 (`wayfarer-game-r005-counters.png`, viewed). Compared with this browser's original 656 draws/11ms, the remaining cost is 17.7% draws/12.7% CPU; full rendering acceptance is not claimed. Native meshes for independent fading remain allocated; fewer GPU draws does not satisfy total-mesh budget. Rebuilt floors/walls/cockpit and retained fittings are visibly present. Earlier r005-stationary-f3 capture contains the game but no F3 panel; use the counters image for counters.

Root additionally owns narrow integration edits in `apps/client/src/construction-flight-presentation.ts`, its test, `AuthoredFlightReview.tsx` and the `authoredFlightEffects` expression in existing App.tsx: old-only presentation pin suppressed new-source exhaust effects and the review install affordance. Both exact qualified sources now use the display allowlist; authority validation remains separate. r006 build passed but typecheck caught an incorrect function comparison, corrected before any activation. Failed r006 snapshot preserved. Final r007 source manifest `89b227ff5242ee1e78e12067faca626e3709e6ca24f0a9bc6efdd429fa4acf05` is undergoing complete build/check and exact-browser review.

### r007 integration activated — 2026-09-12

Full build/check passes (1833 tests/309 files,86 docs). Initial check had one pre-existing planet terrain timeout under concurrent build; complete unchanged repeat passed. `art:check` passes. r007 source manifest89b227ff5242ee1e78e12067faca626e3709e6ca24f0a9bc6efdd429fa4acf05 has zero root drift at freeze. Production clientd61fafd35674619b31608c35c7f3b4432e75aa1e612e046fa7ff4ffd5462fe00 was staged/activated with expected-live/staged guards; HTTPS index/code verifiedbyte-for-byte. Worldffae9acadf56420a8e8dff0d68dc3857b26f7ed72998466e6fcdca674660ee91 published through managed dev.py with delete-data=never, same databaseidentity, no live refit. Existing candidate cargo schema additions accompanied rebuild offer; no removed tables. Final game evidence: r007 deck F3 790draws/2188meshes; exterior F3 360draws/2205meshes; separate two-ships image shows local newroof+remote stockproxy. All images viewed; full rendering budget notclaimed. Remoteproxy/new-characterstarter remainstock. See wayfarer_game_integration_checkin_20260912.md for pins,conservation,checks,limitations and required owner reportapproval.

Normal HTTPS postactivation: ordinary existing review-account ship d00e8875-2443-4e86-914a-42827aca9d2e loads ready with onecanvas. Rebuilt offer reads actual server report1crew/99items/18containers/81objects/130replacements, exactsource andrevision1→2. Only opened/read the panel; no live refit/reviewcheckbox. NormaldatabasePID458746unchanged, publicclientPID850383. Native r003 ledger now preserves exact r007 game captures and remains unapproved.

Final normal HTTPS screenshot `wayfarer-r007-live-conservation.png` viewed: actual existing review-account ship, new conservation panel, unchecked review and disabled Apply. Browser blanked; isolated5187 publicclient stopped via its own managed candidate state. Normalpublic850383/database458746/dashboard836740 remain running. This handoff stops at the brief's owner conservation approval check-in; no contract completion or final art approval recorded.

### Owner-authorized ship replacement — 2026-09-12

Owner explicitly waived conservation of legacy/player ships and their items and instructed “Go ahead.” This supersedes the live-ship conservation approval hold for this operation. Entry HEAD1da95ec173fe81e81b3fa005889ec7dbbc93e97e, dirty list saved at .runtime/shipyard-completion/live-migration-entry-status.txt; native source/runtime pins and live r007 module/client remain as recorded above. Read-only live audit finds28characters,4old authored construction instances and24legacy player ships. Accounts/character UUIDs and appearance will remain; ships and inventories may be replaced. Use bounded, operator-only, revision-checked per-character transactions, not a database reset. Root owns new replacement adapter/tests, narrow starter profile selection, and reducer registration. No other owner's files will be staged/restored.

Replacement adapter checkpoint: two ordinary Dastari accounts seeded on the old module, replaced via deployment operator on isolated sidereal-spacetime-dev-review-replacement-r001-smoke: both receive new ships/fresh seven-item kits, same character/appearance, exact source, working walking/pilot/remote motion; exact operator replay adds nothing. Module049ef237fb511106db75fae72305d17b1075cca0ebc35d3f4f3b76450e163adb. Managed3191 restart834828→883674 preserved DB, no publish/reset. Strengthened denial assertion exposed a generic Error response; operator rejection now uses SenderError so denial is explicit. General smoke's old spawn route attempted to cross the new wall; helper now follows the new verified central corridor for the exact current source. No gameplay validator relaxed. r003 full build/check1838tests passed; r005 is the corrected candidate. Migration has not run on normal players yet.


### Player replacement live — 2026-09-12

Owner-authorized replacement completed for all 28 player ships. Verified 28 exact rebuilt-source instances and 196 fresh items (seven per character), with character identity/name/owner, appearance and identity-link hashes unchanged. New characters receive the rebuilt template. No database reset; normal database PID458746 unchanged. Public client PID901687 serves585b1e87461d5fff76bdb8d754493507d32b395a954db7fbd28f92ac66ada552; published worldbc9d9504e35a1fba4480dad3487cefaceefa060e06fb47ccf52cf8324e9c7ce0. HTTPS index and24referenced code/style assets match release bytes.

Final r008 source manifest9d7f0e28e651125914729d4ab391ac21b15a07f679dfe2f6178b090ff99cdc9b has zero root/post-build source drift. Full build/check passes1838tests/309files; general smoke passes on isolated replacement-final-r0004-smoke. Exact-module two-account replacement/replay/privacy/flight and managed restart pass. Normal game capture: output/playwright/shipyard-boundary/wayfarer-replacement-live.png. See wayfarer_player_replacement_20260912.md for the complete release evidence and retained limitations. Prior live-conservation hold is superseded by the owner's explicit waiver. No full Shipyard contract or native artistic sign-off is claimed.


### Owner editor refinements — 2026-09-13

Entry HEAD1da95ec173fe81e81b3fa005889ec7dbbc93e97e; current dirty list and release pins saved under .runtime/shipyard-completion/editor-refinements-20260913/. Latest owner scope: merge Rooms into Structure with tile-selected labels; persistent layer controls; locked top orthographic Structure; internal-only Objects including qualified doors; selectable exterior hull with canonical attachment planes; fix floor visibility disagreement; remove temporary engine/thruster cutaway pieces from active design; bounded reactor-output/engine-input power integration and visible five-channel device ports. Existing 250mm inward walls and approved vertical dimensions remain. Native history stays preserved; no new art sign-off inferred. The explicit bounded service request is current owner priority, not a declaration of full C2 completion. Both Dastari and Desparil personal accounts remain protected, as explicitly confirmed.

File ownership before delegation: editor_workspace owns apps/dashboard/src/shipyard/layout/{LayoutEditor,LayoutPalette,LayoutInspector,LayoutToolbar,LayoutPanels,panel-context,state,editor-mode-policy,LayoutCanvas,layout-gestures,workbench.css} and room/visibility helper tests. floor_consistency owns packages/render/src/layout-floor-slabs* and a new focused floor diagnosis helper if needed; coordinate layout-hull.ts edits with root. device_services owns new content/sim/world service adapter files and relevant device metadata, no index.ts registration/shared catalogs/generated bindings or deployment. Root owns HullWorkspace, hull snapping/native contracts/assets, door qualification, shared catalog/schema/index integration, candidate/release and browser/game evidence.

Native follow-up ownership: reused audit_art_exclusions (device_services role) owns new side-armor r004 native derivatives/validation only, preserving existingr003andcatalogs; root owns installation/pins/contract integration. floor_consistency will audit/register candidate doorway250 native renderer adapters after floor fix if available; root retainsworldschema/deployment.

2026-09-13 continued integration ownership: root retains catalogs, profile registry, HullWorkspace snapping, release and schema. `floor_consistency` owns doorway integration into layout-inset-walls/layout-hull doorway lifecycle and frame clipping (coordinate root camera edits); `editor_workspace` owns persistent Hull/Objects context overlays and removes duplicate local Layers UI in HullWorkspace only below inspector block, plus optional browser verification after root freeze; `audit_art_exclusions` audits/implements a bounded r005 exterior-only game qualification adapter in NEW files and focused tests, with no shared registration, generated bindings or deployment. All changes preserve old qualified r002 sources and personal accounts.

2026-09-13 test ownership extension: `editor_workspace` owns NEW isolated reactor-power smoke script and test-result capture, reusing managed isolated endpoint3191 only after root publishes the candidate. No normal database/account creation or deletion, no owner impersonation. Root alone controls publication/restarts and browser slot.

2026-09-13 candidate checkpoint: source snapshot is `/root/shipyard-editor-refinements-r001-candidate`, 4,451 files, source manifest SHA-256 `88d9228891a2c10aa2a355320c1cb8cc3a32bdfc0979d5b35d82c8e82bd6230a`. It was moved outside `.runtime` because the existing Vite private-file deny policy correctly prevents serving an entire app whose path contains `.runtime`; the deny policy was preserved. Its own apps use5191/5192 and the existing isolated3191 database lifecycle. Normal3100 remains untouched. Final module `cc2ab99f892b16498a93ace6925d28f563c493766c502e85bf52b0e0cfa94978` is installed only in `sidereal-spacetime-dev-review-editor-refinements-smoke`. Two-account reactor-power smoke passed on earlier module828b..., and final-module restart/replay proof is underway. The CLI publisher correctly failed to grant the third author permissions: an existing authoring administrator must grant the workspace. No self-grant bypass or new Keycloak user was created; r005 real-game admission evidence is pending this authorization. Root preserves personal ships and all2589 prior published runtime asset files byte-for-byte.

2026-09-13 final-check correction ownership: audit_art_exclusions owns the narrow `layout-opening-treatments.ts` digest dependency fix, removing its unnecessary construction-transactions import cycle while preserving deterministic IDs. Root owns verification and replacement candidate. Full check exposed the cycle before release; no running normal module was changed.

2026-09-13 owner confirmation: keep all engines and thrusters, including the small side thrusters; remove custom hull cutouts and filler work from the revised active design. This confirms the existing r005 default. No engine/thruster deletion is authorized by this refinement.

2026-09-13 compatibility check: old585b client against isolated61b reported a binary row decode error. The new powered field must not alter an existing view ABI. editor_workspace owns narrow construction-flight-views.ts/tests and power-smoke changes restoring the old fitting projection and adding a new owner power projection. Root owns registration, generated SDK and ShipSystemsPanel. audit_art_exclusions audits any other existing ABI changes read-only. No normal publication has occurred.

2026-09-13 aft cutwork audit: replay of the retained voxel ownership builder confirms engine-shaped cuts remain in three aft parts (superstructure--2--5, superstructure-0--5, superstructure-2--5). They belong to seven legacy aft chine/trim placements outside the floor end; retire that complete retained trim assembly in the revised exterior template to avoid disconnected filler returns. Preserve engines/thrusters and all cockpit taper/shoulder/roof pieces, which the source audit establishes are cockpit geometry rather than engine cutwork. audit_art_exclusions owns the new exterior qualification helper/tests for this removal; root owns regenerated source JSON and integration. Old source/art/history remain intact.

### Editor refinements release and owner check-in — 2026-09-13

The complete check-in package is `docs/handoffs/shipyard_editor_refinements_checkin_20260913.md`, including exact source/native/deployment pins, browser and game evidence, private-state conservation, owner decisions and unsupported families. Root source candidate50a91989d65ea154b3e2b99555c093be61747250730482b7e99f9958b9e8e0f2 is frozen outside the private Vite deny paths. A later test-only package-import correction and separately hashed dashboard navigation fix are documented; no historical evidence snapshot was overwritten.

| Gate/deliverable | Current acceptance | Owner/next action |
| --- | --- | --- |
| A dimensions and hull frames | Approved inward250mm/3m clear profile retained;18 uncut r005 side panels use explicit attachment sockets and fixed outside wall plane. Native history preserved; new art remains unapproved. | Owner final exact art sign-off stays separate. Arbitrary overhang remains unsupported. |
| B four editor scopes and visibility | Live; actual browser verifies Structure/Objects/Hull/Systems, one visibility row, locked top Structure, cockpit selection/move/Undo and internal-only palette. | Owner browser review at this checkpoint; no whole-B completion claim. |
| B floors, walls, doors and room labels | Actual fresh6-tile gesture creates partition, authored22-mesh doorway and two-tile named room;36 wall pieces/162 meshes, solid top/bottom floors. Revised Wayfarer loads51 slabs and74/74 placements. | Generic doorway game admission and physical pressure qualification remain open. |
| B/C1 ordinary publication and spawn | Exact r005 source pure qualification passes. Real ordinary authoring test is held by missing legitimate workspace grants; self-grant denial preserved. | Existing authorized construction administrator must grant the isolated workspace before the real publish/spawn check. No owner impersonation or new Keycloak accounts. |
| Owner's bounded power request | Live Boolean reactor/9-engine power; exact05ec passes14 two-owner/restart flags and full generic smoke. Browser toggles8→9→8 on actual isolated ship. | Full physical utility routing/flow and all other C2 acceptance remain open. |
| Revised Wayfarer cutwork | New template retires7 aft fillers, replaces18 side panels, retains all9 engines/thrusters/cockpit;74 source/binding entries,169 collision obstacles unchanged. | Existing personal ships remain r002; new-source live refit/spawn proof still pending. |
| Release/state/performance | World05ecf9504e4ca063ac7fe0c111f12cfa2bf23d00313d37c8354ee2033d4f7f00 and client4a4d558a84a2873c0efa5d82ba896b72c45d8e6226bb5143046abfd9506f4524 are live. All eight protected state domains unchanged.771 draws before/after, Render CPU19.6→18.2ms in same-scene comparison. | Check-in delivered with retained limitations; minimum viable completion and full Shipyard completion are not claimed. |

Managed normal publication used delete-data=never; actual stored module bytes match the tested artifact and normal DB PID458746/identity remain unchanged. Publicclient1169706 and dashboard1169789 were activated/restarted independently. HTTPS index and25 referenced assets match release bytes. All1885 tests, typecheck/build, relevant asset/lint checks and isolated generic smoke pass; the final dashboard-link check required one unchanged repeat after the existing20s planet terrain timeout. Root owns only the three narrow public-link files listed in the check-in. Both personal accounts/ships,20 fittings,14 items,14 containers and appearances remain unchanged. All existing native GLBs remain byte-identical. Browser reviewed and blanked; no native approval or contract completion inferred.


### Wall endpoints and vertical object/hull movement — 2026-09-14

Entry HEAD `1da95ec173fe81e81b3fa005889ec7dbbc93e97e` (git status and git log -5 read before code). The full 779-entry shared dirty-file list is recorded in `.runtime/shipyard-completion/wall-height-edits-20260914/entry-status.txt`; no staging/reset/restore. Current native catalogue/interface byte pins are in `entry-pins.json` in that directory: {"assets/runtime/assembly/catalog-shipyard-r005.json": "9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237", "packages/content/src/ship-hull-interfaces.v1.json": "2379415fc3501b6818daa3b17174d52fa8a91c330c9a1107271b5fcc4efd4e03"}. Installed native/source/release pins remain those of the 2026-09-13 check-in above; no native authoring or world publication is planned.

Owner scope: endpoint handles on internal partitions; Shift-drag vertical movement for Objects and Hull; engines/thrusters belong to Objects for editing and visibility. Root owns partition gesture/validation/handles/tests and integration evidence. A bounded vertical-movement agent owns `HullWorkspace.tsx`, `packages/render/src/layout-hull.ts`, new vertical gesture helpers/tests, `layout-asset-scope.ts`, and scope/visibility labels/policy/tests. Coordinate shared model changes with root before editing; no authority schema or deployment owned by the agent. Root owns hull attachment behavior and its tests. Fitting height constraints must remain honest and validated. Existing isolated publish/spawn workspace grant remains pending; no new account/admin role is authorized by this UI request.

Owner added multi-object vertex measurement during implementation. Scope is a temporary editor polyline with exact vertex snaps, per-segment 3D length/rise and cumulative distance, never document/authority geometry. Root owns Structure measurement integration and shared readout. vertical_editing now owns a new reusable Babylon vertex-pick/measurement adapter with pure measurement math/tests, and its integration into layout-hull/HullWorkspace. Preserve current vertical changes. No meshes/native assets/catalog changes or world deployment.

Owner also confirmed whole-wall body dragging independent of endpoint handles. Root added atomic translation of internal walls with attached openings/treatments and strict support checks; generated exterior boundaries remain tile-derived. Native bindings are never silently translated or stretched. Focused doorway/end-resize/move/recovery tests pass. Browser endpoint drag/invalid/cancel/reload evidence is recorded; final candidate review includes the subsequent height and measurement additions.


### Wall, vertical and measurement live check-in — 2026-09-14

See `docs/handoffs/shipyard_wall_height_measure_checkin_20260914.md` for scope, exact pins, state boundaries and evidence. Frozen candidate `c29708cce023ae77b922fac539e56da8fe76012d959c9f83f43e9e17cb2d28ef` matches root source before/after the passing full build. All1,913 tests/327files, typecheck,87document/provenance checks and scoped lint pass. Native/source/world/game pins remain unchanged; dashboardPID1265394 is live on the normal HTTPS Shipyard. Browser proves endpoint/whole-wall drags, attached door preservation, undo/save/reload/cancellation, Shift-height on actual thruster/hull, height-preserving XY moves, and real multi-object vertex measurements with1m vertical difference. One canvas; final fresh load has no errors; browser blanked. No accounts or live ship state were changed. No full contract/minimum completion or new native/game qualification is claimed. Legacy planar fitting heights and pinned native wall transforms remain constrained; prior isolated publish/spawn grant remains pending.


### Wall drag snap correction — 2026-09-14

Entry HEAD `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`; git status/log -5 read before code. Full shared dirty list and narrow pre-edit sources saved in `.runtime/shipyard-completion/wall-snap-20260914/`. Native revision pins remain prior r005 catalogue/interface bytes: {"assets/runtime/assembly/catalog-shipyard-r005.json": "9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237", "packages/content/src/ship-hull-interfaces.v1.json": "2379415fc3501b6818daa3b17174d52fa8a91c330c9a1107271b5fcc4efd4e03"}. No native, live state or schema change planned. Root owns a new pure partition-drag snapping helper/tests and narrow LayoutCanvas gesture/preview integration. Diagnosis: snapping start/end pointer cells produces a grid-multiple delta, preserving an existing half-grid wall offset instead of aligning the final wall to the selected grid. Fix destination snapping from the dragged wall anchor; share exactly one calculation between preview and commit, preserve attachments and strict floor support. Prior wall/height/measurement release, state protections and pending workspace grant remain unchanged.

Live patch and evidence appended to `shipyard_wall_height_measure_checkin_20260914.md`. Exact layered candidate `f00fb3c837e0302e66ee4f66dbf679440997abca345a934b018105fd1efca02b`; dashboard build `7f0b0e0bf6a6ccc5a67ce5ac607669bd73f56953fc009de4d5b5403ced0a66fe`. All 1916 tests/328 files, TypeScript, 87 document/provenance checks, scoped lint and full build pass. Real browser proves an initially half-grid wall and doorway align with both preview and committed grid coordinates, undo/redo and save/reload; corrected 2 m display has no partial repeating cells. One canvas, no alerts/console errors; captures reviewed and browser blanked. Parent-plus-patch source matched after build, native/world/public game bytes unchanged. No live state or authority changes. No whole-contract completion or new art/game qualification claimed.


### Hull voxel/material/damage visual study — 2026-09-14

Owner requested actual visual comparisons of material/voxel technologies, matching damage granularity, variable-height hull modules, holes and explosions; explicitly authorized subagents. Read git status/log -5 before code; HEAD `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`. Full dirty list and native pins saved in `.runtime/shipyard-completion/hull-voxel-study-20260914/`; pins: {"assets/runtime/assembly/catalog-shipyard-r005.json": "9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237", "packages/content/src/ship-hull-interfaces.v1.json": "2379415fc3501b6818daa3b17174d52fa8a91c330c9a1107271b5fcc4efd4e03"}. Study only; no live catalog, native pin, collision, game state or art approval changes. Root owns shared study specification, managed runner, runtime review/captures, comparison boards and ledger/evidence integration. Panel agent owns `scripts/art_library/hull_voxel_study_panels.py` (Blender sources, PBR textures, exports). Damage agent owns `scripts/art_library/hull_voxel_study_damage.py` and its standalone tests (one material-cell grid, removal masks, exposed-face meshing and conservation evidence). Height agent owns `scripts/art_library/hull_voxel_study_height.py` (height/course layout and study layout metadata/tests), with no shared catalog edits.

Study contract: Blender meters; local X outward, Y along panel, Z up. Attachment base midpoint `(0,0,0)`, width2m Y[-1,+1], core depth0.25m X[0,.25]. Experimental shared visual/damage cell0.0625m, exact integer coordinates, no noise shifting damage off-grid; this is not a new approved production hull thickness. Compare mapped cuboid / stepped geometry plus mapped detail / fully sampled voxel surface, same finish palette and camera. Heights0.75/1.5/2.25/3m generated in fixed-size courses; no stretching of voxel/texture scale. Intact, small through-breach, large explosive breach and retained debris come from deterministic removed material cells. Visual blast is an explicitly staged render, not an authoritative explosive simulation. Keep exact input/output sources and actual screenshots.

Offline r002 visual study delivered: see `hull_voxel_material_study_20260914.md` for the image package, exact hashes, comparison findings and limitations. Fourteen actual GLBs, ten study tests, real Babylon browser loads/captures, full check (1,919 tests/328 files), build and art:check pass. Artifact manifest `65ca5ebbd806ee5abcc85ce5e793d1ddeef1055d445ad4c0f9a9655245fe139e`; reviewed artifacts/source/native pins rechecked unchanged after validation. Library index regenerated; whole-library check remains flagged solely for the unrelated unregistered `reference/art/editor-mockup-5.png`, which was not altered. Sources and failed first study preserved. No live deployment/state change, new art approval or Shipyard contract completion is claimed. Prior game acceptance and workspace grant gates remain open.

### Layered hull, reference finishes and interior damage — 2026-09-14

Entry git status/log -5 read before code; HEAD `599d2c7a8ab2c3553f4db8fb63ea5624511a63f0`. Full shared dirty list and native pins saved under `.runtime/shipyard-completion/layered-hull-20260914/`; current pins {"assets/runtime/assembly/catalog-shipyard-r005.json": "9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237", "packages/content/src/ship-hull-interfaces.v1.json": "2379415fc3501b6818daa3b17174d52fa8a91c330c9a1107271b5fcc4efd4e03"}. No staging/reset/cleanup. Owner authorized layered panels, partial craters, reference-led finishes and modular width/height/snapping; then added interior wall damage affecting room pressurization. Preserve r001/r002 studies and all existing live assets. Root owns native layered model/exports, managed runner, browser/render review and integration. Delegate new isolated material recipe/reference notes and authority audit/implementation with explicit file ownership. No art sign-off is inferred; no live publication before exact candidate evidence and applicable check-in.

Concrete delegated ownership: layered_materials owns new `hull_layered_materials.py` and `layered-reference-notes.json`; layered_contract owns new `hull_layered_contract.py` and its tests; interior_damage_authority owns new sim `construction-panel-damage.ts`, `construction-panel-damage-study.ts`, tests and world `construction-panel-damage.test.ts`. Root owns new managed runner/scene/gallery/validation/browser artifacts and package export registration. No agent deploys. Shared r003 sample grid is 1/32m; exterior stack .03125m skin + .09375m rib/cavity + .125m armor; interior .25m symmetrical double skin/rib specimen. These are review assemblies, not an extra replacement of the installed inward structural wall or approved native adapters.

Layered r003 review checkpoint: `layered_hull_pressure_checkin_20260914.md` links all native/render/browser/pressure evidence, conservation and limitations. Artifact manifest `533105f59ddf3ba9525b1c15bfa2d2b4ef08509a4bd984e171d1ed0ad6443df1`; scoped source and native hashes rechecked unchanged. 22 actual GLBs,49socket pairings,10Python+10TypeScript tests and real Babylon/pressure controls pass. Build/art checks pass. Broad check has unrelated flight exact-rest residuals; planet timeout passes isolated rerun. Fresh isolated smoke `sidereal-spacetime-dev-layered-panel-r003-r0001-smoke` fails existing propulsion assertion, retained without reset. Library index refreshed; unrelated editor-mockup-5 inventory mismatch retained. No live publication or state mutation, no new artistic approval and no full Shipyard contract completion. Actual hit-to-persisted-wall-damage/render/collision/pressure integration remains a separate required gate.

### Wayfarer hull-layout concept review — 2026-09-14

Owner requested an assembled appearance proposal and candid comparison to `reference/art/3d-rpg-after.png`. Entry HEAD `c1f2eb4a9c3d5fa637c8b3c9feeb238c8012adee`; git status/log -5 read, dirty list and native pins saved under `.runtime/shipyard-completion/wayfarer-hull-layout-20260914/`. No code/native/live edits planned. Visual inspection finds r003 flat repetitive atlas does not reproduce reference depth, framed bays and differentiated service/identity modules. Produce explicitly labeled AI concept comparison using exact supplied reference and actual r003 render; preserve prompt and outputs. This is a design illustration, not Blender/game or snapping qualification.

Wayfarer appearance concept delivered at `assets/art-library/hull-voxel-study/wayfarer-layout-concept-r001/`; built-in image tool used with original 3d-rpg-after reference plus actual r003 panel. Prompt, original output, input/output hashes and candid REVIEW.md retained. Ledger r004 is concept-only; latest native model study remains r003. Recommendation: shared stepped frames and a curated plain/service/vent/utility/identity sequence, mapped fine details, controlled projections. Current r003 art remains too flat/repetitive to call final. Image is not dimensional, native or game evidence. No application/code/asset deployment or contract completion.

### Framed Wayfarer native implementation — 2026-09-14

Owner approved implementing the concept direction, including front panels, redesigned engines and translucent block plumes. Entry HEAD `0de90fe8913bd84db1a9e7f32aefd91b0d7690c8`; git status/log -5 read before code. Full shared dirty list and native/runtime pins preserved under `.runtime/shipyard-completion/wayfarer-framed-20260914/`. Current branch ifcs-update, no remote configured; PR scan failed for missing remote, owner asked for destination asynchronously. Preserve shared tree; no staging/reset/cleanup of other work. Root owns shared specification, integration/catalog/delivery, exact full-ship evidence, validation and review check-in. Native hull agent owns new `scripts/art_library/framed_hull.py` and output side/front source assets; engine agent owns new `scripts/art_library/framed_engines.py` and engine source assets; plume agent owns `packages/render/src/flight-effects.ts` and its tests only (coordinate before modifying any other file). No agent publishes or edits authority/IFCS.


Framed Wayfarer presentation check-in: native hull r002 (sides and six front profiles), engine r003 (six definitions/nine retained poses), shared runtime-r001 libraries and stepped translucent achieved-output plume are implemented. Exact isolated candidate check passes 1,901 tests/325 files, build/art/typecheck/scoped lint/format/docs. Resource caps remain unchanged; final browser front/rear draw calls are 328/350 versus 457/479 prior, Render CPU medians 2.4/2.5 ms versus 3.7/3.6 ms. Exact candidate game-loader fixture captures and normal unrouted Shipyard native selection/31.25 mm height movement/Undo proof are preserved. Two existing inward wall-fit notes remain separate. All five original physical/native source pins, nine engine poses/nozzles and database PID 458746 remain unchanged; no world publication or state edit.

Managed normal game release 20260914-141801-048e6f35a49f, complete digest 048e6f35a49fffb161d1361dda21cf5f53e69c1e24f73c978525fe99299c7b88, is active. 28 normal HTTPS responses including both shared kits match. Independent dashboard asset refresh/restart corrected stale Vite public asset indexing and serves the same native kits. Full check-in package: `wayfarer_framed_native_checkin_20260914.md`. Exact art final sign-off remains pending; no whole Shipyard contract or damage/pressure qualification is claimed. Required PR awaits repository URL (checkout has no remote); no staging/reset/clean/restore/commit was performed. Prior source/art attempts and frozen candidate verification are preserved.


### Exterior armor geometry correction — 2026-09-14

Owner rejected the framed r005 implementation as an insufficient match to the accepted whole-ship concept and asked for a further Blender pass with independent agent comparison and texture/bump detail. Entry HEAD cd09510ca30705a49bbd38a010d775be30aef0c7; git status/log -5 and all source/native/presentation pins recorded before code in `.runtime/shipyard-completion/armor-geometry-pass-20260914/entry.json` and `entry-status.txt`. Shared working tree and other-owner staged/unstaged work remain untouched. Preserve current live release until the new native geometry, independent reference review and exact candidate browser evidence pass. Interior wall art, physical interfaces, engines/thrusters, plume and authority are not targets of this correction. The new exterior must read as a separate armored shell: strong caps/shoulders, deep cassettes, broad visual bays and wrapped bow armor. Fine fasteners, seams and wear should use maps. No full Shipyard contract or final artistic sign-off is implied.

Native armor delivery baseline audit is assigned to `armor_delivery_checks`:
read-only source audit plus dependency install/check/build/art checks in isolated
`/root/wayfarer-armor-pr`; logs only under the armor-geometry entry evidence folder.
No shared source, Git index, service publication or native file ownership granted.

Armor r004 first native proof: proof-01 failed the inherited shoulder bound;
proof-02 fixed that tip but failed the paired reveal seam bound. Both preserved.
Proof-03 passes independent GLB/socket/material/mating checks (6 models, 3,928
triangles), with separate armor/liner meshes and portable normal/color/roughness
maps. Exact game-loader partial fixture was captured against a new same-camera
baseline (alpha -2.75, beta .955); 17 new placements and 8 explicitly old hull
entries. The independent visual reviewer withheld propagation: dark rails obscure
pale end shoes, including the bow. Root identified coplanar rail/shoe faces;
terminate rails around the shoes before the next proof. No visual acceptance,
publication or final owner approval has been recorded.

OOM continuation: owner requested resumption; shared HEAD now146c4401 (other
owner's IFCS phase4 commit). Saved new status/memory evidence in the entry folder.
Previous agent processes ended and proof-04 has only interrupted build scaffolding;
keep it as interrupted history. New `armor_native_resume` owns only native recipe,
interfaces, validator, native renderer and new r004 hull attempt outputs;
`armor_review_resume` owns independent comparison records only. Root retains
assembly/browser review, packaging, ledger and isolated PR delivery. Serialize
Blender renders and browser captures, close the browser after capture, and avoid
parallel app builds during image work.

Proof-05 (fresh after interrupted proof-04) passes independent native and
same-camera game-loader prototype review. The corrected geometry terminates dark
rails at the pale shoes; mapped transverse cap courses preserve broad surfaces.
Lossless proof library SHA256 b8e0b1baadcfc9b0aca3a85745c3080c3de616c0e989b14c3f1cc78e679a9b45
preserves all mesh/UV/material bytes. Browser had zero application errors and was
closed after capture. Full family propagation is now authorized by the prototype
gate; final full-family and exact assembled review remain required. The existing
public release and dashboard were restarted after OOM via managed up commands;
no new revision activated and no database publication/state edit performed.

`armor_helper_audit` owns read-only review of coordinator review/packaging helpers
and a new audit report in the r004 review folder. No source or Git mutations.


Complete-family armor `final-01` passed the native bounds/material/group validator but failed the independent exact-render review. The retained report is `assets/art-library/framed-wayfarer/armor-correction-review-20260914/final-01-review.md`; all eight whole/side/detail/separation browser captures and their hashes are frozen under `r004/browser/final-01/`. Corrections are a true cyan-lens pocket (coplanar rail overlap), local-edge diagonal UVs, the missing single-panel identity emblem, and fitted bow bumper/cheek terminal returns. Existing bounds admit the bow correction. `final-02` is being authored; no acceptance or publication inferred. The current check-in package is `wayfarer_armor_geometry_checkin_20260914.md`. The native/browser render slot is serialized after the memory incident.


Armor r004 final-03 is ready for owner art review: all46GLBs/33640triangles,14native and8exact game-loader images pass independent comparison. Source49d7fb868d9572b3886ed102cfce624579128b08bfae56c6a407f33a904346fb; sharedGLB7e876ad6a313b918e9497a2dc8cdb36236aa576a14b91c115d4b181b399b80d3. final-02 bevel-sliver failure is preserved; no thresholds relaxed. Strict cyan face-ownership and bow contact/owning-space checks pass. Same-camera bare image matches final-01 exactly. Upstream-main reproduction produces all6prototype GLBs byte-for-byte; all46archived exports validate after extraction. Project check/build/art still reproduce inherited baseline missing files. Exact check-in: `wayfarer_armor_geometry_checkin_20260914.md`. No live native/presentation pin or state write; six pinned files unchanged. Canonical design revision6 awaits owner art review, with prior installed design5 unchanged. No larger Shipyard contract marked complete.

Art delivery published as draft PR #3: https://github.com/Dastari/sidereal_spacetime/pull/3 (`wayfarer-armor-geometry`, implementation 50891c6b5900e1d260f030d834bd945821a9dda6). Exact current native candidate is ready for owner art review. Repo-wide baseline gaps remain explicit; no main merge or live activation. Eight other-owner LFS checkout differences stay unstaged. Full-library check also notes the unregistered existing editor-mockup-5.png; all current revision evidence hashes pass.

PR #3 final remote HEAD verified: `34c663dff7cfdf1b8089338617f0959d2ba508d5`; draft/open, base main. All66new LFS objects uploaded. Only the eight preexisting unstaged LFS checkout differences remain in the delivery worktree. Final receipt: `.runtime/shipyard-completion/armor-geometry-pass-20260914/final-delivery.json`. Browser and native authoring jobs are closed.


### Reusable backed armor kit — owner correction 2026-09-14

Owner requests bulk behind decorative armor, a common kit for straight/angled/bulkhead boundaries, and replacement of Wayfarer-only front pieces. Another Astra agent must review design and native/reference evidence. Before code, git status/log -5 recorded: HEAD 2af5fb3e98057f577b61a657e71f61067c7d338b, 1237 shared dirty entries. Full list and current native/presentation/release pins: `.runtime/shipyard-completion/armor-block-kit-20260914/entry-status.txt` and `entry.json`. Preserve other-owner work and exact r004 history. New pass starts native r005/design r007; no inherited approval. Root owns contract, review fixture/browser, records and isolated PR delivery. No live state changes until exact candidate gates.

First native r005 proof-03 passes independent Astra review for propagation: seven native models demonstrate a true 0.75 m backing, 0.25 m finish/frame, joined bays, half-height convex 45-degree and concave 90-degree interfaces. Exact imported native and exploded captures are preserved. The strict companion checks exported closed backing volume, finite geometry, named contacts and disjoint ownership envelopes. Earlier render failures remain recorded. Full Wayfarer, alternate outline, browser parity and final independent review remain required. Review: `assets/art-library/framed-wayfarer/armor-block-review-20260914/first-proof-review.md`.

Complete native family-02 passes geometry (75 models, 14,012 triangles; 11 assemblies; 150 measured backing contact faces; 42/54/23 matched closed-boundary connections). Independent whole-browser review passes the added bulk and common bow direction but rejects the clipped identity graphic. All 15 native and 12 browser images, hashes and failed-review report are retained. Native family-03 fixes the single-bay graphic without changing geometry. Root also corrects private review visibility to preserve initially hidden game mesh prototypes; no game source, live pin or validator is changed. Final browser coverage will include the alternate tug, height courses, bulkheads, 32 directions and finite junction registry.

Native r005 family-03 is ready for owner art review. Independent Astra passes16native/21browser images,76models/12assemblies; identity crop corrected, existing75geometry streams unchanged. Source f0f381f1f9b38a8b19cb6a91226aafbff082e678e9471b607c0823c15fdbf2ec; library dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8. Exact check-in: `wayfarer_armor_block_kit_checkin_20260914.md`. All six live pins/release unchanged; HTTP200 client/Shipyard. Fresh isolated Blender proof reproduces7GLBs byte-for-byte,76archived exports revalidate and repack exactly. Required repo checks reproduce inherited missing modules/source assets. Canonical design7 awaits owner review; no live installation or whole-contract completion.

Reusable armor delivery verified on draft PR #3, remote HEAD `36c3fa77d2ba1d9fcac4929262e9b8df6ba759cc`. LFS upload completed. The isolated delivery tree retains only the same eight preexisting tracked LFS checkout differences unstaged. Final receipt: `.runtime/shipyard-completion/armor-block-kit-20260914/final-delivery.json`. No merge, live activation or new artistic sign-off; this is the native owner check-in.
