# Changelog

## Unreleased — Shipyard player builder design, 2026-09-25

Recorded the owner's decisions on player ship building and voxel-destructible ship structure. Added a design for the construction rules, an agent-friendly author → voxelise → style pipeline, damage authority, efficiency budget, a shared editor core and a phased plan. Evidence comes from a deterministic headless Blender prototype, `scripts/art_library/voxel_style_prototype.py`, which outputs a Wayfarer-style section with slope/arc bow, styled voxels and impact damage. Documentation and prototype only; no runtime, authority or asset changes.

## Unreleased — Wayfarer exterior armor native r004

Added separate Blender-authored exterior armor with broad paired bays, recessed cassettes, wrapped ribs and fitted bow returns. Fine surface details use shared color, normal and roughness maps. The 46-model final-03 family passes native checks and independent comparison of 14 native and 8 exact game-renderer images. Sources, compressed exact exports, validation and review evidence are retained in the art library. This is a review candidate; the installed ship and physical interfaces are unchanged.

## 0.1.1 — framed Wayfarer presentation, 2026-09-14

Native Blender hull bays and front panels replace the installed Wayfarer surfaces through an explicitly pinned cosmetic revision. Main engines and small thrusters share the pale/red/navy finish; achieved output drives stepped translucent exhaust. Local game, Shipyard and public stock exterior rendering share the new assets. Physical catalog, collision, pressure, placement, power and thrust definitions remain unchanged.

Editable sources, prior revisions and exact native/browser evidence are retained under `assets/art-library/framed-wayfarer`. Release validation and deployment status are recorded in `docs/handoffs/wayfarer_framed_native_checkin_20260914.md`. This version covers render, canvas UI dependency integration, client and dashboard; final artistic approval remains pending.
