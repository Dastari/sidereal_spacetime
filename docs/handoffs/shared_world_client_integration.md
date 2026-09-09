# Shared-world client integration — 2026-09-10

Implemented for explicit `?sharedWorldReview` only; suppressed when `constructionReview` is present. Normal client activation and public publication remain pending combined acceptance.

The active connection callback selects that socket's independent shared cache into a stable renderer-facing presentation store. A pending token-renewal socket does not drive presentation. Replacement, admission revision, system change and disconnect clear the old presentation epoch; ordinary keyed motion changes retain interpolation history. Source row listeners are retained and removed on disposal. The App subscribes to shared admission only; remote body changes update canvas navigation imperatively and remote ship motion does not refresh React inventory/character state.

The active actor is selected by accepted admission character ID. Without an admission, only a unique owned character is selected. Ship and station lookup use the actor's ship ID. The existing native construction/stair/egress flow is preserved.

Shared body descriptors join accepted body motion by canonical body ID and admitted system. The canonical seed supplies display names only. Radius, height, appearance, seed, position and velocity come from the authorized projections. The renderer samples interpolation per frame; navigation uses latest accepted position. Missing motion, deletion or admission revocation cannot synthesize a planet from static seed coordinates. Observe resolves the same canonical body IDs.

Each renderer creates an ID-keyed remote-ship manager in review mode. Native public stock geometry/materials are shared between independent roots; roots subtract the displayed camera origin. No remote crew, inventory, private assembly, equipment light or interior loader is invoked. Manager lifecycle removes roots/listeners/prototype assets when disposed. `getSharedWorldDiagnostics()` exposes enabled state, exterior load completion and remote IDs for review.

## Exact installed exterior

- Installer: `npx tsx scripts/install_shared_exterior.ts`; validation-only: append `--check`.
- Manifest: `assets/runtime/assembly/wayfarer-exterior-r001.json`.
- File SHA-256: `75f0e5cc2bfca709bb06d8ca391003f92a54747bf502b76e90c3ad1c49a06fa7`.
- Payload/asset identity: `stock-wayfarer-exterior:6cd837094b61bb6d1e69aefe4629cd9fa7e0f51db02fee80d203a824af756589`.
- 108 pinned native exterior placements, 14 selected legacy exterior groups, 14 distinct GLBs verified.
- Source assembly `1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb`; hull manifest `2e275052217da4b20a92ab40a9a9f098dc011557f7611b6b0c6f40f71ea22695`; legacy shell `aa27de4fd09db67428659af8e16479217dd7bebd1f764c13744f62b2d621a6db`.

The installer derives from exact published source pins, compares the staged handoff if present, verifies every GLB before writing, and never reads private runtime assemblies. Runtime verifies the compact payload and GLB bytes before importing. This is a stock exterior presentation package; it establishes neither airtightness nor authoritative collision/damage changes.

## Validation at implementation handoff

- 26 focused tests passed across shared body projection, join decisions, presentation bridge, subscription binding and remote exterior manager.
- Full TypeScript check passed.
- Independent `npm run build:client` passed; existing Vite native-config/chunk-size warnings remain.
- Installer `--check` passed and `python3 scripts/prepare_app.py client` copied the exact manifest into development public assets.
- No normal database or public release changed by this integration.
- Actual two-account browser rendering, contact discovery/deletion, canonical-body Observe, login renewal continuity and combined native-stair regression review remain parent-owned acceptance. No hardware FPS or final remote-GLB visual acceptance is claimed here.

## Root real-browser acceptance — 2026-09-10

Two separate ordinary Dastari accounts authenticated through the provider against the isolated shared-provider database. Both received the same canonical system and one other ship contact. Primary browser screenshot `output/playwright/shared-browser-review/first-account.png` shows both native stock exteriors and shared celestial bodies. Secondary screenshot `output/playwright/shared-browser-second-review/second-account.png` and `frame.json` show the independent account, ready scene and remote root. Primary real keyboard E then W moved its accepted ship from y13.549965625 to y35.046756586; the secondary cache received that position and rendered the root at camera-relative (-50,0,-35.046756586). No simulation transform was injected.

Review uses software GPU and manually advanced rendering to avoid monopolising the shared GPU slot; these are visual/integration checks, not hardware FPS measurements. Actual provider token renewal changed the secondary socket while retaining the admission and contact. Root fixed Fast Refresh effect cleanup to detach the old source rather than permanently dispose a React-retained presentation store. Source-mesh shadow flags now replace ineffective InstancedMesh assignments. Nineteen focused presentation/remote-loader tests passed. Normal login activation and explicit migration HUD are the next acceptance step, not yet public.
