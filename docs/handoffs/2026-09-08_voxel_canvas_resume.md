# Sidereal Spacetime — fresh-session handoff

**Historical handoff:** current iteration status and revised counts are in [Astra visual iteration](2026-09-08_astra_visual_iteration.md).

Status: Active handoff; integration and visual acceptance remain unfinished
Last updated: 2026-09-08
Owners: Sidereal project and next lead agent

## Copy this opening into the new lead session

You are taking over an active Sidereal development session. Work in `/root/sidereal_spacetime`, NOT `/root/sidereal`. Read this entire handoff, then the active project's `AGENTS.md`, `PIVOT.md`, and only the relevant domain documents. Preserve the substantial uncommitted work. Do not reset Git, replace this project, start the old stack, or repeat the initial pivot/dependency installation.

The user has explicitly authorized implementation and parallel agents. They request **GPT-6 Astra at medium reasoning** for delegated work; the tool model identifier is `gpt-6-astra`, reasoning `medium`. Use concrete independent tasks and disjoint file ownership. Four concurrent slots were available, including the lead. Keep communicating and continue useful independent work rather than repeatedly asking permission.

Finish the integration/verification work below before widening the feature scope. The current emphasis is a coherent playable 3D voxel ship scene, a true single-canvas game UI, modular skeletal crew, equipment previews, visible world-anchored voxel planets, and real voxel construction/destruction foundations. Preserve server authority and the separate dashboard. Several proofs work, but this is not a completed MMO or a complete live ship authoring system. State limitations honestly.

## Current installation and repository state

- Active repository: `/root/sidereal_spacetime`.
- Last committed baseline: `3070dc4 Scaffold Sidereal Spacetime pivot with independent game and dashboard`.
- **All subsequent art, physics, UI, character and editor work is currently uncommitted**, with many new/untracked source and asset files. Inspect `git status --short` and preserve them. No completion commit was made.
- Game: `http://10.0.1.200:5173` / `http://127.0.0.1:5173`.
- Dashboard: `http://10.0.1.200:5174` / `http://127.0.0.1:5174`.
- SpacetimeDB: `http://127.0.0.1:3100`; normal database `sidereal-spacetime-dev`.
- At handoff, managed database, client and dashboard are all running. Use `npm run status` to recheck; process IDs are transient.
- Normal database was successfully updated with the additive sprint fields. Publication used `--delete-data=never`; it did not reset the world. The schema update disconnected existing clients, so browser reload/reconnect may be necessary.
- Old `/root/sidereal` source and services remain preserved/stopped. Its Cargo cache was cleaned in the original pivot. Do not rebuild the old Rust workspace for this project.
- Legacy private database backup: `/root/sidereal-backups/pre-spacetime-pivot-2026-09-08.dump`, mode 0600. Old Postgres volume remains preserved. Do not import credentials into browser assets.
- Toolchain: Node 24.18.0, npm 11.16.0, TS 6.0.3, SpacetimeDB CLI/server/SDK 2.10.0, Babylon 9.25.0, React 19.2.8, Vite 8.2.2, Blender 4.3.2. Lockfile is present; no wholesale dependency upgrade is needed.

## Non-negotiable direction and scope

The project pivoted from Bevy/Lightyear/AGE to a single-server SpacetimeDB authority with separate browser game and dashboard apps. Sharding is deliberately out of scope. The legacy scope remains in `docs/game_scope.md` and the imported references: modular ships/stations, crew, IFCS, power/fuel/data networks, cargo and variable-footprint inventory, equipment/paper doll, factions/NPCs, crafting/industry/trade, tactical map/scanner/intelligence, proximity/ship/faction chat, docking/EVA/atmosphere and complete authoring/lifecycle scripting tools.

Those systems are phased, not all implemented. M1 identity/shared networking is still the next architectural milestone; owner-requested art/editor/physics proofs were built ahead of it. The current labs are private per identity. Shared crew admission, full AOI/redaction, production OIDC/MFA/admin linking, timestamped prediction/replay, live modular refits, utility-driven IFCS, inventory/combat and full Script Studio remain open.

Authority belongs to SpacetimeDB. Clients send intent, never authoritative transforms, speed, destroyed-cell lists, inventory balances or control grants. Occupied valid control stations grant piloting; ownership or camera mode alone does not. TAB switches view. E uses the seat. Shift requests sprint on foot. Authoritative coordinates are f64 XY; render mapping is X/-Z with render Y as height. Subtract world origin before GPU conversion. Render transforms never feed back into simulation.

