# Crew combat visual layer

Status: Implemented runtime layer; isolated actual Babylon rifle review passed. Integrated authoritative controls remain a separate acceptance.

The existing sixteen-bone Blender rig and twelve authored animation clips remain unchanged. A presentation-only layer raises the actual held weapon toward the actor's facing direction, solves both arm chains for a rifle support grip, and lowers the pelvis 3.5 cm while preserving animated ankle targets. Movement retains its authored gait. Seated poses suppress the combat layer. A 180 ms blend is immediate under reduced motion, and the baseline is restored before each animation update to prevent paused-pose accumulation.

`CrewMotion.combat` enables this layer. The renderer binds its actual held visual with `crew.bindHeldEquipment(visual)` and clears that binding before disposal. Equipment exposes `getMuzzleWorld()` and `getGripBasis()`, reading validated authored manifest anchors through the imported glTF conversion root and actual hand hierarchy. Assets without muzzle metadata return no muzzle. These APIs do not grant ownership, fire permission or simulation transforms.

Root integration owns V mode switching, pointer aim, authoritative aim angle, primary fire, energy/cooldown state and the laser. Right drag remains camera orbit. Existing authored equipment emission should enter the existing glow mask alongside opaque equipment occluders; the layer does not recolor weapon bodies or create lights. No equipment source, native hull source or canonical art outputs are changed.

Validation: actual canonical crew/carbine regression verifies muzzle alignment above .999 dot product under parent rotation, support palm within 3.5 cm, ankle displacement below 2 mm, no accumulated drift over ten paused frames, seated restoration and unchanged gameplay placement. Separate anchor tests cover malformed metadata and reflected glTF transforms. Twelve focused tests pass, including both Babylon handedness modes.

## Actual browser review

The required tailnet origin loaded the actual crew runtime, canonical rig and carbine GLBs in an isolated 480×640 Babylon scene. Local byte routes made assets deterministic after the first unmodified carbine request returned status 0. The scene reported zero console errors and zero pending assets. Four actual PNGs were inspected: `output/playwright/crew-combat-ready-front.png`, `crew-combat-aim-front.png`, `crew-combat-aim-side.png`, and `crew-combat-aim-rear.png`. The rifle changes from diagonal ready to forward level aim; elbows rise and the planted knees visibly flex. Authored cyan weapon optics remain selective and the rear helmet occludes front optics. Actual muzzle direction was approximately (0, 0, −1), at height 1.228 m.

The short minifigure arms keep the rifle stock close to the torso; this is a stylized stance, not a human shoulder-stock simulation. This pass did not verify authoritative fire/cooldown integration or a separate pistol PNG. No original animation, equipment art, canonical export or simulation placement was changed. The review browser was closed after capture.
