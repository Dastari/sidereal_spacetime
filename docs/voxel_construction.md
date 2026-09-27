# Voxel construction, rendering and destruction

Status: Voxel data / meshing / Blender study implemented; live destruction proposed
Last updated: 2026-09-08
Owners: Sidereal assembly, simulation and rendering

**Owner clarification: visual model authoring is moving to Blender.** The TypeScript voxel-solid fixtures described below are being phased out as the source of visible model geometry. New asset work follows [Blender model migration](blender_asset_migration.md): preserve authored meshes/materials in the visual export and retain any needed voxel occupancy, material, collision or damage representation separately. This document's existing voxel implementation and proposed authority rules do not require replacement art to reproduce the old coarse meshed surface.

## Implemented foundation

`packages/sim/src/voxels.ts` implements ship-local integer voxel coordinates, 32³ chunks, one-byte material IDs, strict run-length encoding/decoding, exposed-face meshing and bounded voxel removal with dirty-neighbor reporting. Zero is empty. Meshing merges coplanar adjacent faces of the same material, culls interior faces and checks neighboring chunks across positive and negative coordinates. Tests check winding, chunk boundaries, palette boundaries, removal and data validation.

`packages/content/src/voxel-wayfarer.ts` authors continuous decks, low/upper walls, swept stepped armor, a continuous roof, independent markings, consoles, wall lockers, engine bells and side pods. It is a visual fixture matching the existing rectangular walking bounds and station location. Six furnished room areas share an authored partition/furniture collision fixture with the server. Door openings are passable, and props are visual studies: installed-part physics and functional doors, cargo, utilities and room oxygen are still pending. Geometry is sampled at 32 voxels per two-meter tile (6.25 cm); chunk dimensions and construction tile dimensions are distinct concepts.

Run `npm run art:voxels`. It builds the voxel source, performs face merging, creates semantic layer and room meshes in Blender, saves [voxel_wayfarer.blend](../assets/source/voxel_wayfarer.blend), exports [wayfarer.glb](../assets/runtime/voxels/wayfarer.glb), and writes [voxel data](../assets/runtime/voxels/wayfarer.voxels.json), [metrics](../assets/runtime/voxels/metrics.json) and hashes. Blender works on real geometry with material palette colors. The original 887-mesh Blender assembly and editable kit remain available separately; the voxel study is newly authored geometry, not a claimed voxelization of the original mesh.

The game loads the precompiled mesh batches, not 1.73 million cube objects and not a synchronous voxel meshing task at startup. Both camera modes retain the same meshes. The cutaway hides the roof and camera-facing upper wall bands only. No voxel removal reducer is registered and no multiplayer damage is currently implied by the local removal function.

## Data model for M2 / M6

Keep a distinction between an installed gameplay component, its editable voxel material volume, the source blueprint and a derived GPU surface. An engine remains one UUID-bearing installed item with its mass, mount, resource ports and capability state. Its material samples are not separate ECS entities or separate inventory items. Decorative voxel colors never grant engines, armor, fuel or weapons.

Persist a compiled immutable voxel asset hash plus sparse chunk overrides. A chunk key contains frame UUID, deck/part UUID, layer and integer chunk coordinates. Store a monotonically increasing revision and a bounded changed-cell/material run payload. Do not send meshes or full voxel arrays every simulation tick. Immutable assets use the asset cache; approved changes use ordered revisioned deltas and periodic compact snapshots. Reconnect supplies missing revisions or a replacement chunk snapshot. An absent chunk delta does not mean an absent part.

The current export batches all chunks in a visual layer for a small static fixture. Destructible runtime ships should use spatial render chunks or bounded groups of chunks. Remesh only dirty chunks and boundary neighbors in a worker, discard results with stale source revisions, and swap GPU buffers on the render thread. Share palette/material assets. Budget dirty jobs, upload bytes and debris count per frame; keep the previous coherent mesh while a newer revision builds. Physical collision must update in the authority transaction rather than wait for the GPU.

At 64 samples per tile the sampling pitch is 3.125 cm and dense data costs eight times as much as 32³ for the same physical volume. Keep 32³ storage chunks, so a 64-sample tile spans multiple chunks. Treat 64 as an authored resolution tier for hero components rather than raising the whole universe resolution without measurement. Empty interiors remain implicit; binary occupancy/material runs, palette-indexed data and procedural immutable assets avoid dense per-world allocation.

## Authoritative damage and conservation