## Latest user art and interaction requirements

- One real 3D ship hierarchy for flight and walk-around, not separate sprite/interior substitutes.
- Flight camera overhead; RPG camera fixed elevation about 35.264° above deck, orbit only in azimuth, smoothly transitioning through seat interaction. Long-lens perspective gives depth. Default cabin orientation favors the ship's bow toward the left.
- **LEGO-like studless construction**: visible small brick courses, stepped edges and closely fitted material pieces, smooth tops with no studs. Fine voxels are actual occupied matter, not a pixel filter or fake voxel skin. A brick can contain multiple fine damage cells.
- Materials may be metal, enamel, matte, glass/translucent, emissive or glowing. Opaque and emissive materials work now. Transparent/transmissive voxel export/meshing remains explicitly unsupported and must not silently become opaque. Glass must remain occupied for collision/sealing and must not reveal unauthorized interiors.
- Walls must support actual holes by voxel removal. Damage preview exists locally; authoritative multiplayer combat damage does not yet.
- All beds, couches, crates, lockers, consoles, engines, walls, roof and other parts must remain independently identifiable/movable despite shared GPU geometry.
- User wants ship detail/silhouette much closer to `reference/art/fully-complete-constructed-space-ship.png`: connected plate/brick detail, pale metal/indigo/burgundy/cyan material language, better bow/cockpit, properly mounted non-clipping engines and richer lighting.
- Shadows should be pixelated/stepped. Root changed cabin shadow map to 512 with nearest sampling and no PCF; **visual acceptance of this last change is pending**.
- Planets must appear in the actual playable scene as hero destinations with stable world XY and deeper visual height. They must not be camera-relative backdrop decorations. Actual visiting/landing/orbit gameplay is future work.
- The **game UI is entirely in the same canvas** above the 3D scene, with transparent regions revealing the scene. No HTML game navbar/drawer/overlay. Dashboard remains a separate web authoring app.
- UI references: `reference/art/ui-elements.png`, `ui-elements-2.png` through `ui-elements-6.png`, and `in-game-ui-interface-example-1.png`. User specifically corrected upside-down UI, requested larger scale and stronger emissive corner lighting/contrast. Upload orientation was fixed; default desktop scale now 135%, with darker navy wells and bright corner cores/halos.
- Character references: `characters-weapons-items.png`, `more-character-customization.png`, `character-animations-2.png`. User liked the crew but requested less stiffness, modular style/armor/helmet choices, Shift sprint, and one-handed/two-handed weapon poses.

Reference images are user-supplied inspiration, not runtime textures or an automatic redistribution license. Inspect the actual images. Some earlier filenames misleadingly duplicated another image. Preserve `reference/art`.

## Subagent ledger and fresh-session assignments

All listed tasks returned results; no subagent was in a failed state at the final status check. The last ship agent was asked to stop generation and close its browser for a consistent handoff. Agent names are historical context, not a guarantee they can be resumed from a new session.

