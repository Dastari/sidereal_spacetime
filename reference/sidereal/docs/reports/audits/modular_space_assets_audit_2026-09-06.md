# Modular Space Assets and Walkable Hulls Audit

Status: Reference
Lifecycle: historical-report
Category: report
Last updated: 2026-09-06
Owners: architecture + art tooling + gameplay + client + dashboard
Scope: Code-backed assessment of modular ships, walkable stations, Blender MCP and 2D versus 3D presentation.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/ship_construction_blocks_contract.md
- docs/features/active/dashboard_game_authoring_runtime_contract.md
- docs/plans/active/modular_space_assets_and_interiors_plan_2026-09-06.md
- docs/guides/blender_space_asset_pipeline.md

## 1. Findings as of 2026-09-06

The project has **modular authoring schemas and an editor, but no assembled-hull
runtime**. Replacing ship PNGs alone cannot deliver construction or walkable rooms.
The user's confirmed camera preference is straight top-down. They are also open to
3D ship rendering. Both presentations can use the same construction model and 2D
server simulation; the art workflow now retains editable Blender geometry.

This audit followed the construction, Shipyard, Foundry/Atelier, baseline authoring,
spawn, physics, player control, replication, persistence, asset delivery, client
rendering, native/WASM and dev-tooling paths. It is an integration assessment, not
a claim that every repository file was inspected.

| Area | Evidence in the repository | Integration gap |
|---|---|---|
| Construction schema | `crates/sidereal-game/src/block_registry.rs`, `hull_registry.rs`, `hull_grid.rs`, `hull_validation.rs` | Explicitly authoring-only; no live Hull component or spawn system. Multi-cell footprints and clockwise cardinal facing already exist. |
| Authored examples | `data/content/blocks/`, `data/content/hulls/ship__scout_v2/definition.json` | Five example block packages; Scout V2 has `spawn_enabled: false`. Bridge tile reference is null. |
| Shipyard V2 | `dashboard/src/features/shipyard-v2/`, `dashboard/src/lib/shipyard-v2.server.ts`, gateway `registry_authoring.rs` | Block and hull saves exist. Grid uses category swatches; `BlockVisual` contains only `tile_asset_id`. No atlas, roof, deck or interior edge schema. |
| Pixel editing | `dashboard/src/features/foundry/sprite-editor/SpriteEditor.tsx` | Imports pixels into and saves an existing asset through the gateway payload proxy. Its documented scope excludes creating a new asset; no tileset importer or Blender job queue. |
| Content packages | `data/content/assets/corvette_01/definition.json`, `crates/sidereal-game/src/registry_json_compose.rs` | Current authored packages are JSON. Older construction documents still describe proposed Lua registry files that do not exist. Use the package publisher and composed runtime catalog. |
| Original/live world | `baseline_authoring.rs`, `authoring_policy.rs`, active dashboard authoring contract | Retained baseline merge and durable owner commands are reusable. Hull compilation is absent. Existing live-edit allowlist must not be widened to arbitrary structural mutation. |
| Physics | `crates/engine-physics/src/mass.rs`, `crates/sidereal-game/src/ship_registry.rs` | Current ship authoring uses texture collision; mass path uses rectangle dimensions for inertia. Need block-derived CoM, inertia and compound geometry. |
| Player movement | `crates/sidereal-game/src/character_movement.rs` | Fixed-step player movement/control switching exists. No deck-local frame, room navigation or boarding transition. Default free-space speed is 220 m/s, unsuitable for a 2 m room grid. |
| Renderer | `bins/sidereal-client/src/runtime/scene_world.rs`, `app_builder.rs`, `assets.rs` | World uses Camera2d and Material2d families. No composite hull tile renderer or mesh hull renderer. |
| 3D foundation | `bins/sidereal-client/Cargo.toml` | `bevy_pbr` is already enabled, but glTF scene loading is not wired. This is capability evidence, not proof that adding a Camera3d is sufficient. |
| Delivery | `crates/engine-asset-runtime/src/lib.rs`, client `owner_manifest.rs`, `startup_assets.rs` | Authenticated gateway payload/cache path exists. Model subassets and atlas frame/channel dependencies need explicit resolution for native and byte-backed WASM. |
| Persistence/distribution | Active dashboard authoring contract; DR-0040 | Durable identity and receipts exist. Hull/crew ownership groups and interior redaction still need implementation and tests. |

## 2. What was made concrete

- Installed project skills: `blender-modeling` and `pixel-art-sprites`, from
  reviewed, pinned sources recorded in `scripts/art/provenance.json`.
