# Ten-character reference quality pass

Status: Owner-requested implementation and visual acceptance pending
Date: 2026-09-08

The source is `reference/art/characters-weapons-items.png`. Each reference archetype needs a distinct reproducible appearance, actual rendered PNG evidence and a comparison against its reference crop. Existing animation joints, clips, equipment sockets and authoritative inventory behavior must survive this art pass. Appearance presets grant no gameplay role or equipment.

| Reference | Visible features to reproduce |
| --- | --- |
| Captain | White peaked cap, dark navy jacket, gold rank details, white cuffs, visible face and dark hair, cyan handheld display |
| Engineer | Orange work armor, open lamp helmet with bright cyan lenses, utility belt and layered knee/shin protection |
| Medic | White/red enclosed helmet and armor, red medical insignia, dark blue reflective visor, cyan scanner and medical bag |
| Pilot | White/navy flight suit, orange helmet stripe, broad dark visor, compact technical chest panels and data pad |
| Security officer | Navy peaked cap and uniform, gold insignia, pale cuffs, visible face, compact firearm |
| Heavy marine | Bulky red/grey segmented armor, enclosed helmet, filters, dark visor, substantial shoulders and heavy equipment silhouette |
| Salvage tech | Yellow/orange enclosed industrial suit, broad dark visor, asymmetrical tools and utility fixtures |
| Recon scout | Olive/dark armor, green glowing multi-lens optics, compact backpack, restrained green equipment emission |
| Scientist | Purple stepped hair, visible face, white/light-grey suit, dark gloves and boots, cyan handheld display |
| Mechanic | Open orange/navy work cap, visible face and dark hair, orange utility details and tool belt, compact powered tool |

Manufactured parts need fine blocky detail and restrained beveled edges. Selective lights should illuminate lenses, displays and armor fixtures without making entire armor plates emissive. Visors should have a slightly curved form and a separate tinted, partially transparent reflective material; do not feed transmission through the opaque voxel mesher. Preserve authored Blender sources and validate exported material roles.

Capture all ten looks under the same camera, scale and lighting, plus close face/visor/armor views where the contact sheet cannot show detail. Compare color families, silhouette, face/hair readability, material response and held-item attachment. Record rejected iterations honestly. Runtime presentation and source-render acceptance are separate checks; neither a successful export nor ten palette swaps alone establishes a match.

The owner subsequently found the marine helmet had no rear shell in-game (attachment ending `3bf60d55-e8e0-4fbc-bafd-21ccc5ab7270.png`). The cause was confirmed as missing modeled rear coverage. Acceptance now requires front, side, rear and three-quarter source renders for every look, plus runtime rear/side checks. Enclosed helmets must cover the rear head and have appropriate neck seals; open work helmets and caps retain intentional openings. Front reference matching alone is insufficient.