| Agent / task | Delivered state | Main owned files | Point a fresh agent here next |
| --- | --- | --- | --- |
| `canvas_game_ui` | Completed initial canvas toolkit/HUD, menu/console, settings, rename, crew preview; browser verified upright illuminated UI, text-key consumption and retained UI after asset failure. Root subsequently expanded crew controls and sprint producer. | `packages/canvas-ui/src/{toolkit,index,layout,layout.test}.ts`; `apps/client/src/{App.tsx,style.css}`; `docs/graphics_ui.md` | Finish full-scene interaction/resize review, small-screen scrolling, IME/selection/clipboard and accessibility semantics. Test newest crew selectors, hero navigation/readability and renderer lifecycle. Do not reintroduce HTML game controls. |
| `voxel_planets` | Completed actual merged voxel terrain/cloud globes and isolated browser review. Then audited contacts and fixed a grazing near-miss false impulse. Then completed authoritative sprint schema/rules/smoke. | `packages/render/src/environment/{voxel-planets,voxel-material,voxel-planets.test,index}.ts`; `packages/sim/src/collision*`; world/sim sprint updates; `scripts/smoke.ts`; `docs/space_environment.md` | Verify hero planets in actual game at the user's position and from spawn; add discoverable destination/navigation UX as appropriate. Later cloud shadows/volumetric fog/LOD and shared AOI. Do not move planets with the camera or invent client-only physical destinations. |
| `rigged_crew` | Completed 4 outfits, independent body/armor/helmet/hair/backpack/weapon slots, 16-bone rig, 12 idle/walk/sprint/seated clips across unarmed/pistol/rifle, interruptible 160ms crossfades, attachment sockets. Browser lineup and GLB tests passed. | `scripts/build_crew_source.py`, `build_crew_variants.py`; `packages/render/src/crew/*`; `assets/source/crew-frontier.blend`; `assets/runtime/crew/*`; `docs/crew_visuals.md` | Review live Shift animation timing, soften remaining stiffness/foot sliding, check all slot combinations and external weapon grips. Later persisted appearance/real gear authority, combat actions/reload/interact/death clips. Coordinate with inventory schema before claiming equipped items. |
| `equipment_assets` | Completed 12 original assets, attachment manifest, editable Blender kit, individual GLBs, review images and Babylon loader. Actual browser loading and geometry checks passed. | `scripts/build_equipment_source.py`; `packages/render/src/equipment/index.ts`; `assets/source/equipment-kit.blend`; `assets/runtime/equipment/*`; `docs/equipment_assets.md` | Check actual live hand socket attachment after root's final integration. Expand item/weapon families and reusable asset cache. Keep visual catalog separate from item/weapon gameplay definitions and permissions. |
| `ship_art_refinement` | Completed latest ship source/exports, tapered bow/opaque canopy, roof courses/service bays, three hollow main bells and exterior maneuver pods. Verified new silhouette loaded at entry overlay; full cutaway/engine-clearance browser review NOT completed. Stopped generation and closed browser. | `packages/content/src/voxel-wayfarer.ts`; NEW `voxel-wayfarer-shell.ts`; `docs/ship_art_study.md`; generated voxel/assembly assets | **Highest art priority:** enter game, compare exterior/interior against finished reference, check engine clipping and roof coverage, inspect real materials/shadows/brick joins. Add helper to exporter source manifest. Correct remaining art using the canonical pipeline while keeping server walk/collider fixture aligned. |
| Lead/root | Integrated all boundaries, real Blender solid sampling and material bug fix, modular draft/damage editor, external equipment selection, latest shadow setting and asynchronous renderer serialization. Verified authority smoke/publication and most individual proofs; final combined build/restart/browser pass unfinished. | `packages/render/src/index.ts`, assembly editor/worker, content assembly, art scripts/checker, net binding integration, project docs/tooling | Own the ordered integration checklist below. Treat unreviewed last-minute wiring as unfinished. |

The equipment agent briefly reported a missing `voxel-wayfarer-shell` import while the ship agent was creating it. That file now exists and the latest whole-project typecheck passes. It was a concurrent edit window, not an agent failure.

## Implemented systems and precise boundaries

### Real voxel/model pipeline

`packages/sim/src/voxels.ts` stores sparse 32³ chunks with one-byte materials, zero empty, integer XYZ, strict RLE, exposed-face culling and greedy merging. Removal is bounded and reports dirty neighboring chunks. Tests cover boundaries/winding/materials/removal/RLE.

`scripts/voxelize_blender.py` samples evaluated watertight Blender solids through BVH scanline intervals. It preserves constant Principled color, metalness, roughness, emission color/strength and source/material identity. It rejects open/non-manifold solids, unsupported linked fields, alpha/transmission and budget excess. The original engine source and 64-sample bulkhead/airlock use this actual model-to-volume path. The furnished ship is authored directly as real voxel data then exported through Blender; do not call it an automatic voxelization of the old 887-mesh imported model.

The bright green/magenta material corruption was genuinely fixed: allocating Blender custom-data layers invalidated an earlier UV RNA reference, and UV writes corrupted vertex colors. `export_voxel_blender.py` now creates both layers then reacquires both references. `art:check` reads actual GLB binary colors and rejects values outside [0,1]. Original Blender normal/roughness maps and neutral HDR reflection rig live under `assets/runtime/materials` with sources preserved.

Latest ship output: **1,847,552 occupied cells, 537 chunks, 49,402 quads / 98,804 triangles, 38 semantic batches, 85 exported material primitives, 65 textured primitives**. These are geometry counts, not measured GPU performance. It retains a sealed room fixture and independent prop groups. New canopy is opaque blue, not supported glass.

