# Changelog

## Unreleased — Shipyard player builder design, 2026-09-25

Recorded the owner's decisions on player ship building and voxel-destructible ship structure. Added a design for the construction rules, an agent-friendly author → voxelise → style pipeline, damage authority, efficiency budget, a shared editor core and a phased plan. Evidence comes from a deterministic headless Blender prototype, `scripts/art_library/voxel_style_prototype.py`, which outputs a Wayfarer-style section with slope/arc bow, styled voxels and impact damage. Documentation and prototype only; no runtime, authority or asset changes.

r004 adds a reusable component kit prototype, `scripts/art_library/ship_kit_prototype.py`. It has 59 voxel-aligned pieces covering hull shapes, face cassettes, glazing, roof modules, external mounts, interior edge types and decorators. The pieces use nine material slots, so three faction themes render on the same meshes, and it adds tiling detail bump, mask decals and theme decorators. The design gains §12: kit contract, theming, decals, wall and pressure edge types, glazing families, hull shapes, mounts and faction strategy.

r005 adds denser face and roof pieces (176 kit pieces), stepped slope and curve skins, a general hull rasteriser and a data-driven dresser. Seven combined designs (fighter, shuttle, corvette, frigate, pirate raider, alien explorer, station) and three blueprint sheets (components, shape tiles, designs) are rendered from the same kit.

r006 adds size-class hardpoints (SM 1×1 to XL 4×4 m). Ion drives are segmented octagonal pods with flange, housing, conduit and nozzle sub-parts plus presentation plumes; thrust blocks, RCS thrusters, turrets and cannons also come in size classes. It also adds 0.25 m slope stepping and five more shape tiles.

r007 adds modular mount assemblies (connector, rotation base, gimbal, head, payload) for 11 weapon and utility kinds in SM/MD/LG, with face-mount variants. The ion drive becomes round, with chunk blocks, a bolted cap and deeper nozzles, and a salvaged ion geometry variant is added. The ships are refitted.

r008 adds an interior architecture kit: floor tiles, edge walls with pressure semantics, doors, derived junction posts, pipework, fixtures, ceiling tiles and 1.75 m cutaway variants. A deck generator builds a full 11-room corvette deck from a room plan. Interior objects are art-library design-id sockets, and a room pod exploded view is included.

## Unreleased — Wayfarer exterior armor native r004

Added separate Blender-authored exterior armor with broad paired bays, recessed cassettes, wrapped ribs and fitted bow returns. Fine surface details use shared color, normal and roughness maps. The 46-model final-03 family passes native checks and independent comparison of 14 native and 8 exact game-renderer images. Sources, compressed exact exports, validation and review evidence are retained in the art library. This is a review candidate; the installed ship and physical interfaces are unchanged.

## 0.1.1 — framed Wayfarer presentation, 2026-09-14

Native Blender hull bays and front panels replace the installed Wayfarer surfaces through an explicitly pinned cosmetic revision. Main engines and small thrusters share the pale/red/navy finish; achieved output drives stepped translucent exhaust. Local game, Shipyard and public stock exterior rendering share the new assets. Physical catalog, collision, pressure, placement, power and thrust definitions remain unchanged.

Editable sources, prior revisions and exact native/browser evidence are retained under `assets/art-library/framed-wayfarer`. Release validation and deployment status are recorded in `docs/handoffs/wayfarer_framed_native_checkin_20260914.md`. This version covers render, canvas UI dependency integration, client and dashboard; final artistic approval remains pending.
