# Crew voxel armour kit (armor-v1)

Status: **proposal art, r003 (fitted to CHAR-BODY r002, character spec v2)**. Nothing here is owner-approved, published or active in the normal game. The live r008 modular components, their inventory items and the r003 pose pairing are unchanged.

## What exists

| Layer | Path | State |
| --- | --- | --- |
| Part definitions | `scripts/art_library/crew_armor_parts.py` | Implemented. Pure python: brick-island voxel volumes per crew_rig bone; 52 parts; 17 colourways; 12 role presets; `mannequin()` ports the CHAR-BODY r002 body for fit checks |
| Fit checks | `scripts/art_library/crew_armor_fit.py`, `test_crew_armor_parts.py` | Implemented. Z-fight and emissive checks, run by `npm run art:library:test` |
| Blender build/export/review | `scripts/art_library/crew_armor_kit.py` | Implemented. Headless: GLB + manifest, clip check, review sheets |
| Runtime assets | `assets/runtime/crew/armor-v1/` (`manifest.json`, `parts/*.glb`) | Generated, served at `/assets/crew/armor-v1/` |
| Content catalog | `@sidereal/content/crew-armor` (`crew-armor.json` is generated) | Implemented. Presentation data only |
| Runtime attach | `@sidereal/render/crew/armor-attach` | Implemented and unit-tested. **Not wired into the game.** The voxel crew body is behind CHAR-BODY's `crewBundle = "voxel"` flag |
| Review evidence | `assets/art-library/designs/crew.armor-v1/revisions/r003/` | Sheets beside the reference crops, wardrobe sheets per body type, plus the fit report |

## Parts

Parts are in slots chest, shoulders, gloves, belt, legs, boots and back, with tiers 0–3 (civilian, light, standard, heavy) in every slot. Role styles include:

- coat, lab coat, overalls, flight, tactical, vest, medic and hazard chest pieces
- epaulettes
- dress, flight and sneaker boots
- tool, medic, holster and sash belts

The back slot holds the day, field, expedition and combat backpacks, single and twin oxygen, light and heavy jetpacks, a medpack, a radio and a tool pack. Jetpacks export `EXHAUST-*` nodes for a presentation-only exhaust effect.

Role presets are the ten roster roles: captain, engineer, medic, pilot, security, heavy marine, salvage tech, recon scout, scientist and mechanic. There are two stretch presets, civilian and jet trooper. Each preset names a CHAR-HEADS `headPreset` intent and an undersuit tint.

## Contract with CHAR-BODY

- **Frame:** rest-pose armature voxels at 1/32 m. Blender is Z up; the character faces +Y with `.R` at +X. `.R` is authored and `.L` mirrored.
- **GLB contents:** each GLB carries `crew_rig` plus one rigid-skinned mesh per torso fit, `GEO-armor-<id>-<fit>`. The `wide` fit is for male and neutral bodies, `narrow` for female, and `all` covers limb, belt and boot parts.
- **Attaching:** `attachCrewArmor(scene, { root, joints }, part, { variant, colourway })` re-links each armour bone to the body joint of the same name and parents the glTF root to the crew visual root.
- **Recolouring:** it sets `albedoColor` on the `crew.<slot>` materials.
- **Hidden regions:** it returns `hidesBodyRegions` (gloves → `hands`, boots → `feet`).
- **Fit rules:** armour never shares a visible same-normal coplanar face with the body or with other worn parts. The hanging-hand zone beside the hips stays clear, and nothing crosses the leg midline. Tests enforce all three.

## Style (owner feedback 2026-09-25/26)

- Every authored box is its own **brick island**, as in CHAR-BODY's voxkit. Each island is meshed separately and gets a soft 2-segment bevel (0.011 m, about 0.35 vox) plus face-area weighted normals.
- COLOR_0 carries a per-island tone. Materials are `crew.<slot>` baseColorFactor × COLOR_0. There are no textures and no per-voxel grid.
- The voxel read comes from 2-voxel stepped silhouettes and from layered detail islands: plates, straps, pouches, rivets and lights.
- T2/T3 parts target 10–20 % emissive visible surface. Per-part values are in the manifest `emissiveSurface`.
- Role presets pair saturated armour colourways with darker undersuit tints for contrast.

## Review sheets

`crew_armor_kit.py --sheets` produces the following. Each sheet is saved next to its matching reference crop where one exists.

- progress
- colourways (6)
- tiers
- back & utility
- roles (male and female)
- extras
- loadouts
- pose fit (CHAR-BODY `idle`, `run`, `aim_rifle`, `crouch_idle`, `sit` actions)
- wardrobe: one sheet per body type with base → uniforms → tiers → role sets, in front, 3/4, side and back views, plus a lineup

## Known gaps

- **Body revision:** the kit is fitted to CHAR-BODY **r002**. The owner's round-2 feedback (a head about 10 % smaller, a longer torso and legs, masculine/feminine underwear bases, a face texture) will produce a CHAR-BODY r003. That needs a refit: update `BODY`, `mannequin()` and the builder coordinates, then re-run `crew_armor_fit.py` and the kit.
- **Underwear bases:** the wardrobe "base" row shows the r002 undersuit, because the underwear-only base meshes are CHAR-BODY work that has not been published yet.
- **Clipping:** the clip check samples CHAR-BODY's real actions. In `aim_rifle` the arms cross the chest shell and pauldrons approach the head. The same poses already make the bare body intersect itself, and the manifest `fitReport.clip` records both numbers per preset.
- **No new inventory items:** there are no inventory definitions for the new parts. Existing owned items map to voxel visuals through `legacyVisuals` (`crewArmorLoadoutFromEquipment`). Adding tiered items to inventory is authority work and needs its own change and smoke test.
- **Helmets and visors** belong to CHAR-HEADS.