- Installed Blender MCP 1.9.1 from a pinned upstream revision into `.art-tools/venv`.
  Its declared MCP SDK requirement is `<2`; installed SDK 1.29.1 satisfies it.
  Pillow 12.3.0 and requests 2.34.2 were checked against PyPI at installation.
- Verified Blender 4.3.2, a real MCP initialization, scene inspection and Python
  execution. The bridge uses a virtual display, loopback sockets, safe mode and
  disabled telemetry. No third-party asset generation service was called.
- Generated **73 original prototype tiles** from actual editable Blender meshes:
  8 floors, 16 wall connection masks, 16 hull masks, 21 equipment tiles,
  4 door frames, 4 damaged hull examples and 4 character test frames.
- Exported individual RGBA PNGs, matched albedo/local-normal/emission atlases,
  a checksummed manifest, contact sheet, an editable kit `.blend`, and a second
  `.blend` with a station assembly plus top-down/angled lit renders.
- Built a self-contained browser review board with ship/station selection,
  roof switching and local character movement/collision. This is an **art mock-up**,
  not multiplayer gameplay or a server-persisted station.

2026-09-06 expansion after art review: the kit now contains **185 frames across
six named faction palettes** (1,110 albedo variants), including 48 angled armour
orientations, multi-cell engines/power/shield generators, freight and trade crates,
fluid/fuel containers, resource pallets and two eight-frame airlocks. The original
73-frame export above records the initial milestone. A twin-boom frigate composition
and faction palette comparison now accompany the station and ship-interior studies.
Palette changes share geometry; these are starting themes, not six finished fleets.

The source is original procedural geometry. Reference images guided subject matter,
palette and modularity; no pixels or models were extracted from them. The sample is
a pipeline and scale proof, not the complete final-quality production art library.
It deliberately exposes the distinction between unlit albedo and lit 3D rendering.

## 3. Presentation recommendation

**Use Blender as the master, and benchmark orthographic 3D presentation before
committing the game to exclusively baked tiles.** Keep gameplay in XY with Avian2d
and f64 authoritative coordinates. Height, roofs and lighting are presentation data.

| Choice | Strengths | Work/cost specific to this project |
|---|---|---|
| 2D atlas instances | Fits current material/camera architecture; compact assets; deliberate pixel cleanup | Atlas/chunk renderer, normal rotation, cutaway layering and bounds. Arbitrary ship rotation and zoom cannot preserve a fixed pixel grid perfectly. |
| Top-down 3D meshes | Rotating lights/shadows, roof cutaways, damage geometry, common interior/exterior art | Dedicated 3D world layer and orthographic camera; depth/compositing with existing 2D backgrounds, effects and UI; model cache; lighting parity; draw-call/triangle/shadow budgets. |
| Distance-based mixed presentation | 3D near ship/inside, cheap composite/icon at range | Worth considering after one renderer works; doubles presentation QA if introduced immediately. |

Bevy's PBR dependency being present lowers setup cost. It does **not** establish
WebGPU performance, a working glTF loader or compatibility with the existing
Lighting V2 contract. The generated lit scenes are offline Blender renders, not an
in-engine benchmark. Do not select 3D physics, perspective flight, or networked Z
motion merely because the visuals become 3D.

## 4. Decisions that the artwork cannot make

1. **Two kinds of occupancy:** construction blocks occupy structural cells;
   floors/fixtures/walls describe interior space. A reactor can occupy multiple
   cells while its room has surrounding walkable floor. Cosmetic pixels do not
   define mass, collision, doors or navigation.
2. **Walls belong on edges.** Floor centres and wall/door edge anchors are distinct.
   A floor-cell-only placement API is insufficient for interiors. The prototype
   assembly was corrected to put bulkheads on cell edges.
3. **Moving frame:** persist a character's hull/deck reference and f64 local pose.
   The owner shard derives world pose from the hull. World motion and local walking
   cannot independently write the same authoritative Position component.
4. **Collision domains:** a solid exterior ship collider must not trap its own
   passengers. Interior wall/door collision and external ship collision need
   explicit domains and boarding rules. A texture convex hull also fills holes
   and concave bays, so it is not a construction-footprint union algorithm.
5. **Visibility:** hiding a roof in the renderer is not permission to receive the
   interior. Outside observers get exterior structure; crew, rooms, inventories
   and machinery details require the appropriate visibility lane and redaction.
6. **Live edits:** moving a bulkhead over an occupied cell must fail validation or
   perform an explicitly designed relocation. Rebuild collision, navigation,
   structure and derived stats from one validated revision at a fixed-tick boundary.

## 5. Evidence and limits

