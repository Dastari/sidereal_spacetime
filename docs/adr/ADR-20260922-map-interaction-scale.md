# Map interaction and measurement scale

Date:2026-09-22. Status: accepted for editor interaction and existing metre units;
physical content migration remains proposed pending owner scale direction.

The current runtime maps one world metre directly to renderer units after camera
origin subtraction. Stock planets have radii24–54m and heights about−53..−160m.
They are small authored spheres, not physical-sized planets compressed at depth.
A global multiplier would preserve the incorrect planet/ship size ratio and
change distance/speed meaning unless every dependent quantity changes together.

Keep current authoritative SI coordinates and use unit formatting only for editor
measurements. Distance-to-parent is planar centre distance; time is distance /30m/s,
not orbital circumference or a simulation of orbit motion. Do not relabel existing
20m objects as20km through an undocumented display multiplier.

For physical-scale content, the proposed contract is metre-based authority plus
explicit physical celestial radii and distances, with camera-relative rendering
and visual LOD. Celestial proportions, orbit separations, gameplay travel speeds,
collision exclusion, zones and existing ship placements need a reviewed content
migration together. Renderer-only distance compression, if chosen, must preserve
angular size and never write positions or sizes into simulation. A fixed display
conversion is an alternative requiring an explicit conversion for both distances
and speeds and must not imply physically accurate sizes. No such conversion or
live data migration is silently introduced in this editor update.

Store pen geometry using existing ZoneAnchor offsets. This avoids a second curve
format and lets existing reducers validate/save geometry. Parent changes preserve
world transforms; a drop across systems is refused because current saves commit
one system document, so a two-document transfer would not be atomic.
