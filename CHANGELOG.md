# Changelog

## Dashboard 0.2.2 — distinct native armor choices, 2026-09-15

Collapse 13 equivalent native armor variants in the palette and label total depth so the 0.5 m bulkheads remain distinct from 1 m exterior armor. All placed native IDs and their exact models remain resolvable.

## Dashboard 0.2.1 — palette sizing and native previews, 2026-09-15

Hull and Objects now share Structure’s persisted, keyboard-accessible drawer resize controls. Palette cards wrap within narrow drawers. All 76 r005 armor variants have static previews rendered from their exact native GLB, published only to the dashboard without extra WebGL canvases.

## CI reproducibility repair — 2026-09-15

Hosted validation found two additional Python native-pin reads that depended on the author checkout. Resolve them against the current repository without changing hashes or provenance, and guard geometry tests against accidental reads from the old checkout. Source quality is re-enabled for hosted verification.

Restore omitted native build/test inputs from a compact, hash-verified LFS bundle; resolve test assets relative to the checkout and use canonical runtime files. Terrain budget tests retain their assertions with one case per recipe. Correct package-boundary imports and existing changed-file formatting violations without broadening the quality baseline. Private Python image fixtures replace developer-only output paths and Blender-only decoding. Source quality checks run once per PR and on main pushes, cancel superseded runs, and support manual dispatch. The workflow was paused during the initial review; hosted verification now runs on the repair PR. This is not a runtime release.

## Dashboard 0.2.0 — native armor editor review, 2026-09-15

The normal Shipyard can open an editable Wayfarer using the exact reviewed r005 backed armor, with all 76 native variants in the Hull palette. New-design loading preserves the current draft; pieces use normal selection, transform, measurement, undo and save tools. Dashboard publication includes the hash-pinned native GLB; canvas-ui 0.1.2 declares the matching render 0.2.0 workspace dependency. Game installation remains unqualified and is kept separate from editor review.

## Unreleased — Wayfarer exterior armor native r004

Added separate Blender-authored exterior armor with broad paired bays, recessed cassettes, wrapped ribs and fitted bow returns. Fine surface details use shared color, normal and roughness maps. The 46-model final-03 family passes native checks and independent comparison of 14 native and 8 exact game-renderer images. Sources, compressed exact exports, validation and review evidence are retained in the art library. This is a review candidate; the installed ship and physical interfaces are unchanged.

## 0.1.1 — framed Wayfarer presentation, 2026-09-14

Native Blender hull bays and front panels replace the installed Wayfarer surfaces through an explicitly pinned cosmetic revision. Main engines and small thrusters share the pale/red/navy finish; achieved output drives stepped translucent exhaust. Local game, Shipyard and public stock exterior rendering share the new assets. Physical catalog, collision, pressure, placement, power and thrust definitions remain unchanged.

Editable sources, prior revisions and exact native/browser evidence are retained under `assets/art-library/framed-wayfarer`. Release validation and deployment status are recorded in `docs/handoffs/wayfarer_framed_native_checkin_20260914.md`. This version covers render, canvas UI dependency integration, client and dashboard; final artistic approval remains pending.