Engine sample: 31,070 occupied cells, 7,206 triangles, 7 materials, 712 emissive cells. Bulkhead: 89,689 cells, 2,984 triangles, 9 materials, 416 emissive cells at 64 samples/2m. Airlock: 60,927 cells, 1,376 triangles, 7 materials, 416 emissive cells. Airlock is a closed art study with named source leaves; no live door animation/action/pressure state yet.

### Modular Shipyard draft and destruction proof

Dashboard `/shipyard` is the new local 3D assembly editor; model/material source studies moved to `/models`.

Latest catalog: **289 placements, 195 unique reusable assets, 255 mesh layers**. `build_assembly.ts` splits structural cells on 2m boundaries and retains explicit props as whole independently placed objects. Repeated assets share hardware instance geometry. True model-projection SVG thumbnails replace generic palette boxes. Palette is floating/draggable/resizable; layers on the right, tools by the canvas, alpha checkerboard behind it.

Implemented local gestures: select/drag, palette drop, Ctrl/Cmd-drag copy, R rotate, F flip, delete, numeric transforms, focus/fit, undo/redo and browser persistence/export. There is no complete live aggregate refit, mounting rule validation, replace-on-drop, box selection, room generator, utility routing or full history command architecture yet. Do not mark all original Shipyard requirements complete.

Local history stores up to 40 undo states in `sidereal.assembly.draft.v1`. A catalog mismatch now preserves the old raw draft and offers export plus explicit use-new-draft; it does not silently overwrite the unknown document. This new recovery flow needs final regression review after the latest catalog regeneration. Drafts are currently one local lab document, not the final account/entity/revision-scoped live draft protocol.

The damage tool removes actual cells from a selected placement's volume and remeshes in a worker. It does not mutate the shared asset. Jobs use monotonic revisions and ignore stale replies. All chunks of the changed part rebuild, not yet only dirty chunks; opaque surface groups preserve paint/steel/soft/emitter roles. Up to 16,384 candidate removal cells per part. A two-click bulkhead test genuinely penetrated the core and produced a hole; picking through the hole returned no mesh. Screenshot: `output/playwright/bulkhead-through-hole.png`. One undo restored a pickable core. Full redo/restore/refresh/drag regression remains to complete because a slow screenshot/navigation wait interrupted that sequence.

**This is local authoring damage preview, not authorized multiplayer shooting.** Server damage/repair/material mass/compartment breach/persistence/redaction integration is still open. Never expose a reducer that accepts client-declared destroyed cells as truth.

### World physics, sprint and IFCS

Four private physical asteroids and three known celestial landmarks seed idempotently per lab. `space_body` is private; `own_space_bodies` is owner-filtered and rocks additionally require <=400m distance. World XY/motion are durable. Planets retain deeper visual height. This is not shared-universe AOI.

`stepLabSpace` applies 60Hz velocity kicks and one conservative contact solver owns drift. Whole ship uses a conservative capsule, rocks circles. Collision tests cover high-speed impact/torque/energy and a fixed bug: conservative-advancement exhaustion is unconfirmed, so freeze at safe time and do not invent an impact impulse. Exact voxel hull contacts and ship-to-ship contacts remain open.

`setIntent` now requires `sprint:boolean` along with sequence/throttle/turn/dx/dy. Additive `input.sprint` and `character.sprinting` columns have false defaults. Walking is 2.5m/s; sprint is provisionally 4.5m/s. Server marks sprint only after actual displacement and clears it on stop, blocked movement, input expiry, seat interaction and disconnect. Root updated the App producer/Shift keys and passes replicated `actor.sprinting` to the crew renderer. Latest isolated smoke passed all sprint/reset cases, and normal DB publication succeeded without deletion.

`packages/sim/src/ifcs.ts` contains tested pure mass/CoM/inertia, placed-actuator wrench, bounded allocation and feedback math. **Live ship motion still uses the lab's fixed aggregate mass/thrust**, not installed part/utility state. The latest third engine is visual only and grants no extra thrust. No power/fuel graph, actual inventory mass or powered computer/AI module is live.

### Canvas UI, crew and equipment

`packages/canvas-ui` draws an offscreen 2D raster into a Babylon DynamicTexture/Layer on the existing WebGL canvas. There is only one visible game canvas; transparency shows the 3D scene. This is CPU layout/raster plus GPU composition, not Babylon GUI widgets or DOM overlays. It has reusable flex/grid rectangles, windows, text fields, sliders, toggles, buttons, focus/key consumption and canvas error/loading screens. No extra dependency was needed.

