# Remote exterior rendering — 2026-09-10

Status: native browser proof and isolated combined candidate gates passed; staged, awaiting integrated game review before activation. No world authority, local glass, art revision or public release approval changes are implied.

The approved stock exterior manifest remains `stock-wayfarer-exterior:6cd837094b61bb6d1e69aefe4629cd9fa7e0f51db02fee80d203a824af756589`, with its exact 108 native placements and 14 pinned source GLBs. Runtime rendering excludes the mixed legacy cabin backing, partitions, floors, equipment and cargo. Imported lights are disposed even if a future GLB contains them. The rear boundary retains only existing outward hull-polymer triangles at the pinned stock aft datum; no new cap or art geometry is synthesized. A first review caught and corrected an opening caused by dropping that entire mixed group.

Static opaque primitives are combined once per prototype using strict material object identity and matching vertex/render flags, then instanced per accepted remote ship ID. Native vertices, UVs, normals, tangent handedness, texture/material values and placed identity metadata are retained. Transparency, multi-material, skinned and unsupported vertex layouts remain separate. Two independently moving ships retain separate transforms and lifecycle. Hull decals retain their existing reference-counted material cleanup rather than disposing another ship's shared decal material.

Remote glazing uses a scoped PBR clone with its original blue tint, metallic/specular response, roughness and maps. Alpha is one and refraction/translucency are disabled. Local glass is unchanged; disposing the clone leaves the original material alive.

## Actual native browser evidence

Named browser `remote-exterior-metrics`, 1280×800, SwiftShader, two identical public stock ships, same camera and directional/environment light setup, no game connection or private documents. Imports completed before measured rendering. This is a draw/mesh comparison, **not a hardware FPS claim**.

| Metric | Before | Final |
| --- | ---: | ---: |
| Active meshes, two ships | 1,370 | 150 |
| Observed draw calls | 673 | 80 |
| Meshes per ship | 685 | 75 |
| Triangles per ship | 194,370 | 162,004 |
| Imported lights | 0 | 0 |

The 88.1% draw reduction is specific to this controlled two-ship scene. The final prototype combines 666 native primitives into 70 opaque material batches; each ship adds five independent decals. Reduced triangles are removed legacy inward backing, not simplified native exterior surfaces. Remote motion, subscription visibility and authoritative collision are unchanged.

Evidence under `output/playwright/remote-exterior-metrics/`: `before.json`, `after.json`, `before.png`, `after.png`, `before-aft.png`, `after-aft.png`, `after-lights-off.png`, and `angles-cli.txt`. The final aft image preserves the original closure; the lights-off image uses the existing workshop IBL and confirms opaque cockpit glazing. One initial review-only dynamic import URL failed; correcting it to the managed Vite module path resolved that harness error. The final fresh session had no application console errors. Both named browser runs were blanked and closed.

Twelve focused tests pass: exact manifest/hash selectors, lifecycle and privacy, explicit light rejection, strict material batching, reflected/nonuniform transforms, preserved UVs, opaque/local material isolation, and retained native outward aft triangles. Combined candidate is based on the existing immutable combat-r003 client snapshot and its 33 overlays, plus wall/cabin commit `6fdb5742` and this scoped remote change. Pending cargo, editor camera and proposed wall-model changes are excluded. Exact source hashes are recorded in `.runtime/releases/remote-exterior-20260910/source-manifest.json`.

## Combined candidate gate

The independent snapshot `.runtime/release-checkouts/remote-exterior-20260910` passed typecheck, 1,205 tests in 206 files with two workers, 77 document checks, `npm run build:client`, and `npm run art:check`. Its generated bindings remain on the live refit schema; the independently published collision-only world update `81f5582a` preserves that schema. No world build/generation was invoked for this client release.

Staged client tree SHA256: `143d89828312b6ecdff0646b4168fe6a6d52f0d09cf1264f93cea372e1841760`; entry `/assets/index-xI7EF-rJ.js`, SHA256 `4f41b1d932084fe3804ad138be2ca97c920972e8950c20916c37ee24e29a6071`. Baseline public client `8246fafc6e13048bd1eaabd5a63d6c06dc9ca1ba983de4bdb6e466de676c4a35` remains active at this checkpoint. Source/asset audit confirms only the eleven expected pre-existing render paths changed relative to the baseline input hashes; new scoped remote helpers are separately pinned. All combat overlays and installed r003 assets are preserved. Public compression remains the independent delivery artifact `520de12b8dada34e0016524008d5e098af7b5cd1ac42a89f7875024898e5678d`.
