# Shipyard wall, height and measurement check-in — 2026-09-14

Status: scoped editor changes live and browser-verified. No full Shipyard contract completion or new game/native qualification is claimed.

## Owner scope and delivered behavior

- Internal walls expose visible endpoint handles in Structure/select mode. Drag one end, or use its arrow-key focus, to resize on the current snap grid. The opposite end stays fixed. Doors/treatments remain attached; unsupported floor spans, insufficient door clearance and pinned-native resizing are rejected without changing the draft.
- Drag the wall body to translate both ends and attached openings/treatments together. The same validated movement supports arrow-key nudges and one-step undo. Perimeter walls remain derived from floor tiles.
- Objects and Hull support Shift + left drag and Shift + Up/Down for vertical movement. Normal XY movement, duplication, paste and new Build height preserve height. Exact Height entry is available for assembly placements. Engines/thrusters belong to Objects, including selection, palette and visibility.
- Measure vertices is available in every editing scope. A polyline snaps to actual visible transformed mesh vertices, including otherwise non-editable context meshes; it reports each segment's 3D length and up/down difference plus total length. Remove last/Backspace and Clear/Escape work. Measurements never change draft/history, disappear when inactive and clear when their geometry/visibility changes. Limit128 points.

## Candidate and deployed location

- HEAD at entry: `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`; git status/log read before code. The779-entry dirty file list is retained at `.runtime/shipyard-completion/wall-height-edits-20260914/entry-status.txt`; no staging/reset/restore/clean or commit occurred.
- Frozen source: `/root/shipyard-wall-height-measure-r001-candidate`; 4469 files; source-manifest SHA-256 `c29708cce023ae77b922fac539e56da8fe76012d959c9f83f43e9e17cb2d28ef`. Environment-manifest SHA-256 `b0193585d5508593bfd07fa148c30672a960010d70a97ff402c37df0192b6ec1`. Root matched the frozen source before and after the complete build. This check-in/progress update is a subsequent documentation-only addition.
- Live editor: https://sidereal.tail7a58a6.ts.net:8445/shipyard (managed dashboard5174, PID1265394). Dashboard build tree SHA-256 `aeb7a94bea2fa50f2debc9fce76be3067da9c02cf63db2bd363f486ec068f656`; its manifest excludes compression sidecars. The normal dashboard serves source through managed Vite; it was restarted to recognize the new shared module export.
- Stored world module bytes independently re-read through read-only `st_module`: `05ecf9504e4ca063ac7fe0c111f12cfa2bf23d00313d37c8354ee2033d4f7f00`. No world publication. Normal databasePID458746 unchanged.
- Public game remains client`4a4d558a84a2873c0efa5d82ba896b72c45d8e6226bb5143046abfd9506f4524`, immutable release`.runtime/public-client/releases/20260913-131452-4a4d558a84a2`, PID1169706. Actual HTTPS index matches that release. Native catalogue/interface pins match entry bytes; frozen native runtime files had no source drift after build.

## Acceptance evidence

`npm run check` passes1,913 tests in327 files, TypeScript and87 provenance/document checks. `npm run build` passes. Scoped ESLint passes. Logs and manifests are in `.runtime/shipyard-completion/wall-height-edits-20260914/`.

Real Chromium review used the normal HTTPS Shipyard and native assets, then blanked the named browser. The final fresh load has one canvas,3/3 test placements, no alerts and no console errors. Visual captures were opened and reviewed.

| Browser path | Result / evidence |
| --- | --- |
| Endpoint resize | Snapped0→1m endpoint; opposite end and doorway unchanged; undo/redo, rejected door-detachment edit, Escape cancellation and save/reload pass. `wall-browser.log`, `wall-endpoints-20260914.png`. |
| Whole-wall move | Translated both ends and doorway by1m north, retained IDs/treatments, undo passed; clear endpoint handles visible. `wall-move-browser.log`, `wall-body-move-20260914.png`. |
| Objects and Hull height | Actual thruster and native hull panel raised0.1875→1.1875m. Subsequent XY drag preserves Z; Escape, exact0.6875m field entry and undo pass. `height-browser.log`, `hull-height-20260914.png`. |
| Structural measurements | Three real floor vertices yield2m+2m=4m; Remove last and Escape pass; draft and undo history byte-equivalent before/after. `structure-measure-browser.log`, `measure-floor-vertices-20260914.png`. |
| Multi-object measurements | Two thrusters and a native hull panel: first segment2.2361m with1m vertical difference, second3.1788m, total5.4149m. Actual vertex coordinates retained in `objects-measure-browser.log`; `measure-object-vertices-20260914.png`. |