Artifact checks verify unique IDs, all 16 cardinal masks, nonoverlapping atlas
frames, matching channel silhouettes, binary alpha, a maximum 48-colour albedo
palette, edge extrusion, hashes and normal encoding. Chromium verified the review
page without script errors, movement, equipment blocking, roof toggle and ship
selection. Workspace fmt, Clippy and check were run; no Rust/client gameplay code
was changed in this investigation. Native and WASM rendering performance remains
unmeasured, and no downloadable game client was republished.

## 6. External sources reviewed

- [Blender MCP source and installation](https://github.com/ahujasid/blender-mcp/tree/c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9): the installed bridge/add-on pair and local execution mechanism.
- [Blender modeling skill source](https://github.com/roble3/cc-blender-skill/tree/11016c9a5847897491dde935c346571bd7548e3d/plugin/skills/blender-modeling): named geometry and mesh construction guidance. This is a smaller community source; inspected rather than selected by popularity alone.
- [Pixel art skill source](https://github.com/omer-metin/skills-for-antigravity/tree/e8dcf4e8737921a10088bd5c9eb65e81f74c051f/skills/pixel-art-sprites): palette, silhouette, atlas and integer-scale guidance.


## 7. Implementation update — 2026-09-06

The initial audit above records the starting state. The kit now has 201 frames in
six palettes, including three rocket-pod sizes, fusion and ion pods, compact side
jets and a shaded sprite channel. The runtime shader has a GPU-rendered animated
exhaust review. `art-starter-content` builds six canonical Wayfarer hull packages
with the approved interior layout, exterior armour, airlock and physical engines.

The shared compiler now resolves structural geometry, mounted equipment, loaded
mass, centre of mass and inertia. Owner-shard spawn emits persisted typed entities;
the shared fixed-step IFCS allocates force and torque across actual fuel-consuming
mounts. Client rendering composes public armour separately from owner-only decks
and fittings, using authenticated asset delivery. Shipyard 2.3 previews these layers
and validates support, connected structure, allowed attachment faces and clearance.

The construction and visibility contracts contain current ownership, handoff and
redaction rules. Walking/boarding, interactive airlocks, functional power/shield
networks and command-driven rebuilding of an already spawned ship remain open.
This source update does not itself establish that the public server was deployed;
operational verification is recorded separately when completed.

## 8. Deployment verification — 2026-09-06

The approved development world reset was backed up outside the repository, then
the canonical maintenance reseeder recreated both existing characters' starter
assemblies while preserving account identities. Offline control-target retention
was corrected and checked across server restarts. The public gateway health and
startup-asset manifest respond successfully through HTTPS.

The native protocol-19 flight check received two public hulls, only its owner's
private hull and 20 fittings, plus all three zone boundaries and the field config.
It moved the controlled hull 94.86 m after restart and consumed a further 1.331 kg
of fuel; graph persistence retained the result. The construction has 91 structural
pieces and starts at 14,680 kg loaded. The saved test evidence is
`artifacts/space_tiles/live_flight_verification.json`.

The canonical publisher produced downloadable Windows client **0.2.61**;
the authenticated public download's 59,944,960 bytes and SHA-256 matched the local
published artifact. The shared WASM client was rebuilt. Chromium with a virtual
display and software Vulkan rendered the actual login UI and fetched startup
assets from the public HTTPS gateway. Ordinary headless screenshots did not capture
the WebGPU surface; use the headed Vulkan setup for visual verification, as also
described in [the browser harness's WebGPU findings](https://github.com/vercel-labs/agent-browser/blob/main/skill-data/core/references/webgpu.md).

Live Shipyard verification found 191 blocks and six valid Wayfarer themes, loaded
both interior/exterior sprite views and produced screenshots without browser
exceptions. Art validation passed for all 201 frames, six palettes, channel masks,
atlas bounds and checksums. The actual exhaust WGSL produced a 24-frame GPU-rendered
review animation. Full workspace fmt/Clippy/check, Windows/WASM compile checks,
targeted gameplay/physics/protocol/hydration/privacy/reseed tests, dashboard tests
(403 passing), typecheck, lint, production bundle and documentation checks passed.

This verifies native transport and shared simulation plus separate render/authoring
surfaces; it is not a Windows hardware performance benchmark. Walking/boarding,
interactive airlocks, power/shield networks and live structural reconstruction
remain the next construction milestones.

2026-09-06 browser transport follow-up: the installed development WebTransport
certificate had expired on 2026-03-21. It was renewed through `siderealctl cert`,
and the public stack restarted to advertise the matching hash. Startup and the
certificate task now renew within one day of expiry; orchestration tests cover
reuse and renewal. Browser certificate validation remains enabled.
