# Native Wayfarer inlet and attachment candidate

Status2026-09-10: isolated Blender/source and compiler candidate. Parent reviewed the actuala003 neighbor and cutaway images and approved proceeding with technical integration. This is not final owner artistic sign-off, installed game art or a live refit.

## Exact source and evidence

- Native design: `assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/`.
- Editable Blender, fiveGLBs, normal/packed material maps reused from exact side-hullr003 source;50 editable components.
- Three replacements: `wall-2--2`, `wall-3--2`, `superstructure-3--2`. Their original positions, rotations and mirroring are unchanged. All262 original records remain preserved in `replacement-mapping.json`.
- New roof group bridges actual2.6875m to3m undersides. Floor remains0.1875m; native seam strips resolve the faileda002 support check without deleting the original floor.
- Existing native airlock sourcepart26 is omitted; the other69 sources are preserved exactly. The original70-part fixture's enclosure proof is not reused as the attachment proof.
- New native proofs:21 local/support/seal checks plus8 continuous-door/neighbor checks. Complete hinge-angle envelopes derive from analytic extrema of actual leaf and retracted-gasket vertices, not a few sampled poses.
- `native-walking-projection-v2.json` intersects actual native solids with the accepted body slab and preserves disconnected jamb components. Convex covers may reject minor extra concave clearance; they never merge across the aperture. Every component fits the existing32-shapes-per-object budget. Earlier triangle projection remains preserved.

## Executable standard compiler candidate

Run `npx tsx scripts/prepare_wayfarer_airlock_candidate.ts`.

Exact compiled SHA: `1675396cc027f0af54b2879500eedd8236a5ffa1634a2d6144f6825b27ac31dc`.

Outputs: `.runtime/wayfarer-airlock-candidate-r001/{document,bindings,native-visuals,contract}.json`.

The current construction compiler accepts67floors and266objects; total visual placements333. Two complete normal instance plans allocate independent UUIDs, including both door openings. Three focused tests prove unchanged original source placements, independent spawn allocation and rejection of modified proof/source inputs. This is a compiled plan, not an authoritative database spawn or copied inventory.

## Narrow publication and loader contract

1. Register the exact source SHA and proof above in a trusted server-selected adapter. Do not accept colliders, free volumes, replacement transforms or source revisions from a reducer caller.
2. Publish the five exact newGLBs under a new revisioned runtime path, retaining their hashes. Reuse the seven already installed `/assets/construction/pressure-room-r006/` sources for native wall/floor/roof/contact/door/gasket/junction. No global catalog replacement or live assembly overwrite is implied.
3. The original208 non-replaced object visuals retain their current source asset rules. Apply only the three exact visual replacements. Add two new inlet groups and53non-floor airlock objects. Let the pinned semantic floor renderer handle the16new quarter floors; do not draw a duplicate native floor layer.
4. Native source coordinates: BlenderXYZ metres, worldXY→renderX/-Z and rendererYheight. The mapping's five world positions already include each original local anchor; applying `[5,-5,0]` again is incorrect. Existing sourceparts have their world origins explicitly recorded.
5. The roof transition and12airlock roof parts follow roof/cutaway visibility; existing roof identity and visibility remain unchanged. Exterior armor stays separate from roof layers.
6. Four moving parts (two leafs/two perimeter gaskets) must replace their initial closed collision projections from accepted physical hinge/morph state. Never drop the collision leaf because an opening becomes passable. Use the existing exact two-frame native renderer contract at world origins `[7,-5,0]q1` and `[11,-3,0]q3`.
7. Preserve parent/instance roots, source import sharing, per-placement light/material overrides and disposal. Native details remain visual meshes;19contact cores and50component boxes are separate representations, with no invented armor strength, mass or capabilities.
8. Existing cargo/sofa/growlight/fittings must allocate fresh empty independent instances using the qualified original seed mapping; current helper exact-original-SHA guards must be extended deliberately to this separately qualified candidate, never bypassed globally. Live instance migration/capture is a separate transaction.

## Pressure boundary and real remaining work

Both doors closed isolate the native chamber. Opening inward currently joins an open, unqualified ship-side volume; opening outward joins exterior vacuum. Installing a positive pressure neighbor from a room label would be false. Initial independent review is vacuum-only and cannot refill, allocate or overwrite another compartment's gas.

Whole-ship qualification must still inspect the original cockpit/glazing, roof seams and outer-wall junctions, and establish actual continuous compartment boundaries/free volume. The current old Wayfarer walking proof certifies collision/support, not pressure closure or penetration ratings. The next native boundary audit must list concrete source interfaces/gaps before a sealed ship-side gas row can be installed. Utility penetrations and future external doors need explicit ports/seals, not implicit exceptions.

The manual service controller must revalidate durable game-owned access for trusted starter instances and authoring grants for review workspaces. It must preserve input-control/admission/proximity checks, supported disconnect/grant-loss recovery, interlocks and differential-pressure guards. No handle, motor, power source or pump is invented.

## Validation and environment

`npm run art:check` passes. Three source/material/proxy Python tests and three compiler/spawn Vitest tests pass. `npm run test:python` now includes four native geometry tests through the declared pinned environment. Standard/art environments are kept separate; no native test is silently skipped.

Set up native qualification with `python3 -m venv .runtime/construction-enclosure-python` then `.runtime/construction-enclosure-python/bin/python -m pip install -r scripts/geometry_tests/requirements.txt`. CI declares the same environment. The runner regenerates private Wayfarer fixtures from exact tracked source hashes.

Manifold3.2.1 exhibited a crash when multiple large nativeCSG qualifications shared one interpreter. Each audit now runs in its own required subprocess; any crash/nonzero result fails the gate. The21-check audit also uses exact exported continuous roof cores for contact overlap instead of Boolean-testing coplanar decorative roof skins. All full visual meshes remain present for body clearance and assembled chamber checks.

Aggregate check/build and public publication remain coordinated by the release owner. No public service, normal ship or user inventory was changed by this candidate work.
