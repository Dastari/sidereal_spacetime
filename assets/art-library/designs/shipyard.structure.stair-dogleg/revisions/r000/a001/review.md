# Full native dogleg a001 — retained failed attempt

The complete model and four actual Blender renders are retained. Native triangle fidelity, all18 contact patches, both flight clear widths, real panel omissions and the turn/approach corridors pass. The unchanged standing capsule cannot safely settle on the last tread of either flight: the authored final riser sits31.25mm into that tread instead of beneath its destination landing. Four continuous step checks fail, with20.14mm conservative capsule penetration into those actual riser bounds. This is a geometry error; no body-size or controller exception is accepted.

Next attempt moves the flight-A final riser toY4.1875..4.21875 beneath the midlanding, and flight-B final riser toY1.96875..2 beneath the upper native floor. Tread positions, deck datums, aperture, body dimensions and launch strips remain fixed.

All15 tread-center resting alternatives also collide with the next riser. Those are expected rejected positions. The proposed supported controller uses independently measured downhill-edge stance strips and bounded lift/forward/settle sweeps; the final native qualification will require all such sweeps to pass in both directions. No runtime publication or owner artistic sign-off.