Pure and NullEngine tests additionally cover native mirrored/rotated/elevated vertices, instance transforms and render-origin restoration, rejecting hidden/effect/proxy meshes, no geometry mutation, and vertical snap-datum preservation. Only two temporary line meshes are used for measurement path/hover; inactive guides are disposed. No game performance or entire-contract gate is claimed by these editor-only checks.

## State and remaining boundaries

All editing was in separate browser-local fixtures. No account, character, inventory, live ship, grants or native-source mutations were performed; no test account/admin role was created. Dastari and Desparil remain protected. No authoritative schema/reducer changes occurred, so no new authority deployment/smoke was required for this patch.

Older planar floorplan fittings remain tied to their deck and report that constraint; changing their height requires an explicit validated3D conversion. Pinned native wall assemblies cannot be silently stretched/translated. Measurement targets visible surface-triangle vertices within18CSS pixels, not hidden vertices or arbitrary bounding-box corners. New side-hull art remains unapproved; generic doorway/pressure, multi-deck and new-source game qualification remain open as recorded in the prior check-in.

No new dimensional or art decision is required for these controls. The earlier isolated publish/spawn workspace grant remains pending a legitimate administrator/account authorization; this UI request does not authorize creating an account or self-granting access. Minimum viable completion and full Contracts B/C1 remain open.

## Wall grid snap correction — subsequent live patch

The owner reported a moved corridor wall remaining between grid lines. The old drag snapped the pointer displacement, preserving the wall's existing half-grid offset. Whole-wall dragging now snaps the destination of the wall's first endpoint after the raw pointer displacement, preserving the grab offset and wall span. Preview and commit share this calculation. Doors/treatments translate with the same delta; structural support and native-binding validators remain unchanged. The repeating 2 m grid display now contains complete snap cells, avoiding the previous reset at each 5 m major-pattern boundary.

Entry HEAD remains `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`; status/log were read before edits. Full dirty list, native pins, pre-edit sources and validation artifacts are in `.runtime/shipyard-completion/wall-snap-20260914/`. Root changed only `LayoutCanvas.tsx`, new `partition-drag-snap.ts`/tests, and this handoff/progress documentation. Other owners' work was not staged, reset, restored or cleaned.

The exact patch is frozen at `/root/shipyard-wall-grid-snap-r001-patch`, layered over the `c29708cc…` parent candidate above. Combined source-manifest SHA-256: `f00fb3c837e0302e66ee4f66dbf679440997abca345a934b018105fd1efca02b`. The complete parent-plus-patch file set matched root after the build. This evidence paragraph and final progress entry are subsequent documentation-only updates. Current dashboard build SHA-256: `7f0b0e0bf6a6ccc5a67ce5ac607669bd73f56953fc009de4d5b5403ced0a66fe` (2967 files excluding compression sidecars). Normal HTTPS Shipyard serves this correction through the same managed dashboard PID1265394; the served snap helper was independently checked.

`npm run check` passes all 1916 tests in 328 files, TypeScript and 87 document/provenance checks. Full build and scoped ESLint pass. In the real normal HTTPS browser, a wall starting at 1.5 m with 1 m snap previews and commits at exactly 3 m; its doorway and boundary treatments follow. Undo restores the exact original document; redo, Save draft and reload preserve the correction. The 2 m pattern repeats at 10 m with whole cells. One canvas, no alerts, no browser console errors/warnings. Both captures were opened and reviewed: `output/playwright/shipyard-boundary/wall-grid-snap-preview-20260914.png` and `wall-grid-snap-committed-20260914.png`. Browser was blanked afterward.

Read-only verification confirms the world module, public game index and native catalogue/interface bytes remain those recorded above. No live state, account, grant, schema, art or game release was changed. This is a scoped editor correction, with no new game/contract completion claim. The existing acceptance limitations and pending workspace grant remain unchanged; no new owner decision is needed for this fix.
