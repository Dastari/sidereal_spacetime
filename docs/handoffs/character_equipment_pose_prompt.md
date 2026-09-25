# External Astra handoff: character equipment posing and aiming

Prepared 2026-09-08. This handoff assigns character/rig/pose-system implementation; it does not approve a new art revision for publication. Read the entire owner brief rather than treating this handoff as a replacement for it.

---

Work in `/root/sidereal_spacetime` as the character equipment posing specialist. Implement the complete reusable architecture requested in `reference/combat-poses-update.md`. Its 31 sections define the task and acceptance criteria. This is not a request for one improved rifle animation or a proposal-only response. Implement, test, render, critique and iterate through concrete deliverables.

## Read and audit first

- `AGENTS.md`, `PIVOT.md`, `docs/active_agent_ownership.md`.
- `reference/combat-poses-update.md` in full.
- `docs/blender_asset_migration.md`, `assets/art-library/INDEX.md`, `assets/art-library/WORKFLOW.md`, the relevant character/equipment design ledgers and their exact reference crops.
- `docs/crew_visuals.md`, `docs/crew_combat_visuals.md`, `docs/crew_equipment_iteration.md`, `docs/character_reference_pass.md`, `docs/combat_authority.md`, `docs/architecture.md`.
- Actual implementation in `packages/render/src/crew/`, `packages/render/src/equipment/`, `packages/render/src/combat-aim.ts`, `apps/client/src/combat-input.ts` and the relevant portions of the shared render entrypoint and client App.
- Actual source/export manifests under `assets/source/`, `assets/runtime/crew/manifest.json` and `assets/runtime/equipment/`. Follow those manifests to the source; do not assume a historical generator is the current visual authority.
- Visually inspect `reference/art/characters-weapons-items.png` and the applicable character-animation references in the art library. Preserve the ten existing character looks, blocky proportions, closed helmet backs, armor emission, visor/glass response and existing gameplay scale.

The current implementation has a sixteen-bone rig, twelve authored clips, a small procedural combat layer and equipment grip/muzzle adapters. Re-audit these facts at checkout. Earlier isolated rifle screenshots and hand-placement tests do not establish shoulder contact, torso clearance, aim-space quality or all-profile coverage. The owner reports visible rifle penetration; reproduce and retain that failure before correcting it.

The current laser helper casts from the muzzle toward a cursor-derived target. It does not yet enforce the owner's required physical muzzle-forward direction. Treat this as an explicit integration defect, not an accepted architecture. The render entrypoint also sets whole-character facing from the current planar aim angle; its eventual integration must allow your bounded body catch-up system rather than competing with it.

## Ownership and coordination

You own new character pose/clearance/IK modules under `packages/render/src/crew/`, a dedicated versioned profile schema/data module under `packages/content/src/` (for example `equipment-poses.ts`), the narrow handheld equipment anchor adapter under `packages/render/src/equipment/`, associated tests and a dedicated pose-review scene. You may stage editable character rig, animation and handheld socket revisions in the art library. Identify exact source and output ownership before editing or exporting them. The parent also expects new model-integration work: pin the input rig/asset revision and coordinate any incoming replacement before changing its skeleton or geometry.

The parent integration agent owns `packages/render/src/index.ts`, `apps/client/src/App.tsx`, shared input/diagnostics integration and live model installation. Read those files but deliver a small explicit integration contract or patch for the parent instead of editing them concurrently. `packages/render/src/combat-aim.ts` is also shared with the parent: describe and coordinate the muzzle-forward correction before changing it. Do not leave a working solver disconnected; provide a runnable review harness immediately and arrange the final game wiring with the parent as a required acceptance step.

Other agents own ship equipment fixtures, cargo/hull/floor modeling, the Shipyard layout editor and procedural planets. Do not change their geometry, source revisions, manifests, export scripts or dashboard routes. Distinguish **handheld equipment** from beds, consoles, reactors and other installed ship equipment. Preserve the shared dirty tree and all prior revisions; no blanket reset, clean, generated-file sweep or global formatting.

Use the repository Blender modeling and Playwright skills when performing their work. Research the requested techniques before implementing: two-bone IK and poles, IK/FK blending, aim offsets, layered locomotion, hand retargeting, turn-in-place and scope eye relief. Use primary technical sources such as the official Blender, Babylon and Unreal documentation. Record links, the relevant technique and how it maps to this runtime. Borrow techniques, not proprietary rigs, clips or art. Verify installed Babylon APIs rather than assuming another engine's animation nodes exist here.

## Required architecture

