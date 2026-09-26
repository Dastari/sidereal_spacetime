# Crew voxel armour kit (armor-v1)

Status: **proposal art, r002 (character spec v2)**. Nothing here is owner-approved, published or active in the normal game. The live r008 modular components, their inventory items and the r003 pose pairing are unchanged.

## What exists

| Layer | Path | State |
| --- | --- | --- |
| Part definitions | `scripts/art_library/crew_armor_parts.py` | Implemented. Pure python: voxel volumes per crew_rig bone; 52 parts; 17 colourways; 12 role presets |
| Fit checks | `scripts/art_library/crew_armor_fit.py`, `test_crew_armor_parts.py` | Implemented. Z-fight and emissive checks, run by `npm run art:library:test` |
| Blender build/export/review | `scripts/art_library/crew_armor_kit.py` | Implemented. Headless: GLB + manifest, clip check, review sheets |
| Runtime assets | `assets/runtime/crew/armor-v1/` (`manifest.json`, `parts/*.glb`) | Generated, served at `/assets/crew/armor-v1/` |
| Content catalog | `@sidereal/content/crew-armor` (`crew-armor.json` is generated) | Implemented. Presentation data only |
| Runtime attach | `@sidereal/render/crew/armor-attach` | Implemented and unit-tested. **Not wired into the game.** The voxel crew body is behind CHAR-BODY's `crewBundle = "voxel"` flag |
| Review evidence | `assets/art-library/designs/crew.armor-v1/revisions/r002/` | Sheets beside the reference crops, plus the fit report |

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

## Style (owner feedback 2026-09-25)

- Plates are smooth, merged faces with soft bevelled edges (9 mm). There are no per-voxel textures, grooves or cell noise.
- The voxel read comes from 2-voxel stepped silhouettes and chunky details: vents, straps, pouches, rivets and lights.
- T2/T3 parts target 10–20 % emissive visible surface. Current per-part values are in the manifest `emissiveSurface`.

## Known gaps

- **Placeholder body:** the rig and body are CHAR-ARMOR's spec-v2 placeholder (`crew_armor_parts.BODY`, `mannequin()`) until CHAR-BODY publishes `CHARACTER_SPEC_BODY.json` with `spec_version: 2`. When it lands, refitting means updating `BODY`, the segment coordinates in the builders and the mannequin, then re-running the checks.
- **Clip numbers:** the clip check uses placeholder key poses on that rig until CHAR-BODY's actions are available (`--rig-blend`).
- **No new inventory items:** there are no inventory definitions for the new parts. Existing owned items map to voxel visuals through `legacyVisuals` (`crewArmorLoadoutFromEquipment`). Adding tiered items to inventory is authority work and needs its own change and smoke test.
- **Helmets and visors** belong to CHAR-HEADS.
