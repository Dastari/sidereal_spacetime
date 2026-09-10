# Corrected native wall batching qualification

Status: offline helper and actual native-loader measurement passed; GPU comparison pending. No live source/asset/catalog/assembly/authority binding changes.

The new `packages/render/src/native-wall-batches.ts` helper wraps the existing tested exterior vertex-baking kernel once per immutable placed wall. It never groups across placed identities. It reuses exact material objects and vertex layouts; no texture atlas, UV rewrite, simplification, source scaling or native asset re-export occurs. Alpha-blended, alpha-tested, explicitly ordered/decal, depth-offset and explicit alpha-index primitives keep individual clones and their relative ordering. Unsupported multi-material vertex layouts retain the proven kernel's separate path. The helper rejects animated sources and malformed transforms. Baked normals use inverse-transpose transforms, reflected tangent handedness and reflected triangle winding through the existing kernel.

## Exact measured accounting

`scripts/measure_native_wall_batches.ts` loads every exact SHA-pinned source through Babylon9.25's actual glTF loader in NullEngine, then invokes the actual new helper and compares material identity, per-material triangles/vertices/layouts, source position/normal/UV/tangent buffers, placed-ID picking metadata and disposal independence. The existing50placement frames and48candidate GLBs remain untouched.

| Metric | Current50parts | Candidate direct clones | Candidate batched |
| --- | ---: | ---: | ---: |
| Native glTF mesh nodes | 152 | 570 | sources unchanged |
| Loaded mesh/submesh groups | 262 | 570 | 181 |
| Triangles | 57,434 | 102,578 | 102,578 |
| Independent placed identities | 50 | 50 | 50 |

The earlier152number counted old glTF nodes, including nodes with multiple material primitives. Actual Babylon loads262oldmaterial primitives;152is not the old main-pass draw count. Candidate batching removes389of570groups (68.2%) and yields81fewer than the old262loadedgroups (30.9%). Triangle count still increases45,144 (78.6%) versus currentart. These are offline mesh/submesh counts, not a hardware FPS claim. Two roof collars remain separate controllable placements. All source materials, per-material triangle/vertex/layout counts and library vertex buffers passed preservation checks. No candidate primitive required the transparent/decal fallback in these exact files; synthetic negative controls cover those cases.

Full source-pinned per-placement results are in `docs/releases/usable-wall-readiness-20260910/batching-comparison.json`.

## Parent integration contract

Call `createNativeWallBatches(scene, placementParent, {partId,assetId,category,instanceId?,deckId?}, primitives)`, where each primitive is `{source,matrix,preserveOrder?}` and `matrix` is native mesh→placement-local, excluding the placement transform. Use the returned independent `root` for the existing exact position/rotation/mirror and roof/cutaway gate. Both root and returned pickable meshes carry the same `partId`/asset/context metadata; `authoritativeEntity` stays false. Keep the original asset containers/materials alive until every dependent placed object is disposed. Returned `dispose()` releases only that placement geometry/root, never shared native sources/materials. Do not also retain visible unbatched clones.

Dedicated candidateGLBs select their entire exact mesh set; omit the incompatible historical nodePrefix only in separately qualified candidate catalog entries. This helper does not alter selection, asset hashes, canonical template revisions, collision, health, damage or pressure contracts. Parent owns actual shared renderer integration and normal release gates.

## Reproduce

```sh
npx tsx scripts/measure_native_wall_batches.ts
npx vitest run packages/render/src/native-wall-batches.test.ts packages/render/src/remote-exterior-batches.test.ts
```

The browser fixture `scripts/native-wall-batching-review.ts` loads only source-pinned wall assets with fixed camera/light settings, comparing original clones and the actual helper in the same scene. It imports no game, account or world code. Normal-game installed acceptance remains a later parent integration gate.

## Actual GPU equivalence

The named `native-wall-batching-review` browser loaded all50exact candidate placements in WebGL2 at960×540. With the same camera, lighting and native material objects, unbatched and batched images were pixel-identical: zero changed pixels of518,400, zero channel delta. Measured main-pass draw submissions fell570→181; both retained102,578triangles. GL errors were zero. The visible wall assembly screenshot was reviewed; these are actual native walls, not a blank-image comparison. Evidence: `docs/releases/usable-wall-readiness-20260910/batching-gpu.json`, with exact screenshot SHA256s.

The browser intercepted only the explicitly pinned local review files; Vite’s private docs/art-library denial remained intact and no files were copied into public. The session was disposed, blanked and closed. This qualifies the helper’s surface-equivalent batching in the isolated native fixture. Parent still owns installed normal-game/roof/collision/source-version integration; no current ship was changed.