The single SpacetimeDB authority validates attack/action capability, occupied station or other allowed control grant, weapon resources, range, visibility and server-derived hit geometry. Clients send firing/tool intent, never a list of cells they declare destroyed. Damage resolves against a bounded material query and commits cell changes, part condition, fuel/air breaches, cargo consequences, lost material and persistence receipts together.

Mass changes must use material density / condition or a documented gameplay mass model, including any salvage/debris transfer, exactly once. Hidden fuel still has mass; removing a tank wall does not create free fuel or duplicate its contents. Connected-component analysis determines detached structure on bounded jobs, with a specified temporary frozen/disabled state while analysis runs. Do not spawn thousands of rigid bodies because thousands of voxels were removed: aggregate debris and cap cosmetic fragments. Oxygen and compartments consume the committed wall/door topology, not the render mesh.

Only admitted crew/editors receive internal room/equipment/utility chunks and their changes. Exterior observers receive visible shell/part state and permitted coarse damage, never cargo, fuel, scripts or sealed compartment topology. Cutaway is presentation; it cannot be the privacy mechanism. The current private-owner lab already limits all ship rows to the owner, but shared-crew/exterior redacted lanes remain M1/M2 work.

Blueprint editing and live damage have separate histories. A hit must not mutate the world's original authoring state. Explicit capture-live-to-blueprint and privileged live refit keep revision checks, durable operation receipts, UUIDs and deletion history. Scripts and AI use the same damage/repair/refit validators.

## Remaining acceptance gates

1. Immutable part source, palette and voxel mass metadata validate before publication; rebuilds preserve stable part/chunk IDs.
2. Two clients see the same damage after latency, reconnect and restart; unauthorized clients cannot subscribe to interior or storage deltas.
3. Simultaneous damage/repair/refit cannot resurrect removed parts or duplicate cargo/fuel; stale revisions fail atomically.
4. A boundary hit updates the adjacent render chunk, collision, structural connectivity and compartment seal consistently.
5. Damaged engines affect actual available thrust; plumes use achieved actuator output. See [IFCS integration](ifcs_integration.md).
6. Measure worst-case remesh bandwidth/latency, memory, GPU uploads, chunk fragmentation and fleet draw calls on named hardware before claiming scale.

Algorithm reference: [Mikola Lysenko's exposed-face and greedy-meshing discussion](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/). The project implementation is small and local, with tests; no dependency or external code bundle was installed.

## 2026-09-08 voxel relief and PBR update

Walls and exterior belts now have shallow individual block relief and several pale/indigo material tones. Semantic room batches retain engineering, hydroponics, storage, crew, medbay and lounge geometry separately. Meshing keeps different palette/material faces separate while merging uniform interiors. The denser study contains 1,733,777 occupied samples and 65,736 triangles in 18 source batches; the glTF exporter splits these further by surface material. `npm run art:check` reports the actual primitive count and verifies finite bounds, normal/roughness textures, UVs, room/roof nodes and asset hashes. This is still much smaller than drawing every cube separately, but fleet/LOD/remesh performance has not been measured.

The renderer also uses a Blender-exported voxel asteroid and a block-shaped crew proxy. Shared 512px brushed normal/roughness maps add surface response without defining structural damage. Geometry and palette data still define each voxel. The neutral reflection panorama is a lighting asset, not a world sky/authority record.

## 2026-09-08 material-bearing bricks

Use the studless construction-brick language in the [visual theme](visual_theme.md). A palette entry identifies matter and its surface response, not just RGB. The eventual compiled descriptor includes base color, metalness, roughness, opacity/transmission, index of refraction where supported, emission color/strength, and a separate gameplay material reference for density, strength and sealing. Decorative changes never change gameplay capability implicitly.

The mesher must distinguish opaque, transparent and emissive surfaces. Glass remains occupied for collision and pressure; cull same-material internal glass faces, retain optically meaningful glass/air and glass/opaque boundaries, and keep transparent rendering in bounded separate batches. Do not reuse the current opaque occupancy-only face culling for a glass release. Avoid one light per emissive cell: cluster visible emitters with a bounded light budget and preserve emission even when an illuminating light is culled. None of those rendering choices authorize disclosure of another player's interior.

The current generalized Blender sampler preserves constant Principled base color, metalness, roughness, emission color and emission strength. Linked material inputs and transparent/transmissive materials need a supported bake/optical export path before acceptance. These unsupported cases must fail validation explicitly. Transparent brick rendering and material-strength-aware combat are planned, not implied by the local opaque voxel removal preview.
