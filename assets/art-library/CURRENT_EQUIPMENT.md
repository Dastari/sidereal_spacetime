# Current Shipyard equipment redesign queue

**Owner direction: these TypeScript voxel-solid models are being phased out as the art source.** Reconstruct the replacements in Blender with authored meshes and materials, preserving their surfaces in runtime exports. Use the old models for scale, placement and integration references. Read [Blender model migration](../../docs/blender_asset_migration.md) before choosing an authoring/export path.

[Reusable agent prompt](prompts/REDESIGN_CURRENT_EQUIPMENT.md) · [Living library](INDEX.md) · [Revision workflow](WORKFLOW.md) · [Machine-readable baseline](current-equipment.json)

Snapshot: **2026-09-08 — 10 reusable equipment assets, 17 placements**. This is the tab in the owner's screenshot. The current assembly catalog is the scope authority; re-enumerate it on every resumed pass. This document establishes the queue. Approved installed revisions and evidence are in the [review board](shipyard-equipment/README.md). Final approval remains in each canonical `design.json` ledger.

[Owner-provided equipment tab](review-context/current-equipment-tab.png)

## Work table

Update the mapped-design column as each precise deliverable is resolved. Read current revision, feedback and sign-off from that linked ledger; do not maintain a second approval counter here. A candidate reference family is not yet a reviewed replacement model.

