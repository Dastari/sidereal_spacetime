# Armor editor activation check-in — 2026-09-15

The reviewed backed armor is live in the normal [Shipyard](https://sidereal.tail7a58a6.ts.net:8445/shipyard). Choose **New → Open Wayfarer armor review**. This creates a separate editable local draft, preserves the current draft, and opens Hull in 3D with the assembled ship visible. All 76 native variants are available in the Hull palette. The active in-game ship is unchanged.

## Delivered and verified

| Requirement | Exact candidate evidence |
| --- | --- |
| Review in the actual editor | Normal HTTPS route, no intercepted requests, substitute catalogs, private viewer or authentication bypass; [entry action](../../assets/art-library/framed-wayfarer/r005/editor-01/open-review.png) and [assembled editor](../../assets/art-library/framed-wayfarer/r005/editor-01/assembled.png). |
| Exact approved-for-review geometry | Native r005 family-03/library-02, unchanged GLB and source; 42 native armor placements plus 42 retained original parts. The former 32 special/exterior pieces are excluded from this new draft only. |
| Complete structural context | 51 floor slabs and 169 native wall pieces, no floor/wall fit issues, no substitute guides. The qualified fixture's structural UUID mapping is inverted to match the editor's exact native structural source; geometry, structure and placement poses are asserted unchanged. |
| Individual editing | Actual native surface click selects its placement; 0.1875 → 0.21875 m height edit and Undo; Shift-drag to 1.1875 m and Undo; save at 0.25 m, reload with Undo history intact, then restore the original height. Previous drafts remain saved. |
| Vertex measurement | Actual mouse clicks on two different native armor vertices yield a 4.3677 m segment and 2.6325 m height difference; [measurement capture](../../assets/art-library/framed-wayfarer/r005/editor-01/measurement.png). |
| Rendering budget | Same-camera warmed editor sample: previous assembly 374 draw calls/5.6 ms median CPU; new assembly 251/5.0 ms. Immutable source meshes are batched per material before per-placement instancing; selection and transforms retain separate identities. |
| Publication boundary | New IDs exist only in the dashboard catalog. Publish is disabled for drafts containing them; authority tests independently reject them. The client asset preparation does not include this editor-only library. |

Browser results and replay scripts are retained in [editor-01](../../assets/art-library/framed-wayfarer/r005/editor-01/). There is one canvas and zero application console errors. The performance comparison uses 20 manual frames at the same camera, discarding five warmup frames and taking the median of 15; it is a short headless editor measurement, not a physical GPU/game F3 qualification. Independent read-only implementation review found no actionable blockers.

## Exact locations and pins

- Dashboard and render package version: **0.2.0**.
- Editor library: `/assets/shipyard/armor-r005/hull.glb`, HTTP 200, **2,583,732 bytes**, SHA-256 `dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8`.
- Native Blender source: `assets/art-library/framed-wayfarer/r005/family-03/source.blend`, SHA-256 `f0f381f1f9b38a8b19cb6a91226aafbff082e678e9471b607c0823c15fdbf2ec`.
- Generated catalog/draft: `apps/dashboard/src/shipyard/layout/armor-kit-r005.json`, reproducible with `python3 scripts/art_library/build_armor_editor.py` from the immutable native manifests and recorded assembly poses.
- Existing game: https://sidereal.dastari.net/ ; release `20260914-141801-048e6f35a49f`, complete digest `048e6f35a49fffb161d1361dda21cf5f53e69c1e24f73c978525fe99299c7b88`.
- Source/delivery hashes, entry pins and live HTTP receipt: [delivery.json](../../assets/art-library/framed-wayfarer/r005/editor-01/delivery.json). Browser capture hashes: [manifest.json](../../assets/art-library/framed-wayfarer/r005/editor-01/manifest.json).

The managed dashboard was prepared and restarted with `python3 scripts/dev.py stop-dashboard` / `up-dashboard`. A fresh normal browser session opened the visible New action and verified all placements, loaded native walls and the exact HTTP GLB hash.

## Validation and conservation

`npm run check` passes **2,063 tests in 349 files**, typecheck and documentation checks. `npm run build` and `npm run art:check` pass. Scoped ESLint and formatting pass. The eight asset-preparation Python tests and Python compilation pass. Five focused armor tests cover all native groups/bounds, exact placements and retained equipment, structural identity compatibility, individual movement/serialization, catalog collision rejection and authority rejection. Validation logs are retained with this evidence. The separate whole-library inventory check still reports the existing unregistered reference image; this publication does not change reference inventory. Every current design-7 evidence hash is independently rechecked.

One full check during concurrent browser activity timed out in an unrelated planet terrain test. The serialized full check passes without threshold changes. Earlier missing-wall and unbatched performance captures are recorded as rejected attempts; the final candidate resolves both. The initial measurement automation used incorrect framebuffer coordinates; using the same hardware-scaling and visible-mesh rules as the editor passed the real mouse interaction. No product validator was relaxed.

Entry HEAD was `9c58c07774d7d3c4a58a40c49e90f2a2c647249c`, with an empty dirty-file list. Git status/log -5 and all seven native/catalog/interface/presentation pins were recorded before code. All seven pins and the active game release remain unchanged. Nine engines/thrusters retain the reviewed rigid poses in the new draft. This task performs no world publication, reducer, live refit, spawn, account or inventory mutation; this is absence of task writes, not a new transactional conservation test. Existing drafts were preserved through the normal checkpoint/CAS path.

## Review status and remaining work

The owner authorized publication in the editor and previously authorized merging the native delivery PR #3. This does not infer final artistic sign-off or qualify the new 1 m outward armor family for live collision, equipment mounting, damage or pressure. No whole Shipyard contract is marked complete.

There are no unresolved owner decisions blocking this editor publication. For the next art check-in, the proposed default is to keep this exact native revision available for inspection and record the owner's specific feedback before any further geometry changes. Automated boundary-to-armor planning in the editor, arbitrary turn pairs/heights, qualified external mounts and game installation remain unsupported integration work. The current palette uses ordinary individual placement controls; the native recipe demonstrates the finite joined family but is not a new server construction operation.

Git delivery is scoped to branch `shipyard-armor-editor`, stacked on `ifcs-update`, which contains the currently deployed R16 editor. PR #1 is not merged or broadened by this task. PR #3's native art is already merged. Because the R16 branch predates that merge, this stacked delivery includes the four byte-identical r005 library/recorded-fixture inputs already on main; it does not bring unrelated main changes into the editor branch. The integration PR and its final source commit are recorded in the progress document and PR description. Shared-tree changes are left unstaged; only the explicitly owned files are committed in the isolated delivery worktree.

Delivery: [PR #4](https://github.com/Dastari/sidereal_spacetime/pull/4), implementation commit `4bac1a5b8fb7e6ba6a17277d19494b11e18181ea`. The normal editor is already live; this open PR records the scoped integration without merging the unrelated IFCS branch.

Formatting follow-up: the generated catalog now runs the repository formatter as part of generation. Parsed catalog data is exactly equal to the browser-verified candidate and reproduces byte-for-byte; all five focused tests and catalog formatting pass. Updated source hashes and semantic equality proof are in [format-delivery.json](../../assets/art-library/framed-wayfarer/r005/editor-01/format-delivery.json); original captures and validation receipts are preserved unchanged.

Clean-install follow-up: canvas-ui0.1.2 now declares the matching render0.2.0 dependency, with a regenerated lockfile. Isolated `npm ci` and all five armor tests pass. The broader isolated check passes typecheck but has37failed files/66failed tests from missing baseline native sources and unhydrated baseline LFS pointers; independent review finds no armor regression. Representative missing sources are also absent from origin/ifcs-update. Its full lint/format gates additionally expose existing R16 debt (47/407violations), with no baseline relaxation. These results distinguish the passing fully provisioned deployed working copy from the incomplete fresh checkout. Final package/source hashes and full receipts: [workspace-delivery.json](../../assets/art-library/framed-wayfarer/r005/editor-01/workspace-delivery.json). PR CI remains a separate gate; no merge is performed.