Browser verified zero HTML button/input/nav/header/aside/footer game controls, upright `update(true)` upload, larger illuminated frames, text input consuming WASD/E, and UI remaining visible after blocked GLB loading. Important limits: no full IME/clipboard/selection behavior, incomplete assistive control tree, and small-window overflow currently clips rather than scrolls. Do not claim production accessibility.

Root added `WorldOptions.onScene`, `blocksCameraInput`, `onLoadError`, `onPreviewError`, `signal`, plus a per-canvas initialization queue to dispose prior loaders before reusing a WebGL canvas. `dispose` is idempotent. **The final serialization/AbortSignal/HMR behavior still needs actual browser regression.** It was added after the UI agent's tests.

Crew: original editable source, 16-bone rig, 12 clips: Idle/Walk/Sprint/Seated crossed with unarmed/Pistol/Rifle. Four distinct outfits (crew/engineer/marine/explorer); separate body, armor, helmet, hair, pack and weapon slots. Approximately 1MiB GLB, 19 slot mesh groups, 58 material primitives across all variants; only selected slots render. Default full crew is much less. No animation writes authoritative placement. Sockets: `handR`, `handL`, `back`, `hip`, right-handed +Y up/-Z forward with palm/mount origin.

Root expanded in-canvas Crew controls to style, suit shape, armor, helmet, hair, pack, weapon pose and colors. These are local visual previews, not persisted/equipped inventory. Twelve original equipment assets total 10,648 triangles and 871,924 bytes across individual GLBs: compact pistol, heavy handgun, carbine, long rifle, plasma cutter, scanner, medkit, resource canister, power cell, supply crate and two backpacks. Root wired compact pistol/carbine to handR on selection, with stale async-result disposal and small fixture fallback. **Final live external grip/pose review remains pending.** There is no firing, ammo or inventory authority.

## Verified evidence versus unfinished validation

Latest checks after ship source generation:

- Whole-project `npm run typecheck`: passed.
- `npm test`: **49 tests in 10 files passed**.
- `npm run art:check`: passed latest 98,804-triangle ship, material binaries/hashes, sampled assets, sealing core and 195-asset assembly.
- Last complete `npm run check` passed 49 tests before the last ship refinement; documentation checker should be rerun after this handoff and final edits.
- Latest `npm run smoke`: passed real two-identity private views, unauthorized/private-table rejection, persistent body seeding, authoritative asteroid impact, revision/idempotency, flight/unseated rejection, walk/room collision, sprint activation and resets.
- `npm run world:publish`: succeeded normally, additive defaults, `--delete-data=never`. Existing clients were disconnected by schema change. `.runtime/sprint-publish.log` records this.
- Individual client builds passed during the UI/planet agent work. **A final all-project `npm run build` after all integrations has NOT been run.**
- Original scaffold restart/isolation checks passed earlier. **A fresh actual managed restart followed by `smoke:restart` for the new body/sprint work has NOT been completed.** Running `smoke:restart` alone does not restart anything.
- No reference-GPU frame-rate/fleet/CCU benchmark. Chromium uses software SwiftShader; screenshot calls sometimes take 30–60+seconds and can time out after an actual click completed. Inspect resulting state before repeating destructive edits.

Useful evidence:

- `output/playwright/materials-corrected.png`: repaired ship vertex colors, older geometry/background.
- `output/playwright/bulkhead-through-hole.png`: actual voxel penetration, checkerboard visible through it.
- `output/playwright/canvas-console.png`: upright illuminated same-canvas UI over loaded 3D scene; text entry checked.
- `output/playwright/voxel-planets-study.png`: isolated ocean/cloud/gas/moon proof, not proof of discoverable navigation in game.
- `assets/runtime/crew/browser-outfits.png`: modular crew lineup/weapon poses.
- `assets/runtime/equipment/contact-sheet.png` and `browser-review.png`: original equipment kit.
- `output/playwright/ship-refined-initial.png`: new ship silhouette/engines loaded at entry overlay.
- **Do not use `ship-refined-cutaway.png` as cutaway proof**: misleading filename; entry overlay still present.

## Immediate next-session checklist — in order

