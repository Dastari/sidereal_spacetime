# Shipyard editor refinements check-in — 2026-09-13

Status: validated editor/power release is live; owner check-in for the remaining qualification gates. This is not completion of Contracts A/B/C1 or final artistic approval.

The owner requested four clear editing scopes, shared visibility controls, top-down Structure, tile-selected room labels, internal-only Objects, editable and consistently mounted Hull, typed system ports, solid floors, and removal of custom engine/thruster hull work. The owner explicitly confirmed keeping every engine and thruster.

## Candidate and locations

- Entry/current Git HEAD: `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`. Shared dirty baseline and original release pins are in `.runtime/shipyard-completion/editor-refinements-20260913/`. No files were staged, committed, reset, restored or cleaned.
- Frozen source: `/root/shipyard-editor-refinements-r005-candidate`; 4,455 files; source-manifest SHA-256 `50a91989d65ea154b3e2b99555c093be61747250730482b7e99f9958b9e8e0f2`.
- World module: `05ecf9504e4ca063ac7fe0c111f12cfa2bf23d00313d37c8354ee2033d4f7f00`.
- Client artifact: `4a4d558a84a2873c0efa5d82ba896b72c45d8e6226bb5143046abfd9506f4524`.
- Review apps: client `http://127.0.0.1:5191/`, dashboard `http://127.0.0.1:5192/shipyard`.
- Isolated authority: port3191, `sidereal-spacetime-dev-review-editor-refinements-smoke`. Generic smoke uses the distinct `-review-r005-general-smoke` suffix. Normal port3100 was not reset or used for fixture creation.
- Normal locations: game `https://sidereal.dastari.net/`; Shipyard `https://sidereal.tail7a58a6.ts.net:8445/shipyard`.
- Previous normal client was `585b1e87461d5fff76bdb8d754493507d32b395a954db7fbd28f92ac66ada552`; previous normal world was `bc9d9504e35a1fba4480dad3487cefaceefa060e06fb47ccf52cf8324e9c7ce0`. The candidate pins above are now live; final activation evidence is below.

One post-freeze change corrects a **test-only type import** to the declared `@sidereal/content/assembly` export. Scoped lint and the three qualification tests pass after that correction. The frozen evidence snapshot is preserved. A separately hashed dashboard navigation supplement fixes the public game link; it does not change world or game-client behavior. Subsequent handoff/progress documentation is outside the runtime candidate.

## Owner-requested behavior and actual acceptance

| Request | Implemented and browser verified | Remaining game qualification |
| --- | --- | --- |
| Scope and visibility | Structure, Objects, Hull, Systems; one persistent row controls floors, walls, roofs, labels, internal objects, exterior hull/engines, systems and pressure areas. Rooms is a Structure tool. | Visibility is presentation only. |
| Structure camera | True top orthographic; pan/zoom work, orbit is locked. A full rebuilt floorplan is visible at once. | No change to game camera authority. |
| Internal objects and doors | Objects has21 internal components in this template;53 exterior components are in Hull. A newly drawn partition accepts the authored250mm doorway family:22 native meshes, no fallback. | New doorway250 opening/leaf motion and seal adapters are not admitted to the generic game path yet. Existing Wayfarer passages are not silently resized or converted. |
| Rooms | Clicked two tiles, created `Service workshop`, and verified its label and selection. Labels remain independent of pressure compartments. | Minimum multi-deck/closed-door pressure acceptance remains open. |
| Hull placement | Cockpit glazing is selectable; a real move and Undo restore its location. Qualified side panels use the structural outside mating plane, independent of decorative depth. Roof visibility also covers cockpit/exterior roof components. | Unqualified cockpit bends and engine mounts retain explicit pending interfaces; generic arbitrary hull edits are not qualified live refits. |
| Systems | Five channel filters; placed reactor emits power and all9 engines/thrusters accept it. Browser disconnect/reconnect through Undo works. | Boolean reactor-to-engine power is authoritative and tested. Physical routing, capacity and resource-flow simulation remain separate, unsupported work. No invented fuel/coolant/ventilation ratings. |
| Floors | One closed187.5mm polygon slab representation in every view; top and underside reviewed. Reversed face winding caused the tray appearance and is corrected. Finishes remain separate from shape. | No new collision permissions inferred from visual meshes. |
| Remove custom hull work |18 new uncut side panels and removal of7 old aft trim/filler placements. Revised template has74 placements, including all9 engines/thrusters. Cockpit shape remains. | This new template has not replaced either personal ship. Actual publish/spawn of this source is blocked by a missing legitimate authoring grant. |

Native models initially missing from the new side panels were a loader prefix bug: their authored `GEO-…--` groups did not match the old exact/underscore/dot matcher. The corrected namespace matching loads all74/74 placements; tests inspect every actual r005 GLB node and reject neighboring namespace collisions. No mesh scaling was used.

## Native and semantic pins

