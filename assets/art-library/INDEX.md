# Sidereal living art library

**Owner model direction:** TypeScript voxel-solid art is being phased out in favor of Blender-authored models, meshes and materials. Preserve authored surfaces in the visual export; any required occupancy/collision/damage representation is separate. Read [Blender model migration](../../docs/blender_asset_migration.md).

[Redesign current equipment — agent prompt](prompts/REDESIGN_CURRENT_EQUIPMENT.md) · [Equipment inventory and work queue](CURRENT_EQUIPMENT.md) · [Cargo collection and size matrix](CARGO_COLLECTION.md) · [Mapped ship floor kit](shipyard-floor/README.md)

Saved current reconstruction evidence: **50 design cutouts, 62 Blender sources and 47 runtime view pairs**, covering 103 source appearances. Other reference entries still require reconstruction. Saved evidence does not imply owner acceptance.

Start here for asset work and progress reviews. Read [WORKFLOW.md](WORKFLOW.md) before changing a design. The JSON ledgers are authoritative; regenerate this index after every edit with `python3 scripts/art_catalog.py index`.

**41 source files visually inspected; 2618 exact reference crops; 412 proposed shared design queues; 36 current revisions signed off by the owner.**

[Browse visual library](index.html) · [Source audit](SOURCE_AUDIT.md) · [Style, scale and pipeline](STYLE_AND_PIPELINE.md) · [Current status](status.json) · [Individual character components](character-components/INDEX.md)

## Honest current scope

Every registered source was opened individually. Cataloged references have initial manually authored rectangles, contact sheets and item briefs. Sources added during cargo work are explicitly marked as pending detailed crop annotation in the source audit. Dense crops may retain adjacent/occluded pieces and need visual refinement. Reference crops are not reconstructed cutouts. Shared design queues are provisional; variant compatibility and individual silhouettes must be resolved before implementation. Production cutouts, Blender assets and actual runtime evidence exist only where listed in the revision ledger. Nothing is implicitly final or published.

## Resume prompt

> Read assets/art-library/INDEX.md and WORKFLOW.md. Inspect status.json and the current design ledger. Work through unsigned assets in priority order, preserving every revision and crop. Resolve a specific reference/variant, implement the next feedback-driven improvement, validate and capture Blender and actual in-game evidence. Update the ledger, feedback and this index after each iteration. Request owner feedback when evidence is ready; never infer approval or loop indefinitely without new evidence. Continue other unblocked unsigned designs while waiting.

## Design queues

| Priority | Design | References | Revision | State | Owner final sign-off |
| --- | --- | --- | --- | --- | --- |
| 1 | [shipyard.hull.shoulder-construction-interface](designs/shipyard.hull.shoulder-construction-interface/DESIGN.md) | 0 | r000 | in-progress | NO |
| 1 | [shipyard.structure.complex-perimeter](designs/shipyard.structure.complex-perimeter/DESIGN.md) | 0 | r005 | in-progress | NO |
| 1 | [shipyard.structure.convex-inset-boundary](designs/shipyard.structure.convex-inset-boundary/DESIGN.md) | 0 | r004 | in-progress | NO |
| 1 | [shipyard.structure.doorway250](designs/shipyard.structure.doorway250/DESIGN.md) | 0 | r004 | in-progress | NO |
| 1 | [shipyard.structure.floor-contact250](designs/shipyard.structure.floor-contact250/DESIGN.md) | 0 | r012 | in-progress | NO |
| 1 | [shipyard.structure.inset-boundary-wall](designs/shipyard.structure.inset-boundary-wall/DESIGN.md) | 0 | r005 | in-progress | NO |
| 1 | [shipyard.structure.internal250](designs/shipyard.structure.internal250/DESIGN.md) | 0 | r000 | in-progress | NO |
| 1 | [shipyard.structure.legacy-trapezoid-floor](designs/shipyard.structure.legacy-trapezoid-floor/DESIGN.md) | 0 | r002 | in-progress | NO |
| 1 | [shipyard.structure.roof125](designs/shipyard.structure.roof125/DESIGN.md) | 0 | r000 | in-progress | NO |
| 1 | [shipyard.structure.union-junction250](designs/shipyard.structure.union-junction250/DESIGN.md) | 0 | r001 | in-progress | NO |
| 1 | [shipyard.structure.usable-boundary-wall](designs/shipyard.structure.usable-boundary-wall/DESIGN.md) | 0 | r000 | in-progress | NO |
| 1 | [shipyard.structure.wayfarer-transition](designs/shipyard.structure.wayfarer-transition/DESIGN.md) | 0 | r003 | in-progress | NO |
| 1 | [shipyard.structure.window250](designs/shipyard.structure.window250/DESIGN.md) | 0 | r004 | in-progress | NO |
| 10 | [construction.floor.quad-panel](designs/construction.floor.quad-panel/DESIGN.md) | 1 | r002 | changes-requested | NO |
| 10 | [construction.wall.service-cyan](designs/construction.wall.service-cyan/DESIGN.md) | 1 | r004 | changes-requested | NO |
| 10 | [pale-studless.floor.carpet](designs/pale-studless.floor.carpet/DESIGN.md) | 1 | r000 | reference-only | NO |
| 10 | [pale-studless.floor.exterior](designs/pale-studless.floor.exterior/DESIGN.md) | 1 | r000 | reference-only | NO |
| 10 | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) | 8 | r000 | reference-only | NO |
| 10 | [pale-studless.floor.grate](designs/pale-studless.floor.grate/DESIGN.md) | 2 | r000 | reference-only | NO |
| 10 | [pale-studless.floor.hazard](designs/pale-studless.floor.hazard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 10 | [pale-studless.floor.hex](designs/pale-studless.floor.hex/DESIGN.md) | 1 | r000 | reference-only | NO |
| 10 | [pale-studless.floor.reinforced](designs/pale-studless.floor.reinforced/DESIGN.md) | 1 | r000 | reference-only | NO |
| 10 | [pale-studless.floor.standard](designs/pale-studless.floor.standard/DESIGN.md) | 2 | r000 | reference-only | NO |
| 10 | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) | 28 | r000 | reference-only | NO |
| 10 | [shipyard.floor.mapped-deck-kit](designs/shipyard.floor.mapped-deck-kit/DESIGN.md) | 4 | r002 | awaiting-owner | NO |
| 10 | [shipyard.structure.boundary-kit](designs/shipyard.structure.boundary-kit/DESIGN.md) | 0 | r006 | in-progress | NO |
| 10 | [shipyard.structure.external-airlock](designs/shipyard.structure.external-airlock/DESIGN.md) | 0 | r000 | in-progress | NO |
| 10 | [shipyard.structure.roof-closure](designs/shipyard.structure.roof-closure/DESIGN.md) | 0 | r000 | in-progress | NO |
| 10 | [shipyard.structure.roof-kit](designs/shipyard.structure.roof-kit/DESIGN.md) | 0 | r001 | in-progress | NO |
| 10 | [shipyard.structure.stair-dogleg](designs/shipyard.structure.stair-dogleg/DESIGN.md) | 0 | r000 | in-progress | NO |
| 10 | [shipyard.structure.traversal-ladder](designs/shipyard.structure.traversal-ladder/DESIGN.md) | 0 | r000 | in-progress | NO |
| 10 | [shipyard.structure.wayfarer-airlock-inlet](designs/shipyard.structure.wayfarer-airlock-inlet/DESIGN.md) | 0 | r000 | in-progress | NO |
| 20 | [crystalline-alien.console.standard](designs/crystalline-alien.console.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [historical-baseline.bed.standard](designs/historical-baseline.bed.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [historical-baseline.console.standard](designs/historical-baseline.console.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [historical-baseline.engine.engine](designs/historical-baseline.engine.engine/DESIGN.md) | 6 | r000 | reference-only | NO |
| 20 | [industrial-mining.engine.engine](designs/industrial-mining.engine.engine/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) | 15 | r000 | reference-only | NO |
| 20 | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) | 45 | r000 | reference-only | NO |
| 20 | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) | 8 | r000 | reference-only | NO |
| 20 | [pale-studless.door.blast](designs/pale-studless.door.blast/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) | 12 | r000 | reference-only | NO |
| 20 | [pale-studless.door.exterior-airlock](designs/pale-studless.door.exterior-airlock/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.door.hatch](designs/pale-studless.door.hatch/DESIGN.md) | 2 | r000 | reference-only | NO |
| 20 | [pale-studless.door.interior-airlock](designs/pale-studless.door.interior-airlock/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.door.sliding](designs/pale-studless.door.sliding/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) | 22 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.ion](designs/pale-studless.engine.ion/DESIGN.md) | 2 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.large](designs/pale-studless.engine.large/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.maneuver](designs/pale-studless.engine.maneuver/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.medium](designs/pale-studless.engine.medium/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.rcs](designs/pale-studless.engine.rcs/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.small](designs/pale-studless.engine.small/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.vtol](designs/pale-studless.engine.vtol/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.engine.warp](designs/pale-studless.engine.warp/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [pale-studless.room.engineering](designs/pale-studless.room.engineering/DESIGN.md) | 1 | r000 | reference-only | NO |
| 20 | [raider.engine.engine](designs/raider.engine.engine/DESIGN.md) | 2 | r000 | reference-only | NO |
| 20 | [shipyard.equipment.bridge-bank](designs/shipyard.equipment.bridge-bank/DESIGN.md) | 1 | r004 | signed-off | YES — see exact coverage |
| 20 | [shipyard.equipment.command-console](designs/shipyard.equipment.command-console/DESIGN.md) | 1 | r004 | signed-off | YES — see exact coverage |
| 20 | [shipyard.equipment.hydroponics](designs/shipyard.equipment.hydroponics/DESIGN.md) | 1 | r004 | signed-off | YES — see exact coverage |
| 20 | [shipyard.equipment.medical-bed](designs/shipyard.equipment.medical-bed/DESIGN.md) | 1 | r003 | signed-off | YES — see exact coverage |
| 20 | [shipyard.hull.voxel-material-study](designs/shipyard.hull.voxel-material-study/DESIGN.md) | 0 | r007 | awaiting-owner | NO |
| 50 | [cargo.fluid-chemical.medium](designs/cargo.fluid-chemical.medium/DESIGN.md) | 5 | r001 | signed-off | YES — see exact coverage |
| 50 | [cargo.fluid-cryo.medium](designs/cargo.fluid-cryo.medium/DESIGN.md) | 5 | r001 | signed-off | YES — see exact coverage |
| 50 | [cargo.fluid-fuel.medium](designs/cargo.fluid-fuel.medium/DESIGN.md) | 5 | r001 | signed-off | YES — see exact coverage |
| 50 | [cargo.fluid-gas.medium](designs/cargo.fluid-gas.medium/DESIGN.md) | 5 | r001 | signed-off | YES — see exact coverage |
| 50 | [cargo.fluid-water.medium](designs/cargo.fluid-water.medium/DESIGN.md) | 5 | r001 | signed-off | YES — see exact coverage |
| 50 | [cargo.fluid.large](designs/cargo.fluid.large/DESIGN.md) | 1 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.fluid.medium](designs/cargo.fluid.medium/DESIGN.md) | 4 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.high-value.medium](designs/cargo.high-value.medium/DESIGN.md) | 1 | r003 | signed-off | YES — see exact coverage |
| 50 | [cargo.high-value.small](designs/cargo.high-value.small/DESIGN.md) | 4 | r003 | signed-off | YES — see exact coverage |
| 50 | [cargo.medical.medium](designs/cargo.medical.medium/DESIGN.md) | 1 | r003 | signed-off | YES — see exact coverage |
| 50 | [cargo.medical.small](designs/cargo.medical.small/DESIGN.md) | 5 | r003 | signed-off | YES — see exact coverage |
| 50 | [cargo.refrigerated.large](designs/cargo.refrigerated.large/DESIGN.md) | 1 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.refrigerated.medium](designs/cargo.refrigerated.medium/DESIGN.md) | 4 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.reinforced.large](designs/cargo.reinforced.large/DESIGN.md) | 3 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.reinforced.medium](designs/cargo.reinforced.medium/DESIGN.md) | 1 | r003 | signed-off | YES — see exact coverage |
| 50 | [cargo.reinforced.oversized](designs/cargo.reinforced.oversized/DESIGN.md) | 1 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.salvage.large](designs/cargo.salvage.large/DESIGN.md) | 4 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.salvage.oversized](designs/cargo.salvage.oversized/DESIGN.md) | 1 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.standard.large](designs/cargo.standard.large/DESIGN.md) | 3 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.standard.medium](designs/cargo.standard.medium/DESIGN.md) | 3 | r003 | signed-off | YES — see exact coverage |
| 50 | [cargo.standard.narrow](designs/cargo.standard.narrow/DESIGN.md) | 2 | r001 | signed-off | YES — see exact coverage |
| 50 | [cargo.standard.oversized](designs/cargo.standard.oversized/DESIGN.md) | 5 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.standard.small](designs/cargo.standard.small/DESIGN.md) | 2 | r003 | signed-off | YES — see exact coverage |
| 50 | [cargo.standard.tiny](designs/cargo.standard.tiny/DESIGN.md) | 1 | r001 | signed-off | YES — see exact coverage |
| 50 | [cargo.vacuum.large](designs/cargo.vacuum.large/DESIGN.md) | 1 | r002 | signed-off | YES — see exact coverage |
| 50 | [cargo.vacuum.medium](designs/cargo.vacuum.medium/DESIGN.md) | 4 | r002 | signed-off | YES — see exact coverage |
| 50 | [construction.base.utility](designs/construction.base.utility/DESIGN.md) | 1 | r002 | changes-requested | NO |
| 50 | [construction.corner.service](designs/construction.corner.service/DESIGN.md) | 1 | r002 | changes-requested | NO |
| 50 | [construction.hull.service-cube](designs/construction.hull.service-cube/DESIGN.md) | 1 | r003 | changes-requested | NO |
| 50 | [construction.roof.vented](designs/construction.roof.vented/DESIGN.md) | 1 | r002 | changes-requested | NO |
| 50 | [crew.alien](designs/crew.alien/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.aim](designs/crew.animation.aim/DESIGN.md) | 4 | r003 | signed-off | YES — see exact coverage |
| 50 | [crew.animation.cheer](designs/crew.animation.cheer/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.crouch](designs/crew.animation.crouch/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.die](designs/crew.animation.die/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [crew.animation.hurt](designs/crew.animation.hurt/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.idle](designs/crew.animation.idle/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [crew.animation.melee](designs/crew.animation.melee/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [crew.animation.pick-up-interact](designs/crew.animation.pick-up-interact/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [crew.animation.point](designs/crew.animation.point/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.run](designs/crew.animation.run/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [crew.animation.shoot](designs/crew.animation.shoot/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [crew.animation.sit](designs/crew.animation.sit/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.thumbs-up](designs/crew.animation.thumbs-up/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.animation.use-repair](designs/crew.animation.use-repair/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [crew.animation.walk](designs/crew.animation.walk/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [crew.animation.wave](designs/crew.animation.wave/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) | 70 | r009 | awaiting-owner | NO |
| 50 | [crew.cyborg](designs/crew.cyborg/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.equipment.armor](designs/crew.equipment.armor/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) | 12 | r000 | reference-only | NO |
| 50 | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) | 23 | r000 | reference-only | NO |
| 50 | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) | 9 | r000 | reference-only | NO |
| 50 | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) | 19 | r000 | reference-only | NO |
| 50 | [crew.equipment.gauntlet](designs/crew.equipment.gauntlet/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) | 7 | r000 | reference-only | NO |
| 50 | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) | 14 | r000 | reference-only | NO |
| 50 | [crew.equipment.head](designs/crew.equipment.head/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) | 20 | r000 | reference-only | NO |
| 50 | [crew.equipment.jetpack](designs/crew.equipment.jetpack/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [crew.equipment.legs](designs/crew.equipment.legs/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.equipment.mask](designs/crew.equipment.mask/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.equipment.oxygen-pack](designs/crew.equipment.oxygen-pack/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [crew.equipment.rebreather](designs/crew.equipment.rebreather/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crew.equipment.shield-pack](designs/crew.equipment.shield-pack/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) | 17 | r000 | reference-only | NO |
| 50 | [crew.equipment.visor](designs/crew.equipment.visor/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) | 19 | r000 | reference-only | NO |
| 50 | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) | 24 | r000 | reference-only | NO |
| 50 | [crew.faces.details](designs/crew.faces.details/DESIGN.md) | 12 | r000 | reference-only | NO |
| 50 | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) | 12 | r000 | reference-only | NO |
| 50 | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) | 13 | r000 | reference-only | NO |
| 50 | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) | 13 | r000 | reference-only | NO |
| 50 | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) | 13 | r000 | reference-only | NO |
| 50 | [crystalline-alien.floor.floor](designs/crystalline-alien.floor.floor/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) | 12 | r000 | reference-only | NO |
| 50 | [crystalline-alien.machine.stasis](designs/crystalline-alien.machine.stasis/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) | 9 | r000 | reference-only | NO |
| 50 | [crystalline-alien.pipe.standard](designs/crystalline-alien.pipe.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.plant.standard](designs/crystalline-alien.plant.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.reactor.standard](designs/crystalline-alien.reactor.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.resource.crystal](designs/crystalline-alien.resource.crystal/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [crystalline-alien.roof.standard](designs/crystalline-alien.roof.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.room.assembly](designs/crystalline-alien.room.assembly/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.room.bio-lab](designs/crystalline-alien.room.bio-lab/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [crystalline-alien.room.bridge](designs/crystalline-alien.room.bridge/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [crystalline-alien.room.hatchery](designs/crystalline-alien.room.hatchery/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [crystalline-alien.room.stasis](designs/crystalline-alien.room.stasis/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [crystalline-alien.wall.standard](designs/crystalline-alien.wall.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [environment.asteroids](designs/environment.asteroids/DESIGN.md) | 36 | r000 | reference-only | NO |
| 50 | [environment.background](designs/environment.background/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [environment.planet.crystal](designs/environment.planet.crystal/DESIGN.md) | 3 | r016 | in-progress | NO |
| 50 | [environment.planet.desert](designs/environment.planet.desert/DESIGN.md) | 3 | r015 | in-progress | NO |
| 50 | [environment.planet.gas-giant](designs/environment.planet.gas-giant/DESIGN.md) | 4 | r007 | in-progress | NO |
| 50 | [environment.planet.ice](designs/environment.planet.ice/DESIGN.md) | 3 | r028 | in-progress | NO |
| 50 | [environment.planet.ocean](designs/environment.planet.ocean/DESIGN.md) | 3 | r008 | in-progress | NO |
| 50 | [environment.planet.rocky](designs/environment.planet.rocky/DESIGN.md) | 3 | r011 | in-progress | NO |
| 50 | [environment.planet.temperate](designs/environment.planet.temperate/DESIGN.md) | 3 | r004 | in-progress | NO |
| 50 | [environment.planet.toxic](designs/environment.planet.toxic/DESIGN.md) | 3 | r008 | in-progress | NO |
| 50 | [environment.planet.unspecified](designs/environment.planet.unspecified/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [environment.planet.volcanic](designs/environment.planet.volcanic/DESIGN.md) | 3 | r026 | in-progress | NO |
| 50 | [environment.wreckage](designs/environment.wreckage/DESIGN.md) | 17 | r000 | reference-only | NO |
| 50 | [historical-baseline.bunk.standard](designs/historical-baseline.bunk.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [historical-baseline.hull.standard](designs/historical-baseline.hull.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [historical-baseline.hydroponics.standard](designs/historical-baseline.hydroponics.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [historical-baseline.roof.standard](designs/historical-baseline.roof.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [historical-baseline.sofa.standard](designs/historical-baseline.sofa.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [historical-baseline.wall.standard](designs/historical-baseline.wall.standard/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [industrial-mining.crate.cargo](designs/industrial-mining.crate.cargo/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [industrial-mining.crate.standard](designs/industrial-mining.crate.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [industrial-mining.hull.standard](designs/industrial-mining.hull.standard/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [industrial-mining.machine.crusher](designs/industrial-mining.machine.crusher/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [industrial-mining.machine.drill](designs/industrial-mining.machine.drill/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [industrial-mining.machine.refinery](designs/industrial-mining.machine.refinery/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [industrial-mining.machine.standard](designs/industrial-mining.machine.standard/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [industrial-mining.mount.standard](designs/industrial-mining.mount.standard/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [industrial-mining.pipe.standard](designs/industrial-mining.pipe.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [industrial-mining.room.assembly](designs/industrial-mining.room.assembly/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [industrial-mining.sensor.antenna](designs/industrial-mining.sensor.antenna/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [industrial-mining.sensor.mast](designs/industrial-mining.sensor.mast/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [industrial-mining.tank.fuel](designs/industrial-mining.tank.fuel/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [industrial-mining.tractor.standard](designs/industrial-mining.tractor.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.battery.standard](designs/pale-studless.battery.standard/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.bunk.standard](designs/pale-studless.bunk.standard/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) | 7 | r000 | reference-only | NO |
| 50 | [pale-studless.corner.standard](designs/pale-studless.corner.standard/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.cargo](designs/pale-studless.crate.cargo/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.data](designs/pale-studless.crate.data/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.medical](designs/pale-studless.crate.medical/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.medkit](designs/pale-studless.crate.medkit/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.pallet](designs/pale-studless.crate.pallet/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.refrigerated](designs/pale-studless.crate.refrigerated/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.reinforced](designs/pale-studless.crate.reinforced/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.salvage](designs/pale-studless.crate.salvage/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) | 25 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.tech](designs/pale-studless.crate.tech/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.crate.vacuum](designs/pale-studless.crate.vacuum/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) | 18 | r000 | reference-only | NO |
| 50 | [pale-studless.handgun.standard](designs/pale-studless.handgun.standard/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) | 36 | r000 | reference-only | NO |
| 50 | [pale-studless.hydroponics.standard](designs/pale-studless.hydroponics.standard/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) | 13 | r000 | reference-only | NO |
| 50 | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.air-filter](designs/pale-studless.machine.air-filter/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.cloaking](designs/pale-studless.machine.cloaking/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.coolant](designs/pale-studless.machine.coolant/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.drone](designs/pale-studless.machine.drone/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.fuel-processor](designs/pale-studless.machine.fuel-processor/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.gravity](designs/pale-studless.machine.gravity/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.jump](designs/pale-studless.machine.jump/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.refinery](designs/pale-studless.machine.refinery/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) | 11 | r000 | reference-only | NO |
| 50 | [pale-studless.machine.teleport](designs/pale-studless.machine.teleport/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) | 22 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.cluster](designs/pale-studless.ordnance.cluster/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.emp](designs/pale-studless.ordnance.emp/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.guided](designs/pale-studless.ordnance.guided/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.heavy-torpedo](designs/pale-studless.ordnance.heavy-torpedo/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.incendiary](designs/pale-studless.ordnance.incendiary/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.interceptor](designs/pale-studless.ordnance.interceptor/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.kinetic](designs/pale-studless.ordnance.kinetic/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) | 14 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.plasma](designs/pale-studless.ordnance.plasma/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.ordnance.proximity](designs/pale-studless.ordnance.proximity/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.coolant](designs/pale-studless.pipe.coolant/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.corner](designs/pale-studless.pipe.corner/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.cross](designs/pale-studless.pipe.cross/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.data](designs/pale-studless.pipe.data/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.elbow](designs/pale-studless.pipe.elbow/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.flexible](designs/pale-studless.pipe.flexible/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.power](designs/pale-studless.pipe.power/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.riser](designs/pale-studless.pipe.riser/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) | 17 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.t-junction](designs/pale-studless.pipe.t-junction/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.tray](designs/pale-studless.pipe.tray/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.pipe.vertical](designs/pale-studless.pipe.vertical/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) | 14 | r000 | reference-only | NO |
| 50 | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) | 10 | r000 | reference-only | NO |
| 50 | [pale-studless.resource.ingot](designs/pale-studless.resource.ingot/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.rifle.beam](designs/pale-studless.rifle.beam/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.rifle.carbine](designs/pale-studless.rifle.carbine/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.rifle.rail](designs/pale-studless.rifle.rail/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.rifle.rifle](designs/pale-studless.rifle.rifle/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [pale-studless.rifle.shotgun](designs/pale-studless.rifle.shotgun/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [pale-studless.rifle.smg](designs/pale-studless.rifle.smg/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.rifle.standard](designs/pale-studless.rifle.standard/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) | 16 | r000 | reference-only | NO |
| 50 | [pale-studless.room.airlock](designs/pale-studless.room.airlock/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.room.assembly](designs/pale-studless.room.assembly/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [pale-studless.room.bridge](designs/pale-studless.room.bridge/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.room.cargo](designs/pale-studless.room.cargo/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.room.corridor](designs/pale-studless.room.corridor/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) | 7 | r000 | reference-only | NO |
| 50 | [pale-studless.room.hydroponics](designs/pale-studless.room.hydroponics/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [pale-studless.room.lounge](designs/pale-studless.room.lounge/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.room.medbay](designs/pale-studless.room.medbay/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [pale-studless.room.science](designs/pale-studless.room.science/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.room.storage](designs/pale-studless.room.storage/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.sanitation.standard](designs/pale-studless.sanitation.standard/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [pale-studless.sensor.antenna](designs/pale-studless.sensor.antenna/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.sensor.beacon](designs/pale-studless.sensor.beacon/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [pale-studless.sensor.dish](designs/pale-studless.sensor.dish/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.sensor.dome](designs/pale-studless.sensor.dome/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.sensor.mast](designs/pale-studless.sensor.mast/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.sensor.radar](designs/pale-studless.sensor.radar/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.sensor.standard](designs/pale-studless.sensor.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.shield.standard](designs/pale-studless.shield.standard/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.sofa.standard](designs/pale-studless.sofa.standard/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) | 10 | r000 | reference-only | NO |
| 50 | [pale-studless.tank.chemical](designs/pale-studless.tank.chemical/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.tank.cryo](designs/pale-studless.tank.cryo/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.tank.fuel](designs/pale-studless.tank.fuel/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.tank.gas](designs/pale-studless.tank.gas/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.tank.liquid](designs/pale-studless.tank.liquid/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.tank.oxygen](designs/pale-studless.tank.oxygen/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.tank.water](designs/pale-studless.tank.water/DESIGN.md) | 0 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.baton](designs/pale-studless.tool.baton/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.cutter](designs/pale-studless.tool.cutter/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.data-pad](designs/pale-studless.tool.data-pad/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.flashlight](designs/pale-studless.tool.flashlight/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.grapple](designs/pale-studless.tool.grapple/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.medgun](designs/pale-studless.tool.medgun/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.multi-tool](designs/pale-studless.tool.multi-tool/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.repair](designs/pale-studless.tool.repair/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.scanner](designs/pale-studless.tool.scanner/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.welder](designs/pale-studless.tool.welder/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.tool.wrench](designs/pale-studless.tool.wrench/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [pale-studless.tractor.standard](designs/pale-studless.tractor.standard/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.breaching](designs/pale-studless.turret.breaching/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.drone](designs/pale-studless.turret.drone/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) | 7 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.gauss](designs/pale-studless.turret.gauss/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.ion](designs/pale-studless.turret.ion/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) | 9 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.mine](designs/pale-studless.turret.mine/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.plasma](designs/pale-studless.turret.plasma/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.pulse-beam](designs/pale-studless.turret.pulse-beam/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.rocket](designs/pale-studless.turret.rocket/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.standard](designs/pale-studless.turret.standard/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [pale-studless.turret.torpedo](designs/pale-studless.turret.torpedo/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) | 117 | r000 | reference-only | NO |
| 50 | [pale-studless.window.canopy](designs/pale-studless.window.canopy/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [pale-studless.window.force-field](designs/pale-studless.window.force-field/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.window.glass-floor](designs/pale-studless.window.glass-floor/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.window.large-window](designs/pale-studless.window.large-window/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) | 9 | r000 | reference-only | NO |
| 50 | [raider.bunk.standard](designs/raider.bunk.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.corner.standard](designs/raider.corner.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.crate.cargo](designs/raider.crate.cargo/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) | 12 | r000 | reference-only | NO |
| 50 | [raider.machine.drone](designs/raider.machine.drone/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.machine.jammer](designs/raider.machine.jammer/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.machine.standard](designs/raider.machine.standard/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [raider.pipe.standard](designs/raider.pipe.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.roof.standard](designs/raider.roof.standard/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.room.assembly](designs/raider.room.assembly/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.room.bridge](designs/raider.room.bridge/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.room.cargo](designs/raider.room.cargo/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.room.crew](designs/raider.room.crew/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.shield.standard](designs/raider.shield.standard/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [raider.turret.scrap](designs/raider.turret.scrap/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [raider.turret.standard](designs/raider.turret.standard/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [ship.aurelian](designs/ship.aurelian/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) | 13 | r000 | reference-only | NO |
| 50 | [ship.helix](designs/ship.helix/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [ship.prospector](designs/ship.prospector/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [ship.razor](designs/ship.razor/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [ship.riftjack](designs/ship.riftjack/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [ship.wayfarer](designs/ship.wayfarer/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [shipyard.equipment.crew-bunk](designs/shipyard.equipment.crew-bunk/DESIGN.md) | 1 | r006 | awaiting-owner | NO |
| 50 | [shipyard.equipment.lounge-sofa](designs/shipyard.equipment.lounge-sofa/DESIGN.md) | 1 | r003 | signed-off | YES — see exact coverage |
| 50 | [shipyard.equipment.pilot-seat](designs/shipyard.equipment.pilot-seat/DESIGN.md) | 1 | r003 | signed-off | YES — see exact coverage |
| 50 | [shipyard.equipment.reactor](designs/shipyard.equipment.reactor/DESIGN.md) | 1 | r003 | signed-off | YES — see exact coverage |
| 50 | [shipyard.equipment.wall-locker](designs/shipyard.equipment.wall-locker/DESIGN.md) | 1 | r005 | signed-off | YES — see exact coverage |
| 50 | [shipyard.hull.pilot-section](designs/shipyard.hull.pilot-section/DESIGN.md) | 2 | r006 | awaiting-owner | NO |
| 50 | [shipyard.hull.side-armor](designs/shipyard.hull.side-armor/DESIGN.md) | 1 | r005 | in-progress | NO |
| 50 | [shipyard.roof.frontier](designs/shipyard.roof.frontier/DESIGN.md) | 2 | r004 | signed-off | YES — see exact coverage |
| 50 | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) | 7 | r000 | reference-only | NO |
| 50 | [stepped-environment.resource.crystal](designs/stepped-environment.resource.crystal/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [stepped-environment.resource.exotic](designs/stepped-environment.resource.exotic/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) | 8 | r000 | reference-only | NO |
| 50 | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) | 7 | r000 | reference-only | NO |
| 50 | [stepped-environment.resource.iron](designs/stepped-environment.resource.iron/DESIGN.md) | 6 | r000 | reference-only | NO |
| 50 | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) | 51 | r000 | reference-only | NO |
| 50 | [ui.buttons](designs/ui.buttons/DESIGN.md) | 73 | r000 | reference-only | NO |
| 50 | [ui.character-status-and-equipment](designs/ui.character-status-and-equipment/DESIGN.md) | 4 | r005 | awaiting-owner | NO |
| 50 | [ui.feedback](designs/ui.feedback/DESIGN.md) | 14 | r001 | awaiting-owner | NO |
| 50 | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) | 44 | r000 | reference-only | NO |
| 50 | [ui.icons](designs/ui.icons/DESIGN.md) | 193 | r000 | reference-only | NO |
| 50 | [ui.inputs](designs/ui.inputs/DESIGN.md) | 36 | r000 | reference-only | NO |
| 50 | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) | 28 | r003 | awaiting-owner | NO |
| 50 | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) | 130 | r000 | reference-only | NO |
| 50 | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) | 72 | r000 | reference-only | NO |
| 50 | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) | 125 | r000 | reference-only | NO |
| 50 | [ui.radar-map](designs/ui.radar-map/DESIGN.md) | 12 | r000 | reference-only | NO |
| 50 | [ui.reticles](designs/ui.reticles/DESIGN.md) | 28 | r000 | reference-only | NO |
| 50 | [ui.tabs](designs/ui.tabs/DESIGN.md) | 84 | r000 | reference-only | NO |
| 50 | [vfx.armor-spark-hit](designs/vfx.armor-spark-hit/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.beam-lance](designs/vfx.beam-lance/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.blue-energy-projectile](designs/vfx.blue-energy-projectile/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.blue-shield-arc](designs/vfx.blue-shield-arc/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.contrail](designs/vfx.contrail/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.debris-burst](designs/vfx.debris-burst/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.destruction-breakup](designs/vfx.destruction-breakup/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.emp-burst](designs/vfx.emp-burst/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.fiery-blast](designs/vfx.fiery-blast/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.foreground-explosion](designs/vfx.foreground-explosion/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.healing-beam](designs/vfx.healing-beam/DESIGN.md) | 2 | r000 | reference-only | NO |
| 50 | [vfx.impact-spark](designs/vfx.impact-spark/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.ion-arc](designs/vfx.ion-arc/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.large-explosion](designs/vfx.large-explosion/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.laser-bolt](designs/vfx.laser-bolt/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [vfx.loot-chest-glow](designs/vfx.loot-chest-glow/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.medium-explosion](designs/vfx.medium-explosion/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.missile-trail](designs/vfx.missile-trail/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.muzzle-flash](designs/vfx.muzzle-flash/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.pickup-glow](designs/vfx.pickup-glow/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [vfx.plasma-bolt](designs/vfx.plasma-bolt/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [vfx.plasma-burst](designs/vfx.plasma-burst/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.reactor-vent-flare](designs/vfx.reactor-vent-flare/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.red-laser-projectile](designs/vfx.red-laser-projectile/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.repair-sparks](designs/vfx.repair-sparks/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.ricochet-spark](designs/vfx.ricochet-spark/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.scan-pulse](designs/vfx.scan-pulse/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.scanning-pulse](designs/vfx.scanning-pulse/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.shield-bubble](designs/vfx.shield-bubble/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.shield-bubble-impact](designs/vfx.shield-bubble-impact/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.shield-hit-splash](designs/vfx.shield-hit-splash/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.shrapnel-cloud](designs/vfx.shrapnel-cloud/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.small-explosion](designs/vfx.small-explosion/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.smoke-puff](designs/vfx.smoke-puff/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.smoke-trail](designs/vfx.smoke-trail/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.teleport-arrival](designs/vfx.teleport-arrival/DESIGN.md) | 3 | r000 | reference-only | NO |
| 50 | [vfx.teleport-effect](designs/vfx.teleport-effect/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.thruster-glow](designs/vfx.thruster-glow/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [vfx.tracer-round](designs/vfx.tracer-round/DESIGN.md) | 5 | r000 | reference-only | NO |
| 50 | [vfx.tractor-beam](designs/vfx.tractor-beam/DESIGN.md) | 1 | r000 | reference-only | NO |
| 50 | [vfx.warning-beacon-flash](designs/vfx.warning-beacon-flash/DESIGN.md) | 4 | r000 | reference-only | NO |
| 50 | [vfx.warp-charge](designs/vfx.warp-charge/DESIGN.md) | 2 | r000 | reference-only | NO |

## Every extracted reference

The following list includes objects, separately visible components, variants, animation poses, UI controls and scene/context examples. Each has a separate image and brief. Repeated illustrative stars, anonymous tiny debris specks, decorative grid lines and text glyphs are represented by their effect/background/UI design, not treated as new gameplay items.

| Reference | Source | Category | Design |
| --- | --- | --- | --- |
| [Hull tile](assets/core-construction-blocks--hull-tile/BRIEF.md) | core-construction-blocks.png | structure | [construction.hull.service-cube](designs/construction.hull.service-cube/DESIGN.md) |
| [Floor tile](assets/core-construction-blocks--floor-tile/BRIEF.md) | core-construction-blocks.png | structure | [construction.floor.quad-panel](designs/construction.floor.quad-panel/DESIGN.md) |
| [Wall tile](assets/core-construction-blocks--wall-tile/BRIEF.md) | core-construction-blocks.png | structure | [construction.wall.service-cyan](designs/construction.wall.service-cyan/DESIGN.md) |
| [Corner tile](assets/core-construction-blocks--corner-tile/BRIEF.md) | core-construction-blocks.png | structure | [construction.corner.service](designs/construction.corner.service/DESIGN.md) |
| [Roof cap tile](assets/core-construction-blocks--roof-cap-tile/BRIEF.md) | core-construction-blocks.png | structure | [construction.roof.vented](designs/construction.roof.vented/DESIGN.md) |
| [Structural base](assets/core-construction-blocks--structural-base/BRIEF.md) | core-construction-blocks.png | structure | [construction.base.utility](designs/construction.base.utility/DESIGN.md) |
| [Exploded roof cap](assets/core-construction-blocks--exploded-roof-cap/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Exploded left wall](assets/core-construction-blocks--exploded-left-wall/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Exploded right wall](assets/core-construction-blocks--exploded-right-wall/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Exploded floor](assets/core-construction-blocks--exploded-floor/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Exploded structural service base](assets/core-construction-blocks--exploded-structural-service-base/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Layer cross section](assets/core-construction-blocks--layer-cross-section/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Snap grid preview](assets/core-construction-blocks--snap-grid-preview/BRIEF.md) | core-construction-blocks.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Straight hull join](assets/core-construction-blocks--straight-hull-join/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Corner join](assets/core-construction-blocks--corner-join/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.corner.standard](designs/pale-studless.corner.standard/DESIGN.md) |
| [Open deck join](assets/core-construction-blocks--open-deck-join/BRIEF.md) | core-construction-blocks.png | structure | [pale-studless.floor.standard](designs/pale-studless.floor.standard/DESIGN.md) |
| [Modular icon](assets/core-construction-blocks--modular-icon/BRIEF.md) | core-construction-blocks.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Reconfigure icon](assets/core-construction-blocks--reconfigure-icon/BRIEF.md) | core-construction-blocks.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Expand icon](assets/core-construction-blocks--expand-icon/BRIEF.md) | core-construction-blocks.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Repair icon](assets/core-construction-blocks--repair-icon/BRIEF.md) | core-construction-blocks.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Durable icon](assets/core-construction-blocks--durable-icon/BRIEF.md) | core-construction-blocks.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Voxel unit diagram](assets/core-construction-blocks--voxel-unit-diagram/BRIEF.md) | core-construction-blocks.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Command console](assets/internal-components-2--command-console/BRIEF.md) | internal-components-2.png | console | [shipyard.equipment.command-console](designs/shipyard.equipment.command-console/DESIGN.md) |
| [Navigation console](assets/internal-components-2--navigation-console/BRIEF.md) | internal-components-2.png | console | [shipyard.equipment.bridge-bank](designs/shipyard.equipment.bridge-bank/DESIGN.md) |
| [Engineering console](assets/internal-components-2--engineering-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Medical console](assets/internal-components-2--medical-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Research console](assets/internal-components-2--research-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Security console](assets/internal-components-2--security-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Trade cargo console](assets/internal-components-2--trade-cargo-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Communications console](assets/internal-components-2--communications-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Hacking terminal](assets/internal-components-2--hacking-terminal/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [AI core](assets/internal-components-2--ai-core/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Drone control](assets/internal-components-2--drone-control/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Fabricator](assets/internal-components-2--fabricator/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Map table](assets/internal-components-2--map-table/BRIEF.md) | internal-components-2.png | console | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Crew management console](assets/internal-components-2--crew-management-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Power control console](assets/internal-components-2--power-control-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Life support console](assets/internal-components-2--life-support-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Data archive](assets/internal-components-2--data-archive/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Mission board](assets/internal-components-2--mission-board/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Galactic market terminal](assets/internal-components-2--galactic-market-terminal/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Scanner console](assets/internal-components-2--scanner-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Door control console](assets/internal-components-2--door-control-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Turret control console](assets/internal-components-2--turret-control-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Sensor array console](assets/internal-components-2--sensor-array-console/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Status display](assets/internal-components-2--status-display/BRIEF.md) | internal-components-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Bunk bed](assets/internal-components-2--bunk-bed/BRIEF.md) | internal-components-2.png | furniture | [shipyard.equipment.crew-bunk](designs/shipyard.equipment.crew-bunk/DESIGN.md) |
| [Locker](assets/internal-components-2--locker/BRIEF.md) | internal-components-2.png | furniture | [shipyard.equipment.wall-locker](designs/shipyard.equipment.wall-locker/DESIGN.md) |
| [Table and stools](assets/internal-components-2--table-and-stools/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) |
| [Sofa](assets/internal-components-2--sofa/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.sofa.standard](designs/pale-studless.sofa.standard/DESIGN.md) |
| [Shower](assets/internal-components-2--shower/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.sanitation.standard](designs/pale-studless.sanitation.standard/DESIGN.md) |
| [Toilet](assets/internal-components-2--toilet/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.sanitation.standard](designs/pale-studless.sanitation.standard/DESIGN.md) |
| [Sink](assets/internal-components-2--sink/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.sanitation.standard](designs/pale-studless.sanitation.standard/DESIGN.md) |
| [Kitchen unit](assets/internal-components-2--kitchen-unit/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.sanitation.standard](designs/pale-studless.sanitation.standard/DESIGN.md) |
| [Hydroponics bed](assets/internal-components-2--hydroponics-bed/BRIEF.md) | internal-components-2.png | furniture | [shipyard.equipment.hydroponics](designs/shipyard.equipment.hydroponics/DESIGN.md) |
| [Food dispenser](assets/internal-components-2--food-dispenser/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Vending machine](assets/internal-components-2--vending-machine/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Arcade cabinet](assets/internal-components-2--arcade-cabinet/BRIEF.md) | internal-components-2.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Battery](assets/internal-components-2--battery/BRIEF.md) | internal-components-2.png | system | [pale-studless.battery.standard](designs/pale-studless.battery.standard/DESIGN.md) |
| [Capacitor](assets/internal-components-2--capacitor/BRIEF.md) | internal-components-2.png | system | [pale-studless.battery.standard](designs/pale-studless.battery.standard/DESIGN.md) |
| [Generator](assets/internal-components-2--generator/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Coolant unit](assets/internal-components-2--coolant-unit/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.coolant](designs/pale-studless.machine.coolant/DESIGN.md) |
| [Oxygen tank](assets/internal-components-2--oxygen-tank/BRIEF.md) | internal-components-2.png | system | [pale-studless.tank.oxygen](designs/pale-studless.tank.oxygen/DESIGN.md) |
| [Air filter](assets/internal-components-2--air-filter/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.air-filter](designs/pale-studless.machine.air-filter/DESIGN.md) |
| [Gravity unit](assets/internal-components-2--gravity-unit/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.gravity](designs/pale-studless.machine.gravity/DESIGN.md) |
| [Shield projector](assets/internal-components-2--shield-projector/BRIEF.md) | internal-components-2.png | system | [pale-studless.shield.standard](designs/pale-studless.shield.standard/DESIGN.md) |
| [Fuel processor](assets/internal-components-2--fuel-processor/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.fuel-processor](designs/pale-studless.machine.fuel-processor/DESIGN.md) |
| [Refinery](assets/internal-components-2--refinery/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.refinery](designs/pale-studless.machine.refinery/DESIGN.md) |
| [Teleporter pad](assets/internal-components-2--teleporter-pad/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.teleport](designs/pale-studless.machine.teleport/DESIGN.md) |
| [Drone bay](assets/internal-components-2--drone-bay/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.drone](designs/pale-studless.machine.drone/DESIGN.md) |
| [Standard door](assets/internal-components-2--standard-door/BRIEF.md) | internal-components-2.png | door | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Sliding door](assets/internal-components-2--sliding-door/BRIEF.md) | internal-components-2.png | door | [pale-studless.door.sliding](designs/pale-studless.door.sliding/DESIGN.md) |
| [Interior airlock](assets/internal-components-2--interior-airlock/BRIEF.md) | internal-components-2.png | door | [pale-studless.door.interior-airlock](designs/pale-studless.door.interior-airlock/DESIGN.md) |
| [Exterior airlock](assets/internal-components-2--exterior-airlock/BRIEF.md) | internal-components-2.png | door | [pale-studless.door.exterior-airlock](designs/pale-studless.door.exterior-airlock/DESIGN.md) |
| [Blast door](assets/internal-components-2--blast-door/BRIEF.md) | internal-components-2.png | door | [pale-studless.door.blast](designs/pale-studless.door.blast/DESIGN.md) |
| [Force field](assets/internal-components-2--force-field/BRIEF.md) | internal-components-2.png | door | [pale-studless.window.force-field](designs/pale-studless.window.force-field/DESIGN.md) |
| [Floor panel](assets/internal-components-2--floor-panel/BRIEF.md) | internal-components-2.png | structure | [shipyard.floor.mapped-deck-kit](designs/shipyard.floor.mapped-deck-kit/DESIGN.md) |
| [Reinforced floor](assets/internal-components-2--reinforced-floor/BRIEF.md) | internal-components-2.png | structure | [pale-studless.floor.reinforced](designs/pale-studless.floor.reinforced/DESIGN.md) |
| [Grated floor](assets/internal-components-2--grated-floor/BRIEF.md) | internal-components-2.png | structure | [pale-studless.floor.grate](designs/pale-studless.floor.grate/DESIGN.md) |
| [Hazard floor](assets/internal-components-2--hazard-floor/BRIEF.md) | internal-components-2.png | structure | [pale-studless.floor.hazard](designs/pale-studless.floor.hazard/DESIGN.md) |
| [Glass floor](assets/internal-components-2--glass-floor/BRIEF.md) | internal-components-2.png | structure | [pale-studless.window.glass-floor](designs/pale-studless.window.glass-floor/DESIGN.md) |
| [Carpet floor](assets/internal-components-2--carpet-floor/BRIEF.md) | internal-components-2.png | structure | [pale-studless.floor.carpet](designs/pale-studless.floor.carpet/DESIGN.md) |
| [Hex floor](assets/internal-components-2--hex-floor/BRIEF.md) | internal-components-2.png | structure | [pale-studless.floor.hex](designs/pale-studless.floor.hex/DESIGN.md) |
| [Exterior deck](assets/internal-components-2--exterior-deck/BRIEF.md) | internal-components-2.png | structure | [pale-studless.floor.exterior](designs/pale-studless.floor.exterior/DESIGN.md) |
| [Straight wall](assets/internal-components-2--straight-wall/BRIEF.md) | internal-components-2.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Window wall](assets/internal-components-2--window-wall/BRIEF.md) | internal-components-2.png | structure | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Corner wall](assets/internal-components-2--corner-wall/BRIEF.md) | internal-components-2.png | structure | [pale-studless.corner.standard](designs/pale-studless.corner.standard/DESIGN.md) |
| [Diagonal wall](assets/internal-components-2--diagonal-wall/BRIEF.md) | internal-components-2.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Large window wall](assets/internal-components-2--large-window-wall/BRIEF.md) | internal-components-2.png | structure | [pale-studless.window.large-window](designs/pale-studless.window.large-window/DESIGN.md) |
| [Reinforced wall](assets/internal-components-2--reinforced-wall/BRIEF.md) | internal-components-2.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Utility wall](assets/internal-components-2--utility-wall/BRIEF.md) | internal-components-2.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Wall with pipes](assets/internal-components-2--wall-with-pipes/BRIEF.md) | internal-components-2.png | structure | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Straight pipe](assets/internal-components-2--straight-pipe/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Corner pipe](assets/internal-components-2--corner-pipe/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.corner](designs/pale-studless.pipe.corner/DESIGN.md) |
| [T junction pipe](assets/internal-components-2--t-junction-pipe/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.t-junction](designs/pale-studless.pipe.t-junction/DESIGN.md) |
| [Cross pipe](assets/internal-components-2--cross-pipe/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.cross](designs/pale-studless.pipe.cross/DESIGN.md) |
| [Wall mount pipes](assets/internal-components-2--wall-mount-pipes/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Vertical pipe](assets/internal-components-2--vertical-pipe/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.vertical](designs/pale-studless.pipe.vertical/DESIGN.md) |
| [Flexible pipe](assets/internal-components-2--flexible-pipe/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.flexible](designs/pale-studless.pipe.flexible/DESIGN.md) |
| [Cable tray](assets/internal-components-2--cable-tray/BRIEF.md) | internal-components-2.png | pipe | [pale-studless.pipe.tray](designs/pale-studless.pipe.tray/DESIGN.md) |
| [Ceiling light](assets/internal-components-2--ceiling-light/BRIEF.md) | internal-components-2.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Wall light](assets/internal-components-2--wall-light/BRIEF.md) | internal-components-2.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Floor light](assets/internal-components-2--floor-light/BRIEF.md) | internal-components-2.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Strip light](assets/internal-components-2--strip-light/BRIEF.md) | internal-components-2.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Hanging light](assets/internal-components-2--hanging-light/BRIEF.md) | internal-components-2.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Warning light](assets/internal-components-2--warning-light/BRIEF.md) | internal-components-2.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Hologram projector](assets/internal-components-2--hologram-projector/BRIEF.md) | internal-components-2.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Plant pot](assets/internal-components-2--plant-pot/BRIEF.md) | internal-components-2.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Small thruster](assets/internal-components-2--small-thruster/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.small](designs/pale-studless.engine.small/DESIGN.md) |
| [Medium thruster](assets/internal-components-2--medium-thruster/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.medium](designs/pale-studless.engine.medium/DESIGN.md) |
| [Large thruster](assets/internal-components-2--large-thruster/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.large](designs/pale-studless.engine.large/DESIGN.md) |
| [Maneuvering thruster](assets/internal-components-2--maneuvering-thruster/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.maneuver](designs/pale-studless.engine.maneuver/DESIGN.md) |
| [VTOL thruster](assets/internal-components-2--vtol-thruster/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.vtol](designs/pale-studless.engine.vtol/DESIGN.md) |
| [Ion engine](assets/internal-components-2--ion-engine/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.ion](designs/pale-studless.engine.ion/DESIGN.md) |
| [Warp engine](assets/internal-components-2--warp-engine/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.warp](designs/pale-studless.engine.warp/DESIGN.md) |
| [RCS attitude thruster](assets/internal-components-2--rcs-attitude-thruster/BRIEF.md) | internal-components-2.png | engine | [pale-studless.engine.rcs](designs/pale-studless.engine.rcs/DESIGN.md) |
| [Point defense turret](assets/internal-components-2--point-defense-turret/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Laser turret](assets/internal-components-2--laser-turret/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Railgun turret](assets/internal-components-2--railgun-turret/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Missile pod](assets/internal-components-2--missile-pod/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Dual cannon](assets/internal-components-2--dual-cannon/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.standard](designs/pale-studless.turret.standard/DESIGN.md) |
| [Plasma turret](assets/internal-components-2--plasma-turret/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.plasma](designs/pale-studless.turret.plasma/DESIGN.md) |
| [EMP emitter](assets/internal-components-2--emp-emitter/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.standard](designs/pale-studless.turret.standard/DESIGN.md) |
| [Torpedo launcher](assets/internal-components-2--torpedo-launcher/BRIEF.md) | internal-components-2.png | weapon | [pale-studless.turret.torpedo](designs/pale-studless.turret.torpedo/DESIGN.md) |
| [Short range antenna](assets/internal-components-2--short-range-antenna/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.antenna](designs/pale-studless.sensor.antenna/DESIGN.md) |
| [Long range dish](assets/internal-components-2--long-range-dish/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.dish](designs/pale-studless.sensor.dish/DESIGN.md) |
| [Radar array](assets/internal-components-2--radar-array/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.radar](designs/pale-studless.sensor.radar/DESIGN.md) |
| [Satellite uplink](assets/internal-components-2--satellite-uplink/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.standard](designs/pale-studless.sensor.standard/DESIGN.md) |
| [Scanner mast](assets/internal-components-2--scanner-mast/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.mast](designs/pale-studless.sensor.mast/DESIGN.md) |
| [Sensor dome](assets/internal-components-2--sensor-dome/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.dome](designs/pale-studless.sensor.dome/DESIGN.md) |
| [Directional antenna](assets/internal-components-2--directional-antenna/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.antenna](designs/pale-studless.sensor.antenna/DESIGN.md) |
| [Beacon](assets/internal-components-2--beacon/BRIEF.md) | internal-components-2.png | sensor | [pale-studless.sensor.beacon](designs/pale-studless.sensor.beacon/DESIGN.md) |
| [Shield generator](assets/internal-components-2--shield-generator/BRIEF.md) | internal-components-2.png | system | [pale-studless.shield.standard](designs/pale-studless.shield.standard/DESIGN.md) |
| [Shield node](assets/internal-components-2--shield-node/BRIEF.md) | internal-components-2.png | system | [pale-studless.shield.standard](designs/pale-studless.shield.standard/DESIGN.md) |
| [Cloaking unit](assets/internal-components-2--cloaking-unit/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.cloaking](designs/pale-studless.machine.cloaking/DESIGN.md) |
| [Jump drive](assets/internal-components-2--jump-drive/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.jump](designs/pale-studless.machine.jump/DESIGN.md) |
| [Tractor beam](assets/internal-components-2--tractor-beam/BRIEF.md) | internal-components-2.png | system | [pale-studless.tractor.standard](designs/pale-studless.tractor.standard/DESIGN.md) |
| [Salvage arm](assets/internal-components-2--salvage-arm/BRIEF.md) | internal-components-2.png | system | [pale-studless.tractor.standard](designs/pale-studless.tractor.standard/DESIGN.md) |
| [Docking port](assets/internal-components-2--docking-port/BRIEF.md) | internal-components-2.png | system | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Cargo clamp](assets/internal-components-2--cargo-clamp/BRIEF.md) | internal-components-2.png | system | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Door tile](assets/modular-components-computers--door-tile/BRIEF.md) | modular-components-computers.png | door | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Airlock frame](assets/modular-components-computers--airlock-frame/BRIEF.md) | modular-components-computers.png | door | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Window tile](assets/modular-components-computers--window-tile/BRIEF.md) | modular-components-computers.png | door | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Corridor connector](assets/modular-components-computers--corridor-connector/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Hardpoint connector](assets/modular-components-computers--hardpoint-connector/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Power node](assets/modular-components-computers--power-node/BRIEF.md) | modular-components-computers.png | system | [pale-studless.battery.standard](designs/pale-studless.battery.standard/DESIGN.md) |
| [Computer console tile](assets/modular-components-computers--computer-console-tile/BRIEF.md) | modular-components-computers.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Utility channel](assets/modular-components-computers--utility-channel/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Door upper frame](assets/modular-components-computers--door-upper-frame/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Door side frames](assets/modular-components-computers--door-side-frames/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Door leaf](assets/modular-components-computers--door-leaf/BRIEF.md) | modular-components-computers.png | door | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Door control panel](assets/modular-components-computers--door-control-panel/BRIEF.md) | modular-components-computers.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Airlock upper seal](assets/modular-components-computers--airlock-upper-seal/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Airlock side frames](assets/modular-components-computers--airlock-side-frames/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Pressure door leaf](assets/modular-components-computers--pressure-door-leaf/BRIEF.md) | modular-components-computers.png | door | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Window upper frame](assets/modular-components-computers--window-upper-frame/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Window glass pane](assets/modular-components-computers--window-glass-pane/BRIEF.md) | modular-components-computers.png | door | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Window support frame](assets/modular-components-computers--window-support-frame/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Corridor roof](assets/modular-components-computers--corridor-roof/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Corridor wall left](assets/modular-components-computers--corridor-wall-left/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Corridor wall right](assets/modular-components-computers--corridor-wall-right/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Corridor floor](assets/modular-components-computers--corridor-floor/BRIEF.md) | modular-components-computers.png | structure | [shipyard.floor.mapped-deck-kit](designs/shipyard.floor.mapped-deck-kit/DESIGN.md) |
| [Hardpoint mount plate](assets/modular-components-computers--hardpoint-mount-plate/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Hardpoint connector core](assets/modular-components-computers--hardpoint-connector-core/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Hardpoint locking ring](assets/modular-components-computers--hardpoint-locking-ring/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Hardpoint seal](assets/modular-components-computers--hardpoint-seal/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Power core](assets/modular-components-computers--power-core/BRIEF.md) | modular-components-computers.png | system | [pale-studless.battery.standard](designs/pale-studless.battery.standard/DESIGN.md) |
| [Power housing](assets/modular-components-computers--power-housing/BRIEF.md) | modular-components-computers.png | system | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Power connector plate](assets/modular-components-computers--power-connector-plate/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Console screen](assets/modular-components-computers--console-screen/BRIEF.md) | modular-components-computers.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Console core](assets/modular-components-computers--console-core/BRIEF.md) | modular-components-computers.png | system | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Console data port](assets/modular-components-computers--console-data-port/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Console floor mount](assets/modular-components-computers--console-floor-mount/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Atmosphere pipe](assets/modular-components-computers--atmosphere-pipe/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Power conduit](assets/modular-components-computers--power-conduit/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.power](designs/pale-studless.pipe.power/DESIGN.md) |
| [Data cable](assets/modular-components-computers--data-cable/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.data](designs/pale-studless.pipe.data/DESIGN.md) |
| [Coolant pipe](assets/modular-components-computers--coolant-pipe/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.coolant](designs/pale-studless.pipe.coolant/DESIGN.md) |
| [Pipe elbow](assets/modular-components-computers--pipe-elbow/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.elbow](designs/pale-studless.pipe.elbow/DESIGN.md) |
| [Pipe tee](assets/modular-components-computers--pipe-tee/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Pipe riser](assets/modular-components-computers--pipe-riser/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.riser](designs/pale-studless.pipe.riser/DESIGN.md) |
| [Clamp bracket](assets/modular-components-computers--clamp-bracket/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Utility layer exploded stack](assets/modular-components-computers--utility-layer-exploded-stack/BRIEF.md) | modular-components-computers.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Room to corridor join](assets/modular-components-computers--room-to-corridor-join/BRIEF.md) | modular-components-computers.png | room | [pale-studless.room.corridor](designs/pale-studless.room.corridor/DESIGN.md) |
| [Corridor to hull join](assets/modular-components-computers--corridor-to-hull-join/BRIEF.md) | modular-components-computers.png | room | [pale-studless.room.corridor](designs/pale-studless.room.corridor/DESIGN.md) |
| [Module chain join](assets/modular-components-computers--module-chain-join/BRIEF.md) | modular-components-computers.png | room | [pale-studless.room.assembly](designs/pale-studless.room.assembly/DESIGN.md) |
| [Module snap](assets/modular-components-computers--module-snap/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Hull mount](assets/modular-components-computers--hull-mount/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Utility pass-through](assets/modular-components-computers--utility-pass-through/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Hardpoint socket](assets/modular-components-computers--hardpoint-socket/BRIEF.md) | modular-components-computers.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Standard snap grid diagram](assets/modular-components-computers--standard-snap-grid-diagram/BRIEF.md) | modular-components-computers.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Power port icon](assets/modular-components-computers--power-port-icon/BRIEF.md) | modular-components-computers.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Data port icon](assets/modular-components-computers--data-port-icon/BRIEF.md) | modular-components-computers.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Air port icon](assets/modular-components-computers--air-port-icon/BRIEF.md) | modular-components-computers.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Structural port icon](assets/modular-components-computers--structural-port-icon/BRIEF.md) | modular-components-computers.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Standard cargo crate](assets/cargo-pods-ore-etc--standard-cargo-crate/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.standard.oversized](designs/cargo.standard.oversized/DESIGN.md) |
| [Standard cargo crate variant 1](assets/cargo-pods-ore-etc--standard-cargo-crate-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.standard.oversized](designs/cargo.standard.oversized/DESIGN.md) |
| [Standard cargo crate variant 2](assets/cargo-pods-ore-etc--standard-cargo-crate-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.standard.oversized](designs/cargo.standard.oversized/DESIGN.md) |
| [Standard cargo crate variant 3](assets/cargo-pods-ore-etc--standard-cargo-crate-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.standard.oversized](designs/cargo.standard.oversized/DESIGN.md) |
| [Standard cargo crate variant 4](assets/cargo-pods-ore-etc--standard-cargo-crate-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.standard.oversized](designs/cargo.standard.oversized/DESIGN.md) |
| [Reinforced cargo crate](assets/cargo-pods-ore-etc--reinforced-cargo-crate/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.reinforced.oversized](designs/cargo.reinforced.oversized/DESIGN.md) |
| [Reinforced cargo crate variant 1](assets/cargo-pods-ore-etc--reinforced-cargo-crate-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.reinforced.medium](designs/cargo.reinforced.medium/DESIGN.md) |
| [Reinforced cargo crate variant 2](assets/cargo-pods-ore-etc--reinforced-cargo-crate-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.reinforced.large](designs/cargo.reinforced.large/DESIGN.md) |
| [Reinforced cargo crate variant 3](assets/cargo-pods-ore-etc--reinforced-cargo-crate-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.reinforced.large](designs/cargo.reinforced.large/DESIGN.md) |
| [Reinforced cargo crate variant 4](assets/cargo-pods-ore-etc--reinforced-cargo-crate-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.reinforced.large](designs/cargo.reinforced.large/DESIGN.md) |
| [Refrigerated pod](assets/cargo-pods-ore-etc--refrigerated-pod/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.refrigerated.large](designs/cargo.refrigerated.large/DESIGN.md) |
| [Refrigerated pod variant 1](assets/cargo-pods-ore-etc--refrigerated-pod-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.refrigerated.medium](designs/cargo.refrigerated.medium/DESIGN.md) |
| [Refrigerated pod variant 2](assets/cargo-pods-ore-etc--refrigerated-pod-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.refrigerated.medium](designs/cargo.refrigerated.medium/DESIGN.md) |
| [Refrigerated pod variant 3](assets/cargo-pods-ore-etc--refrigerated-pod-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.refrigerated.medium](designs/cargo.refrigerated.medium/DESIGN.md) |
| [Refrigerated pod variant 4](assets/cargo-pods-ore-etc--refrigerated-pod-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.refrigerated.medium](designs/cargo.refrigerated.medium/DESIGN.md) |
| [Vacuum pod](assets/cargo-pods-ore-etc--vacuum-pod/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.vacuum.large](designs/cargo.vacuum.large/DESIGN.md) |
| [Vacuum pod variant 1](assets/cargo-pods-ore-etc--vacuum-pod-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.vacuum.medium](designs/cargo.vacuum.medium/DESIGN.md) |
| [Vacuum pod variant 2](assets/cargo-pods-ore-etc--vacuum-pod-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.vacuum.medium](designs/cargo.vacuum.medium/DESIGN.md) |
| [Vacuum pod variant 3](assets/cargo-pods-ore-etc--vacuum-pod-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.vacuum.medium](designs/cargo.vacuum.medium/DESIGN.md) |
| [Vacuum pod variant 4](assets/cargo-pods-ore-etc--vacuum-pod-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.vacuum.medium](designs/cargo.vacuum.medium/DESIGN.md) |
| [Salvage pod](assets/cargo-pods-ore-etc--salvage-pod/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.salvage.oversized](designs/cargo.salvage.oversized/DESIGN.md) |
| [Salvage pod variant 1](assets/cargo-pods-ore-etc--salvage-pod-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.salvage.large](designs/cargo.salvage.large/DESIGN.md) |
| [Salvage pod variant 2](assets/cargo-pods-ore-etc--salvage-pod-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.salvage.large](designs/cargo.salvage.large/DESIGN.md) |
| [Salvage pod variant 3](assets/cargo-pods-ore-etc--salvage-pod-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.salvage.large](designs/cargo.salvage.large/DESIGN.md) |
| [Salvage pod variant 4](assets/cargo-pods-ore-etc--salvage-pod-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.salvage.large](designs/cargo.salvage.large/DESIGN.md) |
| [Cargo pallet](assets/cargo-pods-ore-etc--cargo-pallet/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.pallet](designs/pale-studless.crate.pallet/DESIGN.md) |
| [Cargo pallet variant 1](assets/cargo-pods-ore-etc--cargo-pallet-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.pallet](designs/pale-studless.crate.pallet/DESIGN.md) |
| [Cargo pallet variant 2](assets/cargo-pods-ore-etc--cargo-pallet-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.pallet](designs/pale-studless.crate.pallet/DESIGN.md) |
| [Cargo pallet variant 3](assets/cargo-pods-ore-etc--cargo-pallet-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.pallet](designs/pale-studless.crate.pallet/DESIGN.md) |
| [Cargo pallet variant 4](assets/cargo-pods-ore-etc--cargo-pallet-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.pallet](designs/pale-studless.crate.pallet/DESIGN.md) |
| [Liquid tank](assets/cargo-pods-ore-etc--liquid-tank/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid.large](designs/cargo.fluid.large/DESIGN.md) |
| [Liquid tank variant 1](assets/cargo-pods-ore-etc--liquid-tank-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid.medium](designs/cargo.fluid.medium/DESIGN.md) |
| [Liquid tank variant 2](assets/cargo-pods-ore-etc--liquid-tank-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid.medium](designs/cargo.fluid.medium/DESIGN.md) |
| [Liquid tank variant 3](assets/cargo-pods-ore-etc--liquid-tank-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid.medium](designs/cargo.fluid.medium/DESIGN.md) |
| [Liquid tank variant 4](assets/cargo-pods-ore-etc--liquid-tank-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid.medium](designs/cargo.fluid.medium/DESIGN.md) |
| [Cryo tank](assets/cargo-pods-ore-etc--cryo-tank/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-cryo.medium](designs/cargo.fluid-cryo.medium/DESIGN.md) |
| [Cryo tank variant 1](assets/cargo-pods-ore-etc--cryo-tank-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-cryo.medium](designs/cargo.fluid-cryo.medium/DESIGN.md) |
| [Cryo tank variant 2](assets/cargo-pods-ore-etc--cryo-tank-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-cryo.medium](designs/cargo.fluid-cryo.medium/DESIGN.md) |
| [Cryo tank variant 3](assets/cargo-pods-ore-etc--cryo-tank-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-cryo.medium](designs/cargo.fluid-cryo.medium/DESIGN.md) |
| [Cryo tank variant 4](assets/cargo-pods-ore-etc--cryo-tank-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-cryo.medium](designs/cargo.fluid-cryo.medium/DESIGN.md) |
| [Fuel barrel](assets/cargo-pods-ore-etc--fuel-barrel/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-fuel.medium](designs/cargo.fluid-fuel.medium/DESIGN.md) |
| [Fuel barrel variant 1](assets/cargo-pods-ore-etc--fuel-barrel-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-fuel.medium](designs/cargo.fluid-fuel.medium/DESIGN.md) |
| [Fuel barrel variant 2](assets/cargo-pods-ore-etc--fuel-barrel-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-fuel.medium](designs/cargo.fluid-fuel.medium/DESIGN.md) |
| [Fuel barrel variant 3](assets/cargo-pods-ore-etc--fuel-barrel-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-fuel.medium](designs/cargo.fluid-fuel.medium/DESIGN.md) |
| [Fuel barrel variant 4](assets/cargo-pods-ore-etc--fuel-barrel-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-fuel.medium](designs/cargo.fluid-fuel.medium/DESIGN.md) |
| [Gas bundle](assets/cargo-pods-ore-etc--gas-bundle/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-gas.medium](designs/cargo.fluid-gas.medium/DESIGN.md) |
| [Gas bundle variant 1](assets/cargo-pods-ore-etc--gas-bundle-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-gas.medium](designs/cargo.fluid-gas.medium/DESIGN.md) |
| [Gas bundle variant 2](assets/cargo-pods-ore-etc--gas-bundle-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-gas.medium](designs/cargo.fluid-gas.medium/DESIGN.md) |
| [Gas bundle variant 3](assets/cargo-pods-ore-etc--gas-bundle-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-gas.medium](designs/cargo.fluid-gas.medium/DESIGN.md) |
| [Gas bundle variant 4](assets/cargo-pods-ore-etc--gas-bundle-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-gas.medium](designs/cargo.fluid-gas.medium/DESIGN.md) |
| [Chemical drum](assets/cargo-pods-ore-etc--chemical-drum/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-chemical.medium](designs/cargo.fluid-chemical.medium/DESIGN.md) |
| [Chemical drum variant 1](assets/cargo-pods-ore-etc--chemical-drum-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-chemical.medium](designs/cargo.fluid-chemical.medium/DESIGN.md) |
| [Chemical drum variant 2](assets/cargo-pods-ore-etc--chemical-drum-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-chemical.medium](designs/cargo.fluid-chemical.medium/DESIGN.md) |
| [Chemical drum variant 3](assets/cargo-pods-ore-etc--chemical-drum-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-chemical.medium](designs/cargo.fluid-chemical.medium/DESIGN.md) |
| [Chemical drum variant 4](assets/cargo-pods-ore-etc--chemical-drum-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-chemical.medium](designs/cargo.fluid-chemical.medium/DESIGN.md) |
| [Water container](assets/cargo-pods-ore-etc--water-container/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-water.medium](designs/cargo.fluid-water.medium/DESIGN.md) |
| [Water container variant 1](assets/cargo-pods-ore-etc--water-container-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-water.medium](designs/cargo.fluid-water.medium/DESIGN.md) |
| [Water container variant 2](assets/cargo-pods-ore-etc--water-container-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-water.medium](designs/cargo.fluid-water.medium/DESIGN.md) |
| [Water container variant 3](assets/cargo-pods-ore-etc--water-container-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-water.medium](designs/cargo.fluid-water.medium/DESIGN.md) |
| [Water container variant 4](assets/cargo-pods-ore-etc--water-container-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.fluid-water.medium](designs/cargo.fluid-water.medium/DESIGN.md) |
| [Iron ore main cluster](assets/cargo-pods-ore-etc--iron-ore-main-cluster/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.iron](designs/stepped-environment.resource.iron/DESIGN.md) |
| [Iron ore loose sample 1](assets/cargo-pods-ore-etc--iron-ore-loose-sample-1/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.iron](designs/stepped-environment.resource.iron/DESIGN.md) |
| [Iron ore loose sample 2](assets/cargo-pods-ore-etc--iron-ore-loose-sample-2/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.iron](designs/stepped-environment.resource.iron/DESIGN.md) |
| [Iron ore loose sample 3](assets/cargo-pods-ore-etc--iron-ore-loose-sample-3/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.iron](designs/stepped-environment.resource.iron/DESIGN.md) |
| [Iron ore loose sample 4](assets/cargo-pods-ore-etc--iron-ore-loose-sample-4/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.iron](designs/stepped-environment.resource.iron/DESIGN.md) |
| [Copper ore main cluster](assets/cargo-pods-ore-etc--copper-ore-main-cluster/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) |
| [Copper ore loose sample 1](assets/cargo-pods-ore-etc--copper-ore-loose-sample-1/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) |
| [Copper ore loose sample 2](assets/cargo-pods-ore-etc--copper-ore-loose-sample-2/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) |
| [Copper ore loose sample 3](assets/cargo-pods-ore-etc--copper-ore-loose-sample-3/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) |
| [Copper ore loose sample 4](assets/cargo-pods-ore-etc--copper-ore-loose-sample-4/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) |
| [Gold nugget main cluster](assets/cargo-pods-ore-etc--gold-nugget-main-cluster/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Gold nugget loose sample 1](assets/cargo-pods-ore-etc--gold-nugget-loose-sample-1/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Gold nugget loose sample 2](assets/cargo-pods-ore-etc--gold-nugget-loose-sample-2/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Gold nugget loose sample 3](assets/cargo-pods-ore-etc--gold-nugget-loose-sample-3/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Gold nugget loose sample 4](assets/cargo-pods-ore-etc--gold-nugget-loose-sample-4/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Rare crystal main cluster](assets/cargo-pods-ore-etc--rare-crystal-main-cluster/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.crystal](designs/stepped-environment.resource.crystal/DESIGN.md) |
| [Rare crystal loose sample 1](assets/cargo-pods-ore-etc--rare-crystal-loose-sample-1/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.crystal](designs/stepped-environment.resource.crystal/DESIGN.md) |
| [Rare crystal loose sample 2](assets/cargo-pods-ore-etc--rare-crystal-loose-sample-2/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.crystal](designs/stepped-environment.resource.crystal/DESIGN.md) |
| [Rare crystal loose sample 3](assets/cargo-pods-ore-etc--rare-crystal-loose-sample-3/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.crystal](designs/stepped-environment.resource.crystal/DESIGN.md) |
| [Rare crystal loose sample 4](assets/cargo-pods-ore-etc--rare-crystal-loose-sample-4/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.crystal](designs/stepped-environment.resource.crystal/DESIGN.md) |
| [Ice main cluster](assets/cargo-pods-ore-etc--ice-main-cluster/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) |
| [Ice loose sample 1](assets/cargo-pods-ore-etc--ice-loose-sample-1/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) |
| [Ice loose sample 2](assets/cargo-pods-ore-etc--ice-loose-sample-2/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) |
| [Ice loose sample 3](assets/cargo-pods-ore-etc--ice-loose-sample-3/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) |
| [Ice loose sample 4](assets/cargo-pods-ore-etc--ice-loose-sample-4/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) |
| [Exotic ore main cluster](assets/cargo-pods-ore-etc--exotic-ore-main-cluster/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.exotic](designs/stepped-environment.resource.exotic/DESIGN.md) |
| [Exotic ore loose sample 1](assets/cargo-pods-ore-etc--exotic-ore-loose-sample-1/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.exotic](designs/stepped-environment.resource.exotic/DESIGN.md) |
| [Exotic ore loose sample 2](assets/cargo-pods-ore-etc--exotic-ore-loose-sample-2/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.exotic](designs/stepped-environment.resource.exotic/DESIGN.md) |
| [Exotic ore loose sample 3](assets/cargo-pods-ore-etc--exotic-ore-loose-sample-3/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.exotic](designs/stepped-environment.resource.exotic/DESIGN.md) |
| [Exotic ore loose sample 4](assets/cargo-pods-ore-etc--exotic-ore-loose-sample-4/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.exotic](designs/stepped-environment.resource.exotic/DESIGN.md) |
| [Metal ingot stack](assets/cargo-pods-ore-etc--metal-ingot-stack/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.resource.ingot](designs/pale-studless.resource.ingot/DESIGN.md) |
| [Metal ingot stack variant 1](assets/cargo-pods-ore-etc--metal-ingot-stack-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.resource.ingot](designs/pale-studless.resource.ingot/DESIGN.md) |
| [Metal ingot stack variant 2](assets/cargo-pods-ore-etc--metal-ingot-stack-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.resource.ingot](designs/pale-studless.resource.ingot/DESIGN.md) |
| [Metal ingot stack variant 3](assets/cargo-pods-ore-etc--metal-ingot-stack-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.resource.ingot](designs/pale-studless.resource.ingot/DESIGN.md) |
| [Metal ingot stack variant 4](assets/cargo-pods-ore-etc--metal-ingot-stack-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.resource.ingot](designs/pale-studless.resource.ingot/DESIGN.md) |
| [Rare metal bars](assets/cargo-pods-ore-etc--rare-metal-bars/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Rare metal bars variant 1](assets/cargo-pods-ore-etc--rare-metal-bars-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Rare metal bars variant 2](assets/cargo-pods-ore-etc--rare-metal-bars-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Rare metal bars variant 3](assets/cargo-pods-ore-etc--rare-metal-bars-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Rare metal bars variant 4](assets/cargo-pods-ore-etc--rare-metal-bars-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Crystal canister](assets/cargo-pods-ore-etc--crystal-canister/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Crystal canister variant 1](assets/cargo-pods-ore-etc--crystal-canister-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Crystal canister variant 2](assets/cargo-pods-ore-etc--crystal-canister-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Crystal canister variant 3](assets/cargo-pods-ore-etc--crystal-canister-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Crystal canister variant 4](assets/cargo-pods-ore-etc--crystal-canister-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Data core container](assets/cargo-pods-ore-etc--data-core-container/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.data](designs/pale-studless.crate.data/DESIGN.md) |
| [Data core container variant 1](assets/cargo-pods-ore-etc--data-core-container-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.data](designs/pale-studless.crate.data/DESIGN.md) |
| [Data core container variant 2](assets/cargo-pods-ore-etc--data-core-container-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.data](designs/pale-studless.crate.data/DESIGN.md) |
| [Data core container variant 3](assets/cargo-pods-ore-etc--data-core-container-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.data](designs/pale-studless.crate.data/DESIGN.md) |
| [Data core container variant 4](assets/cargo-pods-ore-etc--data-core-container-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.data](designs/pale-studless.crate.data/DESIGN.md) |
| [Medical supply container](assets/cargo-pods-ore-etc--medical-supply-container/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.medical.medium](designs/cargo.medical.medium/DESIGN.md) |
| [Medical supply container variant 1](assets/cargo-pods-ore-etc--medical-supply-container-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.medical.small](designs/cargo.medical.small/DESIGN.md) |
| [Medical supply container variant 2](assets/cargo-pods-ore-etc--medical-supply-container-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.medical.small](designs/cargo.medical.small/DESIGN.md) |
| [Medical supply container variant 3](assets/cargo-pods-ore-etc--medical-supply-container-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.medical.small](designs/cargo.medical.small/DESIGN.md) |
| [Medical supply container variant 4](assets/cargo-pods-ore-etc--medical-supply-container-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.medical.small](designs/cargo.medical.small/DESIGN.md) |
| [High-value tech crate](assets/cargo-pods-ore-etc--high-value-tech-crate/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.high-value.medium](designs/cargo.high-value.medium/DESIGN.md) |
| [High-value tech crate variant 1](assets/cargo-pods-ore-etc--high-value-tech-crate-variant-1/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.high-value.small](designs/cargo.high-value.small/DESIGN.md) |
| [High-value tech crate variant 2](assets/cargo-pods-ore-etc--high-value-tech-crate-variant-2/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.high-value.small](designs/cargo.high-value.small/DESIGN.md) |
| [High-value tech crate variant 3](assets/cargo-pods-ore-etc--high-value-tech-crate-variant-3/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.high-value.small](designs/cargo.high-value.small/DESIGN.md) |
| [High-value tech crate variant 4](assets/cargo-pods-ore-etc--high-value-tech-crate-variant-4/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [cargo.high-value.small](designs/cargo.high-value.small/DESIGN.md) |
| [Tractor target lock example](assets/cargo-pods-ore-etc--tractor-target-lock-example/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.tractor.standard](designs/pale-studless.tractor.standard/DESIGN.md) |
| [Tractor transport example](assets/cargo-pods-ore-etc--tractor-transport-example/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.tractor.standard](designs/pale-studless.tractor.standard/DESIGN.md) |
| [Cargo rack storage example](assets/cargo-pods-ore-etc--cargo-rack-storage-example/BRIEF.md) | cargo-pods-ore-etc.png | cargo | [pale-studless.crate.cargo](designs/pale-studless.crate.cargo/DESIGN.md) |
| [Raw ore icon](assets/cargo-pods-ore-etc--raw-ore-icon/BRIEF.md) | cargo-pods-ore-etc.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Cargo pods icon](assets/cargo-pods-ore-etc--cargo-pods-icon/BRIEF.md) | cargo-pods-ore-etc.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Liquids icon](assets/cargo-pods-ore-etc--liquids-icon/BRIEF.md) | cargo-pods-ore-etc.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [High-value cargo icon](assets/cargo-pods-ore-etc--high-value-cargo-icon/BRIEF.md) | cargo-pods-ore-etc.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Salvage icon](assets/cargo-pods-ore-etc--salvage-icon/BRIEF.md) | cargo-pods-ore-etc.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Rocky world](assets/planets--rocky-world/BRIEF.md) | planets.png | planet | [environment.planet.rocky](designs/environment.planet.rocky/DESIGN.md) |
| [Temperate world](assets/planets--temperate-world/BRIEF.md) | planets.png | planet | [environment.planet.temperate](designs/environment.planet.temperate/DESIGN.md) |
| [Desert world](assets/planets--desert-world/BRIEF.md) | planets.png | planet | [environment.planet.desert](designs/environment.planet.desert/DESIGN.md) |
| [Ice world](assets/planets--ice-world/BRIEF.md) | planets.png | planet | [environment.planet.ice](designs/environment.planet.ice/DESIGN.md) |
| [Volcanic world](assets/planets--volcanic-world/BRIEF.md) | planets.png | planet | [environment.planet.volcanic](designs/environment.planet.volcanic/DESIGN.md) |
| [Ringed gas giant](assets/planets--ringed-gas-giant/BRIEF.md) | planets.png | planet | [environment.planet.gas-giant](designs/environment.planet.gas-giant/DESIGN.md) |
| [Ocean world](assets/planets--ocean-world/BRIEF.md) | planets.png | planet | [environment.planet.ocean](designs/environment.planet.ocean/DESIGN.md) |
| [Toxic world](assets/planets--toxic-world/BRIEF.md) | planets.png | planet | [environment.planet.toxic](designs/environment.planet.toxic/DESIGN.md) |
| [Crystal world](assets/planets--crystal-world/BRIEF.md) | planets.png | planet | [environment.planet.crystal](designs/environment.planet.crystal/DESIGN.md) |
| [Rocky moon 1](assets/planets--rocky-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.rocky](designs/environment.planet.rocky/DESIGN.md) |
| [Rocky moon 2](assets/planets--rocky-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.rocky](designs/environment.planet.rocky/DESIGN.md) |
| [Temperate moon 1](assets/planets--temperate-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.temperate](designs/environment.planet.temperate/DESIGN.md) |
| [Temperate moon 2](assets/planets--temperate-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.temperate](designs/environment.planet.temperate/DESIGN.md) |
| [Desert moon 1](assets/planets--desert-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.desert](designs/environment.planet.desert/DESIGN.md) |
| [Desert moon 2](assets/planets--desert-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.desert](designs/environment.planet.desert/DESIGN.md) |
| [Ice moon 1](assets/planets--ice-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.ice](designs/environment.planet.ice/DESIGN.md) |
| [Ice moon 2](assets/planets--ice-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.ice](designs/environment.planet.ice/DESIGN.md) |
| [Volcanic moon 1](assets/planets--volcanic-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.volcanic](designs/environment.planet.volcanic/DESIGN.md) |
| [Volcanic moon 2](assets/planets--volcanic-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.volcanic](designs/environment.planet.volcanic/DESIGN.md) |
| [Gas giant moon 1](assets/planets--gas-giant-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.gas-giant](designs/environment.planet.gas-giant/DESIGN.md) |
| [Gas giant moon 2](assets/planets--gas-giant-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.gas-giant](designs/environment.planet.gas-giant/DESIGN.md) |
| [Gas giant moon 3](assets/planets--gas-giant-moon-3/BRIEF.md) | planets.png | planet | [environment.planet.gas-giant](designs/environment.planet.gas-giant/DESIGN.md) |
| [Ocean moon 1](assets/planets--ocean-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.ocean](designs/environment.planet.ocean/DESIGN.md) |
| [Ocean moon 2](assets/planets--ocean-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.ocean](designs/environment.planet.ocean/DESIGN.md) |
| [Toxic moon 1](assets/planets--toxic-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.toxic](designs/environment.planet.toxic/DESIGN.md) |
| [Toxic moon 2](assets/planets--toxic-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.toxic](designs/environment.planet.toxic/DESIGN.md) |
| [Crystal moon 1](assets/planets--crystal-moon-1/BRIEF.md) | planets.png | planet | [environment.planet.crystal](designs/environment.planet.crystal/DESIGN.md) |
| [Crystal moon 2](assets/planets--crystal-moon-2/BRIEF.md) | planets.png | planet | [environment.planet.crystal](designs/environment.planet.crystal/DESIGN.md) |
| [Detached crystal spire](assets/planets--detached-crystal-spire/BRIEF.md) | planets.png | resource | [stepped-environment.resource.crystal](designs/stepped-environment.resource.crystal/DESIGN.md) |
| [Rocky orbital fragment cluster](assets/planets--rocky-orbital-fragment-cluster/BRIEF.md) | planets.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Planetary rings material study](assets/planets--planetary-rings-material-study/BRIEF.md) | planets.png | environment | [environment.background](designs/environment.background/DESIGN.md) |
| [Temperate cloud shelf](assets/planets--temperate-cloud-shelf/BRIEF.md) | planets.png | environment | [environment.background](designs/environment.background/DESIGN.md) |
| [Temperate tree canopy](assets/planets--temperate-tree-canopy/BRIEF.md) | planets.png | decor | [pale-studless.window.canopy](designs/pale-studless.window.canopy/DESIGN.md) |
| [Desert mesa relief](assets/planets--desert-mesa-relief/BRIEF.md) | planets.png | environment | [environment.background](designs/environment.background/DESIGN.md) |
| [Captain](assets/characters-weapons-items--captain/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Engineer](assets/characters-weapons-items--engineer/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Medic](assets/characters-weapons-items--medic/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Pilot](assets/characters-weapons-items--pilot/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Security officer](assets/characters-weapons-items--security-officer/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Heavy marine](assets/characters-weapons-items--heavy-marine/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Salvage tech](assets/characters-weapons-items--salvage-tech/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Recon scout](assets/characters-weapons-items--recon-scout/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Scientist](assets/characters-weapons-items--scientist/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Mechanic](assets/characters-weapons-items--mechanic/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Captain role icon](assets/characters-weapons-items--captain-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Engineer role icon](assets/characters-weapons-items--engineer-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Medic role icon](assets/characters-weapons-items--medic-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Pilot role icon](assets/characters-weapons-items--pilot-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Security officer role icon](assets/characters-weapons-items--security-officer-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Heavy marine role icon](assets/characters-weapons-items--heavy-marine-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Salvage tech role icon](assets/characters-weapons-items--salvage-tech-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Recon scout role icon](assets/characters-weapons-items--recon-scout-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Scientist role icon](assets/characters-weapons-items--scientist-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Mechanic role icon](assets/characters-weapons-items--mechanic-role-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Leadership icon](assets/characters-weapons-items--leadership-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Systems repair icon](assets/characters-weapons-items--systems-repair-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Treat injuries icon](assets/characters-weapons-items--treat-injuries-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Ship control icon](assets/characters-weapons-items--ship-control-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Security icon](assets/characters-weapons-items--security-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Heavy firepower icon](assets/characters-weapons-items--heavy-firepower-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Salvage icon](assets/characters-weapons-items--salvage-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Scouting icon](assets/characters-weapons-items--scouting-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Research icon](assets/characters-weapons-items--research-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Fabrication icon](assets/characters-weapons-items--fabrication-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Diplomacy icon](assets/characters-weapons-items--diplomacy-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Efficiency icon](assets/characters-weapons-items--efficiency-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Remove status icon](assets/characters-weapons-items--remove-status-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Evasion icon](assets/characters-weapons-items--evasion-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Crowd control icon](assets/characters-weapons-items--crowd-control-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Durability icon](assets/characters-weapons-items--durability-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Resource recovery icon](assets/characters-weapons-items--resource-recovery-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Intel gathering icon](assets/characters-weapons-items--intel-gathering-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Data analysis icon](assets/characters-weapons-items--data-analysis-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Modifications icon](assets/characters-weapons-items--modifications-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Crew morale icon](assets/characters-weapons-items--crew-morale-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Upgrades icon](assets/characters-weapons-items--upgrades-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Keep crew alive icon](assets/characters-weapons-items--keep-crew-alive-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Precision icon](assets/characters-weapons-items--precision-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Threat detection icon](assets/characters-weapons-items--threat-detection-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Frontline icon](assets/characters-weapons-items--frontline-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Field repairs icon](assets/characters-weapons-items--field-repairs-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Stealth icon](assets/characters-weapons-items--stealth-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [New technology icon](assets/characters-weapons-items--new-technology-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Resource crafting icon](assets/characters-weapons-items--resource-crafting-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Base crew body](assets/characters-weapons-items--base-crew-body/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Rig front view](assets/characters-weapons-items--rig-front-view/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Rig side view](assets/characters-weapons-items--rig-side-view/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Rig back view](assets/characters-weapons-items--rig-back-view/BRIEF.md) | characters-weapons-items.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Civilian Headwear](assets/characters-weapons-items--civilian-headwear/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Light Headwear](assets/characters-weapons-items--light-headwear/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Standard Headwear](assets/characters-weapons-items--standard-headwear/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Heavy Headwear](assets/characters-weapons-items--heavy-headwear/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Civilian Chest armor](assets/characters-weapons-items--civilian-chest-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Light Chest armor](assets/characters-weapons-items--light-chest-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Standard Chest armor](assets/characters-weapons-items--standard-chest-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Heavy Chest armor](assets/characters-weapons-items--heavy-chest-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Civilian Shoulder armor](assets/characters-weapons-items--civilian-shoulder-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Light Shoulder armor](assets/characters-weapons-items--light-shoulder-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Standard Shoulder armor](assets/characters-weapons-items--standard-shoulder-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Heavy Shoulder armor](assets/characters-weapons-items--heavy-shoulder-armor/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Civilian Backpack](assets/characters-weapons-items--civilian-backpack/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Light Backpack](assets/characters-weapons-items--light-backpack/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Standard Backpack](assets/characters-weapons-items--standard-backpack/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Heavy Backpack](assets/characters-weapons-items--heavy-backpack/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Pistol](assets/characters-weapons-items--pistol/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.handgun.standard](designs/pale-studless.handgun.standard/DESIGN.md) |
| [Rifle](assets/characters-weapons-items--rifle/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.rifle.rifle](designs/pale-studless.rifle.rifle/DESIGN.md) |
| [Shotgun](assets/characters-weapons-items--shotgun/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.rifle.shotgun](designs/pale-studless.rifle.shotgun/DESIGN.md) |
| [Heavy gun](assets/characters-weapons-items--heavy-gun/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.rifle.standard](designs/pale-studless.rifle.standard/DESIGN.md) |
| [Stun gun](assets/characters-weapons-items--stun-gun/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.handgun.standard](designs/pale-studless.handgun.standard/DESIGN.md) |
| [Wrench](assets/characters-weapons-items--wrench/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.tool.wrench](designs/pale-studless.tool.wrench/DESIGN.md) |
| [Welder](assets/characters-weapons-items--welder/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.tool.welder](designs/pale-studless.tool.welder/DESIGN.md) |
| [Multi-tool](assets/characters-weapons-items--multi-tool/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.tool.multi-tool](designs/pale-studless.tool.multi-tool/DESIGN.md) |
| [Medkit](assets/characters-weapons-items--medkit/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.crate.medkit](designs/pale-studless.crate.medkit/DESIGN.md) |
| [Sample scanner](assets/characters-weapons-items--sample-scanner/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.tool.scanner](designs/pale-studless.tool.scanner/DESIGN.md) |
| [Data pad](assets/characters-weapons-items--data-pad/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.tool.data-pad](designs/pale-studless.tool.data-pad/DESIGN.md) |
| [Drone](assets/characters-weapons-items--drone/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Grapple](assets/characters-weapons-items--grapple/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.tool.grapple](designs/pale-studless.tool.grapple/DESIGN.md) |
| [Flashlight](assets/characters-weapons-items--flashlight/BRIEF.md) | characters-weapons-items.png | equipment | [pale-studless.tool.flashlight](designs/pale-studless.tool.flashlight/DESIGN.md) |
| [Shield pack](assets/characters-weapons-items--shield-pack/BRIEF.md) | characters-weapons-items.png | equipment | [crew.equipment.shield-pack](designs/crew.equipment.shield-pack/DESIGN.md) |
| [Crew roster ship](assets/characters-weapons-items--crew-roster-ship/BRIEF.md) | characters-weapons-items.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Crew front](assets/more-character-customization--crew-front/BRIEF.md) | more-character-customization.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Crew back](assets/more-character-customization--crew-back/BRIEF.md) | more-character-customization.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Exploded helmet](assets/more-character-customization--exploded-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Exploded head](assets/more-character-customization--exploded-head/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.head](designs/crew.equipment.head/DESIGN.md) |
| [Exploded backpack](assets/more-character-customization--exploded-backpack/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Exploded chest](assets/more-character-customization--exploded-chest/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Exploded left shoulder](assets/more-character-customization--exploded-left-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Exploded right shoulder](assets/more-character-customization--exploded-right-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Exploded glove](assets/more-character-customization--exploded-glove/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) |
| [Exploded left gauntlet](assets/more-character-customization--exploded-left-gauntlet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.gauntlet](designs/crew.equipment.gauntlet/DESIGN.md) |
| [Exploded right gauntlet](assets/more-character-customization--exploded-right-gauntlet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.gauntlet](designs/crew.equipment.gauntlet/DESIGN.md) |
| [Exploded belt](assets/more-character-customization--exploded-belt/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Exploded legs](assets/more-character-customization--exploded-legs/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.legs](designs/crew.equipment.legs/DESIGN.md) |
| [Exploded left boot](assets/more-character-customization--exploded-left-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Exploded right boot](assets/more-character-customization--exploded-right-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Utility cutter](assets/more-character-customization--utility-cutter/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.tool.cutter](designs/pale-studless.tool.cutter/DESIGN.md) |
| [Pistol](assets/more-character-customization--pistol/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.handgun.standard](designs/pale-studless.handgun.standard/DESIGN.md) |
| [SMG](assets/more-character-customization--smg/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.rifle.smg](designs/pale-studless.rifle.smg/DESIGN.md) |
| [Compact carbine](assets/more-character-customization--compact-carbine/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.rifle.carbine](designs/pale-studless.rifle.carbine/DESIGN.md) |
| [Shotgun](assets/more-character-customization--shotgun/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.rifle.shotgun](designs/pale-studless.rifle.shotgun/DESIGN.md) |
| [Beam rifle](assets/more-character-customization--beam-rifle/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.rifle.beam](designs/pale-studless.rifle.beam/DESIGN.md) |
| [Rail rifle](assets/more-character-customization--rail-rifle/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.rifle.rail](designs/pale-studless.rifle.rail/DESIGN.md) |
| [Medgun](assets/more-character-customization--medgun/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.tool.medgun](designs/pale-studless.tool.medgun/DESIGN.md) |
| [Repair tool](assets/more-character-customization--repair-tool/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.tool.repair](designs/pale-studless.tool.repair/DESIGN.md) |
| [Shield emitter](assets/more-character-customization--shield-emitter/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Scanner](assets/more-character-customization--scanner/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.tool.scanner](designs/pale-studless.tool.scanner/DESIGN.md) |
| [Baton](assets/more-character-customization--baton/BRIEF.md) | more-character-customization.png | equipment | [pale-studless.tool.baton](designs/pale-studless.tool.baton/DESIGN.md) |
| [Base hair](assets/more-character-customization--base-hair/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Short hair](assets/more-character-customization--short-hair/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Medium hair](assets/more-character-customization--medium-hair/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Long hair](assets/more-character-customization--long-hair/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Undercut hair](assets/more-character-customization--undercut-hair/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Mohawk hair](assets/more-character-customization--mohawk-hair/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Bald head](assets/more-character-customization--bald-head/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.head](designs/crew.equipment.head/DESIGN.md) |
| [Open helmet](assets/more-character-customization--open-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Closed helmet](assets/more-character-customization--closed-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Tactical helmet](assets/more-character-customization--tactical-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Hazmat helmet](assets/more-character-customization--hazmat-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Pilot helmet](assets/more-character-customization--pilot-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Mining helmet](assets/more-character-customization--mining-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Security helmet](assets/more-character-customization--security-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Clear visor](assets/more-character-customization--clear-visor/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.visor](designs/crew.equipment.visor/DESIGN.md) |
| [Tinted visor](assets/more-character-customization--tinted-visor/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.visor](designs/crew.equipment.visor/DESIGN.md) |
| [HUD visor](assets/more-character-customization--hud-visor/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.visor](designs/crew.equipment.visor/DESIGN.md) |
| [Mirrored visor](assets/more-character-customization--mirrored-visor/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.visor](designs/crew.equipment.visor/DESIGN.md) |
| [AR visor](assets/more-character-customization--ar-visor/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.visor](designs/crew.equipment.visor/DESIGN.md) |
| [Oxygen mask](assets/more-character-customization--oxygen-mask/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.mask](designs/crew.equipment.mask/DESIGN.md) |
| [Rebreather](assets/more-character-customization--rebreather/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.rebreather](designs/crew.equipment.rebreather/DESIGN.md) |
| [Pale Chest plate](assets/more-character-customization--pale-chest-plate/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Red Chest plate](assets/more-character-customization--red-chest-plate/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Blue Chest plate](assets/more-character-customization--blue-chest-plate/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Orange Chest plate](assets/more-character-customization--orange-chest-plate/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Green Chest plate](assets/more-character-customization--green-chest-plate/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Charcoal Chest plate](assets/more-character-customization--charcoal-chest-plate/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Pale Shoulder](assets/more-character-customization--pale-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Red Shoulder](assets/more-character-customization--red-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Blue Shoulder](assets/more-character-customization--blue-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Orange Shoulder](assets/more-character-customization--orange-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Green Shoulder](assets/more-character-customization--green-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Charcoal Shoulder](assets/more-character-customization--charcoal-shoulder/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Pale Glove](assets/more-character-customization--pale-glove/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) |
| [Red Glove](assets/more-character-customization--red-glove/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) |
| [Blue Glove](assets/more-character-customization--blue-glove/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) |
| [Orange Glove](assets/more-character-customization--orange-glove/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) |
| [Green Glove](assets/more-character-customization--green-glove/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) |
| [Charcoal Glove](assets/more-character-customization--charcoal-glove/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.glove](designs/crew.equipment.glove/DESIGN.md) |
| [Pale Boot](assets/more-character-customization--pale-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Red Boot](assets/more-character-customization--red-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Blue Boot](assets/more-character-customization--blue-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Orange Boot](assets/more-character-customization--orange-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Green Boot](assets/more-character-customization--green-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Charcoal Boot](assets/more-character-customization--charcoal-boot/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Backpack variant 1](assets/more-character-customization--backpack-variant-1/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 2](assets/more-character-customization--backpack-variant-2/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 3](assets/more-character-customization--backpack-variant-3/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 4](assets/more-character-customization--backpack-variant-4/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 5](assets/more-character-customization--backpack-variant-5/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 6](assets/more-character-customization--backpack-variant-6/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Oxygen pack variant 1](assets/more-character-customization--oxygen-pack-variant-1/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.oxygen-pack](designs/crew.equipment.oxygen-pack/DESIGN.md) |
| [Oxygen pack variant 2](assets/more-character-customization--oxygen-pack-variant-2/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.oxygen-pack](designs/crew.equipment.oxygen-pack/DESIGN.md) |
| [Oxygen pack variant 3](assets/more-character-customization--oxygen-pack-variant-3/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.oxygen-pack](designs/crew.equipment.oxygen-pack/DESIGN.md) |
| [Oxygen pack variant 4](assets/more-character-customization--oxygen-pack-variant-4/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.oxygen-pack](designs/crew.equipment.oxygen-pack/DESIGN.md) |
| [Oxygen pack variant 5](assets/more-character-customization--oxygen-pack-variant-5/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.oxygen-pack](designs/crew.equipment.oxygen-pack/DESIGN.md) |
| [Oxygen pack variant 6](assets/more-character-customization--oxygen-pack-variant-6/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.oxygen-pack](designs/crew.equipment.oxygen-pack/DESIGN.md) |
| [Jetpack variant 1](assets/more-character-customization--jetpack-variant-1/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.jetpack](designs/crew.equipment.jetpack/DESIGN.md) |
| [Jetpack variant 2](assets/more-character-customization--jetpack-variant-2/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.jetpack](designs/crew.equipment.jetpack/DESIGN.md) |
| [Jetpack variant 3](assets/more-character-customization--jetpack-variant-3/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.jetpack](designs/crew.equipment.jetpack/DESIGN.md) |
| [Jetpack variant 4](assets/more-character-customization--jetpack-variant-4/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.jetpack](designs/crew.equipment.jetpack/DESIGN.md) |
| [Jetpack variant 5](assets/more-character-customization--jetpack-variant-5/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.jetpack](designs/crew.equipment.jetpack/DESIGN.md) |
| [Utility belt variant 1](assets/more-character-customization--utility-belt-variant-1/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Utility belt variant 2](assets/more-character-customization--utility-belt-variant-2/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Utility belt variant 3](assets/more-character-customization--utility-belt-variant-3/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Utility belt variant 4](assets/more-character-customization--utility-belt-variant-4/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Utility belt variant 5](assets/more-character-customization--utility-belt-variant-5/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Utility belt variant 6](assets/more-character-customization--utility-belt-variant-6/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Muzzle flash](assets/more-character-customization--muzzle-flash/BRIEF.md) | more-character-customization.png | vfx | [vfx.muzzle-flash](designs/vfx.muzzle-flash/DESIGN.md) |
| [Laser bolt](assets/more-character-customization--laser-bolt/BRIEF.md) | more-character-customization.png | vfx | [vfx.laser-bolt](designs/vfx.laser-bolt/DESIGN.md) |
| [Plasma bolt](assets/more-character-customization--plasma-bolt/BRIEF.md) | more-character-customization.png | vfx | [vfx.plasma-bolt](designs/vfx.plasma-bolt/DESIGN.md) |
| [Healing beam](assets/more-character-customization--healing-beam/BRIEF.md) | more-character-customization.png | vfx | [vfx.healing-beam](designs/vfx.healing-beam/DESIGN.md) |
| [Scan pulse](assets/more-character-customization--scan-pulse/BRIEF.md) | more-character-customization.png | vfx | [vfx.scan-pulse](designs/vfx.scan-pulse/DESIGN.md) |
| [Shield bubble](assets/more-character-customization--shield-bubble/BRIEF.md) | more-character-customization.png | vfx | [vfx.shield-bubble](designs/vfx.shield-bubble/DESIGN.md) |
| [Impact spark](assets/more-character-customization--impact-spark/BRIEF.md) | more-character-customization.png | vfx | [vfx.impact-spark](designs/vfx.impact-spark/DESIGN.md) |
| [Smoke puff](assets/more-character-customization--smoke-puff/BRIEF.md) | more-character-customization.png | vfx | [vfx.smoke-puff](designs/vfx.smoke-puff/DESIGN.md) |
| [Thruster glow](assets/more-character-customization--thruster-glow/BRIEF.md) | more-character-customization.png | vfx | [vfx.thruster-glow](designs/vfx.thruster-glow/DESIGN.md) |
| [Pickup glow](assets/more-character-customization--pickup-glow/BRIEF.md) | more-character-customization.png | vfx | [vfx.pickup-glow](designs/vfx.pickup-glow/DESIGN.md) |
| [Repair sparks](assets/more-character-customization--repair-sparks/BRIEF.md) | more-character-customization.png | vfx | [vfx.repair-sparks](designs/vfx.repair-sparks/DESIGN.md) |
| [Teleport effect](assets/more-character-customization--teleport-effect/BRIEF.md) | more-character-customization.png | vfx | [vfx.teleport-effect](designs/vfx.teleport-effect/DESIGN.md) |
| [Medic loadout](assets/more-character-customization--medic-loadout/BRIEF.md) | more-character-customization.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Medic loadout Helmet](assets/more-character-customization--medic-loadout-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Medic loadout Chest](assets/more-character-customization--medic-loadout-chest/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Medic loadout Backpack](assets/more-character-customization--medic-loadout-backpack/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Medic loadout Weapon](assets/more-character-customization--medic-loadout-weapon/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Medic loadout Tool](assets/more-character-customization--medic-loadout-tool/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Medic palette swatch 1](assets/more-character-customization--medic-palette-swatch-1/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Medic palette swatch 2](assets/more-character-customization--medic-palette-swatch-2/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Medic palette swatch 3](assets/more-character-customization--medic-palette-swatch-3/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Medic palette swatch 4](assets/more-character-customization--medic-palette-swatch-4/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Medic palette swatch 5](assets/more-character-customization--medic-palette-swatch-5/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engineer loadout](assets/more-character-customization--engineer-loadout/BRIEF.md) | more-character-customization.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Engineer loadout Helmet](assets/more-character-customization--engineer-loadout-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Engineer loadout Chest](assets/more-character-customization--engineer-loadout-chest/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Engineer loadout Backpack](assets/more-character-customization--engineer-loadout-backpack/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Engineer loadout Weapon](assets/more-character-customization--engineer-loadout-weapon/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Engineer loadout Tool](assets/more-character-customization--engineer-loadout-tool/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Engineer palette swatch 1](assets/more-character-customization--engineer-palette-swatch-1/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engineer palette swatch 2](assets/more-character-customization--engineer-palette-swatch-2/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engineer palette swatch 3](assets/more-character-customization--engineer-palette-swatch-3/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engineer palette swatch 4](assets/more-character-customization--engineer-palette-swatch-4/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engineer palette swatch 5](assets/more-character-customization--engineer-palette-swatch-5/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Security loadout](assets/more-character-customization--security-loadout/BRIEF.md) | more-character-customization.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Security loadout Helmet](assets/more-character-customization--security-loadout-helmet/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Security loadout Chest](assets/more-character-customization--security-loadout-chest/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Security loadout Backpack](assets/more-character-customization--security-loadout-backpack/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Security loadout Weapon](assets/more-character-customization--security-loadout-weapon/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Security loadout Tool](assets/more-character-customization--security-loadout-tool/BRIEF.md) | more-character-customization.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Security palette swatch 1](assets/more-character-customization--security-palette-swatch-1/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Security palette swatch 2](assets/more-character-customization--security-palette-swatch-2/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Security palette swatch 3](assets/more-character-customization--security-palette-swatch-3/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Security palette swatch 4](assets/more-character-customization--security-palette-swatch-4/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Security palette swatch 5](assets/more-character-customization--security-palette-swatch-5/BRIEF.md) | more-character-customization.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Crew](assets/character-animations-2--crew/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Engineer](assets/character-animations-2--engineer/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Medic](assets/character-animations-2--medic/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Security](assets/character-animations-2--security/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Pilot](assets/character-animations-2--pilot/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Explorer](assets/character-animations-2--explorer/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Miner](assets/character-animations-2--miner/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Scientist](assets/character-animations-2--scientist/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Cyborg](assets/character-animations-2--cyborg/BRIEF.md) | character-animations-2.png | character | [crew.cyborg](designs/crew.cyborg/DESIGN.md) |
| [Alien](assets/character-animations-2--alien/BRIEF.md) | character-animations-2.png | character | [crew.alien](designs/crew.alien/DESIGN.md) |
| [Hair head variant 1](assets/character-animations-2--hair-head-variant-1/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Hair head variant 2](assets/character-animations-2--hair-head-variant-2/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Hair head variant 3](assets/character-animations-2--hair-head-variant-3/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Hair head variant 4](assets/character-animations-2--hair-head-variant-4/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Hair head variant 5](assets/character-animations-2--hair-head-variant-5/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Hair head variant 6](assets/character-animations-2--hair-head-variant-6/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Hair head variant 7](assets/character-animations-2--hair-head-variant-7/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Hair head variant 8](assets/character-animations-2--hair-head-variant-8/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.hair](designs/crew.equipment.hair/DESIGN.md) |
| [Helmet variant 1](assets/character-animations-2--helmet-variant-1/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Helmet variant 2](assets/character-animations-2--helmet-variant-2/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Helmet variant 3](assets/character-animations-2--helmet-variant-3/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Helmet variant 4](assets/character-animations-2--helmet-variant-4/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Helmet variant 5](assets/character-animations-2--helmet-variant-5/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Helmet variant 6](assets/character-animations-2--helmet-variant-6/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Helmet variant 7](assets/character-animations-2--helmet-variant-7/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Helmet variant 8](assets/character-animations-2--helmet-variant-8/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Backpack variant 1](assets/character-animations-2--backpack-variant-1/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 2](assets/character-animations-2--backpack-variant-2/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 3](assets/character-animations-2--backpack-variant-3/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 4](assets/character-animations-2--backpack-variant-4/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Backpack variant 5](assets/character-animations-2--backpack-variant-5/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Armor suit variant 1](assets/character-animations-2--armor-suit-variant-1/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.armor](designs/crew.equipment.armor/DESIGN.md) |
| [Armor suit variant 2](assets/character-animations-2--armor-suit-variant-2/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.armor](designs/crew.equipment.armor/DESIGN.md) |
| [Armor suit variant 3](assets/character-animations-2--armor-suit-variant-3/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.armor](designs/crew.equipment.armor/DESIGN.md) |
| [Armor suit variant 4](assets/character-animations-2--armor-suit-variant-4/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.armor](designs/crew.equipment.armor/DESIGN.md) |
| [Armor suit variant 5](assets/character-animations-2--armor-suit-variant-5/BRIEF.md) | character-animations-2.png | equipment | [crew.equipment.armor](designs/crew.equipment.armor/DESIGN.md) |
| [Scale astronaut](assets/character-animations-2--scale-astronaut/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Idle key pose 1](assets/character-animations-2--idle-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.idle](designs/crew.animation.idle/DESIGN.md) |
| [Idle key pose 2](assets/character-animations-2--idle-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.idle](designs/crew.animation.idle/DESIGN.md) |
| [Idle key pose 3](assets/character-animations-2--idle-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.idle](designs/crew.animation.idle/DESIGN.md) |
| [Idle key pose 4](assets/character-animations-2--idle-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.idle](designs/crew.animation.idle/DESIGN.md) |
| [Walk key pose 1](assets/character-animations-2--walk-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.walk](designs/crew.animation.walk/DESIGN.md) |
| [Walk key pose 2](assets/character-animations-2--walk-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.walk](designs/crew.animation.walk/DESIGN.md) |
| [Walk key pose 3](assets/character-animations-2--walk-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.walk](designs/crew.animation.walk/DESIGN.md) |
| [Walk key pose 4](assets/character-animations-2--walk-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.walk](designs/crew.animation.walk/DESIGN.md) |
| [Run key pose 1](assets/character-animations-2--run-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.run](designs/crew.animation.run/DESIGN.md) |
| [Run key pose 2](assets/character-animations-2--run-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.run](designs/crew.animation.run/DESIGN.md) |
| [Run key pose 3](assets/character-animations-2--run-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.run](designs/crew.animation.run/DESIGN.md) |
| [Run key pose 4](assets/character-animations-2--run-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.run](designs/crew.animation.run/DESIGN.md) |
| [Shoot key pose 1](assets/character-animations-2--shoot-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.shoot](designs/crew.animation.shoot/DESIGN.md) |
| [Shoot key pose 2](assets/character-animations-2--shoot-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.shoot](designs/crew.animation.shoot/DESIGN.md) |
| [Shoot key pose 3](assets/character-animations-2--shoot-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.shoot](designs/crew.animation.shoot/DESIGN.md) |
| [Shoot key pose 4](assets/character-animations-2--shoot-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.shoot](designs/crew.animation.shoot/DESIGN.md) |
| [Aim key pose 1](assets/character-animations-2--aim-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.aim](designs/crew.animation.aim/DESIGN.md) |
| [Aim key pose 2](assets/character-animations-2--aim-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.aim](designs/crew.animation.aim/DESIGN.md) |
| [Aim key pose 3](assets/character-animations-2--aim-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.aim](designs/crew.animation.aim/DESIGN.md) |
| [Aim key pose 4](assets/character-animations-2--aim-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.aim](designs/crew.animation.aim/DESIGN.md) |
| [Melee key pose 1](assets/character-animations-2--melee-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.melee](designs/crew.animation.melee/DESIGN.md) |
| [Melee key pose 2](assets/character-animations-2--melee-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.melee](designs/crew.animation.melee/DESIGN.md) |
| [Melee key pose 3](assets/character-animations-2--melee-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.melee](designs/crew.animation.melee/DESIGN.md) |
| [Melee key pose 4](assets/character-animations-2--melee-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.melee](designs/crew.animation.melee/DESIGN.md) |
| [Pick up interact key pose 1](assets/character-animations-2--pick-up-interact-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.pick-up-interact](designs/crew.animation.pick-up-interact/DESIGN.md) |
| [Pick up interact key pose 2](assets/character-animations-2--pick-up-interact-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.pick-up-interact](designs/crew.animation.pick-up-interact/DESIGN.md) |
| [Pick up interact key pose 3](assets/character-animations-2--pick-up-interact-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.pick-up-interact](designs/crew.animation.pick-up-interact/DESIGN.md) |
| [Pick up interact key pose 4](assets/character-animations-2--pick-up-interact-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.pick-up-interact](designs/crew.animation.pick-up-interact/DESIGN.md) |
| [Use repair key pose 1](assets/character-animations-2--use-repair-key-pose-1/BRIEF.md) | character-animations-2.png | animation | [crew.animation.use-repair](designs/crew.animation.use-repair/DESIGN.md) |
| [Use repair key pose 2](assets/character-animations-2--use-repair-key-pose-2/BRIEF.md) | character-animations-2.png | animation | [crew.animation.use-repair](designs/crew.animation.use-repair/DESIGN.md) |
| [Use repair key pose 3](assets/character-animations-2--use-repair-key-pose-3/BRIEF.md) | character-animations-2.png | animation | [crew.animation.use-repair](designs/crew.animation.use-repair/DESIGN.md) |
| [Use repair key pose 4](assets/character-animations-2--use-repair-key-pose-4/BRIEF.md) | character-animations-2.png | animation | [crew.animation.use-repair](designs/crew.animation.use-repair/DESIGN.md) |
| [Wave](assets/character-animations-2--wave/BRIEF.md) | character-animations-2.png | animation | [crew.animation.wave](designs/crew.animation.wave/DESIGN.md) |
| [Point](assets/character-animations-2--point/BRIEF.md) | character-animations-2.png | animation | [crew.animation.point](designs/crew.animation.point/DESIGN.md) |
| [Cheer](assets/character-animations-2--cheer/BRIEF.md) | character-animations-2.png | animation | [crew.animation.cheer](designs/crew.animation.cheer/DESIGN.md) |
| [Thumbs up](assets/character-animations-2--thumbs-up/BRIEF.md) | character-animations-2.png | animation | [crew.animation.thumbs-up](designs/crew.animation.thumbs-up/DESIGN.md) |
| [Sit](assets/character-animations-2--sit/BRIEF.md) | character-animations-2.png | animation | [crew.animation.sit](designs/crew.animation.sit/DESIGN.md) |
| [Crouch](assets/character-animations-2--crouch/BRIEF.md) | character-animations-2.png | animation | [crew.animation.crouch](designs/crew.animation.crouch/DESIGN.md) |
| [Hurt](assets/character-animations-2--hurt/BRIEF.md) | character-animations-2.png | animation | [crew.animation.hurt](designs/crew.animation.hurt/DESIGN.md) |
| [Die](assets/character-animations-2--die/BRIEF.md) | character-animations-2.png | animation | [crew.animation.die](designs/crew.animation.die/DESIGN.md) |
| [Equipped explorer](assets/character-animations-2--equipped-explorer/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Equipped medic](assets/character-animations-2--equipped-medic/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Equipped security](assets/character-animations-2--equipped-security/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Equipped miner](assets/character-animations-2--equipped-miner/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Equipped scientist](assets/character-animations-2--equipped-scientist/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Team lineup member 1](assets/character-animations-2--team-lineup-member-1/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Team lineup member 2](assets/character-animations-2--team-lineup-member-2/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Team lineup member 3](assets/character-animations-2--team-lineup-member-3/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Team lineup member 4](assets/character-animations-2--team-lineup-member-4/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Team lineup member 5](assets/character-animations-2--team-lineup-member-5/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Team lineup member 6](assets/character-animations-2--team-lineup-member-6/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Team lineup member 7](assets/character-animations-2--team-lineup-member-7/BRIEF.md) | character-animations-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Directional Front](assets/character-animations-2--directional-front/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Directional Front-right](assets/character-animations-2--directional-front-right/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Directional Right](assets/character-animations-2--directional-right/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Directional Back-right](assets/character-animations-2--directional-back-right/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Directional Back](assets/character-animations-2--directional-back/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Directional Back-left](assets/character-animations-2--directional-back-left/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Directional Left](assets/character-animations-2--directional-left/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Directional Front-left](assets/character-animations-2--directional-front-left/BRIEF.md) | character-animations-2.png | animation | [crew.animation.directional-review](designs/crew.animation.directional-review/DESIGN.md) |
| [Point defense turret](assets/weapons-turrets--point-defense-turret/BRIEF.md) | weapons-turrets.png | weapon | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Point defense turret exploded assembly](assets/weapons-turrets--point-defense-turret-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Point defense turret - Barrel assembly](assets/weapons-turrets--point-defense-turret-barrel-assembly/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Point defense turret - Elevation and targeting unit](assets/weapons-turrets--point-defense-turret-elevation-and-targeting-unit/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Point defense turret - Rotation base](assets/weapons-turrets--point-defense-turret-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Point defense turret - Power coupling](assets/weapons-turrets--point-defense-turret-power-coupling/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Point defense turret - Hardpoint connector](assets/weapons-turrets--point-defense-turret-hardpoint-connector/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Twin autocannon](assets/weapons-turrets--twin-autocannon/BRIEF.md) | weapons-turrets.png | weapon | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Twin autocannon exploded assembly](assets/weapons-turrets--twin-autocannon-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Twin autocannon - Targeting module](assets/weapons-turrets--twin-autocannon-targeting-module/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Twin autocannon - Twin barrel housing](assets/weapons-turrets--twin-autocannon-twin-barrel-housing/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Twin autocannon - Ammo and recoil assembly](assets/weapons-turrets--twin-autocannon-ammo-and-recoil-assembly/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Twin autocannon - Rotation base](assets/weapons-turrets--twin-autocannon-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Twin autocannon - Power conduit and connector](assets/weapons-turrets--twin-autocannon-power-conduit-and-connector/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser cannon](assets/weapons-turrets--laser-cannon/BRIEF.md) | weapons-turrets.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Laser cannon exploded assembly](assets/weapons-turrets--laser-cannon-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Laser cannon - Targeting sensor](assets/weapons-turrets--laser-cannon-targeting-sensor/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser cannon - Emitter housing](assets/weapons-turrets--laser-cannon-emitter-housing/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser cannon - Cooling jacket and lens](assets/weapons-turrets--laser-cannon-cooling-jacket-and-lens/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser cannon - Power core](assets/weapons-turrets--laser-cannon-power-core/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser cannon - Rotation base and hardpoint](assets/weapons-turrets--laser-cannon-rotation-base-and-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Railgun mount](assets/weapons-turrets--railgun-mount/BRIEF.md) | weapons-turrets.png | weapon | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Railgun mount exploded assembly](assets/weapons-turrets--railgun-mount-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Railgun mount - Targeting array](assets/weapons-turrets--railgun-mount-targeting-array/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Railgun mount - Rail barrel](assets/weapons-turrets--railgun-mount-rail-barrel/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Railgun mount - Power coil](assets/weapons-turrets--railgun-mount-power-coil/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Railgun mount - Stabilizer frame](assets/weapons-turrets--railgun-mount-stabilizer-frame/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Railgun mount - Rotation base](assets/weapons-turrets--railgun-mount-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Railgun mount - Hardpoint](assets/weapons-turrets--railgun-mount-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile pod](assets/weapons-turrets--missile-pod/BRIEF.md) | weapons-turrets.png | weapon | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Missile pod exploded assembly](assets/weapons-turrets--missile-pod-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Missile pod - Pod cover](assets/weapons-turrets--missile-pod-pod-cover/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile pod - Missile tubes](assets/weapons-turrets--missile-pod-missile-tubes/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile pod - Loading frame and controller](assets/weapons-turrets--missile-pod-loading-frame-and-controller/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile pod - Power conduit](assets/weapons-turrets--missile-pod-power-conduit/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile pod - Rotation base](assets/weapons-turrets--missile-pod-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile pod - Hardpoint](assets/weapons-turrets--missile-pod-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Flak turret](assets/weapons-turrets--flak-turret/BRIEF.md) | weapons-turrets.png | weapon | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) |
| [Flak turret exploded assembly](assets/weapons-turrets--flak-turret-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) |
| [Flak turret - Barrel cluster](assets/weapons-turrets--flak-turret-barrel-cluster/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Flak turret - Feed and ammo assembly](assets/weapons-turrets--flak-turret-feed-and-ammo-assembly/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Flak turret - Elevation unit](assets/weapons-turrets--flak-turret-elevation-unit/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Flak turret - Rotation base](assets/weapons-turrets--flak-turret-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Flak turret - Power conduit](assets/weapons-turrets--flak-turret-power-conduit/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Flak turret - Hardpoint](assets/weapons-turrets--flak-turret-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Sensor dish](assets/weapons-turrets--sensor-dish/BRIEF.md) | weapons-turrets.png | sensor | [pale-studless.sensor.dish](designs/pale-studless.sensor.dish/DESIGN.md) |
| [Sensor dish exploded assembly](assets/weapons-turrets--sensor-dish-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.sensor.dish](designs/pale-studless.sensor.dish/DESIGN.md) |
| [Sensor dish - Dish array](assets/weapons-turrets--sensor-dish-dish-array/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Sensor dish - Receiver and gimbal](assets/weapons-turrets--sensor-dish-receiver-and-gimbal/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Sensor dish - Processing unit](assets/weapons-turrets--sensor-dish-processing-unit/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Sensor dish - Rotation base](assets/weapons-turrets--sensor-dish-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Sensor dish - Hardpoint](assets/weapons-turrets--sensor-dish-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Shield emitter](assets/weapons-turrets--shield-emitter/BRIEF.md) | weapons-turrets.png | system | [pale-studless.shield.standard](designs/pale-studless.shield.standard/DESIGN.md) |
| [Shield emitter exploded assembly](assets/weapons-turrets--shield-emitter-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.shield.standard](designs/pale-studless.shield.standard/DESIGN.md) |
| [Shield emitter - Shield cap](assets/weapons-turrets--shield-emitter-shield-cap/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Shield emitter - Field coil](assets/weapons-turrets--shield-emitter-field-coil/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Shield emitter - Power core and vents](assets/weapons-turrets--shield-emitter-power-core-and-vents/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Shield emitter - Support frame](assets/weapons-turrets--shield-emitter-support-frame/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Shield emitter - Rotation base](assets/weapons-turrets--shield-emitter-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Shield emitter - Hardpoint](assets/weapons-turrets--shield-emitter-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Tractor projector](assets/weapons-turrets--tractor-projector/BRIEF.md) | weapons-turrets.png | system | [pale-studless.tractor.standard](designs/pale-studless.tractor.standard/DESIGN.md) |
| [Tractor projector exploded assembly](assets/weapons-turrets--tractor-projector-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.tractor.standard](designs/pale-studless.tractor.standard/DESIGN.md) |
| [Tractor projector - Emitter ring](assets/weapons-turrets--tractor-projector-emitter-ring/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Tractor projector - Field generator and focus lens](assets/weapons-turrets--tractor-projector-field-generator-and-focus-lens/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Tractor projector - Power core](assets/weapons-turrets--tractor-projector-power-core/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Tractor projector - Gimbal frame](assets/weapons-turrets--tractor-projector-gimbal-frame/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Tractor projector - Rotation base](assets/weapons-turrets--tractor-projector-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Tractor projector - Hardpoint](assets/weapons-turrets--tractor-projector-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Docking clamp](assets/weapons-turrets--docking-clamp/BRIEF.md) | weapons-turrets.png | system | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Docking clamp exploded assembly](assets/weapons-turrets--docking-clamp-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Docking clamp - Locking jaws and actuator](assets/weapons-turrets--docking-clamp-locking-jaws-and-actuator/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Docking clamp - Hydraulic unit](assets/weapons-turrets--docking-clamp-hydraulic-unit/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Docking clamp - Control module](assets/weapons-turrets--docking-clamp-control-module/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Docking clamp - Rotation base](assets/weapons-turrets--docking-clamp-rotation-base/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Docking clamp - Hardpoint](assets/weapons-turrets--docking-clamp-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Relay beacon](assets/weapons-turrets--relay-beacon/BRIEF.md) | weapons-turrets.png | sensor | [pale-studless.sensor.beacon](designs/pale-studless.sensor.beacon/DESIGN.md) |
| [Relay beacon exploded assembly](assets/weapons-turrets--relay-beacon-exploded-assembly/BRIEF.md) | weapons-turrets.png | system | [pale-studless.sensor.beacon](designs/pale-studless.sensor.beacon/DESIGN.md) |
| [Relay beacon - Antenna mast](assets/weapons-turrets--relay-beacon-antenna-mast/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Relay beacon - Communication array](assets/weapons-turrets--relay-beacon-communication-array/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Relay beacon - Signal processor](assets/weapons-turrets--relay-beacon-signal-processor/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Relay beacon - Power core](assets/weapons-turrets--relay-beacon-power-core/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Relay beacon - Stabilizer frame](assets/weapons-turrets--relay-beacon-stabilizer-frame/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Relay beacon - Hardpoint](assets/weapons-turrets--relay-beacon-hardpoint/BRIEF.md) | weapons-turrets.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Hull hardpoint socket](assets/weapons-turrets--hull-hardpoint-socket/BRIEF.md) | weapons-turrets.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Hardpoint adapter plate](assets/weapons-turrets--hardpoint-adapter-plate/BRIEF.md) | weapons-turrets.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Mounted turret example](assets/weapons-turrets--mounted-turret-example/BRIEF.md) | weapons-turrets.png | structure | [pale-studless.turret.standard](designs/pale-studless.turret.standard/DESIGN.md) |
| [Weapon category icon](assets/weapons-turrets--weapon-category-icon/BRIEF.md) | weapons-turrets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Sensor category icon](assets/weapons-turrets--sensor-category-icon/BRIEF.md) | weapons-turrets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Utility category icon](assets/weapons-turrets--utility-category-icon/BRIEF.md) | weapons-turrets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Defense category icon](assets/weapons-turrets--defense-category-icon/BRIEF.md) | weapons-turrets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Point defense turret](assets/more-turrents-missiles-guns--point-defense-turret/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Point defense turret variant 1](assets/more-turrents-missiles-guns--point-defense-turret-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Point defense turret variant 2](assets/more-turrents-missiles-guns--point-defense-turret-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Point defense turret variant 3](assets/more-turrents-missiles-guns--point-defense-turret-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Point defense turret variant 4](assets/more-turrents-missiles-guns--point-defense-turret-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.point-defense](designs/pale-studless.turret.point-defense/DESIGN.md) |
| [Compact laser turret](assets/more-turrents-missiles-guns--compact-laser-turret/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Compact laser turret variant 1](assets/more-turrents-missiles-guns--compact-laser-turret-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Compact laser turret variant 2](assets/more-turrents-missiles-guns--compact-laser-turret-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Compact laser turret variant 3](assets/more-turrents-missiles-guns--compact-laser-turret-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Compact laser turret variant 4](assets/more-turrents-missiles-guns--compact-laser-turret-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Twin autocannon](assets/more-turrents-missiles-guns--twin-autocannon/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Twin autocannon variant 1](assets/more-turrents-missiles-guns--twin-autocannon-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Twin autocannon variant 2](assets/more-turrents-missiles-guns--twin-autocannon-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Twin autocannon variant 3](assets/more-turrents-missiles-guns--twin-autocannon-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Twin autocannon variant 4](assets/more-turrents-missiles-guns--twin-autocannon-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Plasma turret](assets/more-turrents-missiles-guns--plasma-turret/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.plasma](designs/pale-studless.turret.plasma/DESIGN.md) |
| [Plasma turret variant 1](assets/more-turrents-missiles-guns--plasma-turret-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.plasma](designs/pale-studless.turret.plasma/DESIGN.md) |
| [Plasma turret variant 2](assets/more-turrents-missiles-guns--plasma-turret-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.plasma](designs/pale-studless.turret.plasma/DESIGN.md) |
| [Plasma turret variant 3](assets/more-turrents-missiles-guns--plasma-turret-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.plasma](designs/pale-studless.turret.plasma/DESIGN.md) |
| [Plasma turret variant 4](assets/more-turrents-missiles-guns--plasma-turret-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.plasma](designs/pale-studless.turret.plasma/DESIGN.md) |
| [Railgun mount](assets/more-turrents-missiles-guns--railgun-mount/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Railgun mount variant 1](assets/more-turrents-missiles-guns--railgun-mount-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Railgun mount variant 2](assets/more-turrents-missiles-guns--railgun-mount-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Railgun mount variant 3](assets/more-turrents-missiles-guns--railgun-mount-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Railgun mount variant 4](assets/more-turrents-missiles-guns--railgun-mount-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.railgun](designs/pale-studless.turret.railgun/DESIGN.md) |
| [Flak cannon](assets/more-turrents-missiles-guns--flak-cannon/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) |
| [Flak cannon variant 1](assets/more-turrents-missiles-guns--flak-cannon-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) |
| [Flak cannon variant 2](assets/more-turrents-missiles-guns--flak-cannon-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) |
| [Flak cannon variant 3](assets/more-turrents-missiles-guns--flak-cannon-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) |
| [Flak cannon variant 4](assets/more-turrents-missiles-guns--flak-cannon-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.flak](designs/pale-studless.turret.flak/DESIGN.md) |
| [Gauss cannon](assets/more-turrents-missiles-guns--gauss-cannon/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.gauss](designs/pale-studless.turret.gauss/DESIGN.md) |
| [Gauss cannon variant 1](assets/more-turrents-missiles-guns--gauss-cannon-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.gauss](designs/pale-studless.turret.gauss/DESIGN.md) |
| [Gauss cannon variant 2](assets/more-turrents-missiles-guns--gauss-cannon-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.gauss](designs/pale-studless.turret.gauss/DESIGN.md) |
| [Gauss cannon variant 3](assets/more-turrents-missiles-guns--gauss-cannon-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.gauss](designs/pale-studless.turret.gauss/DESIGN.md) |
| [Gauss cannon variant 4](assets/more-turrents-missiles-guns--gauss-cannon-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.gauss](designs/pale-studless.turret.gauss/DESIGN.md) |
| [Ion blaster](assets/more-turrents-missiles-guns--ion-blaster/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.ion](designs/pale-studless.turret.ion/DESIGN.md) |
| [Ion blaster variant 1](assets/more-turrents-missiles-guns--ion-blaster-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.ion](designs/pale-studless.turret.ion/DESIGN.md) |
| [Ion blaster variant 2](assets/more-turrents-missiles-guns--ion-blaster-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.ion](designs/pale-studless.turret.ion/DESIGN.md) |
| [Ion blaster variant 3](assets/more-turrents-missiles-guns--ion-blaster-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.ion](designs/pale-studless.turret.ion/DESIGN.md) |
| [Ion blaster variant 4](assets/more-turrents-missiles-guns--ion-blaster-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.ion](designs/pale-studless.turret.ion/DESIGN.md) |
| [Pulse beam emitter](assets/more-turrents-missiles-guns--pulse-beam-emitter/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.pulse-beam](designs/pale-studless.turret.pulse-beam/DESIGN.md) |
| [Pulse beam emitter variant 1](assets/more-turrents-missiles-guns--pulse-beam-emitter-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.pulse-beam](designs/pale-studless.turret.pulse-beam/DESIGN.md) |
| [Pulse beam emitter variant 2](assets/more-turrents-missiles-guns--pulse-beam-emitter-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.pulse-beam](designs/pale-studless.turret.pulse-beam/DESIGN.md) |
| [Pulse beam emitter variant 3](assets/more-turrents-missiles-guns--pulse-beam-emitter-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.pulse-beam](designs/pale-studless.turret.pulse-beam/DESIGN.md) |
| [Pulse beam emitter variant 4](assets/more-turrents-missiles-guns--pulse-beam-emitter-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.pulse-beam](designs/pale-studless.turret.pulse-beam/DESIGN.md) |
| [Missile pod](assets/more-turrents-missiles-guns--missile-pod/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Missile pod variant 1](assets/more-turrents-missiles-guns--missile-pod-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Missile pod variant 2](assets/more-turrents-missiles-guns--missile-pod-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Missile pod variant 3](assets/more-turrents-missiles-guns--missile-pod-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Missile pod variant 4](assets/more-turrents-missiles-guns--missile-pod-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.missile](designs/pale-studless.turret.missile/DESIGN.md) |
| [Torpedo launcher](assets/more-turrents-missiles-guns--torpedo-launcher/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.torpedo](designs/pale-studless.turret.torpedo/DESIGN.md) |
| [Torpedo launcher variant 1](assets/more-turrents-missiles-guns--torpedo-launcher-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.torpedo](designs/pale-studless.turret.torpedo/DESIGN.md) |
| [Torpedo launcher variant 2](assets/more-turrents-missiles-guns--torpedo-launcher-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.torpedo](designs/pale-studless.turret.torpedo/DESIGN.md) |
| [Torpedo launcher variant 3](assets/more-turrents-missiles-guns--torpedo-launcher-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.torpedo](designs/pale-studless.turret.torpedo/DESIGN.md) |
| [Torpedo launcher variant 4](assets/more-turrents-missiles-guns--torpedo-launcher-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.torpedo](designs/pale-studless.turret.torpedo/DESIGN.md) |
| [Swarm rocket rack](assets/more-turrents-missiles-guns--swarm-rocket-rack/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.rocket](designs/pale-studless.turret.rocket/DESIGN.md) |
| [Swarm rocket rack variant 1](assets/more-turrents-missiles-guns--swarm-rocket-rack-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.rocket](designs/pale-studless.turret.rocket/DESIGN.md) |
| [Swarm rocket rack variant 2](assets/more-turrents-missiles-guns--swarm-rocket-rack-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.rocket](designs/pale-studless.turret.rocket/DESIGN.md) |
| [Swarm rocket rack variant 3](assets/more-turrents-missiles-guns--swarm-rocket-rack-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.rocket](designs/pale-studless.turret.rocket/DESIGN.md) |
| [Swarm rocket rack variant 4](assets/more-turrents-missiles-guns--swarm-rocket-rack-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.rocket](designs/pale-studless.turret.rocket/DESIGN.md) |
| [Breaching charge pod](assets/more-turrents-missiles-guns--breaching-charge-pod/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.breaching](designs/pale-studless.turret.breaching/DESIGN.md) |
| [Breaching charge pod variant 1](assets/more-turrents-missiles-guns--breaching-charge-pod-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.breaching](designs/pale-studless.turret.breaching/DESIGN.md) |
| [Breaching charge pod variant 2](assets/more-turrents-missiles-guns--breaching-charge-pod-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.breaching](designs/pale-studless.turret.breaching/DESIGN.md) |
| [Breaching charge pod variant 3](assets/more-turrents-missiles-guns--breaching-charge-pod-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.breaching](designs/pale-studless.turret.breaching/DESIGN.md) |
| [Breaching charge pod variant 4](assets/more-turrents-missiles-guns--breaching-charge-pod-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.breaching](designs/pale-studless.turret.breaching/DESIGN.md) |
| [Mine layer](assets/more-turrents-missiles-guns--mine-layer/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.mine](designs/pale-studless.turret.mine/DESIGN.md) |
| [Mine layer variant 1](assets/more-turrents-missiles-guns--mine-layer-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.mine](designs/pale-studless.turret.mine/DESIGN.md) |
| [Mine layer variant 2](assets/more-turrents-missiles-guns--mine-layer-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.mine](designs/pale-studless.turret.mine/DESIGN.md) |
| [Mine layer variant 3](assets/more-turrents-missiles-guns--mine-layer-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.mine](designs/pale-studless.turret.mine/DESIGN.md) |
| [Mine layer variant 4](assets/more-turrents-missiles-guns--mine-layer-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.mine](designs/pale-studless.turret.mine/DESIGN.md) |
| [Bomb canister](assets/more-turrents-missiles-guns--bomb-canister/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Bomb canister variant 1](assets/more-turrents-missiles-guns--bomb-canister-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Bomb canister variant 2](assets/more-turrents-missiles-guns--bomb-canister-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Bomb canister variant 3](assets/more-turrents-missiles-guns--bomb-canister-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Bomb canister variant 4](assets/more-turrents-missiles-guns--bomb-canister-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Drone launcher](assets/more-turrents-missiles-guns--drone-launcher/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.drone](designs/pale-studless.turret.drone/DESIGN.md) |
| [Drone launcher variant 1](assets/more-turrents-missiles-guns--drone-launcher-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.drone](designs/pale-studless.turret.drone/DESIGN.md) |
| [Drone launcher variant 2](assets/more-turrents-missiles-guns--drone-launcher-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.drone](designs/pale-studless.turret.drone/DESIGN.md) |
| [Drone launcher variant 3](assets/more-turrents-missiles-guns--drone-launcher-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.drone](designs/pale-studless.turret.drone/DESIGN.md) |
| [Drone launcher variant 4](assets/more-turrents-missiles-guns--drone-launcher-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | weapon | [pale-studless.turret.drone](designs/pale-studless.turret.drone/DESIGN.md) |
| [PD barrel](assets/more-turrents-missiles-guns--pd-barrel/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [PD rotation piece](assets/more-turrents-missiles-guns--pd-rotation-piece/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [PD power core](assets/more-turrents-missiles-guns--pd-power-core/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser emitter](assets/more-turrents-missiles-guns--laser-emitter/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser gimbal](assets/more-turrents-missiles-guns--laser-gimbal/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Laser base plate](assets/more-turrents-missiles-guns--laser-base-plate/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Gauss accelerator](assets/more-turrents-missiles-guns--gauss-accelerator/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Gauss barrel](assets/more-turrents-missiles-guns--gauss-barrel/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ion focus lens](assets/more-turrents-missiles-guns--ion-focus-lens/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ion barrel](assets/more-turrents-missiles-guns--ion-barrel/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ion power unit](assets/more-turrents-missiles-guns--ion-power-unit/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Torpedo loading mechanism](assets/more-turrents-missiles-guns--torpedo-loading-mechanism/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Rocket fire control](assets/more-turrents-missiles-guns--rocket-fire-control/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Breaching clamp](assets/more-turrents-missiles-guns--breaching-clamp/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Breaching arming unit](assets/more-turrents-missiles-guns--breaching-arming-unit/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Drone feed controller](assets/more-turrents-missiles-guns--drone-feed-controller/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Interceptor](assets/more-turrents-missiles-guns--interceptor/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.interceptor](designs/pale-studless.ordnance.interceptor/DESIGN.md) |
| [Guided missile](assets/more-turrents-missiles-guns--guided-missile/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.guided](designs/pale-studless.ordnance.guided/DESIGN.md) |
| [Guided missile compact](assets/more-turrents-missiles-guns--guided-missile-compact/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.guided](designs/pale-studless.ordnance.guided/DESIGN.md) |
| [Heavy torpedo](assets/more-turrents-missiles-guns--heavy-torpedo/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.heavy-torpedo](designs/pale-studless.ordnance.heavy-torpedo/DESIGN.md) |
| [Heavy torpedo compact](assets/more-turrents-missiles-guns--heavy-torpedo-compact/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.heavy-torpedo](designs/pale-studless.ordnance.heavy-torpedo/DESIGN.md) |
| [Cluster missile](assets/more-turrents-missiles-guns--cluster-missile/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.cluster](designs/pale-studless.ordnance.cluster/DESIGN.md) |
| [Cluster missile compact](assets/more-turrents-missiles-guns--cluster-missile-compact/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.cluster](designs/pale-studless.ordnance.cluster/DESIGN.md) |
| [EMP missile](assets/more-turrents-missiles-guns--emp-missile/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.emp](designs/pale-studless.ordnance.emp/DESIGN.md) |
| [EMP missile orange](assets/more-turrents-missiles-guns--emp-missile-orange/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.emp](designs/pale-studless.ordnance.emp/DESIGN.md) |
| [Incendiary rocket](assets/more-turrents-missiles-guns--incendiary-rocket/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.incendiary](designs/pale-studless.ordnance.incendiary/DESIGN.md) |
| [Incendiary rocket white](assets/more-turrents-missiles-guns--incendiary-rocket-white/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.incendiary](designs/pale-studless.ordnance.incendiary/DESIGN.md) |
| [Kinetic slug](assets/more-turrents-missiles-guns--kinetic-slug/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.kinetic](designs/pale-studless.ordnance.kinetic/DESIGN.md) |
| [Kinetic slug pale](assets/more-turrents-missiles-guns--kinetic-slug-pale/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.kinetic](designs/pale-studless.ordnance.kinetic/DESIGN.md) |
| [Plasma charge violet](assets/more-turrents-missiles-guns--plasma-charge-violet/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.plasma](designs/pale-studless.ordnance.plasma/DESIGN.md) |
| [Plasma charge blue](assets/more-turrents-missiles-guns--plasma-charge-blue/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.plasma](designs/pale-studless.ordnance.plasma/DESIGN.md) |
| [Proximity mine red](assets/more-turrents-missiles-guns--proximity-mine-red/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.proximity](designs/pale-studless.ordnance.proximity/DESIGN.md) |
| [Proximity mine dark](assets/more-turrents-missiles-guns--proximity-mine-dark/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.proximity](designs/pale-studless.ordnance.proximity/DESIGN.md) |
| [Payload variant 1](assets/more-turrents-missiles-guns--payload-variant-1/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 2](assets/more-turrents-missiles-guns--payload-variant-2/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 3](assets/more-turrents-missiles-guns--payload-variant-3/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 4](assets/more-turrents-missiles-guns--payload-variant-4/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 5](assets/more-turrents-missiles-guns--payload-variant-5/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 6](assets/more-turrents-missiles-guns--payload-variant-6/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 7](assets/more-turrents-missiles-guns--payload-variant-7/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 8](assets/more-turrents-missiles-guns--payload-variant-8/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 9](assets/more-turrents-missiles-guns--payload-variant-9/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 10](assets/more-turrents-missiles-guns--payload-variant-10/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 11](assets/more-turrents-missiles-guns--payload-variant-11/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 12](assets/more-turrents-missiles-guns--payload-variant-12/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 13](assets/more-turrents-missiles-guns--payload-variant-13/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Payload variant 14](assets/more-turrents-missiles-guns--payload-variant-14/BRIEF.md) | more-turrents-missiles-guns.png | ordnance | [pale-studless.ordnance.payload](designs/pale-studless.ordnance.payload/DESIGN.md) |
| [Weapon mount Small](assets/more-turrents-missiles-guns--weapon-mount-small/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Weapon mount Medium](assets/more-turrents-missiles-guns--weapon-mount-medium/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Weapon mount Large](assets/more-turrents-missiles-guns--weapon-mount-large/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Weapon mount Fixed](assets/more-turrents-missiles-guns--weapon-mount-fixed/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Weapon mount Gimbal](assets/more-turrents-missiles-guns--weapon-mount-gimbal/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Weapon mount Heavy](assets/more-turrents-missiles-guns--weapon-mount-heavy/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Barrel emitter Ballistic](assets/more-turrents-missiles-guns--barrel-emitter-ballistic/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Barrel emitter Laser](assets/more-turrents-missiles-guns--barrel-emitter-laser/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Barrel emitter Plasma](assets/more-turrents-missiles-guns--barrel-emitter-plasma/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Barrel emitter Gauss](assets/more-turrents-missiles-guns--barrel-emitter-gauss/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Barrel emitter Ion](assets/more-turrents-missiles-guns--barrel-emitter-ion/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Barrel emitter Beam](assets/more-turrents-missiles-guns--barrel-emitter-beam/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile tube Single long](assets/more-turrents-missiles-guns--missile-tube-single-long/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile tube Single box](assets/more-turrents-missiles-guns--missile-tube-single-box/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile tube Twin](assets/more-turrents-missiles-guns--missile-tube-twin/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile tube Quad](assets/more-turrents-missiles-guns--missile-tube-quad/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile tube Hex](assets/more-turrents-missiles-guns--missile-tube-hex/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile tube Pod](assets/more-turrents-missiles-guns--missile-tube-pod/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ammo energy Ammo drum](assets/more-turrents-missiles-guns--ammo-energy-ammo-drum/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ammo energy Missile magazine](assets/more-turrents-missiles-guns--ammo-energy-missile-magazine/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ammo energy Energy cell](assets/more-turrents-missiles-guns--ammo-energy-energy-cell/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ammo energy Fuel pod](assets/more-turrents-missiles-guns--ammo-energy-fuel-pod/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ammo energy Compact drum](assets/more-turrents-missiles-guns--ammo-energy-compact-drum/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ammo energy Energy pack](assets/more-turrents-missiles-guns--ammo-energy-energy-pack/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Support module Cooling unit](assets/more-turrents-missiles-guns--support-module-cooling-unit/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Support module Recoil block](assets/more-turrents-missiles-guns--support-module-recoil-block/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Support module Targeting pod](assets/more-turrents-missiles-guns--support-module-targeting-pod/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Support module Control unit](assets/more-turrents-missiles-guns--support-module-control-unit/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Support module Power pack](assets/more-turrents-missiles-guns--support-module-power-pack/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Support module Heavy cooler](assets/more-turrents-missiles-guns--support-module-heavy-cooler/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Mount adapter Small plate](assets/more-turrents-missiles-guns--mount-adapter-small-plate/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Mount adapter Medium plate](assets/more-turrents-missiles-guns--mount-adapter-medium-plate/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Mount adapter Extension](assets/more-turrents-missiles-guns--mount-adapter-extension/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Mount adapter Angle bracket](assets/more-turrents-missiles-guns--mount-adapter-angle-bracket/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Mount adapter Heavy plate](assets/more-turrents-missiles-guns--mount-adapter-heavy-plate/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Mount adapter Ring](assets/more-turrents-missiles-guns--mount-adapter-ring/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ballistic icon](assets/more-turrents-missiles-guns--ballistic-icon/BRIEF.md) | more-turrents-missiles-guns.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Energy weapon icon](assets/more-turrents-missiles-guns--energy-weapon-icon/BRIEF.md) | more-turrents-missiles-guns.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Missile icon](assets/more-turrents-missiles-guns--missile-icon/BRIEF.md) | more-turrents-missiles-guns.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Utility weapon icon](assets/more-turrents-missiles-guns--utility-weapon-icon/BRIEF.md) | more-turrents-missiles-guns.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Anti-fighter icon](assets/more-turrents-missiles-guns--anti-fighter-icon/BRIEF.md) | more-turrents-missiles-guns.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Muzzle flash Small](assets/effects-and-weapon-firing--muzzle-flash-small/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.muzzle-flash](designs/vfx.muzzle-flash/DESIGN.md) |
| [Muzzle flash Medium](assets/effects-and-weapon-firing--muzzle-flash-medium/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.muzzle-flash](designs/vfx.muzzle-flash/DESIGN.md) |
| [Muzzle flash Large](assets/effects-and-weapon-firing--muzzle-flash-large/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.muzzle-flash](designs/vfx.muzzle-flash/DESIGN.md) |
| [Tracer round Standard](assets/effects-and-weapon-firing--tracer-round-standard/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.tracer-round](designs/vfx.tracer-round/DESIGN.md) |
| [Tracer round Heavy](assets/effects-and-weapon-firing--tracer-round-heavy/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.tracer-round](designs/vfx.tracer-round/DESIGN.md) |
| [Tracer round AP](assets/effects-and-weapon-firing--tracer-round-ap/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.tracer-round](designs/vfx.tracer-round/DESIGN.md) |
| [Tracer round Incendiary](assets/effects-and-weapon-firing--tracer-round-incendiary/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.tracer-round](designs/vfx.tracer-round/DESIGN.md) |
| [Tracer round Plasma](assets/effects-and-weapon-firing--tracer-round-plasma/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.tracer-round](designs/vfx.tracer-round/DESIGN.md) |
| [Laser bolt Red](assets/effects-and-weapon-firing--laser-bolt-red/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.laser-bolt](designs/vfx.laser-bolt/DESIGN.md) |
| [Laser bolt Blue](assets/effects-and-weapon-firing--laser-bolt-blue/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.laser-bolt](designs/vfx.laser-bolt/DESIGN.md) |
| [Laser bolt Green](assets/effects-and-weapon-firing--laser-bolt-green/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.laser-bolt](designs/vfx.laser-bolt/DESIGN.md) |
| [Laser bolt Purple](assets/effects-and-weapon-firing--laser-bolt-purple/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.laser-bolt](designs/vfx.laser-bolt/DESIGN.md) |
| [Plasma bolt Standard](assets/effects-and-weapon-firing--plasma-bolt-standard/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.plasma-bolt](designs/vfx.plasma-bolt/DESIGN.md) |
| [Plasma bolt Charged](assets/effects-and-weapon-firing--plasma-bolt-charged/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.plasma-bolt](designs/vfx.plasma-bolt/DESIGN.md) |
| [Plasma bolt Split](assets/effects-and-weapon-firing--plasma-bolt-split/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.plasma-bolt](designs/vfx.plasma-bolt/DESIGN.md) |
| [Plasma bolt Corrupted](assets/effects-and-weapon-firing--plasma-bolt-corrupted/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.plasma-bolt](designs/vfx.plasma-bolt/DESIGN.md) |
| [Beam lance Standard](assets/effects-and-weapon-firing--beam-lance-standard/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.beam-lance](designs/vfx.beam-lance/DESIGN.md) |
| [Beam lance Heavy](assets/effects-and-weapon-firing--beam-lance-heavy/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.beam-lance](designs/vfx.beam-lance/DESIGN.md) |
| [Beam lance Focused](assets/effects-and-weapon-firing--beam-lance-focused/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.beam-lance](designs/vfx.beam-lance/DESIGN.md) |
| [Ion arc Short](assets/effects-and-weapon-firing--ion-arc-short/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.ion-arc](designs/vfx.ion-arc/DESIGN.md) |
| [Ion arc Medium](assets/effects-and-weapon-firing--ion-arc-medium/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.ion-arc](designs/vfx.ion-arc/DESIGN.md) |
| [Ion arc Large](assets/effects-and-weapon-firing--ion-arc-large/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.ion-arc](designs/vfx.ion-arc/DESIGN.md) |
| [Missile trail Standard](assets/effects-and-weapon-firing--missile-trail-standard/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.missile-trail](designs/vfx.missile-trail/DESIGN.md) |
| [Missile trail Heavy](assets/effects-and-weapon-firing--missile-trail-heavy/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.missile-trail](designs/vfx.missile-trail/DESIGN.md) |
| [Missile trail Cluster](assets/effects-and-weapon-firing--missile-trail-cluster/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.missile-trail](designs/vfx.missile-trail/DESIGN.md) |
| [Missile trail Swarm](assets/effects-and-weapon-firing--missile-trail-swarm/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.missile-trail](designs/vfx.missile-trail/DESIGN.md) |
| [Smoke trail Light](assets/effects-and-weapon-firing--smoke-trail-light/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.smoke-trail](designs/vfx.smoke-trail/DESIGN.md) |
| [Smoke trail Medium](assets/effects-and-weapon-firing--smoke-trail-medium/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.smoke-trail](designs/vfx.smoke-trail/DESIGN.md) |
| [Smoke trail Heavy](assets/effects-and-weapon-firing--smoke-trail-heavy/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.smoke-trail](designs/vfx.smoke-trail/DESIGN.md) |
| [Smoke trail Burning](assets/effects-and-weapon-firing--smoke-trail-burning/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.smoke-trail](designs/vfx.smoke-trail/DESIGN.md) |
| [Contrail Standard](assets/effects-and-weapon-firing--contrail-standard/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.contrail](designs/vfx.contrail/DESIGN.md) |
| [Contrail Afterburn](assets/effects-and-weapon-firing--contrail-afterburn/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.contrail](designs/vfx.contrail/DESIGN.md) |
| [Contrail Ion](assets/effects-and-weapon-firing--contrail-ion/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.contrail](designs/vfx.contrail/DESIGN.md) |
| [Contrail Maneuver](assets/effects-and-weapon-firing--contrail-maneuver/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.contrail](designs/vfx.contrail/DESIGN.md) |
| [Thruster glow Idle](assets/effects-and-weapon-firing--thruster-glow-idle/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.thruster-glow](designs/vfx.thruster-glow/DESIGN.md) |
| [Thruster glow Cruise](assets/effects-and-weapon-firing--thruster-glow-cruise/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.thruster-glow](designs/vfx.thruster-glow/DESIGN.md) |
| [Thruster glow Boost](assets/effects-and-weapon-firing--thruster-glow-boost/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.thruster-glow](designs/vfx.thruster-glow/DESIGN.md) |
| [Thruster glow Warp](assets/effects-and-weapon-firing--thruster-glow-warp/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.thruster-glow](designs/vfx.thruster-glow/DESIGN.md) |
| [Small explosion A](assets/effects-and-weapon-firing--small-explosion-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.small-explosion](designs/vfx.small-explosion/DESIGN.md) |
| [Small explosion B](assets/effects-and-weapon-firing--small-explosion-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.small-explosion](designs/vfx.small-explosion/DESIGN.md) |
| [Small explosion C](assets/effects-and-weapon-firing--small-explosion-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.small-explosion](designs/vfx.small-explosion/DESIGN.md) |
| [Small explosion D](assets/effects-and-weapon-firing--small-explosion-d/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.small-explosion](designs/vfx.small-explosion/DESIGN.md) |
| [Medium explosion A](assets/effects-and-weapon-firing--medium-explosion-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.medium-explosion](designs/vfx.medium-explosion/DESIGN.md) |
| [Medium explosion B](assets/effects-and-weapon-firing--medium-explosion-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.medium-explosion](designs/vfx.medium-explosion/DESIGN.md) |
| [Medium explosion C](assets/effects-and-weapon-firing--medium-explosion-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.medium-explosion](designs/vfx.medium-explosion/DESIGN.md) |
| [Medium explosion D](assets/effects-and-weapon-firing--medium-explosion-d/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.medium-explosion](designs/vfx.medium-explosion/DESIGN.md) |
| [Large explosion A](assets/effects-and-weapon-firing--large-explosion-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.large-explosion](designs/vfx.large-explosion/DESIGN.md) |
| [Large explosion B](assets/effects-and-weapon-firing--large-explosion-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.large-explosion](designs/vfx.large-explosion/DESIGN.md) |
| [Large explosion C](assets/effects-and-weapon-firing--large-explosion-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.large-explosion](designs/vfx.large-explosion/DESIGN.md) |
| [Fiery blast A](assets/effects-and-weapon-firing--fiery-blast-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.fiery-blast](designs/vfx.fiery-blast/DESIGN.md) |
| [Fiery blast B](assets/effects-and-weapon-firing--fiery-blast-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.fiery-blast](designs/vfx.fiery-blast/DESIGN.md) |
| [Fiery blast C](assets/effects-and-weapon-firing--fiery-blast-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.fiery-blast](designs/vfx.fiery-blast/DESIGN.md) |
| [Fiery blast D](assets/effects-and-weapon-firing--fiery-blast-d/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.fiery-blast](designs/vfx.fiery-blast/DESIGN.md) |
| [Plasma burst A](assets/effects-and-weapon-firing--plasma-burst-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.plasma-burst](designs/vfx.plasma-burst/DESIGN.md) |
| [Plasma burst B](assets/effects-and-weapon-firing--plasma-burst-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.plasma-burst](designs/vfx.plasma-burst/DESIGN.md) |
| [Plasma burst C](assets/effects-and-weapon-firing--plasma-burst-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.plasma-burst](designs/vfx.plasma-burst/DESIGN.md) |
| [EMP burst A](assets/effects-and-weapon-firing--emp-burst-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.emp-burst](designs/vfx.emp-burst/DESIGN.md) |
| [EMP burst B](assets/effects-and-weapon-firing--emp-burst-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.emp-burst](designs/vfx.emp-burst/DESIGN.md) |
| [EMP burst C](assets/effects-and-weapon-firing--emp-burst-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.emp-burst](designs/vfx.emp-burst/DESIGN.md) |
| [Shield hit splash A](assets/effects-and-weapon-firing--shield-hit-splash-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shield-hit-splash](designs/vfx.shield-hit-splash/DESIGN.md) |
| [Shield hit splash B](assets/effects-and-weapon-firing--shield-hit-splash-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shield-hit-splash](designs/vfx.shield-hit-splash/DESIGN.md) |
| [Shield hit splash C](assets/effects-and-weapon-firing--shield-hit-splash-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shield-hit-splash](designs/vfx.shield-hit-splash/DESIGN.md) |
| [Shield bubble impact A](assets/effects-and-weapon-firing--shield-bubble-impact-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shield-bubble-impact](designs/vfx.shield-bubble-impact/DESIGN.md) |
| [Shield bubble impact B](assets/effects-and-weapon-firing--shield-bubble-impact-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shield-bubble-impact](designs/vfx.shield-bubble-impact/DESIGN.md) |
| [Shield bubble impact C](assets/effects-and-weapon-firing--shield-bubble-impact-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shield-bubble-impact](designs/vfx.shield-bubble-impact/DESIGN.md) |
| [Armor spark hit A](assets/effects-and-weapon-firing--armor-spark-hit-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.armor-spark-hit](designs/vfx.armor-spark-hit/DESIGN.md) |
| [Armor spark hit B](assets/effects-and-weapon-firing--armor-spark-hit-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.armor-spark-hit](designs/vfx.armor-spark-hit/DESIGN.md) |
| [Armor spark hit C](assets/effects-and-weapon-firing--armor-spark-hit-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.armor-spark-hit](designs/vfx.armor-spark-hit/DESIGN.md) |
| [Ricochet spark A](assets/effects-and-weapon-firing--ricochet-spark-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.ricochet-spark](designs/vfx.ricochet-spark/DESIGN.md) |
| [Ricochet spark B](assets/effects-and-weapon-firing--ricochet-spark-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.ricochet-spark](designs/vfx.ricochet-spark/DESIGN.md) |
| [Ricochet spark C](assets/effects-and-weapon-firing--ricochet-spark-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.ricochet-spark](designs/vfx.ricochet-spark/DESIGN.md) |
| [Debris burst A](assets/effects-and-weapon-firing--debris-burst-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.debris-burst](designs/vfx.debris-burst/DESIGN.md) |
| [Debris burst B](assets/effects-and-weapon-firing--debris-burst-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.debris-burst](designs/vfx.debris-burst/DESIGN.md) |
| [Debris burst C](assets/effects-and-weapon-firing--debris-burst-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.debris-burst](designs/vfx.debris-burst/DESIGN.md) |
| [Shrapnel cloud A](assets/effects-and-weapon-firing--shrapnel-cloud-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shrapnel-cloud](designs/vfx.shrapnel-cloud/DESIGN.md) |
| [Shrapnel cloud B](assets/effects-and-weapon-firing--shrapnel-cloud-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shrapnel-cloud](designs/vfx.shrapnel-cloud/DESIGN.md) |
| [Shrapnel cloud C](assets/effects-and-weapon-firing--shrapnel-cloud-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.shrapnel-cloud](designs/vfx.shrapnel-cloud/DESIGN.md) |
| [Reactor vent flare Small](assets/effects-and-weapon-firing--reactor-vent-flare-small/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.reactor-vent-flare](designs/vfx.reactor-vent-flare/DESIGN.md) |
| [Reactor vent flare Medium](assets/effects-and-weapon-firing--reactor-vent-flare-medium/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.reactor-vent-flare](designs/vfx.reactor-vent-flare/DESIGN.md) |
| [Reactor vent flare Large](assets/effects-and-weapon-firing--reactor-vent-flare-large/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.reactor-vent-flare](designs/vfx.reactor-vent-flare/DESIGN.md) |
| [Tractor beam Active](assets/effects-and-weapon-firing--tractor-beam-active/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.tractor-beam](designs/vfx.tractor-beam/DESIGN.md) |
| [Scanning pulse Active](assets/effects-and-weapon-firing--scanning-pulse-active/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.scanning-pulse](designs/vfx.scanning-pulse/DESIGN.md) |
| [Repair sparks A](assets/effects-and-weapon-firing--repair-sparks-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.repair-sparks](designs/vfx.repair-sparks/DESIGN.md) |
| [Repair sparks B](assets/effects-and-weapon-firing--repair-sparks-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.repair-sparks](designs/vfx.repair-sparks/DESIGN.md) |
| [Healing beam Active](assets/effects-and-weapon-firing--healing-beam-active/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.healing-beam](designs/vfx.healing-beam/DESIGN.md) |
| [Pickup glow Green](assets/effects-and-weapon-firing--pickup-glow-green/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.pickup-glow](designs/vfx.pickup-glow/DESIGN.md) |
| [Pickup glow Blue](assets/effects-and-weapon-firing--pickup-glow-blue/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.pickup-glow](designs/vfx.pickup-glow/DESIGN.md) |
| [Pickup glow Purple](assets/effects-and-weapon-firing--pickup-glow-purple/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.pickup-glow](designs/vfx.pickup-glow/DESIGN.md) |
| [Pickup glow Gold](assets/effects-and-weapon-firing--pickup-glow-gold/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.pickup-glow](designs/vfx.pickup-glow/DESIGN.md) |
| [Warning beacon flash A](assets/effects-and-weapon-firing--warning-beacon-flash-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.warning-beacon-flash](designs/vfx.warning-beacon-flash/DESIGN.md) |
| [Warning beacon flash B](assets/effects-and-weapon-firing--warning-beacon-flash-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.warning-beacon-flash](designs/vfx.warning-beacon-flash/DESIGN.md) |
| [Warning beacon flash C](assets/effects-and-weapon-firing--warning-beacon-flash-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.warning-beacon-flash](designs/vfx.warning-beacon-flash/DESIGN.md) |
| [Warning beacon flash D](assets/effects-and-weapon-firing--warning-beacon-flash-d/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.warning-beacon-flash](designs/vfx.warning-beacon-flash/DESIGN.md) |
| [Teleport arrival A](assets/effects-and-weapon-firing--teleport-arrival-a/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.teleport-arrival](designs/vfx.teleport-arrival/DESIGN.md) |
| [Teleport arrival B](assets/effects-and-weapon-firing--teleport-arrival-b/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.teleport-arrival](designs/vfx.teleport-arrival/DESIGN.md) |
| [Teleport arrival C](assets/effects-and-weapon-firing--teleport-arrival-c/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.teleport-arrival](designs/vfx.teleport-arrival/DESIGN.md) |
| [Warp charge Ship charge](assets/effects-and-weapon-firing--warp-charge-ship-charge/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.warp-charge](designs/vfx.warp-charge/DESIGN.md) |
| [Warp charge Portal](assets/effects-and-weapon-firing--warp-charge-portal/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.warp-charge](designs/vfx.warp-charge/DESIGN.md) |
| [Destruction breakup Intact](assets/effects-and-weapon-firing--destruction-breakup-intact/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.destruction-breakup](designs/vfx.destruction-breakup/DESIGN.md) |
| [Destruction breakup Breaking](assets/effects-and-weapon-firing--destruction-breakup-breaking/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.destruction-breakup](designs/vfx.destruction-breakup/DESIGN.md) |
| [Destruction breakup Debris](assets/effects-and-weapon-firing--destruction-breakup-debris/BRIEF.md) | effects-and-weapon-firing.png | vfx | [vfx.destruction-breakup](designs/vfx.destruction-breakup/DESIGN.md) |
| [Damage FX icon](assets/effects-and-weapon-firing--damage-fx-icon/BRIEF.md) | effects-and-weapon-firing.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Energy FX icon](assets/effects-and-weapon-firing--energy-fx-icon/BRIEF.md) | effects-and-weapon-firing.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Shield FX icon](assets/effects-and-weapon-firing--shield-fx-icon/BRIEF.md) | effects-and-weapon-firing.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Utility FX icon](assets/effects-and-weapon-firing--utility-fx-icon/BRIEF.md) | effects-and-weapon-firing.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Environment FX icon](assets/effects-and-weapon-firing--environment-fx-icon/BRIEF.md) | effects-and-weapon-firing.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Large window frame](assets/ui-elements--large-window-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Medium window frame](assets/ui-elements--medium-window-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Small window frame](assets/ui-elements--small-window-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Minimal window frame](assets/ui-elements--minimal-window-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Standard panel frame](assets/ui-elements--standard-panel-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Glow panel frame](assets/ui-elements--glow-panel-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Card frame](assets/ui-elements--card-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Hover panel frame](assets/ui-elements--hover-panel-frame/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Information dialog](assets/ui-elements--information-dialog/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Success dialog](assets/ui-elements--success-dialog/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Warning dialog](assets/ui-elements--warning-dialog/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Error dialog](assets/ui-elements--error-dialog/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Window title bar](assets/ui-elements--window-title-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Settings title bar](assets/ui-elements--settings-title-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Section header](assets/ui-elements--section-header/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Breadcrumb navigation](assets/ui-elements--breadcrumb-navigation/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Primary tab strip](assets/ui-elements--primary-tab-strip/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Settings tab strip](assets/ui-elements--settings-tab-strip/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Fleet ship station segmented control](assets/ui-elements--fleet-ship-station-segmented-control/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Overview tab](assets/ui-elements--overview-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Crew tab](assets/ui-elements--crew-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Modules selected tab](assets/ui-elements--modules-selected-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Research tab](assets/ui-elements--research-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Map tab](assets/ui-elements--map-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [General selected tab](assets/ui-elements--general-selected-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Audio tab](assets/ui-elements--audio-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Video tab](assets/ui-elements--video-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Controls tab](assets/ui-elements--controls-tab/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Primary button](assets/ui-elements--primary-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Secondary button](assets/ui-elements--secondary-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Success button](assets/ui-elements--success-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Danger button](assets/ui-elements--danger-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Ghost settings button](assets/ui-elements--ghost-settings-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Ghost add button](assets/ui-elements--ghost-add-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Ghost delete button](assets/ui-elements--ghost-delete-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Compact settings button](assets/ui-elements--compact-settings-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Icon diamond button](assets/ui-elements--icon-diamond-button/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Icon download button](assets/ui-elements--icon-download-button/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Icon grid button](assets/ui-elements--icon-grid-button/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Launch button](assets/ui-elements--launch-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Text input](assets/ui-elements--text-input/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Search input](assets/ui-elements--search-input/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Password input](assets/ui-elements--password-input/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Select input](assets/ui-elements--select-input/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Combo box](assets/ui-elements--combo-box/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Unchecked checkbox](assets/ui-elements--unchecked-checkbox/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Checked checkbox](assets/ui-elements--checked-checkbox/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Disabled checkbox](assets/ui-elements--disabled-checkbox/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Radio option A](assets/ui-elements--radio-option-a/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Selected radio option B](assets/ui-elements--selected-radio-option-b/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Radio option C](assets/ui-elements--radio-option-c/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Disabled radio](assets/ui-elements--disabled-radio/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Off toggle](assets/ui-elements--off-toggle/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [On toggle](assets/ui-elements--on-toggle/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Disabled toggle](assets/ui-elements--disabled-toggle/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Wi-Fi toggle](assets/ui-elements--wi-fi-toggle/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Autosave toggle](assets/ui-elements--autosave-toggle/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Tutorial toggle](assets/ui-elements--tutorial-toggle/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Value slider](assets/ui-elements--value-slider/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Range slider](assets/ui-elements--range-slider/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Rotary knob](assets/ui-elements--rotary-knob/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [General progress bar](assets/ui-elements--general-progress-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Health progress bar](assets/ui-elements--health-progress-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Shield progress bar](assets/ui-elements--shield-progress-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Energy progress bar](assets/ui-elements--energy-progress-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Experience progress bar](assets/ui-elements--experience-progress-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Quantity stepper](assets/ui-elements--quantity-stepper/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Small quantity stepper](assets/ui-elements--small-quantity-stepper/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Gem counter](assets/ui-elements--gem-counter/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Document counter](assets/ui-elements--document-counter/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Credit counter](assets/ui-elements--credit-counter/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Cube counter](assets/ui-elements--cube-counter/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Shield notification badge](assets/ui-elements--shield-notification-badge/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Inventory counter](assets/ui-elements--inventory-counter/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Empty inventory slot](assets/ui-elements--empty-inventory-slot/BRIEF.md) | ui-elements.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Item inventory slot](assets/ui-elements--item-inventory-slot/BRIEF.md) | ui-elements.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Stack inventory slot](assets/ui-elements--stack-inventory-slot/BRIEF.md) | ui-elements.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Rare inventory slot](assets/ui-elements--rare-inventory-slot/BRIEF.md) | ui-elements.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Equipped inventory slot](assets/ui-elements--equipped-inventory-slot/BRIEF.md) | ui-elements.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Locked inventory slot](assets/ui-elements--locked-inventory-slot/BRIEF.md) | ui-elements.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [New chip](assets/ui-elements--new-chip/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Popular chip](assets/ui-elements--popular-chip/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Rare chip](assets/ui-elements--rare-chip/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Epic chip](assets/ui-elements--epic-chip/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Legendary chip](assets/ui-elements--legendary-chip/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Weapon tag](assets/ui-elements--weapon-tag/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Module tag](assets/ui-elements--module-tag/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Resource tag](assets/ui-elements--resource-tag/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Crew tag](assets/ui-elements--crew-tag/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Online status chip](assets/ui-elements--online-status-chip/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Offline status chip](assets/ui-elements--offline-status-chip/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Busy status chip](assets/ui-elements--busy-status-chip/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Mission status chip](assets/ui-elements--mission-status-chip/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Arrow scrollbar](assets/ui-elements--arrow-scrollbar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Track scrollbar](assets/ui-elements--track-scrollbar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Thumb scrollbar](assets/ui-elements--thumb-scrollbar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Icon scrollbar](assets/ui-elements--icon-scrollbar/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Horizontal scrollbar](assets/ui-elements--horizontal-scrollbar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Module list row](assets/ui-elements--module-list-row/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Crew list row](assets/ui-elements--crew-list-row/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Resource stack list row](assets/ui-elements--resource-stack-list-row/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Table column header](assets/ui-elements--table-column-header/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Online weapon table row](assets/ui-elements--online-weapon-table-row/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Offline shield table row](assets/ui-elements--offline-shield-table-row/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Online utility table row](assets/ui-elements--online-utility-table-row/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Maintenance table row](assets/ui-elements--maintenance-table-row/BRIEF.md) | ui-elements.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Tooltip](assets/ui-elements--tooltip/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Success toast](assets/ui-elements--success-toast/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Info toast](assets/ui-elements--info-toast/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Warning toast](assets/ui-elements--warning-toast/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Error toast](assets/ui-elements--error-toast/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Interact key hint](assets/ui-elements--interact-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Sprint key hint](assets/ui-elements--sprint-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Use key hint](assets/ui-elements--use-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Crouch key hint](assets/ui-elements--crouch-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Reload key hint](assets/ui-elements--reload-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Free look key hint](assets/ui-elements--free-look-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Map key hint](assets/ui-elements--map-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Menu key hint](assets/ui-elements--menu-key-hint/BRIEF.md) | ui-elements.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Loading arc](assets/ui-elements--loading-arc/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Percent spinner](assets/ui-elements--percent-spinner/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Dot spinner](assets/ui-elements--dot-spinner/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Loading progress strip](assets/ui-elements--loading-progress-strip/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Pagination bar](assets/ui-elements--pagination-bar/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Previous page](assets/ui-elements--previous-page/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Page one selected](assets/ui-elements--page-one-selected/BRIEF.md) | ui-elements.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Page two](assets/ui-elements--page-two/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Page three](assets/ui-elements--page-three/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Page four](assets/ui-elements--page-four/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Page five](assets/ui-elements--page-five/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Next page](assets/ui-elements--next-page/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Page dots](assets/ui-elements--page-dots/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Build step](assets/ui-elements--build-step/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Configure step](assets/ui-elements--configure-step/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Deploy step](assets/ui-elements--deploy-step/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Complete step](assets/ui-elements--complete-step/BRIEF.md) | ui-elements.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Circular minimap](assets/ui-elements--circular-minimap/BRIEF.md) | ui-elements.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Coordinate widget](assets/ui-elements--coordinate-widget/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Signal icon](assets/ui-elements--signal-icon/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Globe icon](assets/ui-elements--globe-icon/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Ship arc gauge](assets/ui-elements--ship-arc-gauge/BRIEF.md) | ui-elements.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Mission card composition](assets/ui-elements--mission-card-composition/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Inventory window composition](assets/ui-elements--inventory-window-composition/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Settings composition](assets/ui-elements--settings-composition/BRIEF.md) | ui-elements.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Ship status composition](assets/ui-elements--ship-status-composition/BRIEF.md) | ui-elements.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Mission landscape thumbnail](assets/ui-elements--mission-landscape-thumbnail/BRIEF.md) | ui-elements.png | environment | [environment.background](designs/environment.background/DESIGN.md) |
| [Mission accept button](assets/ui-elements--mission-accept-button/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Crystal inventory icon](assets/ui-elements--crystal-inventory-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Ice cargo icon](assets/ui-elements--ice-cargo-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Metal plate icon](assets/ui-elements--metal-plate-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Gold crate icon](assets/ui-elements--gold-crate-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Supply crate icon](assets/ui-elements--supply-crate-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Pale cargo icon](assets/ui-elements--pale-cargo-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hardpoint icon](assets/ui-elements--hardpoint-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Blue cargo icon](assets/ui-elements--blue-cargo-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Tech crate icon](assets/ui-elements--tech-crate-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Steel crate icon](assets/ui-elements--steel-crate-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Green crate icon](assets/ui-elements--green-crate-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Purple resource icon](assets/ui-elements--purple-resource-icon/BRIEF.md) | ui-elements.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Ship modules shortcut](assets/ui-elements--ship-modules-shortcut/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Crew shortcut](assets/ui-elements--crew-shortcut/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Cargo shortcut](assets/ui-elements--cargo-shortcut/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Map shortcut](assets/ui-elements--map-shortcut/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Jump shortcut](assets/ui-elements--jump-shortcut/BRIEF.md) | ui-elements.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Small reticle](assets/ui-elements-2--small-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Medium reticle](assets/ui-elements-2--medium-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Heavy reticle](assets/ui-elements-2--heavy-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Sniper reticle](assets/ui-elements-2--sniper-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Spread reticle](assets/ui-elements-2--spread-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Beam-focus reticle](assets/ui-elements-2--beam-focus-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Missile-lock reticle](assets/ui-elements-2--missile-lock-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Scan reticle](assets/ui-elements-2--scan-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Mining box reticle](assets/ui-elements-2--mining-box-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Green cross reticle](assets/ui-elements-2--green-cross-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Repair reticle](assets/ui-elements-2--repair-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Support reticle](assets/ui-elements-2--support-reticle/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Enemy bracket](assets/ui-elements-2--enemy-bracket/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Friendly bracket](assets/ui-elements-2--friendly-bracket/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Neutral bracket](assets/ui-elements-2--neutral-bracket/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Objective bracket](assets/ui-elements-2--objective-bracket/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Boss target bracket](assets/ui-elements-2--boss-target-bracket/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Offscreen arrow](assets/ui-elements-2--offscreen-arrow/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Soft lock](assets/ui-elements-2--soft-lock/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Hard lock](assets/ui-elements-2--hard-lock/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Incoming missile marker](assets/ui-elements-2--incoming-missile-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Normal hit marker](assets/ui-elements-2--normal-hit-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Critical hit marker](assets/ui-elements-2--critical-hit-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Shield hit marker](assets/ui-elements-2--shield-hit-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Armor hit marker](assets/ui-elements-2--armor-hit-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Healing confirmation](assets/ui-elements-2--healing-confirmation/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [System disable marker](assets/ui-elements-2--system-disable-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Weak-point marker](assets/ui-elements-2--weak-point-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Target destroyed marker](assets/ui-elements-2--target-destroyed-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Objective waypoint](assets/ui-elements-2--objective-waypoint/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Mission marker](assets/ui-elements-2--mission-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Squad marker](assets/ui-elements-2--squad-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Cargo marker](assets/ui-elements-2--cargo-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Salvage marker](assets/ui-elements-2--salvage-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Docking marker](assets/ui-elements-2--docking-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Beacon marker](assets/ui-elements-2--beacon-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Home base marker](assets/ui-elements-2--home-base-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Distress marker](assets/ui-elements-2--distress-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Alert marker](assets/ui-elements-2--alert-marker/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Circular radar](assets/ui-elements-2--circular-radar/BRIEF.md) | ui-elements-2.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Cone scanner](assets/ui-elements-2--cone-scanner/BRIEF.md) | ui-elements-2.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Pulse scan overlay](assets/ui-elements-2--pulse-scan-overlay/BRIEF.md) | ui-elements-2.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Directional ping](assets/ui-elements-2--directional-ping/BRIEF.md) | ui-elements-2.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Threat radius](assets/ui-elements-2--threat-radius/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Detection cone](assets/ui-elements-2--detection-cone/BRIEF.md) | ui-elements-2.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Fog of war edge](assets/ui-elements-2--fog-of-war-edge/BRIEF.md) | ui-elements-2.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Resource scan](assets/ui-elements-2--resource-scan/BRIEF.md) | ui-elements-2.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Anomaly indicator](assets/ui-elements-2--anomaly-indicator/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Hull HUD bar](assets/ui-elements-2--hull-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Shield HUD bar](assets/ui-elements-2--shield-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Power HUD bar](assets/ui-elements-2--power-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Heat HUD bar](assets/ui-elements-2--heat-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Fuel HUD bar](assets/ui-elements-2--fuel-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Oxygen HUD bar](assets/ui-elements-2--oxygen-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Cargo HUD bar](assets/ui-elements-2--cargo-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [XP HUD bar](assets/ui-elements-2--xp-hud-bar/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Speed gauge](assets/ui-elements-2--speed-gauge/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Throttle gauge](assets/ui-elements-2--throttle-gauge/BRIEF.md) | ui-elements-2.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Ammo missile count widget](assets/ui-elements-2--ammo-missile-count-widget/BRIEF.md) | ui-elements-2.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Hull integrity arc](assets/ui-elements-2--hull-integrity-arc/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Credits counter](assets/ui-elements-2--credits-counter/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Fuel cells counter](assets/ui-elements-2--fuel-cells-counter/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Alloys counter](assets/ui-elements-2--alloys-counter/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Data counter](assets/ui-elements-2--data-counter/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Low health icon](assets/ui-elements-2--low-health-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Low shield icon](assets/ui-elements-2--low-shield-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Overheating icon](assets/ui-elements-2--overheating-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [No ammo icon](assets/ui-elements-2--no-ammo-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Jammed icon](assets/ui-elements-2--jammed-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [EMP icon](assets/ui-elements-2--emp-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Disabled engine icon](assets/ui-elements-2--disabled-engine-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Cargo full icon](assets/ui-elements-2--cargo-full-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Radiation icon](assets/ui-elements-2--radiation-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Toxic icon](assets/ui-elements-2--toxic-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Frozen icon](assets/ui-elements-2--frozen-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [On fire icon](assets/ui-elements-2--on-fire-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Hacking icon](assets/ui-elements-2--hacking-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Stealth active icon](assets/ui-elements-2--stealth-active-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Scan complete icon](assets/ui-elements-2--scan-complete-icon/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Target information panel](assets/ui-elements-2--target-information-panel/BRIEF.md) | ui-elements-2.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Target ship portrait](assets/ui-elements-2--target-ship-portrait/BRIEF.md) | ui-elements-2.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Target subsystem panel](assets/ui-elements-2--target-subsystem-panel/BRIEF.md) | ui-elements-2.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Lock progress panel](assets/ui-elements-2--lock-progress-panel/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Intercept vector panel](assets/ui-elements-2--intercept-vector-panel/BRIEF.md) | ui-elements-2.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Dogfight HUD composition](assets/ui-elements-2--dogfight-hud-composition/BRIEF.md) | ui-elements-2.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Target-lock HUD composition](assets/ui-elements-2--target-lock-hud-composition/BRIEF.md) | ui-elements-2.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Navigation HUD composition](assets/ui-elements-2--navigation-hud-composition/BRIEF.md) | ui-elements-2.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Shield ring](assets/ui-elements-2--shield-ring/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Selection circle](assets/ui-elements-2--selection-circle/BRIEF.md) | ui-elements-2.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Area of effect](assets/ui-elements-2--area-of-effect/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Danger zone](assets/ui-elements-2--danger-zone/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Tractor target overlay](assets/ui-elements-2--tractor-target-overlay/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Hacking hemisphere overlay](assets/ui-elements-2--hacking-hemisphere-overlay/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Repair overlay](assets/ui-elements-2--repair-overlay/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Healing pulse overlay](assets/ui-elements-2--healing-pulse-overlay/BRIEF.md) | ui-elements-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Inventory loot full composition](assets/ui-elements-3--inventory-loot-full-composition/BRIEF.md) | ui-elements-3.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Map tab](assets/ui-elements-3--map-tab/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Ship tab](assets/ui-elements-3--ship-tab/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Inventory tab](assets/ui-elements-3--inventory-tab/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Crafting tab](assets/ui-elements-3--crafting-tab/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Skills tab](assets/ui-elements-3--skills-tab/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Missions tab](assets/ui-elements-3--missions-tab/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Database tab](assets/ui-elements-3--database-tab/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [All items category](assets/ui-elements-3--all-items-category/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Weapons category](assets/ui-elements-3--weapons-category/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Modules category](assets/ui-elements-3--modules-category/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Resources category](assets/ui-elements-3--resources-category/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Consumables category](assets/ui-elements-3--consumables-category/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Components category](assets/ui-elements-3--components-category/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Quest category](assets/ui-elements-3--quest-category/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Inventory weight header](assets/ui-elements-3--inventory-weight-header/BRIEF.md) | ui-elements-3.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Inventory search](assets/ui-elements-3--inventory-search/BRIEF.md) | ui-elements-3.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Rarity sort selector](assets/ui-elements-3--rarity-sort-selector/BRIEF.md) | ui-elements-3.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Grid view toggle](assets/ui-elements-3--grid-view-toggle/BRIEF.md) | ui-elements-3.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [List view toggle](assets/ui-elements-3--list-view-toggle/BRIEF.md) | ui-elements-3.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Medkit](assets/ui-elements-3--medkit/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Purple crystal](assets/ui-elements-3--purple-crystal/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Iron ore](assets/ui-elements-3--iron-ore/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Gold crate](assets/ui-elements-3--gold-crate/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Pulse rifle](assets/ui-elements-3--pulse-rifle/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Blue canister](assets/ui-elements-3--blue-canister/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Circuit board](assets/ui-elements-3--circuit-board/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Pale container](assets/ui-elements-3--pale-container/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Power coupling](assets/ui-elements-3--power-coupling/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Blue crystal](assets/ui-elements-3--blue-crystal/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Red salvage crate](assets/ui-elements-3--red-salvage-crate/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Pistol](assets/ui-elements-3--pistol/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Long pistol](assets/ui-elements-3--long-pistol/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Power node](assets/ui-elements-3--power-node/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Gray container](assets/ui-elements-3--gray-container/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Orange battery](assets/ui-elements-3--orange-battery/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Cargo module](assets/ui-elements-3--cargo-module/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Blue cell](assets/ui-elements-3--blue-cell/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Reactor core](assets/ui-elements-3--reactor-core/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Small tech crate](assets/ui-elements-3--small-tech-crate/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Fuel can](assets/ui-elements-3--fuel-can/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Metal plate](assets/ui-elements-3--metal-plate/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Cable coil](assets/ui-elements-3--cable-coil/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Purple crystal stack](assets/ui-elements-3--purple-crystal-stack/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Dark power cube](assets/ui-elements-3--dark-power-cube/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Microprocessor](assets/ui-elements-3--microprocessor/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Small hardpoint](assets/ui-elements-3--small-hardpoint/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Green crate](assets/ui-elements-3--green-crate/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Engine cartridge](assets/ui-elements-3--engine-cartridge/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Red crystals](assets/ui-elements-3--red-crystals/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Data crate](assets/ui-elements-3--data-crate/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Metal plates](assets/ui-elements-3--metal-plates/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Empty slot 1](assets/ui-elements-3--empty-slot-1/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Empty slot 2](assets/ui-elements-3--empty-slot-2/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Empty slot 3](assets/ui-elements-3--empty-slot-3/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Empty slot 4](assets/ui-elements-3--empty-slot-4/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Empty slot 5](assets/ui-elements-3--empty-slot-5/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Empty slot 6](assets/ui-elements-3--empty-slot-6/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Empty slot 7](assets/ui-elements-3--empty-slot-7/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Empty slot 8](assets/ui-elements-3--empty-slot-8/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Pulse cannon tooltip](assets/ui-elements-3--pulse-cannon-tooltip/BRIEF.md) | ui-elements-3.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [HX-7 pulse cannon](assets/ui-elements-3--hx-7-pulse-cannon/BRIEF.md) | ui-elements-3.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Legendary rarity badge](assets/ui-elements-3--legendary-rarity-badge/BRIEF.md) | ui-elements-3.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Tooltip damage bar](assets/ui-elements-3--tooltip-damage-bar/BRIEF.md) | ui-elements-3.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Tooltip fire-rate bar](assets/ui-elements-3--tooltip-fire-rate-bar/BRIEF.md) | ui-elements-3.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Tooltip range bar](assets/ui-elements-3--tooltip-range-bar/BRIEF.md) | ui-elements-3.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Tooltip energy bar](assets/ui-elements-3--tooltip-energy-bar/BRIEF.md) | ui-elements-3.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Tooltip crit bar](assets/ui-elements-3--tooltip-crit-bar/BRIEF.md) | ui-elements-3.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Shield penetration affix](assets/ui-elements-3--shield-penetration-affix/BRIEF.md) | ui-elements-3.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Stabilized rounds affix](assets/ui-elements-3--stabilized-rounds-affix/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Tooltip mass and price](assets/ui-elements-3--tooltip-mass-and-price/BRIEF.md) | ui-elements-3.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Tooltip compare hint](assets/ui-elements-3--tooltip-compare-hint/BRIEF.md) | ui-elements-3.png | ui | [ui.feedback](designs/ui.feedback/DESIGN.md) |
| [Open salvage chest](assets/ui-elements-3--open-salvage-chest/BRIEF.md) | ui-elements-3.png | cargo | [pale-studless.crate.salvage](designs/pale-studless.crate.salvage/DESIGN.md) |
| [Loot pulse cannon](assets/ui-elements-3--loot-pulse-cannon/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Quantum core](assets/ui-elements-3--quantum-core/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Shield array](assets/ui-elements-3--shield-array/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Titanium ingots](assets/ui-elements-3--titanium-ingots/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Engine schematic](assets/ui-elements-3--engine-schematic/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Open crate button](assets/ui-elements-3--open-crate-button/BRIEF.md) | ui-elements-3.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Open ten button](assets/ui-elements-3--open-ten-button/BRIEF.md) | ui-elements-3.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Take all button](assets/ui-elements-3--take-all-button/BRIEF.md) | ui-elements-3.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Transfer inventory button](assets/ui-elements-3--transfer-inventory-button/BRIEF.md) | ui-elements-3.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Transfer cargo button](assets/ui-elements-3--transfer-cargo-button/BRIEF.md) | ui-elements-3.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Dismantle button](assets/ui-elements-3--dismantle-button/BRIEF.md) | ui-elements-3.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Wallet footer](assets/ui-elements-3--wallet-footer/BRIEF.md) | ui-elements-3.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Cargo capacity footer](assets/ui-elements-3--cargo-capacity-footer/BRIEF.md) | ui-elements-3.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Inventory mass footer](assets/ui-elements-3--inventory-mass-footer/BRIEF.md) | ui-elements-3.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Character HUD card](assets/ui-elements-3--character-hud-card/BRIEF.md) | ui-elements-3.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Character HUD portrait](assets/ui-elements-3--character-hud-portrait/BRIEF.md) | ui-elements-3.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Survival HUD panel](assets/ui-elements-3--survival-hud-panel/BRIEF.md) | ui-elements-3.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Hotbar pulse cannon](assets/ui-elements-3--hotbar-pulse-cannon/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar pistol](assets/ui-elements-3--hotbar-pistol/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar supply case](assets/ui-elements-3--hotbar-supply-case/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar medkit](assets/ui-elements-3--hotbar-medkit/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar energy cell](assets/ui-elements-3--hotbar-energy-cell/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar drone](assets/ui-elements-3--hotbar-drone/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar power coil](assets/ui-elements-3--hotbar-power-coil/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar core](assets/ui-elements-3--hotbar-core/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Hotbar crystals](assets/ui-elements-3--hotbar-crystals/BRIEF.md) | ui-elements-3.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Radar HUD](assets/ui-elements-3--radar-hud/BRIEF.md) | ui-elements-3.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Radar coordinates legend](assets/ui-elements-3--radar-coordinates-legend/BRIEF.md) | ui-elements-3.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Unopened loot badge](assets/ui-elements-3--unopened-loot-badge/BRIEF.md) | ui-elements-3.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Map navigation](assets/ui-elements-4--map-navigation/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Inventory navigation](assets/ui-elements-4--inventory-navigation/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Ship navigation](assets/ui-elements-4--ship-navigation/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Trading navigation](assets/ui-elements-4--trading-navigation/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Missions navigation](assets/ui-elements-4--missions-navigation/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Star chart navigation](assets/ui-elements-4--star-chart-navigation/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Codex navigation](assets/ui-elements-4--codex-navigation/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Station kiosk banner](assets/ui-elements-4--station-kiosk-banner/BRIEF.md) | ui-elements-4.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Trading kiosk environment](assets/ui-elements-4--trading-kiosk-environment/BRIEF.md) | ui-elements-4.png | environment | [environment.background](designs/environment.background/DESIGN.md) |
| [Vendor H-7 portrait](assets/ui-elements-4--vendor-h-7-portrait/BRIEF.md) | ui-elements-4.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Player trading identity](assets/ui-elements-4--player-trading-identity/BRIEF.md) | ui-elements-4.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Wallet balance](assets/ui-elements-4--wallet-balance/BRIEF.md) | ui-elements-4.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Faction reputation widget](assets/ui-elements-4--faction-reputation-widget/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Allied rank badge](assets/ui-elements-4--allied-rank-badge/BRIEF.md) | ui-elements-4.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Buy tab](assets/ui-elements-4--buy-tab/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Sell tab](assets/ui-elements-4--sell-tab/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Barter tab](assets/ui-elements-4--barter-tab/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Restock timer](assets/ui-elements-4--restock-timer/BRIEF.md) | ui-elements-4.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Vendor category selector](assets/ui-elements-4--vendor-category-selector/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [All goods category](assets/ui-elements-4--all-goods-category/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Weapons goods category](assets/ui-elements-4--weapons-goods-category/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Ship parts category](assets/ui-elements-4--ship-parts-category/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Resources goods category](assets/ui-elements-4--resources-goods-category/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Cargo goods category](assets/ui-elements-4--cargo-goods-category/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Medical goods category](assets/ui-elements-4--medical-goods-category/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Upgrades goods category](assets/ui-elements-4--upgrades-goods-category/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Vendor filter button](assets/ui-elements-4--vendor-filter-button/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [S-76 laser cannon](assets/ui-elements-4--s-76-laser-cannon/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Ion missile rack](assets/ui-elements-4--ion-missile-rack/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Plasma repeater](assets/ui-elements-4--plasma-repeater/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Deflector shield](assets/ui-elements-4--deflector-shield/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [FTL drive MK II](assets/ui-elements-4--ftl-drive-mk-ii/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Reactor core](assets/ui-elements-4--reactor-core/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Titanium ingots](assets/ui-elements-4--titanium-ingots/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Rare elements](assets/ui-elements-4--rare-elements/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Standard cargo crate](assets/ui-elements-4--standard-cargo-crate/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Premium cargo crate](assets/ui-elements-4--premium-cargo-crate/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Medkit](assets/ui-elements-4--medkit/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Crew medbay kit](assets/ui-elements-4--crew-medbay-kit/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Armor plating](assets/ui-elements-4--armor-plating/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Engine tuning kit](assets/ui-elements-4--engine-tuning-kit/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Weapon overclock](assets/ui-elements-4--weapon-overclock/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Shield booster](assets/ui-elements-4--shield-booster/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Laser cannon large preview](assets/ui-elements-4--laser-cannon-large-preview/BRIEF.md) | ui-elements-4.png | weapon | [pale-studless.turret.laser](designs/pale-studless.turret.laser/DESIGN.md) |
| [Item details panel](assets/ui-elements-4--item-details-panel/BRIEF.md) | ui-elements-4.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Autocannon comparison preview](assets/ui-elements-4--autocannon-comparison-preview/BRIEF.md) | ui-elements-4.png | weapon | [pale-studless.turret.autocannon](designs/pale-studless.turret.autocannon/DESIGN.md) |
| [Comparison stats panel](assets/ui-elements-4--comparison-stats-panel/BRIEF.md) | ui-elements-4.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Price label](assets/ui-elements-4--price-label/BRIEF.md) | ui-elements-4.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Purchase quantity stepper](assets/ui-elements-4--purchase-quantity-stepper/BRIEF.md) | ui-elements-4.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Buy purchase button](assets/ui-elements-4--buy-purchase-button/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Add to cart button](assets/ui-elements-4--add-to-cart-button/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Compare button](assets/ui-elements-4--compare-button/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Vendor inventory violet crystal](assets/ui-elements-4--vendor-inventory-violet-crystal/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory ice crate](assets/ui-elements-4--vendor-inventory-ice-crate/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory plate](assets/ui-elements-4--vendor-inventory-plate/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory gold crate](assets/ui-elements-4--vendor-inventory-gold-crate/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory bracket](assets/ui-elements-4--vendor-inventory-bracket/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory reinforced crate](assets/ui-elements-4--vendor-inventory-reinforced-crate/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory gray pod](assets/ui-elements-4--vendor-inventory-gray-pod/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory mount](assets/ui-elements-4--vendor-inventory-mount/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory blue module](assets/ui-elements-4--vendor-inventory-blue-module/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory green crate](assets/ui-elements-4--vendor-inventory-green-crate/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory medkit](assets/ui-elements-4--vendor-inventory-medkit/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory cylinder](assets/ui-elements-4--vendor-inventory-cylinder/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory purple bar](assets/ui-elements-4--vendor-inventory-purple-bar/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory red cell](assets/ui-elements-4--vendor-inventory-red-cell/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory blue cell](assets/ui-elements-4--vendor-inventory-blue-cell/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory ore](assets/ui-elements-4--vendor-inventory-ore/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory blue crystal](assets/ui-elements-4--vendor-inventory-blue-crystal/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory purple crystal stack](assets/ui-elements-4--vendor-inventory-purple-crystal-stack/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory chip](assets/ui-elements-4--vendor-inventory-chip/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Vendor inventory coil](assets/ui-elements-4--vendor-inventory-coil/BRIEF.md) | ui-elements-4.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Inventory category selector](assets/ui-elements-4--inventory-category-selector/BRIEF.md) | ui-elements-4.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Inventory price sort](assets/ui-elements-4--inventory-price-sort/BRIEF.md) | ui-elements-4.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Quick sell toggle](assets/ui-elements-4--quick-sell-toggle/BRIEF.md) | ui-elements-4.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Inventory help button](assets/ui-elements-4--inventory-help-button/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Transaction summary](assets/ui-elements-4--transaction-summary/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Weapon transaction row](assets/ui-elements-4--weapon-transaction-row/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Medkit transaction row](assets/ui-elements-4--medkit-transaction-row/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Titanium transaction row](assets/ui-elements-4--titanium-transaction-row/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Clear cart button](assets/ui-elements-4--clear-cart-button/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Confirm purchase button](assets/ui-elements-4--confirm-purchase-button/BRIEF.md) | ui-elements-4.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Map tab](assets/ui-elements-5--map-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Journal tab](assets/ui-elements-5--journal-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Character tab](assets/ui-elements-5--character-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Inventory tab](assets/ui-elements-5--inventory-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Ship tab](assets/ui-elements-5--ship-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Crafting tab](assets/ui-elements-5--crafting-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Missions tab](assets/ui-elements-5--missions-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Database tab](assets/ui-elements-5--database-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Crew portrait](assets/ui-elements-5--crew-portrait/BRIEF.md) | ui-elements-5.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Crew identity and level](assets/ui-elements-5--crew-identity-and-level/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Faction identity panel](assets/ui-elements-5--faction-identity-panel/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Character paper doll](assets/ui-elements-5--character-paper-doll/BRIEF.md) | ui-elements-5.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Explorer helmet slot](assets/ui-elements-5--explorer-helmet-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Pathfinder shoulders slot](assets/ui-elements-5--pathfinder-shoulders-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [AR-7 primary weapon slot](assets/ui-elements-5--ar-7-primary-weapon-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Tech gloves slot](assets/ui-elements-5--tech-gloves-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Explorer greaves slot](assets/ui-elements-5--explorer-greaves-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Recon visor slot](assets/ui-elements-5--recon-visor-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Orion chest plate slot](assets/ui-elements-5--orion-chest-plate-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Expedition backpack slot](assets/ui-elements-5--expedition-backpack-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [K-11 sidearm slot](assets/ui-elements-5--k-11-sidearm-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Utility belt slot](assets/ui-elements-5--utility-belt-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Jet boots slot](assets/ui-elements-5--jet-boots-slot/BRIEF.md) | ui-elements-5.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Explorer helmet](assets/ui-elements-5--explorer-helmet/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.helmet](designs/crew.equipment.helmet/DESIGN.md) |
| [Pathfinder shoulder pads](assets/ui-elements-5--pathfinder-shoulder-pads/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [AR-7 explorer rifle](assets/ui-elements-5--ar-7-explorer-rifle/BRIEF.md) | ui-elements-5.png | equipment | [pale-studless.rifle.rifle](designs/pale-studless.rifle.rifle/DESIGN.md) |
| [Tech gauntlet](assets/ui-elements-5--tech-gauntlet/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.gauntlet](designs/crew.equipment.gauntlet/DESIGN.md) |
| [Explorer greaves](assets/ui-elements-5--explorer-greaves/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Recon visor](assets/ui-elements-5--recon-visor/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.visor](designs/crew.equipment.visor/DESIGN.md) |
| [Orion chest plate](assets/ui-elements-5--orion-chest-plate/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Expedition pack](assets/ui-elements-5--expedition-pack/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [K-11 sidearm](assets/ui-elements-5--k-11-sidearm/BRIEF.md) | ui-elements-5.png | equipment | [pale-studless.handgun.standard](designs/pale-studless.handgun.standard/DESIGN.md) |
| [Utility belt](assets/ui-elements-5--utility-belt/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.belt](designs/crew.equipment.belt/DESIGN.md) |
| [Jet boots](assets/ui-elements-5--jet-boots/BRIEF.md) | ui-elements-5.png | equipment | [crew.equipment.boot](designs/crew.equipment.boot/DESIGN.md) |
| [Strength attribute row](assets/ui-elements-5--strength-attribute-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Agility attribute row](assets/ui-elements-5--agility-attribute-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Intellect attribute row](assets/ui-elements-5--intellect-attribute-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Endurance attribute row](assets/ui-elements-5--endurance-attribute-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Technology attribute row](assets/ui-elements-5--technology-attribute-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Health core status](assets/ui-elements-5--health-core-status/BRIEF.md) | ui-elements-5.png | ui | [ui.character-status-and-equipment](designs/ui.character-status-and-equipment/DESIGN.md) |
| [Shield core status](assets/ui-elements-5--shield-core-status/BRIEF.md) | ui-elements-5.png | ui | [ui.character-status-and-equipment](designs/ui.character-status-and-equipment/DESIGN.md) |
| [Energy core status](assets/ui-elements-5--energy-core-status/BRIEF.md) | ui-elements-5.png | ui | [ui.character-status-and-equipment](designs/ui.character-status-and-equipment/DESIGN.md) |
| [Stamina core status](assets/ui-elements-5--stamina-core-status/BRIEF.md) | ui-elements-5.png | ui | [ui.character-status-and-equipment](designs/ui.character-status-and-equipment/DESIGN.md) |
| [Overview stats tab](assets/ui-elements-5--overview-stats-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Combat stats tab](assets/ui-elements-5--combat-stats-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Exploration stats tab](assets/ui-elements-5--exploration-stats-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Crafting stats tab](assets/ui-elements-5--crafting-stats-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Resistances stats tab](assets/ui-elements-5--resistances-stats-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Health stat row](assets/ui-elements-5--health-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Shield stat row](assets/ui-elements-5--shield-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Energy stat row](assets/ui-elements-5--energy-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Stamina stat row](assets/ui-elements-5--stamina-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Health regeneration stat row](assets/ui-elements-5--health-regeneration-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Shield regeneration stat row](assets/ui-elements-5--shield-regeneration-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Energy regeneration stat row](assets/ui-elements-5--energy-regeneration-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Weapon damage stat row](assets/ui-elements-5--weapon-damage-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Critical chance stat row](assets/ui-elements-5--critical-chance-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Critical damage stat row](assets/ui-elements-5--critical-damage-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Ability power stat row](assets/ui-elements-5--ability-power-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Fire rate stat row](assets/ui-elements-5--fire-rate-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Weapon range stat row](assets/ui-elements-5--weapon-range-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Armor penetration stat row](assets/ui-elements-5--armor-penetration-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Mining yield stat row](assets/ui-elements-5--mining-yield-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Repair speed stat row](assets/ui-elements-5--repair-speed-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Hacking speed stat row](assets/ui-elements-5--hacking-speed-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Move speed stat row](assets/ui-elements-5--move-speed-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Boost speed stat row](assets/ui-elements-5--boost-speed-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Cargo capacity stat row](assets/ui-elements-5--cargo-capacity-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Scan range stat row](assets/ui-elements-5--scan-range-stat-row/BRIEF.md) | ui-elements-5.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Kinetic resistance](assets/ui-elements-5--kinetic-resistance/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Thermal resistance](assets/ui-elements-5--thermal-resistance/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Energy resistance](assets/ui-elements-5--energy-resistance/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Radiation resistance](assets/ui-elements-5--radiation-resistance/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [EMP resistance](assets/ui-elements-5--emp-resistance/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Corrosion resistance](assets/ui-elements-5--corrosion-resistance/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Explorer instinct perk](assets/ui-elements-5--explorer-instinct-perk/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Salvage expertise perk](assets/ui-elements-5--salvage-expertise-perk/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Efficient systems perk](assets/ui-elements-5--efficient-systems-perk/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Adaptive shielding perk](assets/ui-elements-5--adaptive-shielding-perk/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Field engineer perk](assets/ui-elements-5--field-engineer-perk/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Pathfinder perk](assets/ui-elements-5--pathfinder-perk/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View skill tree button](assets/ui-elements-5--view-skill-tree-button/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Equipment set bonus panel](assets/ui-elements-5--equipment-set-bonus-panel/BRIEF.md) | ui-elements-5.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [All items tab](assets/ui-elements-5--all-items-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Weapons tab](assets/ui-elements-5--weapons-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Armor tab](assets/ui-elements-5--armor-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Consumables tab](assets/ui-elements-5--consumables-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Resources tab](assets/ui-elements-5--resources-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Quest tab](assets/ui-elements-5--quest-tab/BRIEF.md) | ui-elements-5.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Purple beam weapon](assets/ui-elements-5--purple-beam-weapon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Purple rifle](assets/ui-elements-5--purple-rifle/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Gold rail rifle](assets/ui-elements-5--gold-rail-rifle/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Green gun](assets/ui-elements-5--green-gun/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Helmet icon](assets/ui-elements-5--helmet-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Armor icon](assets/ui-elements-5--armor-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Backpack icon](assets/ui-elements-5--backpack-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Orange crate icon](assets/ui-elements-5--orange-crate-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Broken frame icon](assets/ui-elements-5--broken-frame-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Cross brace icon](assets/ui-elements-5--cross-brace-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Crystal stack icon](assets/ui-elements-5--crystal-stack-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Red canister icon](assets/ui-elements-5--red-canister-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Medkit stack icon](assets/ui-elements-5--medkit-stack-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Blue cell icon](assets/ui-elements-5--blue-cell-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Orange cell icon](assets/ui-elements-5--orange-cell-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Green orb icon](assets/ui-elements-5--green-orb-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Power capsule icon](assets/ui-elements-5--power-capsule-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Purple orb icon](assets/ui-elements-5--purple-orb-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Triangular relic icon](assets/ui-elements-5--triangular-relic-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Datapad icon](assets/ui-elements-5--datapad-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Blue case icon](assets/ui-elements-5--blue-case-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Gold crate stack icon](assets/ui-elements-5--gold-crate-stack-icon/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Empty inventory one](assets/ui-elements-5--empty-inventory-one/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Empty inventory two](assets/ui-elements-5--empty-inventory-two/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Dash action](assets/ui-elements-5--dash-action/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Missile action](assets/ui-elements-5--missile-action/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Shield action](assets/ui-elements-5--shield-action/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Drone action](assets/ui-elements-5--drone-action/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Heal action](assets/ui-elements-5--heal-action/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Warp action](assets/ui-elements-5--warp-action/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Empty action one](assets/ui-elements-5--empty-action-one/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Empty action two](assets/ui-elements-5--empty-action-two/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Canister quickslot](assets/ui-elements-5--canister-quickslot/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Green orb quickslot](assets/ui-elements-5--green-orb-quickslot/BRIEF.md) | ui-elements-5.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Sector time footer](assets/ui-elements-5--sector-time-footer/BRIEF.md) | ui-elements-5.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Ship tab](assets/ui-elements-6--ship-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Overview tab](assets/ui-elements-6--overview-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Bridge tab](assets/ui-elements-6--bridge-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Engineering tab](assets/ui-elements-6--engineering-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Weapons tab](assets/ui-elements-6--weapons-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Cargo tab](assets/ui-elements-6--cargo-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Crew tab](assets/ui-elements-6--crew-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Systems tab](assets/ui-elements-6--systems-tab/BRIEF.md) | ui-elements-6.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Ship identity panel](assets/ui-elements-6--ship-identity-panel/BRIEF.md) | ui-elements-6.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Ship portrait](assets/ui-elements-6--ship-portrait/BRIEF.md) | ui-elements-6.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Exploration frigate preview](assets/ui-elements-6--exploration-frigate-preview/BRIEF.md) | ui-elements-6.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Exterior mode](assets/ui-elements-6--exterior-mode/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Systems mode](assets/ui-elements-6--systems-mode/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Hardpoints mode](assets/ui-elements-6--hardpoints-mode/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Interior mode](assets/ui-elements-6--interior-mode/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [3D mode](assets/ui-elements-6--3d-mode/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [X-ray mode](assets/ui-elements-6--x-ray-mode/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Blueprint mode](assets/ui-elements-6--blueprint-mode/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engine module callout](assets/ui-elements-6--engine-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Reactor module callout](assets/ui-elements-6--reactor-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Cargo module callout](assets/ui-elements-6--cargo-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Sensor module callout](assets/ui-elements-6--sensor-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Crew module callout](assets/ui-elements-6--crew-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Science module callout](assets/ui-elements-6--science-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Hydroponics module callout](assets/ui-elements-6--hydroponics-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Bridge module callout](assets/ui-elements-6--bridge-module-callout/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Hull subsystem bar](assets/ui-elements-6--hull-subsystem-bar/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Shield subsystem bar](assets/ui-elements-6--shield-subsystem-bar/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Reactor subsystem bar](assets/ui-elements-6--reactor-subsystem-bar/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Engines subsystem bar](assets/ui-elements-6--engines-subsystem-bar/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Sensors subsystem bar](assets/ui-elements-6--sensors-subsystem-bar/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Oxygen subsystem bar](assets/ui-elements-6--oxygen-subsystem-bar/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Cargo subsystem bar](assets/ui-elements-6--cargo-subsystem-bar/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Command crew count](assets/ui-elements-6--command-crew-count/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Security crew count](assets/ui-elements-6--security-crew-count/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engineering crew count](assets/ui-elements-6--engineering-crew-count/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Medical crew count](assets/ui-elements-6--medical-crew-count/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Science crew count](assets/ui-elements-6--science-crew-count/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Support crew count](assets/ui-elements-6--support-crew-count/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Manage crew button](assets/ui-elements-6--manage-crew-button/BRIEF.md) | ui-elements-6.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Hardpoint plan](assets/ui-elements-6--hardpoint-plan/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Turret hardpoint legend](assets/ui-elements-6--turret-hardpoint-legend/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Missile hardpoint legend](assets/ui-elements-6--missile-hardpoint-legend/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Medium hardpoint legend](assets/ui-elements-6--medium-hardpoint-legend/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Small hardpoint legend](assets/ui-elements-6--small-hardpoint-legend/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Ship tactical radar](assets/ui-elements-6--ship-tactical-radar/BRIEF.md) | ui-elements-6.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Player radar marker](assets/ui-elements-6--player-radar-marker/BRIEF.md) | ui-elements-6.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Ally radar marker](assets/ui-elements-6--ally-radar-marker/BRIEF.md) | ui-elements-6.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Enemy radar marker](assets/ui-elements-6--enemy-radar-marker/BRIEF.md) | ui-elements-6.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Object radar marker](assets/ui-elements-6--object-radar-marker/BRIEF.md) | ui-elements-6.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Station radar marker](assets/ui-elements-6--station-radar-marker/BRIEF.md) | ui-elements-6.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Cargo resources icon](assets/ui-elements-6--cargo-resources-icon/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Cargo raw materials icon](assets/ui-elements-6--cargo-raw-materials-icon/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Cargo consumables icon](assets/ui-elements-6--cargo-consumables-icon/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Cargo equipment icon](assets/ui-elements-6--cargo-equipment-icon/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Cargo artifacts icon](assets/ui-elements-6--cargo-artifacts-icon/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Repair kit consumable](assets/ui-elements-6--repair-kit-consumable/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Shield cell consumable](assets/ui-elements-6--shield-cell-consumable/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Fuel cell consumable](assets/ui-elements-6--fuel-cell-consumable/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Medkit consumable](assets/ui-elements-6--medkit-consumable/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Oxygen tank consumable](assets/ui-elements-6--oxygen-tank-consumable/BRIEF.md) | ui-elements-6.png | inventory-icon | [ui.item-thumbnails](designs/ui.item-thumbnails/DESIGN.md) |
| [Manage cargo button](assets/ui-elements-6--manage-cargo-button/BRIEF.md) | ui-elements-6.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Mass ship stat](assets/ui-elements-6--mass-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Dimensions ship stat](assets/ui-elements-6--dimensions-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Maximum thrust ship stat](assets/ui-elements-6--maximum-thrust-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Turn rate ship stat](assets/ui-elements-6--turn-rate-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Top speed ship stat](assets/ui-elements-6--top-speed-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Power output ship stat](assets/ui-elements-6--power-output-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Heat capacity ship stat](assets/ui-elements-6--heat-capacity-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Jump range ship stat](assets/ui-elements-6--jump-range-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Scan range ship stat](assets/ui-elements-6--scan-range-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Weapon slots ship stat](assets/ui-elements-6--weapon-slots-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Drone slots ship stat](assets/ui-elements-6--drone-slots-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Cargo capacity ship stat](assets/ui-elements-6--cargo-capacity-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Armor rating ship stat](assets/ui-elements-6--armor-rating-ship-stat/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Command bridge installed row](assets/ui-elements-6--command-bridge-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Fusion reactor installed row](assets/ui-elements-6--fusion-reactor-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Deflector shield array installed row](assets/ui-elements-6--deflector-shield-array-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Medical bay installed row](assets/ui-elements-6--medical-bay-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Expanded cargo bay installed row](assets/ui-elements-6--expanded-cargo-bay-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Hydroponics module installed row](assets/ui-elements-6--hydroponics-module-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Quad turret mount installed row](assets/ui-elements-6--quad-turret-mount-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Missile rack installed row](assets/ui-elements-6--missile-rack-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Long-range sensor dish installed row](assets/ui-elements-6--long-range-sensor-dish-installed-row/BRIEF.md) | ui-elements-6.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Reactor load dial](assets/ui-elements-6--reactor-load-dial/BRIEF.md) | ui-elements-6.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Weapons power allocation](assets/ui-elements-6--weapons-power-allocation/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Shields power allocation](assets/ui-elements-6--shields-power-allocation/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Engines power allocation](assets/ui-elements-6--engines-power-allocation/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Systems power allocation](assets/ui-elements-6--systems-power-allocation/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Life support power allocation](assets/ui-elements-6--life-support-power-allocation/BRIEF.md) | ui-elements-6.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View blueprint button](assets/ui-elements-6--view-blueprint-button/BRIEF.md) | ui-elements-6.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Refit ship button](assets/ui-elements-6--refit-ship-button/BRIEF.md) | ui-elements-6.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Repair ship button](assets/ui-elements-6--repair-ship-button/BRIEF.md) | ui-elements-6.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Launch ship button](assets/ui-elements-6--launch-ship-button/BRIEF.md) | ui-elements-6.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Layer stack roof](assets/modular-spaceship-design--layer-stack-roof/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Layer stack exterior wall ring](assets/modular-spaceship-design--layer-stack-exterior-wall-ring/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Layer stack interior walls](assets/modular-spaceship-design--layer-stack-interior-walls/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Layer stack floor](assets/modular-spaceship-design--layer-stack-floor/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Layer stack utilities](assets/modular-spaceship-design--layer-stack-utilities/BRIEF.md) | modular-spaceship-design.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Layer stack base](assets/modular-spaceship-design--layer-stack-base/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Crew room pod exploded](assets/modular-spaceship-design--crew-room-pod-exploded/BRIEF.md) | modular-spaceship-design.png | room | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) |
| [Crew room roof](assets/modular-spaceship-design--crew-room-roof/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Crew room bed](assets/modular-spaceship-design--crew-room-bed/BRIEF.md) | modular-spaceship-design.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Crew room floor](assets/modular-spaceship-design--crew-room-floor/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Crew room utility layer](assets/modular-spaceship-design--crew-room-utility-layer/BRIEF.md) | modular-spaceship-design.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Crew room base](assets/modular-spaceship-design--crew-room-base/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Engine exploded assembly](assets/modular-spaceship-design--engine-exploded-assembly/BRIEF.md) | modular-spaceship-design.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Engine cap](assets/modular-spaceship-design--engine-cap/BRIEF.md) | modular-spaceship-design.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Engine reactor core](assets/modular-spaceship-design--engine-reactor-core/BRIEF.md) | modular-spaceship-design.png | system | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Engine conduit layer](assets/modular-spaceship-design--engine-conduit-layer/BRIEF.md) | modular-spaceship-design.png | pipe | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Engine housing and nozzle](assets/modular-spaceship-design--engine-housing-and-nozzle/BRIEF.md) | modular-spaceship-design.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Corridor exploded assembly](assets/modular-spaceship-design--corridor-exploded-assembly/BRIEF.md) | modular-spaceship-design.png | room | [pale-studless.room.corridor](designs/pale-studless.room.corridor/DESIGN.md) |
| [Corridor roof](assets/modular-spaceship-design--corridor-roof/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Corridor wall set](assets/modular-spaceship-design--corridor-wall-set/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Corridor pipes](assets/modular-spaceship-design--corridor-pipes/BRIEF.md) | modular-spaceship-design.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Corridor floor](assets/modular-spaceship-design--corridor-floor/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Corridor utilities](assets/modular-spaceship-design--corridor-utilities/BRIEF.md) | modular-spaceship-design.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Corridor base](assets/modular-spaceship-design--corridor-base/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Bridge exploded assembly](assets/modular-spaceship-design--bridge-exploded-assembly/BRIEF.md) | modular-spaceship-design.png | room | [pale-studless.room.bridge](designs/pale-studless.room.bridge/DESIGN.md) |
| [Bridge roof](assets/modular-spaceship-design--bridge-roof/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Bridge control chairs](assets/modular-spaceship-design--bridge-control-chairs/BRIEF.md) | modular-spaceship-design.png | furniture | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) |
| [Bridge deck](assets/modular-spaceship-design--bridge-deck/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.floor.standard](designs/pale-studless.floor.standard/DESIGN.md) |
| [Bridge utility layer](assets/modular-spaceship-design--bridge-utility-layer/BRIEF.md) | modular-spaceship-design.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Bridge hull base](assets/modular-spaceship-design--bridge-hull-base/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Bridge cockpit window](assets/modular-spaceship-design--bridge-cockpit-window/BRIEF.md) | modular-spaceship-design.png | door | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Expandable closed hull](assets/modular-spaceship-design--expandable-closed-hull/BRIEF.md) | modular-spaceship-design.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Expansion engine](assets/modular-spaceship-design--expansion-engine/BRIEF.md) | modular-spaceship-design.png | engine | [pale-studless.engine.ion](designs/pale-studless.engine.ion/DESIGN.md) |
| [Expansion corridor](assets/modular-spaceship-design--expansion-corridor/BRIEF.md) | modular-spaceship-design.png | room | [pale-studless.room.corridor](designs/pale-studless.room.corridor/DESIGN.md) |
| [Expansion room pod](assets/modular-spaceship-design--expansion-room-pod/BRIEF.md) | modular-spaceship-design.png | room | [pale-studless.room.assembly](designs/pale-studless.room.assembly/DESIGN.md) |
| [Hull tile](assets/modular-spaceship-design--hull-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Floor tile](assets/modular-spaceship-design--floor-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Wall tile](assets/modular-spaceship-design--wall-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Corner tile](assets/modular-spaceship-design--corner-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.corner.standard](designs/pale-studless.corner.standard/DESIGN.md) |
| [Door tile](assets/modular-spaceship-design--door-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Window tile](assets/modular-spaceship-design--window-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Decor tile](assets/modular-spaceship-design--decor-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Console tile](assets/modular-spaceship-design--console-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Bed tile](assets/modular-spaceship-design--bed-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Storage tile](assets/modular-spaceship-design--storage-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Pipe tile](assets/modular-spaceship-design--pipe-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Power node](assets/modular-spaceship-design--power-node/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.battery.standard](designs/pale-studless.battery.standard/DESIGN.md) |
| [Airlock tile](assets/modular-spaceship-design--airlock-tile/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Engine nozzle](assets/modular-spaceship-design--engine-nozzle/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Hardpoint connector](assets/modular-spaceship-design--hardpoint-connector/BRIEF.md) | modular-spaceship-design.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Voxel layer grid icon](assets/modular-spaceship-design--voxel-layer-grid-icon/BRIEF.md) | modular-spaceship-design.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Three-axis snap diagram](assets/modular-spaceship-design--three-axis-snap-diagram/BRIEF.md) | modular-spaceship-design.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Crew wall screen](assets/modular-spaceship-design--crew-wall-screen/BRIEF.md) | modular-spaceship-design.png | furniture | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Crew room plant](assets/modular-spaceship-design--crew-room-plant/BRIEF.md) | modular-spaceship-design.png | furniture | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Crew bedside chest](assets/modular-spaceship-design--crew-bedside-chest/BRIEF.md) | modular-spaceship-design.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Crew door panel](assets/modular-spaceship-design--crew-door-panel/BRIEF.md) | modular-spaceship-design.png | furniture | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Crew bed tile](assets/modular-spaceship-design-2--crew-bed-tile/BRIEF.md) | modular-spaceship-design-2.png | room | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) |
| [Storage crate tile](assets/modular-spaceship-design-2--storage-crate-tile/BRIEF.md) | modular-spaceship-design-2.png | room | [pale-studless.room.storage](designs/pale-studless.room.storage/DESIGN.md) |
| [Medbay tile](assets/modular-spaceship-design-2--medbay-tile/BRIEF.md) | modular-spaceship-design-2.png | room | [pale-studless.room.medbay](designs/pale-studless.room.medbay/DESIGN.md) |
| [Hydroponics tile](assets/modular-spaceship-design-2--hydroponics-tile/BRIEF.md) | modular-spaceship-design-2.png | room | [pale-studless.room.hydroponics](designs/pale-studless.room.hydroponics/DESIGN.md) |
| [Lounge tile](assets/modular-spaceship-design-2--lounge-tile/BRIEF.md) | modular-spaceship-design-2.png | room | [pale-studless.room.lounge](designs/pale-studless.room.lounge/DESIGN.md) |
| [Table tile](assets/modular-spaceship-design-2--table-tile/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Reactor module](assets/modular-spaceship-design-2--reactor-module/BRIEF.md) | modular-spaceship-design-2.png | system | [shipyard.equipment.reactor](designs/shipyard.equipment.reactor/DESIGN.md) |
| [Wall console decor tile](assets/modular-spaceship-design-2--wall-console-decor-tile/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Crew room assembled](assets/modular-spaceship-design-2--crew-room-assembled/BRIEF.md) | modular-spaceship-design-2.png | room | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) |
| [Crew room exploded](assets/modular-spaceship-design-2--crew-room-exploded/BRIEF.md) | modular-spaceship-design-2.png | room | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) |
| [Corner floor snap example](assets/modular-spaceship-design-2--corner-floor-snap-example/BRIEF.md) | modular-spaceship-design-2.png | structure | [shipyard.floor.mapped-deck-kit](designs/shipyard.floor.mapped-deck-kit/DESIGN.md) |
| [Bed mattress](assets/modular-spaceship-design-2--bed-mattress/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Bed frame drawer](assets/modular-spaceship-design-2--bed-frame-drawer/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Bed floor mount](assets/modular-spaceship-design-2--bed-floor-mount/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Blue blanket panel](assets/modular-spaceship-design-2--blue-blanket-panel/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Personal screen](assets/modular-spaceship-design-2--personal-screen/BRIEF.md) | modular-spaceship-design-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Bed wall light](assets/modular-spaceship-design-2--bed-wall-light/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Bed wall panel](assets/modular-spaceship-design-2--bed-wall-panel/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Bed storage drawer](assets/modular-spaceship-design-2--bed-storage-drawer/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Storage large crate](assets/modular-spaceship-design-2--storage-large-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.large](designs/cargo.standard.large/DESIGN.md) |
| [Storage medium crate](assets/modular-spaceship-design-2--storage-medium-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.medium](designs/cargo.standard.medium/DESIGN.md) |
| [Storage small crate](assets/modular-spaceship-design-2--storage-small-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.small](designs/cargo.standard.small/DESIGN.md) |
| [Storage pale loose crate](assets/modular-spaceship-design-2--storage-pale-loose-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.medium](designs/cargo.standard.medium/DESIGN.md) |
| [Storage orange loose crate](assets/modular-spaceship-design-2--storage-orange-loose-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.large](designs/cargo.standard.large/DESIGN.md) |
| [Storage large gold loose crate](assets/modular-spaceship-design-2--storage-large-gold-loose-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.large](designs/cargo.standard.large/DESIGN.md) |
| [Storage blue loose crate](assets/modular-spaceship-design-2--storage-blue-loose-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.medium](designs/cargo.standard.medium/DESIGN.md) |
| [Storage red loose crate](assets/modular-spaceship-design-2--storage-red-loose-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.small](designs/cargo.standard.small/DESIGN.md) |
| [Storage narrow blue crate](assets/modular-spaceship-design-2--storage-narrow-blue-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.narrow](designs/cargo.standard.narrow/DESIGN.md) |
| [Storage tiny magenta crate](assets/modular-spaceship-design-2--storage-tiny-magenta-crate/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.tiny](designs/cargo.standard.tiny/DESIGN.md) |
| [Storage red canister](assets/modular-spaceship-design-2--storage-red-canister/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.standard.narrow](designs/cargo.standard.narrow/DESIGN.md) |
| [Storage floor marking tile](assets/modular-spaceship-design-2--storage-floor-marking-tile/BRIEF.md) | modular-spaceship-design-2.png | structure | [shipyard.floor.mapped-deck-kit](designs/shipyard.floor.mapped-deck-kit/DESIGN.md) |
| [Medical wall tool stand](assets/modular-spaceship-design-2--medical-wall-tool-stand/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Medical IV stand](assets/modular-spaceship-design-2--medical-iv-stand/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Medical bed headrest](assets/modular-spaceship-design-2--medical-bed-headrest/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Medical supply case](assets/modular-spaceship-design-2--medical-supply-case/BRIEF.md) | modular-spaceship-design-2.png | cargo | [cargo.medical.small](designs/cargo.medical.small/DESIGN.md) |
| [Medical bed module](assets/modular-spaceship-design-2--medical-bed-module/BRIEF.md) | modular-spaceship-design-2.png | furniture | [shipyard.equipment.medical-bed](designs/shipyard.equipment.medical-bed/DESIGN.md) |
| [Medical monitor](assets/modular-spaceship-design-2--medical-monitor/BRIEF.md) | modular-spaceship-design-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Medical IV pole](assets/modular-spaceship-design-2--medical-iv-pole/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Medical marker panel](assets/modular-spaceship-design-2--medical-marker-panel/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Medical cabinet](assets/modular-spaceship-design-2--medical-cabinet/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Hydro wall panel](assets/modular-spaceship-design-2--hydro-wall-panel/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Hydro potted specimen](assets/modular-spaceship-design-2--hydro-potted-specimen/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Hydro large tray](assets/modular-spaceship-design-2--hydro-large-tray/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.hydroponics.standard](designs/pale-studless.hydroponics.standard/DESIGN.md) |
| [Hydro small tray](assets/modular-spaceship-design-2--hydro-small-tray/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.hydroponics.standard](designs/pale-studless.hydroponics.standard/DESIGN.md) |
| [Hydro grow light](assets/modular-spaceship-design-2--hydro-grow-light/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Hydro control screen](assets/modular-spaceship-design-2--hydro-control-screen/BRIEF.md) | modular-spaceship-design-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Hydro wall control](assets/modular-spaceship-design-2--hydro-wall-control/BRIEF.md) | modular-spaceship-design-2.png | console | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Hydro water unit](assets/modular-spaceship-design-2--hydro-water-unit/BRIEF.md) | modular-spaceship-design-2.png | system | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Hydro water pipes](assets/modular-spaceship-design-2--hydro-water-pipes/BRIEF.md) | modular-spaceship-design-2.png | pipe | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Hydro tall controller](assets/modular-spaceship-design-2--hydro-tall-controller/BRIEF.md) | modular-spaceship-design-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Lounge plant](assets/modular-spaceship-design-2--lounge-plant/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Lounge straight sofa](assets/modular-spaceship-design-2--lounge-straight-sofa/BRIEF.md) | modular-spaceship-design-2.png | furniture | [shipyard.equipment.lounge-sofa](designs/shipyard.equipment.lounge-sofa/DESIGN.md) |
| [Lounge corner sofa](assets/modular-spaceship-design-2--lounge-corner-sofa/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.sofa.standard](designs/pale-studless.sofa.standard/DESIGN.md) |
| [Lounge floor tile](assets/modular-spaceship-design-2--lounge-floor-tile/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Lounge mug](assets/modular-spaceship-design-2--lounge-mug/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Lounge snack shelf](assets/modular-spaceship-design-2--lounge-snack-shelf/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Lounge wall slab](assets/modular-spaceship-design-2--lounge-wall-slab/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Lounge coffee table](assets/modular-spaceship-design-2--lounge-coffee-table/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Lounge side table](assets/modular-spaceship-design-2--lounge-side-table/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Dining chair one](assets/modular-spaceship-design-2--dining-chair-one/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) |
| [Dining table with plant](assets/modular-spaceship-design-2--dining-table-with-plant/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Dining table plain](assets/modular-spaceship-design-2--dining-table-plain/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Dining chair two](assets/modular-spaceship-design-2--dining-chair-two/BRIEF.md) | modular-spaceship-design-2.png | furniture | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) |
| [Dining potted plant](assets/modular-spaceship-design-2--dining-potted-plant/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Reactor front ring](assets/modular-spaceship-design-2--reactor-front-ring/BRIEF.md) | modular-spaceship-design-2.png | system | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor front shroud](assets/modular-spaceship-design-2--reactor-front-shroud/BRIEF.md) | modular-spaceship-design-2.png | system | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor luminous core](assets/modular-spaceship-design-2--reactor-luminous-core/BRIEF.md) | modular-spaceship-design-2.png | system | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor rear shroud](assets/modular-spaceship-design-2--reactor-rear-shroud/BRIEF.md) | modular-spaceship-design-2.png | system | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor coolant line](assets/modular-spaceship-design-2--reactor-coolant-line/BRIEF.md) | modular-spaceship-design-2.png | pipe | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor control box](assets/modular-spaceship-design-2--reactor-control-box/BRIEF.md) | modular-spaceship-design-2.png | console | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor rear connector](assets/modular-spaceship-design-2--reactor-rear-connector/BRIEF.md) | modular-spaceship-design-2.png | pipe | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor small screen](assets/modular-spaceship-design-2--reactor-small-screen/BRIEF.md) | modular-spaceship-design-2.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Reactor straight conduit](assets/modular-spaceship-design-2--reactor-straight-conduit/BRIEF.md) | modular-spaceship-design-2.png | pipe | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Reactor mounting clamp](assets/modular-spaceship-design-2--reactor-mounting-clamp/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Green status console](assets/modular-spaceship-design-2--green-status-console/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Blue map screen](assets/modular-spaceship-design-2--blue-map-screen/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Crew slogan poster](assets/modular-spaceship-design-2--crew-slogan-poster/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Planet insignia poster](assets/modular-spaceship-design-2--planet-insignia-poster/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Door control strip](assets/modular-spaceship-design-2--door-control-strip/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Wall grille](assets/modular-spaceship-design-2--wall-grille/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Utility wall variant one](assets/modular-spaceship-design-2--utility-wall-variant-one/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Utility wall variant two](assets/modular-spaceship-design-2--utility-wall-variant-two/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Utility wall variant three](assets/modular-spaceship-design-2--utility-wall-variant-three/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Medical wall variant](assets/modular-spaceship-design-2--medical-wall-variant/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Wall pipe cluster](assets/modular-spaceship-design-2--wall-pipe-cluster/BRIEF.md) | modular-spaceship-design-2.png | decor | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Universal socket pair](assets/modular-spaceship-design-2--universal-socket-pair/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Universal small node](assets/modular-spaceship-design-2--universal-small-node/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Aligned frame cube](assets/modular-spaceship-design-2--aligned-frame-cube/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Aligned solid cube](assets/modular-spaceship-design-2--aligned-solid-cube/BRIEF.md) | modular-spaceship-design-2.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Comfort icon](assets/modular-spaceship-design-2--comfort-icon/BRIEF.md) | modular-spaceship-design-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Storage icon](assets/modular-spaceship-design-2--storage-icon/BRIEF.md) | modular-spaceship-design-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Medical icon](assets/modular-spaceship-design-2--medical-icon/BRIEF.md) | modular-spaceship-design-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Hydroponics icon](assets/modular-spaceship-design-2--hydroponics-icon/BRIEF.md) | modular-spaceship-design-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Engineering icon](assets/modular-spaceship-design-2--engineering-icon/BRIEF.md) | modular-spaceship-design-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Decor icon](assets/modular-spaceship-design-2--decor-icon/BRIEF.md) | modular-spaceship-design-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Upper hull shell](assets/exploded-spaceship-view--upper-hull-shell/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Engine bank](assets/exploded-spaceship-view--engine-bank/BRIEF.md) | exploded-spaceship-view.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Engineering room](assets/exploded-spaceship-view--engineering-room/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.engineering](designs/pale-studless.room.engineering/DESIGN.md) |
| [Hydroponics room](assets/exploded-spaceship-view--hydroponics-room/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.hydroponics](designs/pale-studless.room.hydroponics/DESIGN.md) |
| [Medbay room](assets/exploded-spaceship-view--medbay-room/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.medbay](designs/pale-studless.room.medbay/DESIGN.md) |
| [Bridge cockpit](assets/exploded-spaceship-view--bridge-cockpit/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.bridge](designs/pale-studless.room.bridge/DESIGN.md) |
| [Crew quarters](assets/exploded-spaceship-view--crew-quarters/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) |
| [Lounge room](assets/exploded-spaceship-view--lounge-room/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.lounge](designs/pale-studless.room.lounge/DESIGN.md) |
| [Storage room](assets/exploded-spaceship-view--storage-room/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.storage](designs/pale-studless.room.storage/DESIGN.md) |
| [Docking airlock room](assets/exploded-spaceship-view--docking-airlock-room/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.airlock](designs/pale-studless.room.airlock/DESIGN.md) |
| [Lower hull shell](assets/exploded-spaceship-view--lower-hull-shell/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Scale captain](assets/exploded-spaceship-view--scale-captain/BRIEF.md) | exploded-spaceship-view.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Corridor connector 1](assets/exploded-spaceship-view--corridor-connector-1/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Corridor connector 2](assets/exploded-spaceship-view--corridor-connector-2/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Corridor connector 3](assets/exploded-spaceship-view--corridor-connector-3/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Corridor connector 4](assets/exploded-spaceship-view--corridor-connector-4/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Corridor connector 5](assets/exploded-spaceship-view--corridor-connector-5/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Corridor connector 6](assets/exploded-spaceship-view--corridor-connector-6/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Engine module miniature](assets/exploded-spaceship-view--engine-module-miniature/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.assembly](designs/pale-studless.room.assembly/DESIGN.md) |
| [Room pod miniature](assets/exploded-spaceship-view--room-pod-miniature/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.assembly](designs/pale-studless.room.assembly/DESIGN.md) |
| [Bridge miniature](assets/exploded-spaceship-view--bridge-miniature/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.bridge](designs/pale-studless.room.bridge/DESIGN.md) |
| [Corridor miniature](assets/exploded-spaceship-view--corridor-miniature/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.corridor](designs/pale-studless.room.corridor/DESIGN.md) |
| [Hull section miniature](assets/exploded-spaceship-view--hull-section-miniature/BRIEF.md) | exploded-spaceship-view.png | room | [pale-studless.room.assembly](designs/pale-studless.room.assembly/DESIGN.md) |
| [Utility mast miniature](assets/exploded-spaceship-view--utility-mast-miniature/BRIEF.md) | exploded-spaceship-view.png | system | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Utility pedestal miniature](assets/exploded-spaceship-view--utility-pedestal-miniature/BRIEF.md) | exploded-spaceship-view.png | system | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Sensor dish miniature](assets/exploded-spaceship-view--sensor-dish-miniature/BRIEF.md) | exploded-spaceship-view.png | system | [pale-studless.sensor.dish](designs/pale-studless.sensor.dish/DESIGN.md) |
| [Hull tile](assets/exploded-spaceship-view--hull-tile/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Floor tile](assets/exploded-spaceship-view--floor-tile/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Wall segment](assets/exploded-spaceship-view--wall-segment/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Corner piece](assets/exploded-spaceship-view--corner-piece/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.corner.standard](designs/pale-studless.corner.standard/DESIGN.md) |
| [Door](assets/exploded-spaceship-view--door/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Window](assets/exploded-spaceship-view--window/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Pipe conduit](assets/exploded-spaceship-view--pipe-conduit/BRIEF.md) | exploded-spaceship-view.png | structure | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Snap grid schematic](assets/exploded-spaceship-view--snap-grid-schematic/BRIEF.md) | exploded-spaceship-view.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Custom assembled ship](assets/exploded-spaceship-view--custom-assembled-ship/BRIEF.md) | exploded-spaceship-view.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Human exploration frigate](assets/faction-ship-1--human-exploration-frigate/BRIEF.md) | faction-ship-1.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Exploded engine bank](assets/faction-ship-1--exploded-engine-bank/BRIEF.md) | faction-ship-1.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Exploded crew room](assets/faction-ship-1--exploded-crew-room/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) |
| [Exploded science lab](assets/faction-ship-1--exploded-science-lab/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.science](designs/pale-studless.room.science/DESIGN.md) |
| [Exploded hydroponics habitat](assets/faction-ship-1--exploded-hydroponics-habitat/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.hydroponics](designs/pale-studless.room.hydroponics/DESIGN.md) |
| [Exploded medbay](assets/faction-ship-1--exploded-medbay/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.medbay](designs/pale-studless.room.medbay/DESIGN.md) |
| [Exploded cargo room](assets/faction-ship-1--exploded-cargo-room/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.cargo](designs/pale-studless.room.cargo/DESIGN.md) |
| [Exploded bridge nose](assets/faction-ship-1--exploded-bridge-nose/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.bridge](designs/pale-studless.room.bridge/DESIGN.md) |
| [Captain scale figure](assets/faction-ship-1--captain-scale-figure/BRIEF.md) | faction-ship-1.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Roof module 1](assets/faction-ship-1--roof-module-1/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Roof module 2](assets/faction-ship-1--roof-module-2/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Roof module 3](assets/faction-ship-1--roof-module-3/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Roof module 4](assets/faction-ship-1--roof-module-4/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Roof module 5](assets/faction-ship-1--roof-module-5/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Corridor module 1](assets/faction-ship-1--corridor-module-1/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Corridor module 2](assets/faction-ship-1--corridor-module-2/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Corridor module 3](assets/faction-ship-1--corridor-module-3/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Corridor module 4](assets/faction-ship-1--corridor-module-4/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Corridor module 5](assets/faction-ship-1--corridor-module-5/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Corridor module 6](assets/faction-ship-1--corridor-module-6/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Corridor module 7](assets/faction-ship-1--corridor-module-7/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Bridge closeup](assets/faction-ship-1--bridge-closeup/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.bridge](designs/pale-studless.room.bridge/DESIGN.md) |
| [Crew quarters closeup](assets/faction-ship-1--crew-quarters-closeup/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.crew](designs/pale-studless.room.crew/DESIGN.md) |
| [Science lab closeup](assets/faction-ship-1--science-lab-closeup/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.science](designs/pale-studless.room.science/DESIGN.md) |
| [Medbay closeup](assets/faction-ship-1--medbay-closeup/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.medbay](designs/pale-studless.room.medbay/DESIGN.md) |
| [Cargo bay closeup](assets/faction-ship-1--cargo-bay-closeup/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.cargo](designs/pale-studless.room.cargo/DESIGN.md) |
| [Engine block closeup](assets/faction-ship-1--engine-block-closeup/BRIEF.md) | faction-ship-1.png | room | [pale-studless.room.assembly](designs/pale-studless.room.assembly/DESIGN.md) |
| [Hull tile](assets/faction-ship-1--hull-tile/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Floor tile](assets/faction-ship-1--floor-tile/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.floor.floor](designs/pale-studless.floor.floor/DESIGN.md) |
| [Wall tile](assets/faction-ship-1--wall-tile/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Window tile](assets/faction-ship-1--window-tile/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.window.window](designs/pale-studless.window.window/DESIGN.md) |
| [Corridor](assets/faction-ship-1--corridor/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Door](assets/faction-ship-1--door/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Utility tile](assets/faction-ship-1--utility-tile/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Hardpoint](assets/faction-ship-1--hardpoint/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Pipe conduit](assets/faction-ship-1--pipe-conduit/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.pipe.standard](designs/pale-studless.pipe.standard/DESIGN.md) |
| [Roof cap](assets/faction-ship-1--roof-cap/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Standard connector](assets/faction-ship-1--standard-connector/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Airlock connector](assets/faction-ship-1--airlock-connector/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Utility bus](assets/faction-ship-1--utility-bus/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Reinforced joint](assets/faction-ship-1--reinforced-joint/BRIEF.md) | faction-ship-1.png | structure | [pale-studless.mount.standard](designs/pale-studless.mount.standard/DESIGN.md) |
| [Ship side scale drawing](assets/faction-ship-1--ship-side-scale-drawing/BRIEF.md) | faction-ship-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Ship end scale drawing](assets/faction-ship-1--ship-end-scale-drawing/BRIEF.md) | faction-ship-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Prospector mining ship](assets/faction-ship-2--prospector-mining-ship/BRIEF.md) | faction-ship-2.png | ship | [ship.prospector](designs/ship.prospector/DESIGN.md) |
| [Engine pod bank](assets/faction-ship-2--engine-pod-bank/BRIEF.md) | faction-ship-2.png | engine | [industrial-mining.engine.engine](designs/industrial-mining.engine.engine/DESIGN.md) |
| [Refinery pod](assets/faction-ship-2--refinery-pod/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.refinery](designs/industrial-mining.machine.refinery/DESIGN.md) |
| [Ore crusher module](assets/faction-ship-2--ore-crusher-module/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.crusher](designs/industrial-mining.machine.crusher/DESIGN.md) |
| [Cargo hold module](assets/faction-ship-2--cargo-hold-module/BRIEF.md) | faction-ship-2.png | cargo | [industrial-mining.crate.cargo](designs/industrial-mining.crate.cargo/DESIGN.md) |
| [Operations cockpit](assets/faction-ship-2--operations-cockpit/BRIEF.md) | faction-ship-2.png | room | [industrial-mining.room.assembly](designs/industrial-mining.room.assembly/DESIGN.md) |
| [Tractor beam bay](assets/faction-ship-2--tractor-beam-bay/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.tractor.standard](designs/industrial-mining.tractor.standard/DESIGN.md) |
| [Drilling assembly](assets/faction-ship-2--drilling-assembly/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.drill](designs/industrial-mining.machine.drill/DESIGN.md) |
| [Refinery open module](assets/faction-ship-2--refinery-open-module/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.refinery](designs/industrial-mining.machine.refinery/DESIGN.md) |
| [Ore crusher open module](assets/faction-ship-2--ore-crusher-open-module/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.crusher](designs/industrial-mining.machine.crusher/DESIGN.md) |
| [Cargo module closeup](assets/faction-ship-2--cargo-module-closeup/BRIEF.md) | faction-ship-2.png | cargo | [industrial-mining.crate.cargo](designs/industrial-mining.crate.cargo/DESIGN.md) |
| [Standard drill head](assets/faction-ship-2--standard-drill-head/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.drill](designs/industrial-mining.machine.drill/DESIGN.md) |
| [Wide-bore drill head](assets/faction-ship-2--wide-bore-drill-head/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.drill](designs/industrial-mining.machine.drill/DESIGN.md) |
| [Precision drill head](assets/faction-ship-2--precision-drill-head/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.drill](designs/industrial-mining.machine.drill/DESIGN.md) |
| [Cargo connector ring](assets/faction-ship-2--cargo-connector-ring/BRIEF.md) | faction-ship-2.png | structure | [industrial-mining.mount.standard](designs/industrial-mining.mount.standard/DESIGN.md) |
| [Drill connector ring](assets/faction-ship-2--drill-connector-ring/BRIEF.md) | faction-ship-2.png | structure | [industrial-mining.mount.standard](designs/industrial-mining.mount.standard/DESIGN.md) |
| [Small cargo pod](assets/faction-ship-2--small-cargo-pod/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.crate.cargo](designs/industrial-mining.crate.cargo/DESIGN.md) |
| [Large cargo pod](assets/faction-ship-2--large-cargo-pod/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.crate.cargo](designs/industrial-mining.crate.cargo/DESIGN.md) |
| [Ore bin](assets/faction-ship-2--ore-bin/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.standard](designs/industrial-mining.machine.standard/DESIGN.md) |
| [Refined material container](assets/faction-ship-2--refined-material-container/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.crate.standard](designs/industrial-mining.crate.standard/DESIGN.md) |
| [Fuel tank](assets/faction-ship-2--fuel-tank/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.tank.fuel](designs/industrial-mining.tank.fuel/DESIGN.md) |
| [Utility corridor](assets/faction-ship-2--utility-corridor/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.standard](designs/industrial-mining.machine.standard/DESIGN.md) |
| [Armor block](assets/faction-ship-2--armor-block/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.hull.standard](designs/industrial-mining.hull.standard/DESIGN.md) |
| [Hull section](assets/faction-ship-2--hull-section/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.hull.standard](designs/industrial-mining.hull.standard/DESIGN.md) |
| [Docking frame](assets/faction-ship-2--docking-frame/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.standard](designs/industrial-mining.machine.standard/DESIGN.md) |
| [Small hardpoint](assets/faction-ship-2--small-hardpoint/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.mount.standard](designs/industrial-mining.mount.standard/DESIGN.md) |
| [Large hardpoint](assets/faction-ship-2--large-hardpoint/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.mount.standard](designs/industrial-mining.mount.standard/DESIGN.md) |
| [Mining arm joint](assets/faction-ship-2--mining-arm-joint/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.mount.standard](designs/industrial-mining.mount.standard/DESIGN.md) |
| [Exterior pipe](assets/faction-ship-2--exterior-pipe/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.pipe.standard](designs/industrial-mining.pipe.standard/DESIGN.md) |
| [Sensor mast](assets/faction-ship-2--sensor-mast/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.sensor.mast](designs/industrial-mining.sensor.mast/DESIGN.md) |
| [Antenna sensor](assets/faction-ship-2--antenna-sensor/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.sensor.antenna](designs/industrial-mining.sensor.antenna/DESIGN.md) |
| [Industrial decorative kit](assets/faction-ship-2--industrial-decorative-kit/BRIEF.md) | faction-ship-2.png | system | [industrial-mining.machine.standard](designs/industrial-mining.machine.standard/DESIGN.md) |
| [Mining snap grid diagram](assets/faction-ship-2--mining-snap-grid-diagram/BRIEF.md) | faction-ship-2.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Mining asteroid upper](assets/faction-ship-2--mining-asteroid-upper/BRIEF.md) | faction-ship-2.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Mining asteroid right](assets/faction-ship-2--mining-asteroid-right/BRIEF.md) | faction-ship-2.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Aurelian prism explorer](assets/alien-ship-1--aurelian-prism-explorer/BRIEF.md) | alien-ship-1.png | ship | [ship.aurelian](designs/ship.aurelian/DESIGN.md) |
| [Alien energy wing](assets/alien-ship-1--alien-energy-wing/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Crystal reactor pod](assets/alien-ship-1--crystal-reactor-pod/BRIEF.md) | alien-ship-1.png | system | [crystalline-alien.reactor.standard](designs/crystalline-alien.reactor.standard/DESIGN.md) |
| [Bio lab room](assets/alien-ship-1--bio-lab-room/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.bio-lab](designs/crystalline-alien.room.bio-lab/DESIGN.md) |
| [Stasis chamber bank](assets/alien-ship-1--stasis-chamber-bank/BRIEF.md) | alien-ship-1.png | system | [crystalline-alien.machine.stasis](designs/crystalline-alien.machine.stasis/DESIGN.md) |
| [Drone hatchery room](assets/alien-ship-1--drone-hatchery-room/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.hatchery](designs/crystalline-alien.room.hatchery/DESIGN.md) |
| [Synod bridge room](assets/alien-ship-1--synod-bridge-room/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.bridge](designs/crystalline-alien.room.bridge/DESIGN.md) |
| [Psionic crystal dome](assets/alien-ship-1--psionic-crystal-dome/BRIEF.md) | alien-ship-1.png | system | [crystalline-alien.resource.crystal](designs/crystalline-alien.resource.crystal/DESIGN.md) |
| [Upper left wing segment](assets/alien-ship-1--upper-left-wing-segment/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Upper right wing segment](assets/alien-ship-1--upper-right-wing-segment/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Lower right wing segment](assets/alien-ship-1--lower-right-wing-segment/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Alien connector module 1](assets/alien-ship-1--alien-connector-module-1/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Alien connector module 2](assets/alien-ship-1--alien-connector-module-2/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Alien connector module 3](assets/alien-ship-1--alien-connector-module-3/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Alien connector module 4](assets/alien-ship-1--alien-connector-module-4/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Crystal reactor interior](assets/alien-ship-1--crystal-reactor-interior/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.assembly](designs/crystalline-alien.room.assembly/DESIGN.md) |
| [Bio lab interior](assets/alien-ship-1--bio-lab-interior/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.bio-lab](designs/crystalline-alien.room.bio-lab/DESIGN.md) |
| [Synod bridge interior](assets/alien-ship-1--synod-bridge-interior/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.bridge](designs/crystalline-alien.room.bridge/DESIGN.md) |
| [Stasis chamber interior](assets/alien-ship-1--stasis-chamber-interior/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.stasis](designs/crystalline-alien.room.stasis/DESIGN.md) |
| [Drone hatchery interior](assets/alien-ship-1--drone-hatchery-interior/BRIEF.md) | alien-ship-1.png | room | [crystalline-alien.room.hatchery](designs/crystalline-alien.room.hatchery/DESIGN.md) |
| [Curved connector frame](assets/alien-ship-1--curved-connector-frame/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Alien standard connector](assets/alien-ship-1--alien-standard-connector/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Alien open block](assets/alien-ship-1--alien-open-block/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Alien small connector](assets/alien-ship-1--alien-small-connector/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Curved hull tile](assets/alien-ship-1--curved-hull-tile/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Spire hull](assets/alien-ship-1--spire-hull/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Crystal node](assets/alien-ship-1--crystal-node/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.resource.crystal](designs/crystalline-alien.resource.crystal/DESIGN.md) |
| [Energy conduit](assets/alien-ship-1--energy-conduit/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.pipe.standard](designs/crystalline-alien.pipe.standard/DESIGN.md) |
| [Organic hull](assets/alien-ship-1--organic-hull/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Floor tile](assets/alien-ship-1--floor-tile/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.floor.floor](designs/crystalline-alien.floor.floor/DESIGN.md) |
| [Curved wall](assets/alien-ship-1--curved-wall/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.wall.standard](designs/crystalline-alien.wall.standard/DESIGN.md) |
| [Archway](assets/alien-ship-1--archway/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Hex connector](assets/alien-ship-1--hex-connector/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Ceiling dome](assets/alien-ship-1--ceiling-dome/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.roof.standard](designs/crystalline-alien.roof.standard/DESIGN.md) |
| [Life pod](assets/alien-ship-1--life-pod/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Psionic console](assets/alien-ship-1--psionic-console/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.console.standard](designs/crystalline-alien.console.standard/DESIGN.md) |
| [Plant vat](assets/alien-ship-1--plant-vat/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.plant.standard](designs/crystalline-alien.plant.standard/DESIGN.md) |
| [Drone bay](assets/alien-ship-1--drone-bay/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Wing connector](assets/alien-ship-1--wing-connector/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.mount.standard](designs/crystalline-alien.mount.standard/DESIGN.md) |
| [Wing tip](assets/alien-ship-1--wing-tip/BRIEF.md) | alien-ship-1.png | structure | [crystalline-alien.hull.standard](designs/crystalline-alien.hull.standard/DESIGN.md) |
| [Alien snap grid diagram](assets/alien-ship-1--alien-snap-grid-diagram/BRIEF.md) | alien-ship-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Aurelian crystal insignia](assets/alien-ship-1--aurelian-crystal-insignia/BRIEF.md) | alien-ship-1.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Riftjack marauder ship](assets/alien-ship-2--riftjack-marauder-ship/BRIEF.md) | alien-ship-2.png | ship | [ship.riftjack](designs/ship.riftjack/DESIGN.md) |
| [Raider engine boosters](assets/alien-ship-2--raider-engine-boosters/BRIEF.md) | alien-ship-2.png | engine | [raider.engine.engine](designs/raider.engine.engine/DESIGN.md) |
| [Salvaged shield emitter](assets/alien-ship-2--salvaged-shield-emitter/BRIEF.md) | alien-ship-2.png | system | [raider.shield.standard](designs/raider.shield.standard/DESIGN.md) |
| [Raider weapon pod](assets/alien-ship-2--raider-weapon-pod/BRIEF.md) | alien-ship-2.png | weapon | [raider.turret.standard](designs/raider.turret.standard/DESIGN.md) |
| [Raider crew bunks room](assets/alien-ship-2--raider-crew-bunks-room/BRIEF.md) | alien-ship-2.png | room | [raider.room.crew](designs/raider.room.crew/DESIGN.md) |
| [Stolen cargo hold](assets/alien-ship-2--stolen-cargo-hold/BRIEF.md) | alien-ship-2.png | room | [raider.room.cargo](designs/raider.room.cargo/DESIGN.md) |
| [Raider bridge](assets/alien-ship-2--raider-bridge/BRIEF.md) | alien-ship-2.png | room | [raider.room.bridge](designs/raider.room.bridge/DESIGN.md) |
| [Raider hull chain](assets/alien-ship-2--raider-hull-chain/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Boarding module](assets/alien-ship-2--boarding-module/BRIEF.md) | alien-ship-2.png | room | [raider.room.assembly](designs/raider.room.assembly/DESIGN.md) |
| [Raider bridge roof turret](assets/alien-ship-2--raider-bridge-roof-turret/BRIEF.md) | alien-ship-2.png | weapon | [raider.turret.standard](designs/raider.turret.standard/DESIGN.md) |
| [Detached raider roof](assets/alien-ship-2--detached-raider-roof/BRIEF.md) | alien-ship-2.png | structure | [raider.roof.standard](designs/raider.roof.standard/DESIGN.md) |
| [Detached raider side panel](assets/alien-ship-2--detached-raider-side-panel/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Detached corridor frame](assets/alien-ship-2--detached-corridor-frame/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Raider scale crew](assets/alien-ship-2--raider-scale-crew/BRIEF.md) | alien-ship-2.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Salvaged armor closeup](assets/alien-ship-2--salvaged-armor-closeup/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Exposed conduit closeup](assets/alien-ship-2--exposed-conduit-closeup/BRIEF.md) | alien-ship-2.png | structure | [raider.pipe.standard](designs/raider.pipe.standard/DESIGN.md) |
| [Spike detail closeup](assets/alien-ship-2--spike-detail-closeup/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Scrap hull](assets/alien-ship-2--scrap-hull/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Spiked hull](assets/alien-ship-2--spiked-hull/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Reinforced corner](assets/alien-ship-2--reinforced-corner/BRIEF.md) | alien-ship-2.png | structure | [raider.corner.standard](designs/raider.corner.standard/DESIGN.md) |
| [Jury-rig panel](assets/alien-ship-2--jury-rig-panel/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Exposed frame](assets/alien-ship-2--exposed-frame/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Chain module](assets/alien-ship-2--chain-module/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Patch plate](assets/alien-ship-2--patch-plate/BRIEF.md) | alien-ship-2.png | structure | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Weapon pod miniature](assets/alien-ship-2--weapon-pod-miniature/BRIEF.md) | alien-ship-2.png | system | [raider.turret.standard](designs/raider.turret.standard/DESIGN.md) |
| [Engine miniature](assets/alien-ship-2--engine-miniature/BRIEF.md) | alien-ship-2.png | system | [raider.engine.engine](designs/raider.engine.engine/DESIGN.md) |
| [Shield emitter miniature](assets/alien-ship-2--shield-emitter-miniature/BRIEF.md) | alien-ship-2.png | system | [raider.shield.standard](designs/raider.shield.standard/DESIGN.md) |
| [Crew bunks miniature](assets/alien-ship-2--crew-bunks-miniature/BRIEF.md) | alien-ship-2.png | system | [raider.bunk.standard](designs/raider.bunk.standard/DESIGN.md) |
| [Cargo hold miniature](assets/alien-ship-2--cargo-hold-miniature/BRIEF.md) | alien-ship-2.png | system | [raider.crate.cargo](designs/raider.crate.cargo/DESIGN.md) |
| [Bridge miniature](assets/alien-ship-2--bridge-miniature/BRIEF.md) | alien-ship-2.png | system | [raider.machine.standard](designs/raider.machine.standard/DESIGN.md) |
| [Boarding module miniature](assets/alien-ship-2--boarding-module-miniature/BRIEF.md) | alien-ship-2.png | system | [raider.machine.standard](designs/raider.machine.standard/DESIGN.md) |
| [Spike ram](assets/alien-ship-2--spike-ram/BRIEF.md) | alien-ship-2.png | system | [raider.hull.standard](designs/raider.hull.standard/DESIGN.md) |
| [Chain launcher](assets/alien-ship-2--chain-launcher/BRIEF.md) | alien-ship-2.png | system | [raider.machine.standard](designs/raider.machine.standard/DESIGN.md) |
| [Scrap cannon](assets/alien-ship-2--scrap-cannon/BRIEF.md) | alien-ship-2.png | system | [raider.turret.scrap](designs/raider.turret.scrap/DESIGN.md) |
| [Boarding pod](assets/alien-ship-2--boarding-pod/BRIEF.md) | alien-ship-2.png | system | [raider.machine.standard](designs/raider.machine.standard/DESIGN.md) |
| [Salvage drone](assets/alien-ship-2--salvage-drone/BRIEF.md) | alien-ship-2.png | system | [raider.machine.drone](designs/raider.machine.drone/DESIGN.md) |
| [Jammer array](assets/alien-ship-2--jammer-array/BRIEF.md) | alien-ship-2.png | system | [raider.machine.jammer](designs/raider.machine.jammer/DESIGN.md) |
| [Riftjack skull insignia](assets/alien-ship-2--riftjack-skull-insignia/BRIEF.md) | alien-ship-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Inhabited cutaway ship](assets/fully-complete-constructed-space-ship--inhabited-cutaway-ship/BRIEF.md) | fully-complete-constructed-space-ship.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Engineering reactor](assets/fully-complete-constructed-space-ship--engineering-reactor/BRIEF.md) | fully-complete-constructed-space-ship.png | system | [pale-studless.reactor.standard](designs/pale-studless.reactor.standard/DESIGN.md) |
| [Engineering console](assets/fully-complete-constructed-space-ship--engineering-console/BRIEF.md) | fully-complete-constructed-space-ship.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Engineering wall screen](assets/fully-complete-constructed-space-ship--engineering-wall-screen/BRIEF.md) | fully-complete-constructed-space-ship.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Engineering tool panel](assets/fully-complete-constructed-space-ship--engineering-tool-panel/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Hydroponic tiered trays](assets/fully-complete-constructed-space-ship--hydroponic-tiered-trays/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.hydroponics.standard](designs/pale-studless.hydroponics.standard/DESIGN.md) |
| [Hydroponics terminal](assets/fully-complete-constructed-space-ship--hydroponics-terminal/BRIEF.md) | fully-complete-constructed-space-ship.png | console | [pale-studless.hydroponics.standard](designs/pale-studless.hydroponics.standard/DESIGN.md) |
| [Hydroponics door](assets/fully-complete-constructed-space-ship--hydroponics-door/BRIEF.md) | fully-complete-constructed-space-ship.png | door | [pale-studless.hydroponics.standard](designs/pale-studless.hydroponics.standard/DESIGN.md) |
| [Medical bed](assets/fully-complete-constructed-space-ship--medical-bed/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Medical equipment cart](assets/fully-complete-constructed-space-ship--medical-equipment-cart/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Medical wall supply locker](assets/fully-complete-constructed-space-ship--medical-wall-supply-locker/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Medical cross sign](assets/fully-complete-constructed-space-ship--medical-cross-sign/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Medical diagnostic monitor](assets/fully-complete-constructed-space-ship--medical-diagnostic-monitor/BRIEF.md) | fully-complete-constructed-space-ship.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Medical IV equipment](assets/fully-complete-constructed-space-ship--medical-iv-equipment/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.machine.standard](designs/pale-studless.machine.standard/DESIGN.md) |
| [Bridge control chair](assets/fully-complete-constructed-space-ship--bridge-control-chair/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) |
| [Bridge console horseshoe](assets/fully-complete-constructed-space-ship--bridge-console-horseshoe/BRIEF.md) | fully-complete-constructed-space-ship.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Bridge plant](assets/fully-complete-constructed-space-ship--bridge-plant/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Bridge canopy](assets/fully-complete-constructed-space-ship--bridge-canopy/BRIEF.md) | fully-complete-constructed-space-ship.png | door | [pale-studless.window.canopy](designs/pale-studless.window.canopy/DESIGN.md) |
| [Crew bunk beds](assets/fully-complete-constructed-space-ship--crew-bunk-beds/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.bunk.standard](designs/pale-studless.bunk.standard/DESIGN.md) |
| [Crew dining table](assets/fully-complete-constructed-space-ship--crew-dining-table/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Crew wall desk](assets/fully-complete-constructed-space-ship--crew-wall-desk/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Crew rug](assets/fully-complete-constructed-space-ship--crew-rug/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Crew poster left](assets/fully-complete-constructed-space-ship--crew-poster-left/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Crew poster right](assets/fully-complete-constructed-space-ship--crew-poster-right/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Lounge red sectional](assets/fully-complete-constructed-space-ship--lounge-red-sectional/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.sofa.standard](designs/pale-studless.sofa.standard/DESIGN.md) |
| [Lounge coffee table](assets/fully-complete-constructed-space-ship--lounge-coffee-table/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Lounge tall plant](assets/fully-complete-constructed-space-ship--lounge-tall-plant/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Lounge floor plant](assets/fully-complete-constructed-space-ship--lounge-floor-plant/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Lounge table plant](assets/fully-complete-constructed-space-ship--lounge-table-plant/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Lounge table bottle left](assets/fully-complete-constructed-space-ship--lounge-table-bottle-left/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Lounge table bottle right](assets/fully-complete-constructed-space-ship--lounge-table-bottle-right/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Lounge vending machine](assets/fully-complete-constructed-space-ship--lounge-vending-machine/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Lounge arcade machine](assets/fully-complete-constructed-space-ship--lounge-arcade-machine/BRIEF.md) | fully-complete-constructed-space-ship.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Lounge crew poster](assets/fully-complete-constructed-space-ship--lounge-crew-poster/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Storage orange rear crate](assets/fully-complete-constructed-space-ship--storage-orange-rear-crate/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage gold stack](assets/fully-complete-constructed-space-ship--storage-gold-stack/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage yellow rear crate](assets/fully-complete-constructed-space-ship--storage-yellow-rear-crate/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage red case](assets/fully-complete-constructed-space-ship--storage-red-case/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage pale stack](assets/fully-complete-constructed-space-ship--storage-pale-stack/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage gold front crate](assets/fully-complete-constructed-space-ship--storage-gold-front-crate/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage yellow front crate](assets/fully-complete-constructed-space-ship--storage-yellow-front-crate/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage blue front case](assets/fully-complete-constructed-space-ship--storage-blue-front-case/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage purple case](assets/fully-complete-constructed-space-ship--storage-purple-case/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Storage dark case](assets/fully-complete-constructed-space-ship--storage-dark-case/BRIEF.md) | fully-complete-constructed-space-ship.png | cargo | [pale-studless.crate.standard](designs/pale-studless.crate.standard/DESIGN.md) |
| [Airlock pressure door](assets/fully-complete-constructed-space-ship--airlock-pressure-door/BRIEF.md) | fully-complete-constructed-space-ship.png | door | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Airlock service device](assets/fully-complete-constructed-space-ship--airlock-service-device/BRIEF.md) | fully-complete-constructed-space-ship.png | system | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Airlock hazard ramp](assets/fully-complete-constructed-space-ship--airlock-hazard-ramp/BRIEF.md) | fully-complete-constructed-space-ship.png | structure | [pale-studless.door.airlock](designs/pale-studless.door.airlock/DESIGN.md) |
| [Captain walking crew](assets/fully-complete-constructed-space-ship--captain-walking-crew/BRIEF.md) | fully-complete-constructed-space-ship.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Airlock crew](assets/fully-complete-constructed-space-ship--airlock-crew/BRIEF.md) | fully-complete-constructed-space-ship.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Roof sensor dish](assets/fully-complete-constructed-space-ship--roof-sensor-dish/BRIEF.md) | fully-complete-constructed-space-ship.png | sensor | [pale-studless.sensor.dish](designs/pale-studless.sensor.dish/DESIGN.md) |
| [Roof turret](assets/fully-complete-constructed-space-ship--roof-turret/BRIEF.md) | fully-complete-constructed-space-ship.png | weapon | [pale-studless.turret.standard](designs/pale-studless.turret.standard/DESIGN.md) |
| [Hull insignia](assets/fully-complete-constructed-space-ship--hull-insignia/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Hull service poster](assets/fully-complete-constructed-space-ship--hull-service-poster/BRIEF.md) | fully-complete-constructed-space-ship.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Detached background ship](assets/fully-complete-constructed-space-ship--detached-background-ship/BRIEF.md) | fully-complete-constructed-space-ship.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Foreground rocky asteroid](assets/fully-complete-constructed-space-ship--foreground-rocky-asteroid/BRIEF.md) | fully-complete-constructed-space-ship.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Ringed planet limb](assets/fully-complete-constructed-space-ship--ringed-planet-limb/BRIEF.md) | fully-complete-constructed-space-ship.png | planet | [environment.planet.unspecified](designs/environment.planet.unspecified/DESIGN.md) |
| [Engine bank nozzle 1](assets/fully-complete-constructed-space-ship--engine-bank-nozzle-1/BRIEF.md) | fully-complete-constructed-space-ship.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Engine bank nozzle 2](assets/fully-complete-constructed-space-ship--engine-bank-nozzle-2/BRIEF.md) | fully-complete-constructed-space-ship.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Engine bank nozzle 3](assets/fully-complete-constructed-space-ship--engine-bank-nozzle-3/BRIEF.md) | fully-complete-constructed-space-ship.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Rock asteroid 1](assets/fully-complete-constructed-space-ship--rock-asteroid-1/BRIEF.md) | fully-complete-constructed-space-ship.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Rock asteroid 2](assets/fully-complete-constructed-space-ship--rock-asteroid-2/BRIEF.md) | fully-complete-constructed-space-ship.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Rock asteroid 3](assets/fully-complete-constructed-space-ship--rock-asteroid-3/BRIEF.md) | fully-complete-constructed-space-ship.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Rock asteroid 4](assets/fully-complete-constructed-space-ship--rock-asteroid-4/BRIEF.md) | fully-complete-constructed-space-ship.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Rock asteroid 5](assets/fully-complete-constructed-space-ship--rock-asteroid-5/BRIEF.md) | fully-complete-constructed-space-ship.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Razor fighter cutaway](assets/small-craft-example-3d--razor-fighter-cutaway/BRIEF.md) | small-craft-example-3d.png | ship | [ship.razor](designs/ship.razor/DESIGN.md) |
| [Razor canopy](assets/small-craft-example-3d--razor-canopy/BRIEF.md) | small-craft-example-3d.png | door | [pale-studless.window.canopy](designs/pale-studless.window.canopy/DESIGN.md) |
| [Razor pilot](assets/small-craft-example-3d--razor-pilot/BRIEF.md) | small-craft-example-3d.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Razor control console](assets/small-craft-example-3d--razor-control-console/BRIEF.md) | small-craft-example-3d.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Razor pilot chair](assets/small-craft-example-3d--razor-pilot-chair/BRIEF.md) | small-craft-example-3d.png | furniture | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) |
| [Rear medkit locker](assets/small-craft-example-3d--rear-medkit-locker/BRIEF.md) | small-craft-example-3d.png | furniture | [pale-studless.locker.standard](designs/pale-studless.locker.standard/DESIGN.md) |
| [Rear wall console](assets/small-craft-example-3d--rear-wall-console/BRIEF.md) | small-craft-example-3d.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Rear floor hatch](assets/small-craft-example-3d--rear-floor-hatch/BRIEF.md) | small-craft-example-3d.png | structure | [pale-studless.door.hatch](designs/pale-studless.door.hatch/DESIGN.md) |
| [Rear compartment doorway](assets/small-craft-example-3d--rear-compartment-doorway/BRIEF.md) | small-craft-example-3d.png | door | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Starboard wing](assets/small-craft-example-3d--starboard-wing/BRIEF.md) | small-craft-example-3d.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Port wing](assets/small-craft-example-3d--port-wing/BRIEF.md) | small-craft-example-3d.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Port engine](assets/small-craft-example-3d--port-engine/BRIEF.md) | small-craft-example-3d.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Starboard engine](assets/small-craft-example-3d--starboard-engine/BRIEF.md) | small-craft-example-3d.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Razor nose panel](assets/small-craft-example-3d--razor-nose-panel/BRIEF.md) | small-craft-example-3d.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Razor wing insignia](assets/small-craft-example-3d--razor-wing-insignia/BRIEF.md) | small-craft-example-3d.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Razor warm navigation light](assets/small-craft-example-3d--razor-warm-navigation-light/BRIEF.md) | small-craft-example-3d.png | decor | [pale-studless.light.standard](designs/pale-studless.light.standard/DESIGN.md) |
| [Razor blue side strip](assets/small-craft-example-3d--razor-blue-side-strip/BRIEF.md) | small-craft-example-3d.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Razor left asteroid](assets/small-craft-example-3d--razor-left-asteroid/BRIEF.md) | small-craft-example-3d.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Razor lower asteroid](assets/small-craft-example-3d--razor-lower-asteroid/BRIEF.md) | small-craft-example-3d.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Ship identity HUD](assets/small-craft-example-3d--ship-identity-hud/BRIEF.md) | small-craft-example-3d.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View mode button](assets/small-craft-example-3d--view-mode-button/BRIEF.md) | small-craft-example-3d.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Menu button](assets/small-craft-example-3d--menu-button/BRIEF.md) | small-craft-example-3d.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Connection status](assets/small-craft-example-3d--connection-status/BRIEF.md) | small-craft-example-3d.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Flight telemetry](assets/small-craft-example-3d--flight-telemetry/BRIEF.md) | small-craft-example-3d.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Interaction prompt](assets/small-craft-example-3d--interaction-prompt/BRIEF.md) | small-craft-example-3d.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Input hints](assets/small-craft-example-3d--input-hints/BRIEF.md) | small-craft-example-3d.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Razor fighter overhead](assets/small-craft-example-top--razor-fighter-overhead/BRIEF.md) | small-craft-example-top.png | ship | [ship.razor](designs/ship.razor/DESIGN.md) |
| [Razor overhead canopy](assets/small-craft-example-top--razor-overhead-canopy/BRIEF.md) | small-craft-example-top.png | door | [pale-studless.window.canopy](designs/pale-studless.window.canopy/DESIGN.md) |
| [Razor overhead pilot](assets/small-craft-example-top--razor-overhead-pilot/BRIEF.md) | small-craft-example-top.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Razor central roof](assets/small-craft-example-top--razor-central-roof/BRIEF.md) | small-craft-example-top.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Razor port wing roof](assets/small-craft-example-top--razor-port-wing-roof/BRIEF.md) | small-craft-example-top.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Razor starboard wing roof](assets/small-craft-example-top--razor-starboard-wing-roof/BRIEF.md) | small-craft-example-top.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Razor port engine overhead](assets/small-craft-example-top--razor-port-engine-overhead/BRIEF.md) | small-craft-example-top.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Razor starboard engine overhead](assets/small-craft-example-top--razor-starboard-engine-overhead/BRIEF.md) | small-craft-example-top.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Razor nose roof](assets/small-craft-example-top--razor-nose-roof/BRIEF.md) | small-craft-example-top.png | structure | [pale-studless.roof.standard](designs/pale-studless.roof.standard/DESIGN.md) |
| [Razor engine spine vent](assets/small-craft-example-top--razor-engine-spine-vent/BRIEF.md) | small-craft-example-top.png | structure | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Razor upper-left asteroid](assets/small-craft-example-top--razor-upper-left-asteroid/BRIEF.md) | small-craft-example-top.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Razor left asteroid](assets/small-craft-example-top--razor-left-asteroid/BRIEF.md) | small-craft-example-top.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Razor upper-right asteroid](assets/small-craft-example-top--razor-upper-right-asteroid/BRIEF.md) | small-craft-example-top.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Razor lower-right asteroid](assets/small-craft-example-top--razor-lower-right-asteroid/BRIEF.md) | small-craft-example-top.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Ship identity HUD](assets/small-craft-example-top--ship-identity-hud/BRIEF.md) | small-craft-example-top.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View mode button](assets/small-craft-example-top--view-mode-button/BRIEF.md) | small-craft-example-top.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Menu button](assets/small-craft-example-top--menu-button/BRIEF.md) | small-craft-example-top.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Connection status](assets/small-craft-example-top--connection-status/BRIEF.md) | small-craft-example-top.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Flight telemetry](assets/small-craft-example-top--flight-telemetry/BRIEF.md) | small-craft-example-top.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Interaction prompt](assets/small-craft-example-top--interaction-prompt/BRIEF.md) | small-craft-example-top.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Input hints](assets/small-craft-example-top--input-hints/BRIEF.md) | small-craft-example-top.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Wayfarer target cutaway](assets/3d-rpg-after--wayfarer-target-cutaway/BRIEF.md) | 3d-rpg-after.png | ship | [shipyard.hull.pilot-section](designs/shipyard.hull.pilot-section/DESIGN.md) |
| [Wayfarer cockpit canopy](assets/3d-rpg-after--wayfarer-cockpit-canopy/BRIEF.md) | 3d-rpg-after.png | door | [pale-studless.window.canopy](designs/pale-studless.window.canopy/DESIGN.md) |
| [Wayfarer pilot seat](assets/3d-rpg-after--wayfarer-pilot-seat/BRIEF.md) | 3d-rpg-after.png | furniture | [shipyard.equipment.pilot-seat](designs/shipyard.equipment.pilot-seat/DESIGN.md) |
| [Wayfarer bridge console](assets/3d-rpg-after--wayfarer-bridge-console/BRIEF.md) | 3d-rpg-after.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Wayfarer wall storage](assets/3d-rpg-after--wayfarer-wall-storage/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Wayfarer standing character](assets/3d-rpg-after--wayfarer-standing-character/BRIEF.md) | 3d-rpg-after.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Wayfarer lounge sofa](assets/3d-rpg-after--wayfarer-lounge-sofa/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.sofa.standard](designs/pale-studless.sofa.standard/DESIGN.md) |
| [Wayfarer lounge table](assets/3d-rpg-after--wayfarer-lounge-table/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.table.standard](designs/pale-studless.table.standard/DESIGN.md) |
| [Wayfarer lounge poster](assets/3d-rpg-after--wayfarer-lounge-poster/BRIEF.md) | 3d-rpg-after.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Wayfarer lounge plant](assets/3d-rpg-after--wayfarer-lounge-plant/BRIEF.md) | 3d-rpg-after.png | decor | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Wayfarer wall shelf](assets/3d-rpg-after--wayfarer-wall-shelf/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Wayfarer single bed](assets/3d-rpg-after--wayfarer-single-bed/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Wayfarer bunk beds](assets/3d-rpg-after--wayfarer-bunk-beds/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.bunk.standard](designs/pale-studless.bunk.standard/DESIGN.md) |
| [Wayfarer bedroom terminal](assets/3d-rpg-after--wayfarer-bedroom-terminal/BRIEF.md) | 3d-rpg-after.png | console | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Wayfarer crew door](assets/3d-rpg-after--wayfarer-crew-door/BRIEF.md) | 3d-rpg-after.png | door | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Wayfarer cargo gold crate](assets/3d-rpg-after--wayfarer-cargo-gold-crate/BRIEF.md) | 3d-rpg-after.png | cargo | [pale-studless.crate.cargo](designs/pale-studless.crate.cargo/DESIGN.md) |
| [Wayfarer cargo orange crate](assets/3d-rpg-after--wayfarer-cargo-orange-crate/BRIEF.md) | 3d-rpg-after.png | cargo | [pale-studless.crate.cargo](designs/pale-studless.crate.cargo/DESIGN.md) |
| [Wayfarer cargo pale crate](assets/3d-rpg-after--wayfarer-cargo-pale-crate/BRIEF.md) | 3d-rpg-after.png | cargo | [pale-studless.crate.cargo](designs/pale-studless.crate.cargo/DESIGN.md) |
| [Wayfarer cargo blue crate](assets/3d-rpg-after--wayfarer-cargo-blue-crate/BRIEF.md) | 3d-rpg-after.png | cargo | [pale-studless.crate.cargo](designs/pale-studless.crate.cargo/DESIGN.md) |
| [Wayfarer hydroponics bed](assets/3d-rpg-after--wayfarer-hydroponics-bed/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.bed.standard](designs/pale-studless.bed.standard/DESIGN.md) |
| [Wayfarer small planter](assets/3d-rpg-after--wayfarer-small-planter/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.plant.standard](designs/pale-studless.plant.standard/DESIGN.md) |
| [Wayfarer equipment console](assets/3d-rpg-after--wayfarer-equipment-console/BRIEF.md) | 3d-rpg-after.png | console | [pale-studless.console.standard](designs/pale-studless.console.standard/DESIGN.md) |
| [Wayfarer engineering chair](assets/3d-rpg-after--wayfarer-engineering-chair/BRIEF.md) | 3d-rpg-after.png | furniture | [pale-studless.chair.standard](designs/pale-studless.chair.standard/DESIGN.md) |
| [Wayfarer port engine](assets/3d-rpg-after--wayfarer-port-engine/BRIEF.md) | 3d-rpg-after.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Wayfarer center engine](assets/3d-rpg-after--wayfarer-center-engine/BRIEF.md) | 3d-rpg-after.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Wayfarer near engine](assets/3d-rpg-after--wayfarer-near-engine/BRIEF.md) | 3d-rpg-after.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Wayfarer partition segment](assets/3d-rpg-after--wayfarer-partition-segment/BRIEF.md) | 3d-rpg-after.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Wayfarer cyan door header](assets/3d-rpg-after--wayfarer-cyan-door-header/BRIEF.md) | 3d-rpg-after.png | decor | [pale-studless.door.door](designs/pale-studless.door.door/DESIGN.md) |
| [Wayfarer center floor grate](assets/3d-rpg-after--wayfarer-center-floor-grate/BRIEF.md) | 3d-rpg-after.png | structure | [pale-studless.floor.grate](designs/pale-studless.floor.grate/DESIGN.md) |
| [Wayfarer exterior red service panel](assets/3d-rpg-after--wayfarer-exterior-red-service-panel/BRIEF.md) | 3d-rpg-after.png | structure | [shipyard.hull.side-armor](designs/shipyard.hull.side-armor/DESIGN.md) |
| [Wayfarer exterior vent wall](assets/3d-rpg-after--wayfarer-exterior-vent-wall/BRIEF.md) | 3d-rpg-after.png | structure | [pale-studless.wall.standard](designs/pale-studless.wall.standard/DESIGN.md) |
| [Wayfarer exterior side hatch](assets/3d-rpg-after--wayfarer-exterior-side-hatch/BRIEF.md) | 3d-rpg-after.png | door | [pale-studless.door.hatch](designs/pale-studless.door.hatch/DESIGN.md) |
| [Wayfarer exterior slogan panel](assets/3d-rpg-after--wayfarer-exterior-slogan-panel/BRIEF.md) | 3d-rpg-after.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Wayfarer front nameplate](assets/3d-rpg-after--wayfarer-front-nameplate/BRIEF.md) | 3d-rpg-after.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Ship identity HUD](assets/3d-rpg-after--ship-identity-hud/BRIEF.md) | 3d-rpg-after.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View mode button](assets/3d-rpg-after--view-mode-button/BRIEF.md) | 3d-rpg-after.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Menu button](assets/3d-rpg-after--menu-button/BRIEF.md) | 3d-rpg-after.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Connection status](assets/3d-rpg-after--connection-status/BRIEF.md) | 3d-rpg-after.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Flight telemetry](assets/3d-rpg-after--flight-telemetry/BRIEF.md) | 3d-rpg-after.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Interaction prompt](assets/3d-rpg-after--interaction-prompt/BRIEF.md) | 3d-rpg-after.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Input hints](assets/3d-rpg-after--input-hints/BRIEF.md) | 3d-rpg-after.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Wayfarer prototype cutaway](assets/3d-rpg-before--wayfarer-prototype-cutaway/BRIEF.md) | 3d-rpg-before.png | ship | [shipyard.hull.pilot-section](designs/shipyard.hull.pilot-section/DESIGN.md) |
| [Prototype stepped bow](assets/3d-rpg-before--prototype-stepped-bow/BRIEF.md) | 3d-rpg-before.png | structure | [historical-baseline.hull.standard](designs/historical-baseline.hull.standard/DESIGN.md) |
| [Prototype bridge console](assets/3d-rpg-before--prototype-bridge-console/BRIEF.md) | 3d-rpg-before.png | console | [historical-baseline.console.standard](designs/historical-baseline.console.standard/DESIGN.md) |
| [Prototype crew](assets/3d-rpg-before--prototype-crew/BRIEF.md) | 3d-rpg-before.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Prototype sofa](assets/3d-rpg-before--prototype-sofa/BRIEF.md) | 3d-rpg-before.png | furniture | [historical-baseline.sofa.standard](designs/historical-baseline.sofa.standard/DESIGN.md) |
| [Prototype single bed](assets/3d-rpg-before--prototype-single-bed/BRIEF.md) | 3d-rpg-before.png | furniture | [historical-baseline.bed.standard](designs/historical-baseline.bed.standard/DESIGN.md) |
| [Prototype bunk](assets/3d-rpg-before--prototype-bunk/BRIEF.md) | 3d-rpg-before.png | furniture | [historical-baseline.bunk.standard](designs/historical-baseline.bunk.standard/DESIGN.md) |
| [Prototype left partition](assets/3d-rpg-before--prototype-left-partition/BRIEF.md) | 3d-rpg-before.png | structure | [historical-baseline.wall.standard](designs/historical-baseline.wall.standard/DESIGN.md) |
| [Prototype wall fixture](assets/3d-rpg-before--prototype-wall-fixture/BRIEF.md) | 3d-rpg-before.png | structure | [historical-baseline.wall.standard](designs/historical-baseline.wall.standard/DESIGN.md) |
| [Prototype hydroponics](assets/3d-rpg-before--prototype-hydroponics/BRIEF.md) | 3d-rpg-before.png | furniture | [historical-baseline.hydroponics.standard](designs/historical-baseline.hydroponics.standard/DESIGN.md) |
| [Prototype front service wall](assets/3d-rpg-before--prototype-front-service-wall/BRIEF.md) | 3d-rpg-before.png | structure | [historical-baseline.wall.standard](designs/historical-baseline.wall.standard/DESIGN.md) |
| [Prototype far engine](assets/3d-rpg-before--prototype-far-engine/BRIEF.md) | 3d-rpg-before.png | engine | [historical-baseline.engine.engine](designs/historical-baseline.engine.engine/DESIGN.md) |
| [Prototype middle engine](assets/3d-rpg-before--prototype-middle-engine/BRIEF.md) | 3d-rpg-before.png | engine | [historical-baseline.engine.engine](designs/historical-baseline.engine.engine/DESIGN.md) |
| [Prototype near engine](assets/3d-rpg-before--prototype-near-engine/BRIEF.md) | 3d-rpg-before.png | engine | [historical-baseline.engine.engine](designs/historical-baseline.engine.engine/DESIGN.md) |
| [Ship identity HUD](assets/3d-rpg-before--ship-identity-hud/BRIEF.md) | 3d-rpg-before.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View mode button](assets/3d-rpg-before--view-mode-button/BRIEF.md) | 3d-rpg-before.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Menu button](assets/3d-rpg-before--menu-button/BRIEF.md) | 3d-rpg-before.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Connection status](assets/3d-rpg-before--connection-status/BRIEF.md) | 3d-rpg-before.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Flight telemetry](assets/3d-rpg-before--flight-telemetry/BRIEF.md) | 3d-rpg-before.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Interaction prompt](assets/3d-rpg-before--interaction-prompt/BRIEF.md) | 3d-rpg-before.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Input hints](assets/3d-rpg-before--input-hints/BRIEF.md) | 3d-rpg-before.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Wayfarer prototype overhead](assets/top-down-before--wayfarer-prototype-overhead/BRIEF.md) | top-down-before.png | ship | [ship.wayfarer](designs/ship.wayfarer/DESIGN.md) |
| [Prototype roof skin](assets/top-down-before--prototype-roof-skin/BRIEF.md) | top-down-before.png | structure | [historical-baseline.roof.standard](designs/historical-baseline.roof.standard/DESIGN.md) |
| [Prototype port engine](assets/top-down-before--prototype-port-engine/BRIEF.md) | top-down-before.png | engine | [historical-baseline.engine.engine](designs/historical-baseline.engine.engine/DESIGN.md) |
| [Prototype center engine](assets/top-down-before--prototype-center-engine/BRIEF.md) | top-down-before.png | engine | [historical-baseline.engine.engine](designs/historical-baseline.engine.engine/DESIGN.md) |
| [Prototype starboard engine](assets/top-down-before--prototype-starboard-engine/BRIEF.md) | top-down-before.png | engine | [historical-baseline.engine.engine](designs/historical-baseline.engine.engine/DESIGN.md) |
| [Ship identity HUD](assets/top-down-before--ship-identity-hud/BRIEF.md) | top-down-before.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View mode button](assets/top-down-before--view-mode-button/BRIEF.md) | top-down-before.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Menu button](assets/top-down-before--menu-button/BRIEF.md) | top-down-before.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Connection status](assets/top-down-before--connection-status/BRIEF.md) | top-down-before.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Flight telemetry](assets/top-down-before--flight-telemetry/BRIEF.md) | top-down-before.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Interaction prompt](assets/top-down-before--interaction-prompt/BRIEF.md) | top-down-before.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Input hints](assets/top-down-before--input-hints/BRIEF.md) | top-down-before.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Wayfarer target overhead](assets/top-down-after--wayfarer-target-overhead/BRIEF.md) | top-down-after.png | ship | [ship.wayfarer](designs/ship.wayfarer/DESIGN.md) |
| [Wayfarer canopy overhead](assets/top-down-after--wayfarer-canopy-overhead/BRIEF.md) | top-down-after.png | door | [pale-studless.window.canopy](designs/pale-studless.window.canopy/DESIGN.md) |
| [Wayfarer forward roof](assets/top-down-after--wayfarer-forward-roof/BRIEF.md) | top-down-after.png | structure | [shipyard.roof.frontier](designs/shipyard.roof.frontier/DESIGN.md) |
| [Wayfarer center roof emblem](assets/top-down-after--wayfarer-center-roof-emblem/BRIEF.md) | top-down-after.png | decor | [pale-studless.decal.standard](designs/pale-studless.decal.standard/DESIGN.md) |
| [Wayfarer forward access plate](assets/top-down-after--wayfarer-forward-access-plate/BRIEF.md) | top-down-after.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Wayfarer mid access plate](assets/top-down-after--wayfarer-mid-access-plate/BRIEF.md) | top-down-after.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Wayfarer rear access plate](assets/top-down-after--wayfarer-rear-access-plate/BRIEF.md) | top-down-after.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Wayfarer front vent](assets/top-down-after--wayfarer-front-vent/BRIEF.md) | top-down-after.png | structure | [pale-studless.hull.standard](designs/pale-studless.hull.standard/DESIGN.md) |
| [Wayfarer rear roof vent](assets/top-down-after--wayfarer-rear-roof-vent/BRIEF.md) | top-down-after.png | structure | [shipyard.roof.frontier](designs/shipyard.roof.frontier/DESIGN.md) |
| [Wayfarer port engine overhead](assets/top-down-after--wayfarer-port-engine-overhead/BRIEF.md) | top-down-after.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Wayfarer middle engine overhead](assets/top-down-after--wayfarer-middle-engine-overhead/BRIEF.md) | top-down-after.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Wayfarer starboard engine overhead](assets/top-down-after--wayfarer-starboard-engine-overhead/BRIEF.md) | top-down-after.png | engine | [pale-studless.engine.engine](designs/pale-studless.engine.engine/DESIGN.md) |
| [Wayfarer upper-right asteroid](assets/top-down-after--wayfarer-upper-right-asteroid/BRIEF.md) | top-down-after.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Wayfarer lower-right asteroid](assets/top-down-after--wayfarer-lower-right-asteroid/BRIEF.md) | top-down-after.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Wayfarer left asteroid](assets/top-down-after--wayfarer-left-asteroid/BRIEF.md) | top-down-after.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Wayfarer lower asteroid](assets/top-down-after--wayfarer-lower-asteroid/BRIEF.md) | top-down-after.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Ship identity HUD](assets/top-down-after--ship-identity-hud/BRIEF.md) | top-down-after.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [View mode button](assets/top-down-after--view-mode-button/BRIEF.md) | top-down-after.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Menu button](assets/top-down-after--menu-button/BRIEF.md) | top-down-after.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Connection status](assets/top-down-after--connection-status/BRIEF.md) | top-down-after.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Flight telemetry](assets/top-down-after--flight-telemetry/BRIEF.md) | top-down-after.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Interaction prompt](assets/top-down-after--interaction-prompt/BRIEF.md) | top-down-after.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Input hints](assets/top-down-after--input-hints/BRIEF.md) | top-down-after.png | ui | [ui.inputs](designs/ui.inputs/DESIGN.md) |
| [Player explorer frigate](assets/in-game-ui-interface-example-1--player-explorer-frigate/BRIEF.md) | in-game-ui-interface-example-1.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Helix support drone](assets/in-game-ui-interface-example-1--helix-support-drone/BRIEF.md) | in-game-ui-interface-example-1.png | ship | [ship.helix](designs/ship.helix/DESIGN.md) |
| [Riftjack scavenger](assets/in-game-ui-interface-example-1--riftjack-scavenger/BRIEF.md) | in-game-ui-interface-example-1.png | ship | [ship.riftjack](designs/ship.riftjack/DESIGN.md) |
| [Riftjack locked marauder](assets/in-game-ui-interface-example-1--riftjack-locked-marauder/BRIEF.md) | in-game-ui-interface-example-1.png | ship | [ship.riftjack](designs/ship.riftjack/DESIGN.md) |
| [Aurelian combat ship](assets/in-game-ui-interface-example-1--aurelian-combat-ship/BRIEF.md) | in-game-ui-interface-example-1.png | ship | [ship.aurelian](designs/ship.aurelian/DESIGN.md) |
| [Asteroid station](assets/in-game-ui-interface-example-1--asteroid-station/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Upper floating wreck](assets/in-game-ui-interface-example-1--upper-floating-wreck/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Right asteroid outpost](assets/in-game-ui-interface-example-1--right-asteroid-outpost/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Foreground explosion](assets/in-game-ui-interface-example-1--foreground-explosion/BRIEF.md) | in-game-ui-interface-example-1.png | vfx | [vfx.foreground-explosion](designs/vfx.foreground-explosion/DESIGN.md) |
| [Blue shield arc](assets/in-game-ui-interface-example-1--blue-shield-arc/BRIEF.md) | in-game-ui-interface-example-1.png | vfx | [vfx.blue-shield-arc](designs/vfx.blue-shield-arc/DESIGN.md) |
| [Red laser projectile](assets/in-game-ui-interface-example-1--red-laser-projectile/BRIEF.md) | in-game-ui-interface-example-1.png | vfx | [vfx.red-laser-projectile](designs/vfx.red-laser-projectile/DESIGN.md) |
| [Blue energy projectile](assets/in-game-ui-interface-example-1--blue-energy-projectile/BRIEF.md) | in-game-ui-interface-example-1.png | vfx | [vfx.blue-energy-projectile](designs/vfx.blue-energy-projectile/DESIGN.md) |
| [Guided missile one](assets/in-game-ui-interface-example-1--guided-missile-one/BRIEF.md) | in-game-ui-interface-example-1.png | ordnance | [pale-studless.ordnance.guided](designs/pale-studless.ordnance.guided/DESIGN.md) |
| [Guided missile two](assets/in-game-ui-interface-example-1--guided-missile-two/BRIEF.md) | in-game-ui-interface-example-1.png | ordnance | [pale-studless.ordnance.guided](designs/pale-studless.ordnance.guided/DESIGN.md) |
| [Alien beam lance](assets/in-game-ui-interface-example-1--alien-beam-lance/BRIEF.md) | in-game-ui-interface-example-1.png | vfx | [vfx.beam-lance](designs/vfx.beam-lance/DESIGN.md) |
| [Combat asteroid 1](assets/in-game-ui-interface-example-1--combat-asteroid-1/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 2](assets/in-game-ui-interface-example-1--combat-asteroid-2/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 3](assets/in-game-ui-interface-example-1--combat-asteroid-3/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 4](assets/in-game-ui-interface-example-1--combat-asteroid-4/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 5](assets/in-game-ui-interface-example-1--combat-asteroid-5/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 6](assets/in-game-ui-interface-example-1--combat-asteroid-6/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 7](assets/in-game-ui-interface-example-1--combat-asteroid-7/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 8](assets/in-game-ui-interface-example-1--combat-asteroid-8/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 9](assets/in-game-ui-interface-example-1--combat-asteroid-9/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 10](assets/in-game-ui-interface-example-1--combat-asteroid-10/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 11](assets/in-game-ui-interface-example-1--combat-asteroid-11/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 12](assets/in-game-ui-interface-example-1--combat-asteroid-12/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 13](assets/in-game-ui-interface-example-1--combat-asteroid-13/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 14](assets/in-game-ui-interface-example-1--combat-asteroid-14/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 15](assets/in-game-ui-interface-example-1--combat-asteroid-15/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat asteroid 16](assets/in-game-ui-interface-example-1--combat-asteroid-16/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.asteroids](designs/environment.asteroids/DESIGN.md) |
| [Combat salvage fragment 1](assets/in-game-ui-interface-example-1--combat-salvage-fragment-1/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 2](assets/in-game-ui-interface-example-1--combat-salvage-fragment-2/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 3](assets/in-game-ui-interface-example-1--combat-salvage-fragment-3/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 4](assets/in-game-ui-interface-example-1--combat-salvage-fragment-4/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 5](assets/in-game-ui-interface-example-1--combat-salvage-fragment-5/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 6](assets/in-game-ui-interface-example-1--combat-salvage-fragment-6/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 7](assets/in-game-ui-interface-example-1--combat-salvage-fragment-7/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 8](assets/in-game-ui-interface-example-1--combat-salvage-fragment-8/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 9](assets/in-game-ui-interface-example-1--combat-salvage-fragment-9/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 10](assets/in-game-ui-interface-example-1--combat-salvage-fragment-10/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 11](assets/in-game-ui-interface-example-1--combat-salvage-fragment-11/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 12](assets/in-game-ui-interface-example-1--combat-salvage-fragment-12/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 13](assets/in-game-ui-interface-example-1--combat-salvage-fragment-13/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 14](assets/in-game-ui-interface-example-1--combat-salvage-fragment-14/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Combat salvage fragment 15](assets/in-game-ui-interface-example-1--combat-salvage-fragment-15/BRIEF.md) | in-game-ui-interface-example-1.png | environment | [environment.wreckage](designs/environment.wreckage/DESIGN.md) |
| [Objective tracker](assets/in-game-ui-interface-example-1--objective-tracker/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Locked target panel](assets/in-game-ui-interface-example-1--locked-target-panel/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.reticles](designs/ui.reticles/DESIGN.md) |
| [Enemy scavenger nameplate](assets/in-game-ui-interface-example-1--enemy-scavenger-nameplate/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Enemy marauder nameplate](assets/in-game-ui-interface-example-1--enemy-marauder-nameplate/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Helix drone nameplate](assets/in-game-ui-interface-example-1--helix-drone-nameplate/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Alien nameplate](assets/in-game-ui-interface-example-1--alien-nameplate/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Player health shield bars](assets/in-game-ui-interface-example-1--player-health-shield-bars/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Ship status card](assets/in-game-ui-interface-example-1--ship-status-card/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.lists-tables](designs/ui.lists-tables/DESIGN.md) |
| [Tactical map](assets/in-game-ui-interface-example-1--tactical-map/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.radar-map](designs/ui.radar-map/DESIGN.md) |
| [Ammunition supplies widget](assets/in-game-ui-interface-example-1--ammunition-supplies-widget/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Turret action](assets/in-game-ui-interface-example-1--turret-action/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Missile action](assets/in-game-ui-interface-example-1--missile-action/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Repair action](assets/in-game-ui-interface-example-1--repair-action/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Drone action](assets/in-game-ui-interface-example-1--drone-action/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Boost action](assets/in-game-ui-interface-example-1--boost-action/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Player ship blueprint icon](assets/in-game-ui-interface-example-1--player-ship-blueprint-icon/BRIEF.md) | in-game-ui-interface-example-1.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Enemy target thumbnail](assets/in-game-ui-interface-example-1--enemy-target-thumbnail/BRIEF.md) | in-game-ui-interface-example-1.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Source identity wordmark](assets/core-construction-blocks--source-identity-wordmark/BRIEF.md) | core-construction-blocks.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/modular-components-computers--source-identity-wordmark/BRIEF.md) | modular-components-computers.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/cargo-pods-ore-etc--source-identity-wordmark/BRIEF.md) | cargo-pods-ore-etc.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/planets--source-identity-wordmark/BRIEF.md) | planets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/characters-weapons-items--source-identity-wordmark/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/more-character-customization--source-identity-wordmark/BRIEF.md) | more-character-customization.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/weapons-turrets--source-identity-wordmark/BRIEF.md) | weapons-turrets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/more-turrents-missiles-guns--source-identity-wordmark/BRIEF.md) | more-turrents-missiles-guns.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/effects-and-weapon-firing--source-identity-wordmark/BRIEF.md) | effects-and-weapon-firing.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/ui-elements--source-identity-wordmark/BRIEF.md) | ui-elements.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/ui-elements-2--source-identity-wordmark/BRIEF.md) | ui-elements-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/ui-elements-3--source-identity-wordmark/BRIEF.md) | ui-elements-3.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/ui-elements-4--source-identity-wordmark/BRIEF.md) | ui-elements-4.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/ui-elements-5--source-identity-wordmark/BRIEF.md) | ui-elements-5.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/ui-elements-6--source-identity-wordmark/BRIEF.md) | ui-elements-6.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/modular-spaceship-design--source-identity-wordmark/BRIEF.md) | modular-spaceship-design.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/modular-spaceship-design-2--source-identity-wordmark/BRIEF.md) | modular-spaceship-design-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/exploded-spaceship-view--source-identity-wordmark/BRIEF.md) | exploded-spaceship-view.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/faction-ship-1--source-identity-wordmark/BRIEF.md) | faction-ship-1.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Source identity wordmark](assets/faction-ship-2--source-identity-wordmark/BRIEF.md) | faction-ship-2.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Iron ore loose sample 5](assets/cargo-pods-ore-etc--iron-ore-loose-sample-5/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.iron](designs/stepped-environment.resource.iron/DESIGN.md) |
| [Copper ore loose sample 5](assets/cargo-pods-ore-etc--copper-ore-loose-sample-5/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) |
| [Copper ore loose sample 6](assets/cargo-pods-ore-etc--copper-ore-loose-sample-6/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.copper](designs/stepped-environment.resource.copper/DESIGN.md) |
| [Gold nugget loose sample 5](assets/cargo-pods-ore-etc--gold-nugget-loose-sample-5/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Gold nugget loose sample 6](assets/cargo-pods-ore-etc--gold-nugget-loose-sample-6/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Gold nugget loose sample 7](assets/cargo-pods-ore-etc--gold-nugget-loose-sample-7/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.gold](designs/stepped-environment.resource.gold/DESIGN.md) |
| [Ice loose sample 5](assets/cargo-pods-ore-etc--ice-loose-sample-5/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) |
| [Ice loose sample 6](assets/cargo-pods-ore-etc--ice-loose-sample-6/BRIEF.md) | cargo-pods-ore-etc.png | resource | [stepped-environment.resource.ice](designs/stepped-environment.resource.ice/DESIGN.md) |
| [Barrel emitter compact orange](assets/more-turrents-missiles-guns--barrel-emitter-compact-orange/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Missile tube compact single](assets/more-turrents-missiles-guns--missile-tube-compact-single/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Ammo energy feed case](assets/more-turrents-missiles-guns--ammo-energy-feed-case/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Mount adapter upright coupler](assets/more-turrents-missiles-guns--mount-adapter-upright-coupler/BRIEF.md) | more-turrents-missiles-guns.png | weapon-part | [pale-studless.weapon-part.standard](designs/pale-studless.weapon-part.standard/DESIGN.md) |
| [Head equipment legend icon](assets/characters-weapons-items--head-equipment-legend-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Chest equipment legend icon](assets/characters-weapons-items--chest-equipment-legend-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Shoulder equipment legend icon](assets/characters-weapons-items--shoulder-equipment-legend-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Backpack equipment legend icon](assets/characters-weapons-items--backpack-equipment-legend-icon/BRIEF.md) | characters-weapons-items.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Empty inventory three](assets/ui-elements-5--empty-inventory-three/BRIEF.md) | ui-elements-5.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Inventory sort button](assets/ui-elements-5--inventory-sort-button/BRIEF.md) | ui-elements-5.png | ui | [ui.buttons](designs/ui.buttons/DESIGN.md) |
| [Crew XP progress bar](assets/ui-elements-5--crew-xp-progress-bar/BRIEF.md) | ui-elements-5.png | ui | [ui.bars-gauges](designs/ui.bars-gauges/DESIGN.md) |
| [Partially occluded empty slot 9](assets/ui-elements-3--partially-occluded-empty-slot-9/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Partially occluded empty slot 10](assets/ui-elements-3--partially-occluded-empty-slot-10/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Partially occluded empty slot 11](assets/ui-elements-3--partially-occluded-empty-slot-11/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Partially occluded empty slot 12](assets/ui-elements-3--partially-occluded-empty-slot-12/BRIEF.md) | ui-elements-3.png | ui | [ui.inventory-slots](designs/ui.inventory-slots/DESIGN.md) |
| [Previous navigation Q hint](assets/ui-elements-3--previous-navigation-q-hint/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Next navigation E hint](assets/ui-elements-3--next-navigation-e-hint/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Previous category Q hint](assets/ui-elements-3--previous-category-q-hint/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Next category T hint](assets/ui-elements-3--next-category-t-hint/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Inventory drag instruction](assets/ui-elements-3--inventory-drag-instruction/BRIEF.md) | ui-elements-3.png | ui | [ui.miscellaneous](designs/ui.miscellaneous/DESIGN.md) |
| [Loot chest glow](assets/ui-elements-3--loot-chest-glow/BRIEF.md) | ui-elements-3.png | vfx | [vfx.loot-chest-glow](designs/vfx.loot-chest-glow/DESIGN.md) |
| [Menu TAB hint](assets/ui-elements-3--menu-tab-hint/BRIEF.md) | ui-elements-3.png | ui | [ui.tabs](designs/ui.tabs/DESIGN.md) |
| [Captain](assets/characters-weapons-items-female--captain/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Engineer](assets/characters-weapons-items-female--engineer/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Medic](assets/characters-weapons-items-female--medic/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Pilot](assets/characters-weapons-items-female--pilot/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Security officer](assets/characters-weapons-items-female--security-officer/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Heavy marine](assets/characters-weapons-items-female--heavy-marine/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Salvage tech](assets/characters-weapons-items-female--salvage-tech/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Recon scout](assets/characters-weapons-items-female--recon-scout/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Scientist](assets/characters-weapons-items-female--scientist/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Mechanic](assets/characters-weapons-items-female--mechanic/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Captain role icon](assets/characters-weapons-items-female--captain-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Engineer role icon](assets/characters-weapons-items-female--engineer-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Medic role icon](assets/characters-weapons-items-female--medic-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Pilot role icon](assets/characters-weapons-items-female--pilot-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Security officer role icon](assets/characters-weapons-items-female--security-officer-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Heavy marine role icon](assets/characters-weapons-items-female--heavy-marine-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Salvage tech role icon](assets/characters-weapons-items-female--salvage-tech-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Recon scout role icon](assets/characters-weapons-items-female--recon-scout-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Scientist role icon](assets/characters-weapons-items-female--scientist-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Mechanic role icon](assets/characters-weapons-items-female--mechanic-role-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Leadership icon](assets/characters-weapons-items-female--leadership-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Systems repair icon](assets/characters-weapons-items-female--systems-repair-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Treat injuries icon](assets/characters-weapons-items-female--treat-injuries-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Ship control icon](assets/characters-weapons-items-female--ship-control-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Security icon](assets/characters-weapons-items-female--security-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Heavy firepower icon](assets/characters-weapons-items-female--heavy-firepower-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Salvage icon](assets/characters-weapons-items-female--salvage-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Scouting icon](assets/characters-weapons-items-female--scouting-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Research icon](assets/characters-weapons-items-female--research-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Fabrication icon](assets/characters-weapons-items-female--fabrication-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Diplomacy icon](assets/characters-weapons-items-female--diplomacy-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Efficiency icon](assets/characters-weapons-items-female--efficiency-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Remove status icon](assets/characters-weapons-items-female--remove-status-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Evasion icon](assets/characters-weapons-items-female--evasion-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Crowd control icon](assets/characters-weapons-items-female--crowd-control-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Durability icon](assets/characters-weapons-items-female--durability-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Resource recovery icon](assets/characters-weapons-items-female--resource-recovery-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Intel gathering icon](assets/characters-weapons-items-female--intel-gathering-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Data analysis icon](assets/characters-weapons-items-female--data-analysis-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Modifications icon](assets/characters-weapons-items-female--modifications-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Crew morale icon](assets/characters-weapons-items-female--crew-morale-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Upgrades icon](assets/characters-weapons-items-female--upgrades-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Keep crew alive icon](assets/characters-weapons-items-female--keep-crew-alive-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Precision icon](assets/characters-weapons-items-female--precision-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Threat detection icon](assets/characters-weapons-items-female--threat-detection-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Frontline icon](assets/characters-weapons-items-female--frontline-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Field repairs icon](assets/characters-weapons-items-female--field-repairs-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Stealth icon](assets/characters-weapons-items-female--stealth-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [New technology icon](assets/characters-weapons-items-female--new-technology-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Resource crafting icon](assets/characters-weapons-items-female--resource-crafting-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Base crew body](assets/characters-weapons-items-female--base-crew-body/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Rig front view](assets/characters-weapons-items-female--rig-front-view/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Rig side view](assets/characters-weapons-items-female--rig-side-view/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Rig back view](assets/characters-weapons-items-female--rig-back-view/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Civilian Headwear](assets/characters-weapons-items-female--civilian-headwear/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Light Headwear](assets/characters-weapons-items-female--light-headwear/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Standard Headwear](assets/characters-weapons-items-female--standard-headwear/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Heavy Headwear](assets/characters-weapons-items-female--heavy-headwear/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.headwear](designs/crew.equipment.headwear/DESIGN.md) |
| [Civilian Chest armor](assets/characters-weapons-items-female--civilian-chest-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Light Chest armor](assets/characters-weapons-items-female--light-chest-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Standard Chest armor](assets/characters-weapons-items-female--standard-chest-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Heavy Chest armor](assets/characters-weapons-items-female--heavy-chest-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.chest](designs/crew.equipment.chest/DESIGN.md) |
| [Civilian Shoulder armor](assets/characters-weapons-items-female--civilian-shoulder-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Light Shoulder armor](assets/characters-weapons-items-female--light-shoulder-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Standard Shoulder armor](assets/characters-weapons-items-female--standard-shoulder-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Heavy Shoulder armor](assets/characters-weapons-items-female--heavy-shoulder-armor/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.shoulder](designs/crew.equipment.shoulder/DESIGN.md) |
| [Civilian Backpack](assets/characters-weapons-items-female--civilian-backpack/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Light Backpack](assets/characters-weapons-items-female--light-backpack/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Standard Backpack](assets/characters-weapons-items-female--standard-backpack/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Heavy Backpack](assets/characters-weapons-items-female--heavy-backpack/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.backpack](designs/crew.equipment.backpack/DESIGN.md) |
| [Pistol](assets/characters-weapons-items-female--pistol/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.handgun.standard](designs/pale-studless.handgun.standard/DESIGN.md) |
| [Rifle](assets/characters-weapons-items-female--rifle/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.rifle.rifle](designs/pale-studless.rifle.rifle/DESIGN.md) |
| [Shotgun](assets/characters-weapons-items-female--shotgun/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.rifle.shotgun](designs/pale-studless.rifle.shotgun/DESIGN.md) |
| [Heavy gun](assets/characters-weapons-items-female--heavy-gun/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.rifle.standard](designs/pale-studless.rifle.standard/DESIGN.md) |
| [Stun gun](assets/characters-weapons-items-female--stun-gun/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.handgun.standard](designs/pale-studless.handgun.standard/DESIGN.md) |
| [Wrench](assets/characters-weapons-items-female--wrench/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.tool.wrench](designs/pale-studless.tool.wrench/DESIGN.md) |
| [Welder](assets/characters-weapons-items-female--welder/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.tool.welder](designs/pale-studless.tool.welder/DESIGN.md) |
| [Multi-tool](assets/characters-weapons-items-female--multi-tool/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.tool.multi-tool](designs/pale-studless.tool.multi-tool/DESIGN.md) |
| [Medkit](assets/characters-weapons-items-female--medkit/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.crate.medkit](designs/pale-studless.crate.medkit/DESIGN.md) |
| [Sample scanner](assets/characters-weapons-items-female--sample-scanner/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.tool.scanner](designs/pale-studless.tool.scanner/DESIGN.md) |
| [Data pad](assets/characters-weapons-items-female--data-pad/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.tool.data-pad](designs/pale-studless.tool.data-pad/DESIGN.md) |
| [Drone](assets/characters-weapons-items-female--drone/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.attachments](designs/crew.equipment.attachments/DESIGN.md) |
| [Grapple](assets/characters-weapons-items-female--grapple/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.tool.grapple](designs/pale-studless.tool.grapple/DESIGN.md) |
| [Flashlight](assets/characters-weapons-items-female--flashlight/BRIEF.md) | characters-weapons-items-female.png | equipment | [pale-studless.tool.flashlight](designs/pale-studless.tool.flashlight/DESIGN.md) |
| [Shield pack](assets/characters-weapons-items-female--shield-pack/BRIEF.md) | characters-weapons-items-female.png | equipment | [crew.equipment.shield-pack](designs/crew.equipment.shield-pack/DESIGN.md) |
| [Crew roster ship](assets/characters-weapons-items-female--crew-roster-ship/BRIEF.md) | characters-weapons-items-female.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Source identity wordmark](assets/characters-weapons-items-female--source-identity-wordmark/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Head equipment legend icon](assets/characters-weapons-items-female--head-equipment-legend-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Chest equipment legend icon](assets/characters-weapons-items-female--chest-equipment-legend-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Shoulder equipment legend icon](assets/characters-weapons-items-female--shoulder-equipment-legend-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Backpack equipment legend icon](assets/characters-weapons-items-female--backpack-equipment-legend-icon/BRIEF.md) | characters-weapons-items-female.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Medic open comms detail](assets/characters-weapons-items-female--medic-open-comms-detail/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Medic swept fringe and ponytail](assets/characters-weapons-items-female--medic-swept-fringe-and-ponytail/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Female medic armor detail](assets/characters-weapons-items-female--female-medic-armor-detail/BRIEF.md) | characters-weapons-items-female.png | character | [crew.base-and-outfits](designs/crew.base-and-outfits/DESIGN.md) |
| [Base male head 01 violet swept](assets/characters-facial-assets--base-male-head-01-violet-swept/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 02 copper side part](assets/characters-facial-assets--base-male-head-02-copper-side-part/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 03 dark close crop](assets/characters-facial-assets--base-male-head-03-dark-close-crop/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 04 red sweep](assets/characters-facial-assets--base-male-head-04-red-sweep/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 05 golden curls](assets/characters-facial-assets--base-male-head-05-golden-curls/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 06 brown short](assets/characters-facial-assets--base-male-head-06-brown-short/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 07 charcoal tousled](assets/characters-facial-assets--base-male-head-07-charcoal-tousled/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 08 brown flat top](assets/characters-facial-assets--base-male-head-08-brown-flat-top/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 09 silver sweep](assets/characters-facial-assets--base-male-head-09-silver-sweep/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 10 plum fringe](assets/characters-facial-assets--base-male-head-10-plum-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 11 orange curls](assets/characters-facial-assets--base-male-head-11-orange-curls/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base male head 12 grey textured](assets/characters-facial-assets--base-male-head-12-grey-textured/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 01 charcoal side fringe](assets/characters-facial-assets--base-female-head-01-charcoal-side-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 02 navy long fringe](assets/characters-facial-assets--base-female-head-02-navy-long-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 03 red bob](assets/characters-facial-assets--base-female-head-03-red-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 04 blonde long hair](assets/characters-facial-assets--base-female-head-04-blonde-long-hair/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 05 dark violet fringe](assets/characters-facial-assets--base-female-head-05-dark-violet-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 06 purple gathered hair](assets/characters-facial-assets--base-female-head-06-purple-gathered-hair/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 07 pink bob](assets/characters-facial-assets--base-female-head-07-pink-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 08 black gathered hair](assets/characters-facial-assets--base-female-head-08-black-gathered-hair/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 09 auburn gathered hair](assets/characters-facial-assets--base-female-head-09-auburn-gathered-hair/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 10 silver bob](assets/characters-facial-assets--base-female-head-10-silver-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 11 crimson fringe](assets/characters-facial-assets--base-female-head-11-crimson-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Base female head 12 plum long hair](assets/characters-facial-assets--base-female-head-12-plum-long-hair/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) |
| [Head age young upper row](assets/characters-facial-assets--head-age-young-upper-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head age adult upper row](assets/characters-facial-assets--head-age-adult-upper-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head age middle aged upper row](assets/characters-facial-assets--head-age-middle-aged-upper-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head age older upper row](assets/characters-facial-assets--head-age-older-upper-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head age young lower row](assets/characters-facial-assets--head-age-young-lower-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head age adult lower row](assets/characters-facial-assets--head-age-adult-lower-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head age middle aged lower row](assets/characters-facial-assets--head-age-middle-aged-lower-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head age older lower row](assets/characters-facial-assets--head-age-older-lower-row/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) |
| [Head skin tone sample 01](assets/characters-facial-assets--head-skin-tone-sample-01/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head skin tone sample 02](assets/characters-facial-assets--head-skin-tone-sample-02/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head skin tone sample 03](assets/characters-facial-assets--head-skin-tone-sample-03/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head skin tone sample 04](assets/characters-facial-assets--head-skin-tone-sample-04/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head skin tone sample 05](assets/characters-facial-assets--head-skin-tone-sample-05/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head skin tone sample 06](assets/characters-facial-assets--head-skin-tone-sample-06/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head skin tone sample 07](assets/characters-facial-assets--head-skin-tone-sample-07/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head skin tone sample 08](assets/characters-facial-assets--head-skin-tone-sample-08/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) |
| [Head eye color Brown](assets/characters-facial-assets--head-eye-color-brown/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Head eye color Blue](assets/characters-facial-assets--head-eye-color-blue/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Head eye color Green](assets/characters-facial-assets--head-eye-color-green/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Head eye color Hazel](assets/characters-facial-assets--head-eye-color-hazel/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Head eye color Grey](assets/characters-facial-assets--head-eye-color-grey/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Head eye color Amber](assets/characters-facial-assets--head-eye-color-amber/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Head eye color Red](assets/characters-facial-assets--head-eye-color-red/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Head eye color Cyber](assets/characters-facial-assets--head-eye-color-cyber/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) |
| [Hair male 01 dark spiked quiff](assets/characters-facial-assets--hair-male-01-dark-spiked-quiff/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 02 blonde swept quiff](assets/characters-facial-assets--hair-male-02-blonde-swept-quiff/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 03 brown pompadour](assets/characters-facial-assets--hair-male-03-brown-pompadour/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 04 charcoal short spikes](assets/characters-facial-assets--hair-male-04-charcoal-short-spikes/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 05 auburn pointed quiff](assets/characters-facial-assets--hair-male-05-auburn-pointed-quiff/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 06 navy short waves](assets/characters-facial-assets--hair-male-06-navy-short-waves/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 07 dark close crop](assets/characters-facial-assets--hair-male-07-dark-close-crop/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 08 tall charcoal crest](assets/characters-facial-assets--hair-male-08-tall-charcoal-crest/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 09 red mohawk shaved sides](assets/characters-facial-assets--hair-male-09-red-mohawk-shaved-sides/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 10 blonde side undercut](assets/characters-facial-assets--hair-male-10-blonde-side-undercut/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 11 dark hanging locks](assets/characters-facial-assets--hair-male-11-dark-hanging-locks/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 12 brown flat top](assets/characters-facial-assets--hair-male-12-brown-flat-top/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair male 13 dark broad spiked top](assets/characters-facial-assets--hair-male-13-dark-broad-spiked-top/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) |
| [Hair female 01 violet side bob](assets/characters-facial-assets--hair-female-01-violet-side-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 02 auburn side bob](assets/characters-facial-assets--hair-female-02-auburn-side-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 03 charcoal side bob](assets/characters-facial-assets--hair-female-03-charcoal-side-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 04 blonde long side fringe](assets/characters-facial-assets--hair-female-04-blonde-long-side-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 05 black gathered bun](assets/characters-facial-assets--hair-female-05-black-gathered-bun/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 06 red long gathered fringe](assets/characters-facial-assets--hair-female-06-red-long-gathered-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 07 violet long gathered fringe](assets/characters-facial-assets--hair-female-07-violet-long-gathered-fringe/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 08 pink long bob](assets/characters-facial-assets--hair-female-08-pink-long-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 09 auburn gathered bun](assets/characters-facial-assets--hair-female-09-auburn-gathered-bun/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 10 navy long bob](assets/characters-facial-assets--hair-female-10-navy-long-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 11 plum long hair](assets/characters-facial-assets--hair-female-11-plum-long-hair/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 12 white long bob](assets/characters-facial-assets--hair-female-12-white-long-bob/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Hair female 13 brown cropped side sweep](assets/characters-facial-assets--hair-female-13-brown-cropped-side-sweep/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) |
| [Facial hair Clean](assets/characters-facial-assets--facial-hair-clean/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Stubble](assets/characters-facial-assets--facial-hair-stubble/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Short beard](assets/characters-facial-assets--facial-hair-short-beard/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Full beard](assets/characters-facial-assets--facial-hair-full-beard/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Goatee](assets/characters-facial-assets--facial-hair-goatee/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Moustache](assets/characters-facial-assets--facial-hair-moustache/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Handlebar](assets/characters-facial-assets--facial-hair-handlebar/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Side burns](assets/characters-facial-assets--facial-hair-side-burns/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Soul patch](assets/characters-facial-assets--facial-hair-soul-patch/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Old beard](assets/characters-facial-assets--facial-hair-old-beard/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Grey](assets/characters-facial-assets--facial-hair-grey/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Facial hair Braided](assets/characters-facial-assets--facial-hair-braided/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) |
| [Head facial detail Freckles](assets/characters-facial-assets--head-facial-detail-freckles/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Scars](assets/characters-facial-assets--head-facial-detail-scars/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Scratch](assets/characters-facial-assets--head-facial-detail-scratch/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Tattoo](assets/characters-facial-assets--head-facial-detail-tattoo/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Bandage](assets/characters-facial-assets--head-facial-detail-bandage/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Dirt](assets/characters-facial-assets--head-facial-detail-dirt/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Warpaint](assets/characters-facial-assets--head-facial-detail-warpaint/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Cyber](assets/characters-facial-assets--head-facial-detail-cyber/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Eyepatch](assets/characters-facial-assets--head-facial-detail-eyepatch/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Monocle](assets/characters-facial-assets--head-facial-detail-monocle/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Visor scar](assets/characters-facial-assets--head-facial-detail-visor-scar/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head facial detail Birthmark](assets/characters-facial-assets--head-facial-detail-birthmark/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.details](designs/crew.faces.details/DESIGN.md) |
| [Head accessory Cap](assets/characters-facial-assets--head-accessory-cap/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Beanie](assets/characters-facial-assets--head-accessory-beanie/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Headband](assets/characters-facial-assets--head-accessory-headband/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Pilot hat](assets/characters-facial-assets--head-accessory-pilot-hat/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Beret](assets/characters-facial-assets--head-accessory-beret/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Cowboy hat](assets/characters-facial-assets--head-accessory-cowboy-hat/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Pirate hat](assets/characters-facial-assets--head-accessory-pirate-hat/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Hood](assets/characters-facial-assets--head-accessory-hood/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Goggles up](assets/characters-facial-assets--head-accessory-goggles-up/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Goggles down](assets/characters-facial-assets--head-accessory-goggles-down/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Glasses](assets/characters-facial-assets--head-accessory-glasses/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Sunglasses](assets/characters-facial-assets--head-accessory-sunglasses/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Headset](assets/characters-facial-assets--head-accessory-headset/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Earring](assets/characters-facial-assets--head-accessory-earring/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Nose ring](assets/characters-facial-assets--head-accessory-nose-ring/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Cigar](assets/characters-facial-assets--head-accessory-cigar/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Mask](assets/characters-facial-assets--head-accessory-mask/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Scarf dark](assets/characters-facial-assets--head-accessory-scarf-dark/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head accessory Scarf red](assets/characters-facial-assets--head-accessory-scarf-red/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) |
| [Head specialty Pirate](assets/characters-facial-assets--head-specialty-pirate/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Military](assets/characters-facial-assets--head-specialty-military/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Corporate](assets/characters-facial-assets--head-specialty-corporate/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Scientist](assets/characters-facial-assets--head-specialty-scientist/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Engineer](assets/characters-facial-assets--head-specialty-engineer/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Medic](assets/characters-facial-assets--head-specialty-medic/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Mechanic](assets/characters-facial-assets--head-specialty-mechanic/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Scavenger](assets/characters-facial-assets--head-specialty-scavenger/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Civilian](assets/characters-facial-assets--head-specialty-civilian/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Outlaw](assets/characters-facial-assets--head-specialty-outlaw/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Explorer](assets/characters-facial-assets--head-specialty-explorer/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Cybernetic](assets/characters-facial-assets--head-specialty-cybernetic/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head specialty Alien hybrid](assets/characters-facial-assets--head-specialty-alien-hybrid/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) |
| [Head expression Neutral](assets/characters-facial-assets--head-expression-neutral/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Head expression Happy](assets/characters-facial-assets--head-expression-happy/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Head expression Sad](assets/characters-facial-assets--head-expression-sad/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Head expression Angry](assets/characters-facial-assets--head-expression-angry/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Head expression Surprised](assets/characters-facial-assets--head-expression-surprised/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Head expression Determined](assets/characters-facial-assets--head-expression-determined/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Head expression Wink](assets/characters-facial-assets--head-expression-wink/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Head expression Grin](assets/characters-facial-assets--head-expression-grin/BRIEF.md) | characters-facial-assets.png | equipment | [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) |
| [Face sheet identity wordmark](assets/characters-facial-assets--face-sheet-identity-wordmark/BRIEF.md) | characters-facial-assets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Face sheet header slogan](assets/characters-facial-assets--face-sheet-header-slogan/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Face Assets header panel](assets/characters-facial-assets--face-assets-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Face sheet footer wordmark](assets/characters-facial-assets--face-sheet-footer-wordmark/BRIEF.md) | characters-facial-assets.png | ui | [ui.icons](designs/ui.icons/DESIGN.md) |
| [Face sheet footer slogan](assets/characters-facial-assets--face-sheet-footer-slogan/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Face sheet header ship context](assets/characters-facial-assets--face-sheet-header-ship-context/BRIEF.md) | characters-facial-assets.png | ship | [ship.exploration-frigate](designs/ship.exploration-frigate/DESIGN.md) |
| [Base faces header panel](assets/characters-facial-assets--base-faces-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Age variations header panel](assets/characters-facial-assets--age-variations-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Skin tones header panel](assets/characters-facial-assets--skin-tones-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Eye colours header panel](assets/characters-facial-assets--eye-colours-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Male hairstyles header panel](assets/characters-facial-assets--male-hairstyles-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Female hairstyles header panel](assets/characters-facial-assets--female-hairstyles-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Facial hair header panel](assets/characters-facial-assets--facial-hair-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Facial details header panel](assets/characters-facial-assets--facial-details-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Accessories header panel](assets/characters-facial-assets--accessories-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Specialty styles header panel](assets/characters-facial-assets--specialty-styles-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
| [Expressions header panel](assets/characters-facial-assets--expressions-header-panel/BRIEF.md) | characters-facial-assets.png | ui | [ui.frames-panels](designs/ui.frames-panels/DESIGN.md) |