1. Read active AGENTS and inspect Git/services. Preserve all uncommitted/untracked work; no reset or old-server startup. Confirm no agent is still writing files before broad formatting/builds.
2. Diagnose any session/provider Bad Request separately from game errors (details below). Do not infer that a completed shell command or subagent failed from a generic conversation error.
3. Add `packages/content/src/voxel-wayfarer-shell.ts` to the explicit source list in `scripts/export_voxel_blender.py`. Regenerate through canonical art tools if manifest/exporter changes require it. Current checker verifies output hashes but does not catch this missing declared source dependency.
4. Recopy completed canonical assets to both intended consumers: `python3 scripts/prepare_app.py client` and `python3 scripts/prepare_app.py dashboard` (or their builds). The ship agent copied client assets before assembly export finished. Dashboard may still serve an older catalog. Do not overwrite invalid saved drafts; test the recovery flow.
5. Reload game after the sprint schema change. Actually enter the lab. Verify the latest ship, fixed-elevation walk view, E seat transition, Shift sprint and sprint clip, all Crew outfit/armor/helmet/weapon choices, correct external pistol/carbine grip, and crisp shadows. Check UI upright orientation, size, luminous corners, transparent reveal, resizing and input consumption. Fix lifecycle/HMR regressions if found.
6. **Ensure hero planets are actually visible/findable in the playable game**, not only an isolated study. They are world-anchored and the user may have flown away from the initial landmarks. Inspect authorized body/ship positions and provide useful destination navigation/visibility, rather than moving planets with the camera. Confirm depth/parallax through camera orbit. Landing/travel gameplay is not already implemented.
7. Review latest ship against `fully-complete-constructed-space-ship.png` in flight AND true cutaway. Three main bells are sampled hollow, but engine clearance/material quality/roof coverage were not fully camera-reviewed. Keep all cabin collider/seat positions aligned if changing geometry. Main engine collar overlap is intentional mounting; nozzle/body clipping is not.
8. Finish dashboard editor regression: drag, Ctrl-copy, rotation/flip/delete, selection, part visibility, full undo/redo/restore/refresh and preserved invalid drafts. The damage preview is local only; retain that distinction.
9. Run `npm run check`, `npm run art:check`, `npm run build`. Re-run authority smoke if authority changed. Perform an actual managed stop/start and then `npm run smoke:restart`; announce the brief restart. Recheck independent app build isolation if touching their wiring.
10. Refresh documentation to final behavior/counts. Several early `docs/visual_theme.md`, `voxel_construction.md`, `assets.md`, `authoring.md`, `verification.md` paragraphs still describe earlier 18/37-batch art or scaffold-only editor/crew. Preserve dated history but explicitly supersede outdated current claims. Record final browser/command evidence and limits.
11. Make a coherent reviewed checkpoint when appropriate, keeping private `.runtime`, tokens, provider logs, local DB and ignored test screenshots out of commits. User has not asked to publish remotely or redirect public proxies.
12. Return to phased architecture: M1 identity/shared multiplayer/interpolation, then persistent modular compiler/refits, utilities/IFCS, inventory/equipment and authority-backed destruction. Do not let visual placeholders become implicit gameplay capability.

## Suggested fresh subagent prompts

Use these after the lead establishes current file ownership. Do not assign every agent the same renderer entrypoint.

### Canvas UI / playable integration agent

Work in `/root/sidereal_spacetime`. Read the handoff and AGENTS. Own `packages/canvas-ui` and client UI composition; coordinate narrow renderer hooks with lead. Compare actual reference UI images and verify one visible game canvas, upright upload, 135% default desktop scale, emissive corner lighting and readable dark wells. Test newest Crew controls, Shift input consumption, window resizing/scrolling and failure/reconnect/HMR paths. Improve actual usability/accessibility without adding HTML overlays. Report what was browser-tested and remaining limits. Do not change server authorization.

### Ship / voxel art agent

Work in `/root/sidereal_spacetime`. Read `docs/ship_art_study.md`, theme/voxel contracts, and inspect `reference/art/fully-complete-constructed-space-ship.png`. Own `voxel-wayfarer.ts`/`voxel-wayfarer-shell.ts` and canonical art rebuilds, coordinating exporter changes. Start by entering the actual game and reviewing exterior/cutaway/engine clearance, because the prior review stopped behind entry UI. Refine connected studless brick/plate detail, cockpit/bow, material response and mounted hollow engines. Preserve fine solid voxel data, semantic independent parts, roof sealing and server walking fixtures. Do not add real engine capability by drawing engines.