- Approved construction convention remains250mm inward from the fixed tile perimeter. Standard stack:0.1875m floor +3m clear +0.125m roof +0.1875m service void =3.5m pitch. Wall heights0.75/1.5/2.25/3m. Smaller explicit profiles remain part of the contract.
- New r005 exterior canonical source: `02bee325b9eca36084352ed4f662f9f90cdc2a889494d7d30f8a4fc54bfd57f1`.
- Previous installed r002 source remains `56e485c9a9d49b5aa0c5e44a47f88916296896717df386b7240baf408e28ae44`.
- r005 side-hull Blender: `312b1ba45c983c9adde933d37519cab452b4244735ba05919082d6c73a31c62f`; native kit: `3ca097eeda5f50a05e1c540c9279bb27039b573da45e1a0e268394cb271805a6`; measured bounds: `f555989aa421eb2ff1012cbfca573219075dcababbc5327d9ab6a948bdd08b22`.
- Old333-asset catalog remains `f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac`; new351-asset catalog is `9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237`.
- Native family sources/history and old catalog remain preserved. r004/r005 side-hull art is **unapproved**. See `docs/ship_hull_attachment_contract.md` for the explicit Blender frame/socket contract and `docs/handoffs/shipyard_floor_doorway_review_20260913.md` for exact doorway bytes and limitations.
- Seven retired IDs: `superstructure--3--5`, `superstructure--2--5`, `superstructure--1--5`, `superstructure-0--5`, `superstructure-1--5`, `superstructure-2--5`, `superstructure-3--5`. Three contain engine-shaped voxel cuts; the other four belong to the same aft trim assembly. Removing the whole assembly avoids disconnected fillers. The revised returned instance mapping has74 bindings; none of these seven IDs survives in the source, identity domain, bindings or collision obstacles. The169 obstacles and126 native wall requests remain unchanged.

## Evidence and compatibility

`npm run check`:1,885 tests in322 files, TypeScript and87 document/provenance checks pass. `npm run build`, relevant scoped lint and `art:check` pass. The import-only lint correction has a separate passing three-test rerun. Logs are `/tmp/shipyard-refinements-final-r005-{check,build,art}.log` and `/tmp/shipyard-r005-{scoped-lint,test-import-check}.log`.

Exact module05ec passes the actual two-owner reactor/engine smoke, including ownership and stale-revision denial, idempotent receipts, real IFCS behavior, and server restart persistence. Managed3191 restarted1156361→1164712 without module publication or data reset. All14 power/restart flags pass, Alpha retains8/9 powered and Beta9/9, and all engine/character/ship UUIDs remain stable. Full generic smoke also passes collision, walking, flight, inventory, interactions, combat, privacy, replay, reconnect and authoring denial checks. Private evidence: `power-smoke.json`, `general-exact-05ec-smoke-result.json` and its log under the task runtime directory. Tokens remain private; no new normal accounts were created.

An initial compatibility test caught an added field in an existing view breaking old clients' binary decoding. The existing `own_authored_flight_fittings` ABI is now restored exactly; the new powered field is exposed only through additive owner-only `own_authored_flight_power_fittings`. The old live client source connects successfully to the new module. No existing view/table field was removed or reordered for this release.

Browser evidence under `output/playwright/shipyard-boundary/`:

- `refinements-r005-structure.png`: top orthographic, visible room map, shared controls,51 floors.
- `refinements-r005-hull.png`: all74 placements,53 editable exterior components, all9 engines, no retired aft pieces, roofs hidden.
- `refinements-r005-cockpit-editable.png`: actual cockpit selection/move/Undo.
- `refinements-r005-internal-objects.png`: internal scope and shared visibility.
- `refinements-r005-systems.png`: actual reactor output,9 inputs and editable logical connections.
- `refinements-r005-door-room-top.png`, `refinements-r005-door-assembled.png`: freshly drawn wall, authored doorway, tile-selected room,6 floors,36 wall pieces/162 meshes,22 doorway meshes, no native issues after load.
- `refinements-r005-floor-underside.png`: solid bottom faces under a real orbit gesture.

Initial edits can briefly show stale-compiler/native-fit notes while the asynchronous native preview refreshes; final settled floor/wall/door arrays are empty. This is not evidence of pressure qualification. The editor uses one WebGL canvas plus a projected semantic SVG overlay.

## Conservation and open decisions

Immediately before publication, private normal-state readback exactly matches entry:2 characters,2 instances,20 flight fittings,2 flight bindings,14 items,14 containers,2 appearances and0 identity-link rows. Both Dastari and Desparil remain protected. Their source pin remains r002. No engine/thruster, account or personal inventory deletion was performed.

The dimensional and boundary-treatment decisions are already approved; no further approval is requested for them. Numeric overhang for new generic classes remains unspecified: proposed default is still only explicitly qualified attachment interfaces, with no arbitrary overhang allowance. No validator relaxation or non-additive schema migration is proposed. No artistic approval is inferred.