Create versioned, data-driven `EquipmentPoseProfile` definitions for RIFLE, LONG_RIFLE, PISTOL_TWO_HAND, PISTOL_ONE_HAND, FLASHLIGHT, HANDHELD_DEVICE/SCANNER and TOOL. Directed devices and screen-viewing devices need distinct behavior. Profiles specify primary hand, support-hand mode, shoulder/sight requirements, aim pivot, anatomical limits, torso/pelvis contributions, clearance proxies, transition parameters and locomotion/pose-set references. Items select a profile and provide their own measured socket locations. A new weapon size must not require a bespoke character animation.

Standardize semantic equipment anchors, with explicit compatibility mapping from existing names:

- `Grip.Primary`, `Grip.Secondary` or pistol `SupportHandContact`.
- `Contact.Shoulder` for shoulder-fired weapons.
- `Aim.Muzzle` or `Aim.Direction` for directed devices.
- `Sight.Primary`, `Sight.EyeReference` where applicable.
- `Interaction.Contact` and a display reference where appropriate.

Character controls include shoulder pockets, elbow poles, eye references and posing-clearance volumes for head, chest, abdomen and upper arms. Equipment has a bounded clearance representation for receiver, stock, barrel or device body. These are posing helpers, separate from authoritative gameplay collision.

Define one acyclic solve order. A suitable contract is locomotion/base pose → equipment aim offset → bounded torso/pelvis/root catch-up → shoulder/weapon placement → primary arm → support arm → bounded clearance correction and final validation. Do not create hand → weapon → other hand → torso → original hand cycles. If iteration is needed, set explicit iteration/time bounds and preserve a known feasible fallback pose.

For rifles, place and aim around the stock/shoulder contact region, never the weapon's geometric center. Shoulder contact is a strong soft constraint. Outside-body clearance outranks exact requested aim; when a target is infeasible, adjust torso/waist/pelvis/feet or lower/reposition the weapon within declared limits. Report residual aim error instead of cheating through the chest. Primary grip has priority over support grip; elbow poles and reach limits must prevent flips and impossible limb stretching. An intentional stock/shoulder contact is not permission to sink the receiver into the torso.

Long rifles require a distinct support extension and soft scope/eye-relief constraint. Two-handed pistols support the dominant hand/grip, not a fictitious foregrip. One-handed profiles provide a deliberate free-arm pose. Scanners must distinguish pointing an emitter from reading a display; flashlight/tool beams follow the physical device.

Author usable base poses and an aim-offset library in Blender, retaining controller/deformation bone separation. Runtime constraints must either be reproduced procedurally or baked into exported animation; Blender-only IK controllers do not magically execute in glTF. Preserve a stable exported bone/socket contract or provide an explicit migration adapter. Do not rebuild the character as TypeScript voxel boxes or quantize authored Blender surfaces back through the legacy mesher.

Layer locomotion and equipment transitions. Provide the required ready/raised/lowered, forward/backward/strafe movement and turn-in-place behavior, plus the equip/unequip and device-use foundations in the owner brief. Preserve gait, knee bends and planted-foot intent while aiming. Use smooth yaw ranges and body catch-up rather than abrupt whole-body snapping. Blend between item profiles and IK acquisition/release; never accumulate additive transforms across paused frames. Restore the animation baseline before each solve. Preserve seated, sprint-lowered, reduced-motion, hidden-character and disposal behavior.

Prepare recoil as a bounded additive layer driven by accepted shot events; do not fabricate repeated firing when a subscription refreshes or a weapon is re-equipped. Shot sequence is per item UUID: reset the presentation baseline on item changes so historical shots do not replay. Reload clips must not pretend ammunition/reload authority exists when it does not.

## Desired aim, physical muzzle and server authority

The pointer supplies a desired target. The pose solver produces a final physical weapon transform. Only then derive visual beam origin/direction from the transformed muzzle/direction socket. The beam may lag or miss the cursor while the body catches up; that is correct. Raycast along **actual muzzle forward**, with obstacle clipping. Never rotate a laser or flashlight independently to hit the cursor. Validate socket orientation through glTF coordinate conversion, rotated parent ships, mirrored variants and both relevant handedness paths.

Expose a small explicit runtime contract: desired target in a declared frame, locomotion/facing/equipment inputs, final muzzle/direction socket transform, achieved aim error, contact/clearance diagnostics and bounded update/dispose methods. Provide a pose-review API capable of full yaw/pitch even though current gameplay aim authority is planar. Do not silently extend the network protocol to accept arbitrary client transforms or six-degree-of-freedom gameplay.

SpacetimeDB remains authoritative for actor permissions, equipped item UUID, aim intent, energy, cooldown and accepted shots. The existing combat slice does **not** implement projectile/hit/damage simulation. The browser's visual muzzle matrix or local raycast must never become trusted damage authority. Any later real projectile implementation must derive or validate a server-owned muzzle/aim envelope from authoritative state and declared equipment geometry. Document the integration gap rather than pretending client posing solves server hit validation.