| Order | Equipment | Current bounds X × Y × Z (m) | Placements | Mapped design ledger |
| --- | --- | --- | --- | --- |
| 1 | [Control seat](#equipment-1) | 1.125 × 1.125 × 1.3125 | 1 | [pilot-seat](designs/shipyard.equipment.pilot-seat/DESIGN.md) |
| 2 | [Command console](#equipment-2) | 2 × 0.75 × 1.625 | 1 | [command-console](designs/shipyard.equipment.command-console/DESIGN.md) |
| 3 | [Wall locker](#equipment-3) | 0.5 × 1.5 × 1.3125 | 6 | [wall-locker](designs/shipyard.equipment.wall-locker/DESIGN.md) |
| 4 | [Engineering reactor](#equipment-4) | 1.5 × 2.75 × 1.6875 | 1 | [reactor](designs/shipyard.equipment.reactor/DESIGN.md) |
| 5 | [Hydroponic tray](#equipment-5) | 1.5 × 0.625 × 1.75 | 3 | [hydroponics](designs/shipyard.equipment.hydroponics/DESIGN.md) |
| 6 | [Crew bunk](#equipment-6) | 1.375 × 2.75 × 2 | 1 | [crew-bunk](designs/shipyard.equipment.crew-bunk/DESIGN.md) |
| 7 | [Medical bed](#equipment-7) | 1.5 × 2.75 × 1.9375 | 1 | [medical-bed](designs/shipyard.equipment.medical-bed/DESIGN.md) |
| 8 | [Lounge sofa](#equipment-8) | 1.5 × 2.75 × 1.375 | 1 | [lounge-sofa](designs/shipyard.equipment.lounge-sofa/DESIGN.md) |
| 9 | [Bridge bank, port](#equipment-9) | 0.5625 × 0.875 × 1.25 | 1 | [bridge-bank](designs/shipyard.equipment.bridge-bank/DESIGN.md) |
| 10 | [Bridge bank, starboard](#equipment-10) | 0.5625 × 0.875 × 1.25 | 1 | [bridge-bank](designs/shipyard.equipment.bridge-bank/DESIGN.md) |

Bounds are measured from the current catalog in source X/Y/Z (width/depth/height), not recommended final dimensions or collision/clearance promises. Local origins are floor based; renderer coordinates use X/height/−Y. The 2 m construction grid does not require every furniture dimension to be 2 m.

## Source and identity contract

**Legacy source chain being retired for visual authoring:** `packages/content/src/voxel-wayfarer.ts` plus `voxel-wayfarer-interior.ts` → semantic material-bearing volumes → `scripts/build_assembly.ts` → sampled/meshed assembly data → `scripts/export_voxel_blender.py` and `voxel_visual_surface.py` → `assets/source/modular_parts.blend` and the assembly GLB. Hydroponics also has an independent authored source and explicitly preserved botanical surfaces; see its record below. The current exported assembly Blender file is not a substitute for reconstructing the other models as editable Blender geometry with materials.

**Replacement visual chain:** selected reference and measured specification → authored Blender meshes/materials/UVs/sockets → validated authored GLB → real Babylon review → explicit owner final sign-off → separately authorized integration/publication. TypeScript retains runtime/content integration. Any needed sampled occupancy/collision/damage proxy is separate from the visible authored surface.

The part catalog contains IDs, labels, category, mesh nodes and bounds; it does not contain equipment balance statistics. Existing implementations must be traced separately. Every proposed stat needs units, basis and status before owner review.

`build_assembly.ts` hashes geometry signatures into runtime asset IDs. Keep the new stable library design UUID separate, preserve old artifact identity, and record an explicit old/new runtime mapping for any approved integration. Placement IDs, transforms and damage drafts remain independent. The two bridge banks differ in runtime identity despite similar thumbnails; compare actual geometry before merging design work.

The reusable prompt targets these Shipyard models. `assets/runtime/equipment` and `art:equipment` are the separate carried/worn equipment pipeline.

## Baseline provenance

- Catalog SHA-256: `3424811c77e2ebda51406e921fb97ec9d2f0d59f68fffa0d4838f1880c5ba8b7`.
- Assembly SHA-256: `eaff0ffc70e662ab0043a0651cca4a9e672213ad6b511a80db88502fee771138`.
- Owner screenshot SHA-256: `4dc6909fa7d5fd5cb197e9b397c8154146d939932dad4c7121b238e7575fe467`.
- The original snapshot is preserved in `current-equipment.json`. Record catalog changes and newly added scope below; never rewrite a historical snapshot to imply it was captured later.

## Equipment records

<a id="equipment-1"></a>
### 1. Control seat

One seated operator; fit the actual rig, footwell, arm/hand reach and unobstructed exit. Occupancy and a valid station grant control; geometry does not.

Runtime asset: `part-c0b6b036f5b3dd8bd2f3`. Catalog label: `equipment control seat`.

**Candidate references — inspect before choosing:**

- [Bridge control chair](assets/fully-complete-constructed-space-ship--bridge-control-chair/revisions/r000/reference.png) · [brief](assets/fully-complete-constructed-space-ship--bridge-control-chair/BRIEF.md) · [current family](designs/pale-studless.chair.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** operator capacity [people], mass [kg], health [HP], seat/hand/foot anchors [m]. These are field requirements, not implemented values.

**Preserved placement IDs:** `equipment-control-seat`.

<a id="equipment-2"></a>
### 2. Command console

Three-display command workstation. Preserve its relationship to the control seat; verify console height, knee space, screen readability and power/data interfaces.

Runtime asset: `part-d9f37a5f7ea6e8d13254`. Catalog label: `equipment control console`.

**Candidate references — inspect before choosing:**

- [Command console](assets/internal-components-2--command-console/revisions/r000/reference.png) · [brief](assets/internal-components-2--command-console/BRIEF.md) · [current family](designs/shipyard.equipment.command-console/DESIGN.md).
- [Bridge console horseshoe](assets/fully-complete-constructed-space-ship--bridge-console-horseshoe/revisions/r000/reference.png) · [brief](assets/fully-complete-constructed-space-ship--bridge-console-horseshoe/BRIEF.md) · [current family](designs/pale-studless.console.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** power draw [W], heat output [W], mass [kg], health [HP], operator reach [m]. These are field requirements, not implemented values.

**Preserved placement IDs:** `equipment-control-console`.

<a id="equipment-3"></a>
### 3. Wall locker

Six placed lockers sharing one current asset. Identify the actual front face before resizing; retain wall attachment, door sweep and corridor clearance.

Runtime asset: `part-c03ec0260cd7329050a8`. Catalog label: `equipment locker  4.7  6`.

**Candidate references — inspect before choosing:**

- [Locker](assets/internal-components-2--locker/revisions/r000/reference.png) · [brief](assets/internal-components-2--locker/BRIEF.md) · [current family](designs/shipyard.equipment.wall-locker/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** usable storage [L], load limit [kg], mass [kg], health [HP], door sweep [m]. These are field requirements, not implemented values.

**Preserved placement IDs:** `equipment-locker--4.7--6`, `equipment-locker--4.7--2`, `equipment-locker--4.7-2`, `equipment-locker-4.7--6`, `equipment-locker-4.7--2`, `equipment-locker-4.7-2`.

<a id="equipment-4"></a>
### 4. Engineering reactor

Ringed power-unit visual in the engineering room. Resolve the pressure housing, mounts, service aisle, coolant, electrical and effect interfaces.

Runtime asset: `part-77728ecc8ad36b0ff45f`. Catalog label: `room engineering`.

**Candidate references — inspect before choosing:**

- [Reactor module](assets/modular-spaceship-design-2--reactor-module/revisions/r000/reference.png) · [brief](assets/modular-spaceship-design-2--reactor-module/BRIEF.md) · [current family](designs/shipyard.equipment.reactor/DESIGN.md).
- [Engineering reactor](assets/fully-complete-constructed-space-ship--engineering-reactor/revisions/r000/reference.png) · [brief](assets/fully-complete-constructed-space-ship--engineering-reactor/BRIEF.md) · [current family](designs/pale-studless.reactor.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** electrical output [kW], idle draw [W], waste heat [kW], fuel rate [kg/h], mass [kg], health [HP]. These are field requirements, not implemented values.

**Preserved placement IDs:** `room-engineering`.

<a id="equipment-5"></a>
### 5. Hydroponic tray

Three placed trays sharing one authored design. Preserve the existing separate plants, grow frame, feed components and documented authored-leaf presentation over sampled matter.

Runtime asset: `part-acbbef7209c4ef100693`. Catalog label: `room hydroponics tray  2.4`.

**Candidate references — inspect before choosing:**

- [Hydro large tray](assets/modular-spaceship-design-2--hydro-large-tray/revisions/r000/reference.png) · [brief](assets/modular-spaceship-design-2--hydro-large-tray/BRIEF.md) · [current family](designs/pale-studless.hydroponics.standard/DESIGN.md).
- [Hydro small tray](assets/modular-spaceship-design-2--hydro-small-tray/revisions/r000/reference.png) · [brief](assets/modular-spaceship-design-2--hydro-small-tray/BRIEF.md) · [current family](designs/pale-studless.hydroponics.standard/DESIGN.md).
- [Hydroponic tiered trays](assets/fully-complete-constructed-space-ship--hydroponic-tiered-trays/revisions/r000/reference.png) · [brief](assets/fully-complete-constructed-space-ship--hydroponic-tiered-trays/BRIEF.md) · [current family](designs/pale-studless.hydroponics.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`, `scripts/build_interior_prop_source.py`, `assets/source/interior_hydroponics.blend`, `packages/content/src/voxel-wayfarer-props.ts`, `assets/runtime/voxels/interior-props.voxels.json`.

**Fields to resolve:** plant capacity [plants], grow power [W], water demand [L/day], yield [kg/day], mass [kg], health [HP]. These are field requirements, not implemented values.

**Preserved placement IDs:** `room-hydroponics-tray--2.4`, `room-hydroponics-tray--1.5`, `room-hydroponics-tray--0.6`.

<a id="equipment-6"></a>
### 6. Crew bunk

Two stacked berths. Fit crew lying length, mattress width, ladder approach and seated headroom; test against the actual room ceiling.

Runtime asset: `part-c41467ac46f6b350df24`. Catalog label: `room crew`.

**Candidate references — inspect before choosing:**

- [Bunk bed](assets/internal-components-2--bunk-bed/revisions/r000/reference.png) · [brief](assets/internal-components-2--bunk-bed/BRIEF.md) · [current family](designs/shipyard.equipment.crew-bunk/DESIGN.md).
- [Crew bunk beds](assets/fully-complete-constructed-space-ship--crew-bunk-beds/revisions/r000/reference.png) · [brief](assets/fully-complete-constructed-space-ship--crew-bunk-beds/BRIEF.md) · [current family](designs/pale-studless.bunk.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** berth capacity [people], supported load [kg/berth], mass [kg], health [HP], headroom [m]. These are field requirements, not implemented values.

**Preserved placement IDs:** `room-crew`.

<a id="equipment-7"></a>
### 7. Medical bed

One patient bed with diagnostic hardware. Keep attendant access, head/foot clearance, monitor and medical service interfaces distinct from clinical gameplay.

Runtime asset: `part-cc610ba071b8eb38ab8c`. Catalog label: `room medbay`.

**Candidate references — inspect before choosing:**

- [Medical bed module](assets/modular-spaceship-design-2--medical-bed-module/revisions/r000/reference.png) · [brief](assets/modular-spaceship-design-2--medical-bed-module/BRIEF.md) · [current family](designs/shipyard.equipment.medical-bed/DESIGN.md).
- [Medical bed](assets/fully-complete-constructed-space-ship--medical-bed/revisions/r000/reference.png) · [brief](assets/fully-complete-constructed-space-ship--medical-bed/BRIEF.md) · [current family](designs/pale-studless.bed.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** patient capacity [people], power draw [W], consumables [item/action], treatment rate [HP/s, proposed mechanic], mass [kg], health [HP]. These are field requirements, not implemented values.

**Preserved placement IDs:** `room-medbay`.

<a id="equipment-8"></a>
### 8. Lounge sofa

Three visible cushions on an elongated lounge seat. Establish seat depth/height, back angle, armrest scale and actual number of usable crew positions.

Runtime asset: `part-73df516feb786d73fc5e`. Catalog label: `room lounge`.

**Candidate references — inspect before choosing:**

- [Sofa](assets/internal-components-2--sofa/revisions/r000/reference.png) · [brief](assets/internal-components-2--sofa/BRIEF.md) · [current family](designs/pale-studless.sofa.standard/DESIGN.md).
- [Lounge straight sofa](assets/modular-spaceship-design-2--lounge-straight-sofa/revisions/r000/reference.png) · [brief](assets/modular-spaceship-design-2--lounge-straight-sofa/BRIEF.md) · [current family](designs/shipyard.equipment.lounge-sofa/DESIGN.md).
- [Lounge red sectional](assets/fully-complete-constructed-space-ship--lounge-red-sectional/revisions/r000/reference.png) · [brief](assets/fully-complete-constructed-space-ship--lounge-red-sectional/BRIEF.md) · [current family](designs/pale-studless.sofa.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** seat capacity [people], supported load [kg], mass [kg], health [HP]. These are field requirements, not implemented values.

**Preserved placement IDs:** `room-lounge`.

<a id="equipment-9"></a>
### 9. Bridge bank, port

Compact bridge display pedestal at negative X. Compare local occupied cells, materials, orientation and footprint with the starboard bank before canonical reuse.

Runtime asset: `part-75910d7a0d27dfc17aaf`. Catalog label: `equipment bridge bank  1.3`.

**Candidate references — inspect before choosing:**

- [Navigation console](assets/internal-components-2--navigation-console/revisions/r000/reference.png) · [brief](assets/internal-components-2--navigation-console/BRIEF.md) · [current family](designs/shipyard.equipment.bridge-bank/DESIGN.md).
- [Personal screen](assets/modular-spaceship-design-2--personal-screen/revisions/r000/reference.png) · [brief](assets/modular-spaceship-design-2--personal-screen/BRIEF.md) · [current family](designs/pale-studless.console.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** power draw [W], heat output [W], mass [kg], health [HP], display/interaction height [m]. These are field requirements, not implemented values.

**Preserved placement IDs:** `equipment-bridge-bank--1.3`.

<a id="equipment-10"></a>
### 10. Bridge bank, starboard

Compact bridge display pedestal at positive X. Retain its own placement identity even if a verified shared canonical design replaces both banks.

Runtime asset: `part-0f14bf002f4c11854337`. Catalog label: `equipment bridge bank 1.3`.

**Candidate references — inspect before choosing:**

- [Navigation console](assets/internal-components-2--navigation-console/revisions/r000/reference.png) · [brief](assets/internal-components-2--navigation-console/BRIEF.md) · [current family](designs/shipyard.equipment.bridge-bank/DESIGN.md).
- [Personal screen](assets/modular-spaceship-design-2--personal-screen/revisions/r000/reference.png) · [brief](assets/modular-spaceship-design-2--personal-screen/BRIEF.md) · [current family](designs/pale-studless.console.standard/DESIGN.md).

**Source chain:** `packages/content/src/voxel-wayfarer.ts`, `packages/content/src/voxel-wayfarer-interior.ts`, `scripts/build_assembly.ts`, `scripts/export_voxel_blender.py`, `scripts/voxel_visual_surface.py`.

**Fields to resolve:** power draw [W], heat output [W], mass [kg], health [HP], display/interaction height [m]. These are field requirements, not implemented values.

**Preserved placement IDs:** `equipment-bridge-bank-1.3`.

## Scope changes and handoff

- 2026-09-08 owner clarification: current TypeScript voxel-solid models are being phased out in favor of Blender models, meshes and materials. This changes the replacement authoring direction; the baseline snapshot and legacy source evidence remain intact.

- 2026-09-08: Initial owner-requested equipment queue and reusable prompt created. No equipment redesign has been inferred to be owner signed off. Existing hydroponics work is a starting point whose evidence and exact revision still need mapping into the living design ledger.
