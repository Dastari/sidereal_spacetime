# Independent exterior armor review

Reviewer: `/root/armor_reference_review`  
Date: 2026-09-14  
State: Prior implementation fails the owner's concept match. New candidate not yet supplied.

The owner requested another Blender geometry pass and independent comparison against `assets/art-library/hull-voxel-study/wayfarer-layout-concept-r001/proposal.png`, with textures and bump maps where possible. The exact concept, original `reference/art/3d-rpg-after.png`, rejected assembled front view, and six r002 native panel renders were opened individually. Their hashes are retained in `initial-evidence.json`. The concept is a visual target, not proof of delivered native or game geometry.

The previous native implementation contains separate side surfaces, but they visually read as full-height wall cladding. The assembled ship has narrow upright strips, shallow straight top rails and little visible lower shoulder mass. The bow transition is a thin triangular face over a rectangular inset. These differences are visible before considering lighting, wear or small greebles; adding those alone will not resolve the owner's objection.

| Requirement | Visible evidence needed | Failure to reject |
| --- | --- | --- |
| Separate armor silhouette | Armor-only view reads as an exterior shell, and assembled view visibly surrounds the retained pressure walls. | A changed wall face or texture sold as separate armor. |
| Shoulders and edge wraps | Broad stepped top and lower rails; pale ribs wrap onto rail top/bottom surfaces and end returns. | Thin flat trim or isolated white face strips with no silhouette effect. |
| Cassette depth | Dark recess reveals and visibly different frame/cassette planes in neutral three-quarter and grazing views. | Coplanar color zones or fine grooves carrying all apparent depth. |
| Bay proportions | Quiet broad armor bays alternate with bounded vent, service and identity inserts at ordinary gameplay zoom. A larger visual bay may span independently snapped modules. | Every 2 m member treated as an identical tall narrow door, or arbitrary off-grid width changes. |
| Connectors and modular fit | Joined-pair render shows a deliberate common rib, aligned shoulders, preserved outside datum and no doubled posts or open seams. | Decorative ribs that do not meet rails, heavy join overlaps, or hidden interface drift. |
| Bow continuity | Cheeks, lower transom, bumper and shoulder continue the same stepped shell around the bridge. | A flat triangular appliqué or disconnected nameplate standing in for armored bow geometry. |
| Material hierarchy | Pale enamel, charcoal/indigo cavities and burgundy service inserts are distinct under neutral light. Cyan/amber remain accents with bloom off. | Uniform gray plastic response, blacked-out recesses from lighting alone, or glow hiding flatness. |
| Mapped details | Fine bolts, panel lines, labels and finish use portable textures/normal/roughness maps. Main shoulders, deep vents and corner returns remain geometry. | Added tiny cubes for every detail, Blender-only procedural bump, or normal maps substituting for silhouette. |

The existing 0.5 m outward envelope, 2 m anchor interfaces, 3 m full wall height and approved reduced-height variants constrain this pass. The concept's illustrated thumbnail proportions do not grant permission to resize the structural floorplan or expand its mounting envelope. Broad visual hierarchy must be achieved inside those constraints and verified on the assembled ship.

Required review package: neutral native single part, two joined modules, bow corner/transition, concept-aligned assembled ship, armor alone, bare retained structure, and ordinary gameplay zoom of the exact new source/export. Capture metadata must identify camera, lighting, source/export hashes and renderer. Final browser evidence must come from the actual candidate loader. A catalog render or AI comparison alone cannot pass the assembly criterion.

The reviewer will report named pass/fail findings without arbitrary numerical scores. Passing this review means ready for owner review; it does not create artistic approval, publication permission, damage/pressure qualification or completion of a Shipyard contract.
