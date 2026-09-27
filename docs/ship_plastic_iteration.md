# Ship molded-plastic finish iteration

Status: material-only candidate staged; first matched-camera comparison completed, visual acceptance not reached.

The owner explicitly prioritizes `reference/Astra_Voxel_Space_Game_Art_Technical_Design.md` and `reference/art/3d-rpg-after.png`: dielectric molded surfaces, modest real bevels, controlled highlights, and selected mechanical metal. A high triangle count does not establish visual fidelity.

## What was already present

The canonical ship had a welded greedy surface with selective convex two-segment bevels. At the .0625m gameplay sample pitch, bevel width is .02m; edges shorter than .125m are excluded to bound cost. The presentation mesh preserves occupied cells and palette IDs. These geometric improvements were real, but most non-metal surfaces shared one .36-roughness polymer material. Ceramic-colored palette3 was incorrectly assigned to exposed .8-metal steel. The game HDR intensity is .28; ship lighting remains owned by the common renderer.

## Staged change

`scripts/ship_materials.py` maps existing immutable palette IDs to four shared polymer roles: light hull .30 roughness, middle structure .34, dark structure .39, and painted accent .26. All are non-metallic with IOR1.46, coat .06–.10 and coat roughness .20. Ceramic trim is dielectric. Explicit metal9/10/30, rubber, fabric, botanical, soil and emitter roles are retained. No new optical role, authority operation, occupied cell or geometry detail is introduced by this material pass.

Blender omits the opaque material's authored IOR during standard glTF export. A narrow JSON extension step retains `KHR_materials_ior=1.46`; it preserves binary geometry/texture bytes. CPU contract tests verify binary preservation and role separation (`python3 scripts/test_ship_materials.py`). The authored `.blend` retains the same Principled values.

The exporter has a `--staged-plastic` mode writing `.runtime/art/wayfarer-plastic.blend` and `.glb`, leaving the canonical ship/source in place. The previous editable source is also retained as `assets/source/voxel_wayfarer_legacy_finish.blend`. The structural-only candidate has14 materials and138 material primitives versus10/126 previously; GLB size is20.03MB versus20.73MB. Geometry/bevel policy stays unchanged. These are catalog counts, not frame-rate claims.

## Acceptance boundary

The controlled browser comparison imports the real `createShipLighting` module and the same HDR environment at .28. It uses identical camera/cutaway settings for canonical and staged ship bytes. Material-only differences must be visible before publication. It does not claim to complete the owner-directed Blender reconstruction of older TypeScript-authored furniture or the whole ship. Dense legacy stepped detail, panel modeling and controlled highlight lighting remain separate potential bottlenecks; they must be judged from actual images.

## Ownership and first comparison result

The policy is explicitly limited to deck, walls, armor, partitions, roof, markings and cutaway structural layers. All room/equipment/drive meshes and all assembly exports retain the prior mapping and finish values. External equipment authoring owns beds, seats, consoles and other fixture models; this pass does not rebuild or publish their outputs. Three CPU tests cover this separation and glTF binary preservation.

The initial four Babylon images (`output/playwright/ship-plastic-before/after-interior/exterior.png`) verified the actual loaded role values, but visual differences were too subtle for plastic acceptance. Exterior top-trim diagonal patches and prow stippling persisted. The candidate remains staged. A subsequent structural-only source studio render (`ship-plastic-source-studio.png`, CPU Cycles96) has clean trim, implicating the runtime shadow path. The source still has simpler shapes and panel relief than the reference. A bounded shadow/specular/IBL runtime diagnostic is pending.

## Shadow diagnosis under unchanged game lighting

The structural-only staged ship was captured at the same camera with the actual production lighting module and HDR intensity .28. No ambient/specular boost was applied in this diagnostic.

- `ship-plastic-diagnostic-baseline.png`: reproduces exterior trim sawtooth.
- `ship-plastic-diagnostic-no-shadows.png`: removes the sawtooth and engine stippling, confirming a shadow-path artifact. This is a control only, never a proposed production fix.
- `ship-plastic-diagnostic-normal0-bias0035.png`: zero normal bias at512 retains the trim artifact and adds wall acne; rejected.
- `ship-plastic-diagnostic-normal0-bias001.png`: lower depth bias adds extensive upper-face acne; rejected.

All four browser captures completed with zero console errors. Production lighting, canonical ship assets and equipment remained unchanged. The GPU was returned to the parent for higher-priority live zoom/dust validation before further iterations. A1024/filtered-shadow or stronger-depth-bias comparison remains unvalidated. Current `FILTER_NONE`/nearest sampling is a likely contributor to aliasing around fine bevels, but this is a hypothesis, not an accepted fix. Do not increase ambient illumination or disable production shadows to hide the defect. The parent separately owns reported light leakage through walls.

Material-only tuning has **not** reached the requested premium-plastic appearance. The candidate's correct dielectric roles and finish values remain staged, awaiting a clean, demonstrated runtime lighting solution and coordinated publication that does not overwrite external equipment work.