### Character / equipment agent

Work in `/root/sidereal_spacetime`. Read crew/equipment docs and character references. Own crew/equipment source and renderer subdomains; coordinate main renderer/UI wiring with lead. Verify modular slots, the latest live sprint state/clip, smoother movement, and external pistol/carbine socket orientation with one-/two-handed poses. Continue needed animations and item families, keeping bone weights/material grouping efficient. Local appearance is not equipped inventory; no combat/security bypass. Regenerate only through managed art commands and document actual browser evidence.

### Authority / navigation agent

Work in `/root/sidereal_spacetime`. Read architecture, space_environment, IFCS and implementation plan. First verify sprint defaults, state resets, body visibility and durable restart. Help make known hero planets findable in the actual game using authorized positions, without camera-relative fake destinations. Then propose/implement a bounded M1 shared-world identity/admission/interpolation slice; owner-only private labs are not complete multiplayer. Keep private base tables, actor-scoped state and station authority. Coordinate schema changes and non-destructive publication with lead. Never accept client transforms or destroyed-cell claims.

## Commands and operating notes

```sh
cd /root/sidereal_spacetime
npm run status
npm run check
npm run art:check
npm run build
npm run smoke
```

Services only through `scripts/dev.py` / npm wrappers. `npm run dev` and `npm run stop` manage the new stack. `dev:client`, `stop:client`, `dev:dashboard`, `stop:dashboard` affect one app. `build:client`/`build:dashboard` are independent; `world:build`, `world:generate`, `world:publish` are explicit. Normal publish refuses data deletion; smoke resets ONLY the `-smoke` database. Configuration is `dev.toml`. `.runtime` and `.spacetime-data` are private.

Art commands: `art:voxels`, `art:engine`, `art:bulkheads`, `art:assembly`, `art:crew`, `art:equipment`, `art:check`. Assembly depends on generated bulkhead/airlock samples in `.runtime/art`; on a fresh checkout rebuild those first. Blender source, voxel samples and previews are art inputs/outputs, not authoritative world writes. Preserve immutable imported `assets/source/blender` and imported document/content hashes. `art:mcp` / `art:verify` use the isolated local Blender MCP; it previously listed 28 tools successfully.

Installed project skills are in `.agents/skills`: frontend-design, playwright, blender-modeling, pixel-art-sprites, security-best-practices. Read relevant skill and announce first use. Use actual local reference images, not memory of filename labels.

Browser automation uses `.agents/skills/playwright/scripts/playwright_cli.sh`. Each agent needs its own named session (`-s=<name>`). Chromium executable: `/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`; launch args `--no-sandbox`, `--use-angle=swiftshader-webgl`, `--enable-unsafe-swiftshader`. Config uses `browser.browserName='chromium'`, `browser.launchOptions.executablePath/args`, and `browser.contextOptions.viewport`. Default root session may still be on the dashboard; other agents closed their sessions. Avoid simultaneous screenshots on the software GPU. Do not kill unrelated browsers/services. A screenshot filename is not evidence until actually inspected.

## Session-tooling Bad Request investigation

The user reported a red `{"detail":"Bad Request"}` in the conversation UI. Successful shell output appeared immediately before it. At handoff, read-only inspection located corresponding **Codex provider error/failed turn events**, not a game HTTP response, in:

`/root/.t3/userdata/logs/provider/events.3fb45dae-595b-41c2-a9c7-dd4ea352844d.log`

Examples: native `method: error` at `2026-09-08T04:22:33.737Z`, then `turn/completed` at `04:22:34.185Z`; also a failed turn around `04:20:34Z`. Error object contains `message: '{"detail":"Bad Request"}'`, `codexErrorInfo: 'other'`. T3's main server log had no matching Bad Request text in the inspected current file. The underlying provider rejection reason was **not identified**; do not assert context length, model quota or a particular subagent as cause without more evidence.

Provider log lines have a timestamp/NTIVE or CANON prefix followed by JSON, so direct whole-line `json.loads` fails; parse from the first `{`. Logs can include full prompts, tool commands and sensitive runtime context. Never copy them wholesale into public project docs/assets, and do not expose credentials. Further read-only evidence may be in `/root/.codex/logs_2.sqlite` and rolled provider logs. Distinguish conversation provider errors, browser test timeouts, game reducer/schema mismatches and actual subagent task failures. A fresh session may help isolate the issue, but is not a proven fix.
