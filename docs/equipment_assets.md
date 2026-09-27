# Modular equipment asset kit

Status: Implemented visual preview; gameplay integration pending
Last updated: 2026-09-08
Owners: Sidereal art and rendering

## 2026-09-08 implementation

Twelve original, editable Blender assets translate the owner-provided crew and cargo references into pale studless plate forms, indigo recesses, burgundy service covers, copper fittings and cyan powered elements. Reference artwork is not copied into geometry or runtime files.

Rebuild with `npm run art:equipment` (managed `dev.py export-equipment`). Source: `assets/source/equipment-kit.blend`; deterministic authoring recipe: `scripts/build_equipment_source.py`. The source retains twelve distinct asset roots and their merged multi-material meshes. Source geometry is staged for review; individual exported GLBs have identity transforms and their own attachment origins.

`assets/runtime/equipment/manifest.json` records each unique asset ID, role, dimensions, attachment socket, auxiliary muzzle/support anchors, triangle and material counts, source hash and export hashes. The combined `equipment-review.glb` and `contact-sheet.png` are review artifacts, not an inventory definition. Across the twelve individual files: 10,648 triangles and approximately 852 KiB of GLB payload. Each asset uses one merged mesh with four to seven shared material primitives; there is no node or draw call per brick. Eight shared PBR material roles use opaque or emissive geometry, with no unsupported transparency. This is beveled studless geometry; fine destructible voxel conversion remains separate future work.

| Asset | Attachment / purpose |
| --- | --- |
| compact-pistol, heavy-handgun | handR, one-handed weapon preview |
| carbine, long-rifle | handR, two-handed weapon preview, support/muzzle anchors |
| plasma-cutter, sample-scanner | handR, repair/science tool preview |
| medkit, resource-canister, power-cell | handR, carried supplies |
| supply-crate | ground origin, independently placed cargo visual |
| utility-backpack, shield-backpack | back mounting origin |

## Runtime use

`packages/render/src/equipment/index.ts` exports `EQUIPMENT_ASSETS` and `createEquipmentVisual(scene, parent, asset, baseUrl?)`. Default URL is `/assets/equipment/`. The returned placement node follows its parent socket. Call `dispose()` to release the imported container and placement node when changing the equipped asset or removing the actor. The caller controls asynchronous replacement races; an import that finishes after its actor is disposed must also be disposed. Each current call imports its own container; large crowds need a measured shared-container instance cache before treating this as a fleet-scale loader.

The attachment frame uses meters, glTF +Y up and -Z forward; handheld grips center on local `(0,0,0)`. Grips are 7.5 cm wide and 15.5 cm tall, matching the crew's 16 cm glove. Backpacks extend behind the local mounting plane. Babylon's standard glTF handedness conversion is retained. The crew API supplies `sockets.handR`, `handL`, `back` and `hip`; use the matching pistol/rifle weapon pose and `weaponFixture:false` to hide the crew's built-in placeholder when an external weapon is attached. Auxiliary support anchors are authored visual metadata; two-handed inverse kinematics and exact grip contact across all poses are not implemented by this kit.

These models do not create inventory balances, combat permissions, ammunition, repair effects, shield mechanics or persistent equipment grants. Future character-owned inventory, validated item attachment, combat and resource reducers must provide authority before a visual loadout becomes gameplay state. No server tables or reducers change here.

## Actual-model inventory thumbnails

`npm run art:inventory-icons` loads the preserved equipment Blender source without saving changes and renders eleven 256×256 transparent PNG thumbnails into `assets/runtime/equipment/icons/`. Orthographic three-quarter views expose the actual broad silhouettes and service panels; original material colors are retained under neutral CPU studio lighting. Runtime paths are `/assets/equipment/icons/<assetId>.png`. The eleven icon files total 573,459 bytes; the separate contact sheet is review evidence. The manifest records source/generator/output hashes, image dimensions and padded alpha bounds. `npm run art:check` verifies those hashes and RGBA PNG headers. These thumbnails depict actual assets and do not grant inventory instances or equipment permissions.