Do not change inventory balances, resource rules, world transforms, control grants, private views or table visibility as part of rig work. No renderer callback writes canonical state. Maintain the existing HTTP preview compatibility: operation IDs cannot rely on secure-context-only `crypto.randomUUID` without the project's fallback.

## Deliver and verify in stages

1. **Audit and reproduce:** retain current torso-intersection and independent-beam evidence. Map actual rig bones, source assets, grip/muzzle anchors and transform conventions. Write a concise solver/controller graph and proposed API tied to this source, then implement it rather than stopping at the plan.
2. **Carbine vertical slice:** fix shoulder pivot, torso clearance, stable poles and actual-muzzle beam coupling in a runnable scene. Show forward, high/low pitch, cross-body yaw and whole-body catch-up before broadening profiles.
3. **Reusable profiles:** exercise long rifle, two- and one-handed pistols, flashlight, directed/screen scanner and tool using per-item sockets. Include two differently sized long guns sharing a profile. Missing required anchors fail clearly; do not silently reuse an unrelated grip.
4. **Layering and transitions:** add the requested aim offsets, gait/turn-in-place integration, equip/profile switching, raise/lower, device use and additive recoil foundation. Prove behavior during movement, seating, sprinting, pause/resume, reduced motion and item disposal/reload.
5. **Game integration and evidence:** coordinate the narrow parent-owned wiring; verify the exact staged export and solver in the real game. Deliver changed paths, API adapters, reproducible scripts, tests, performance figures and an honest implemented/planned matrix for every section of the owner brief.

The review scene must expose movable targets and the brief's complete grid: yaw 0, ±20, ±45, ±70, ±90, ±135 degrees; pitch 0, ±20, ±40, ±60 degrees, including combinations. At impossible targets, a safe bounded pose with visible aim lag/error is acceptable; body penetration or a dishonest beam is not.

Provide the requested debug overlays: desired target, actual forward ray, weapon pivot, primary/support grips, shoulder contact, sights/eye relief, both IK targets/poles, body/weapon clearance volumes, body heading, torso yaw/pitch and turn threshold. Keep them off during normal gameplay and avoid permanent per-frame debug allocations.

Numerical tests should cover finite transforms, reach/pole degeneracy, no elbow flips, root rotation and coordinate transforms, grip/contact errors, clearance, frame-rate-independent transitions, paused-pose drift, rapid opposite target changes, profile swaps and cleanup. State measured tolerances in metres/degrees with reasons based on the model scale. Do not assert success merely because hands are close while the stock intersects the chest. Test both armor bulk and helmet variations among the ten looks.

Save real PNG contact sheets at fixed cameras for neutral/extreme views, close-up hand/stock/scope details and before/after/reference comparison. Also save actual playback captures for transitions, turn-in-place and movement; still images cannot prove animation timing. Inspect every meaningful revision yourself and retain failures. Use the art-library ledgers and immutable revision folders, preserving editable `.blend`, exported GLB, socket/profile metadata, validation results, hashes, camera/settings and reproduction commands. Generated concept imagery is not runtime evidence.

Measure CPU per character and bounded solver work at representative visible character counts, mesh/material/draw/texture budgets and hidden-character behavior. Cache bone/socket references, use reusable math storage where practical, avoid full-scene searches or one light per armor part, and skip the expensive solver when its character is hidden. Coordinate any scene-lighting change with the parent performance work.

Use `http://sidereal.tail7a58a6.ts.net:5173/` for actual game preview. Coordinate the shared GPU slot; close or blank the browser after review. Run services only through `python3 scripts/dev.py` or existing npm commands, using `dev.toml`. Never start `/root/sidereal`, reset the development database or publish over a public host as an incidental action.

Before completion run `npm run check`, `npm run build`, and `npm run art:check` for changed assets. Run authority smoke against an isolated test database only if coordinated changes actually touch authority. Do not hand-edit generated networking bindings. Report unrelated concurrent failures precisely and rerun relevant checks without loosening correctness/performance constraints.

Complete the implementation and make the exact candidate reviewable before requesting art publication approval. Under `AGENTS.md` and the art-library workflow, final asset sign-off requires explicit owner approval of the exact revision; agent satisfaction and passing checks are not that approval. Ordinary reversible code implementation and staged asset reviews should proceed without repeated permission questions.

Your final handoff must identify what the parent needs to wire, what already runs, the exact staged artifacts and evidence, all missing profile/pose cases, authority limitations, measured costs and outstanding approval requirements. A clipping rifle, independently steerable beam, untested export or Blender-only constraint stack is not a completed result.