The remaining authoring blocker is concrete: an ordinary isolated review principal lacks active `draft.read`, `draft.write`, `blueprint.publish` and `instance.spawn` grants for its workspace. The existing publisher correctly rejected an attempted grant with `Explicit active construction grant required`. An existing authorized construction administrator must grant the review workspace; the agent did not self-grant, impersonate either personal owner, create Keycloak test accounts, or use a different admission route to evade the denial. Exact private principal/workspace details are in `qualified-smoke.json`.

Proposed next gate: complete that ordinary publish/spawn review for the r005 template, qualify doorway250 motion/seals and multi-deck traversal with two actual instances, then deliver the minimum-completion owner check-in. Current template/game integration, pressure, physical utilities, generic engine mounts and exact new art sign-off remain explicitly open.

## Activation and final browser review

Managed `scripts/dev.py publish` updated the normal database with `--delete-data=never`. Reading the actual stored `st_module.program_bytes` confirms the live module SHA exactly equals tested05ec. Normal database identity and PID458746 are unchanged. Guarded client activation required expected-live585b and expected-staged4a4d; the public client now runs as PID1169706 from `.runtime/public-client/releases/20260913-131452-4a4d558a84a2`. The independent dashboard was restarted as PID1169789. HTTPS game index and25 referenced code/style files match the exact immutable release bytes.

The complete post-publication conservation readback equals the immediately preceding readback for all eight protected domains above. Results: `.runtime/shipyard-completion/editor-refinements-20260913/live-conservation-result.json`; private rows stay in the adjacent0600 files. No personal actor was impersonated and no personal ship was refitted.

Source baseline from the previously live585b release and final candidate were reviewed at identical960×640 startup size,100% HUD scale, same isolated actor/ship/camera and one software-GPU slot. Both show771 draws and354 active/2096 total meshes. Render CPU measured19.60ms before,18.20ms after; the10% regression gate passes for this scene. Both run at0.4fps on this software browser; this is not a broad hardware-performance acceptance. Evidence: `refinements-r005-{baseline,candidate}-f3.png`, viewed, and `render-comparison.json`.

On the exact candidate/module, a real game checkbox connected the previously disconnected starboard main drive:8/9→9/9, then restored8/9. Both server-backed outcomes were captured and reviewed in `refinements-r005-game-power-{8,9}.png`. This supplements the two-owner/restart smoke; it does not imply the new exterior source is installed.

Normal HTTPS Shipyard opens the revised template through **New → Import an existing design → Open rebuilt Wayfarer**. Its four tabs, persistent visibility row, locked top camera and74/74 placements were verified in the normal browser (`refinements-r005-live-shipyard.png`, viewed). Opening that template creates a separate draft; it does not overwrite existing local drafts or personal ships.

The public review also exposed an old navigation bug: “Open game” constructed an HTTPS URL on the development port. Root owns the narrow correction in `apps/dashboard/src/App.tsx`, `apps/dashboard/vite.config.ts` and `scripts/public_config.py`. HTTPS now uses the configured public game origin; HTTP review retains its local paired client. The three-file supplemental manifest SHA is `5d3a455017cf99cd4f522549f98cc4f1d4a6c566ce4a6b2f915dc8c2b2d8be88`, preserved under the task runtime `public-navigation-source/`. Scoped lint passes; complete check again passes1,885 tests. Its first attempt hit the unchanged planet terrain test's20s timeout during browser work; the unchanged repeat passes with the browser off the render scene. No timeout or terrain validator was relaxed.

The corrected link was followed from the actual public Shipyard to `https://sidereal.dastari.net/`; the normal sign-in action reached the real Dastari provider and displayed username/password fields (`refinements-r005-live-oidc-entry.png`, viewed). No credentials were entered. This proves fresh OIDC entry, not a new personal-account login journey. The browser was blanked afterward.

The complete post-navigation build passes (`/tmp/shipyard-public-link-final-build.log`). World05ec and client4a4d remain byte-identical to their already tested and activated artifacts. The dashboard production-build tree is `565d2059d1d7227b88e0fb255bc9fe5aba1f0f5e117be3cbbf6a0fb248c1a951`; its normal managed Vite service serves the equivalent reviewed source plus the navigation supplement. Final pins are in `post-navigation-build-pins.json`. Final Git status has no staged entries; other owners' changes remain in the shared tree. The temporary baseline client was stopped through its own managed lifecycle; the isolated final candidate remains available for the pending grant review.

Read-only asset preservation audit: all2,551 retained runtime files are byte-identical to585b, including every existing1,692 GLB,320 PNGs and the HDR.38 omissions comprise36 review images and the `complex-preview-r000`/`inset250-r000` standalone manifests. Both manifests remain as byte-identical bundled content metadata; source/compiled JS fetch the GLBs directly and do not request those omitted paths. No published JSON has dangling asset URLs and no GLB references external local files. New published assets are18 side-hull GLBs,4 doorway GLBs and the new catalog. Historical native sources are preserved; this publication does not confer final art approval.
