# Map interaction and measurement scale

Date: 2026-09-22. Status: compressed gameplay with one display conversion accepted
by the owner. Initial calibration: 1 gameplay metre = 100 displayed kilometres
(factor 100,000); chosen as the documented implementation default, not an owner
approval of that exact numeric factor.

The current runtime maps one gameplay metre directly to renderer units after
camera origin subtraction. Stock planets have radii 24–54 m and heights about
−53..−160 m. They are small authored spheres, not physical-sized planets compressed
at depth. This decision preserves gameplay geometry and uses astronomical display
units for celestial radii, map positions, zone extents, parent distances and
navigation speeds. A 20 gameplay metre diameter displays as 2,000 km. It does not
claim physically accurate relative planet/orbit proportions.

The single presentation contract is `packages/ui/src/astronomical-units.ts`.
Distances multiply by 100,000 to obtain displayed metres; speeds use the same
factor. Time does not scale: a 900 gameplay metre journey at 30 gameplay m/s takes
30 seconds, shown as 90,000 km at 3,000 km/s. Orbit annotations show planar XY
centre-to-centre straight-line ETA, not circumference, orbital period, acceleration
or a route planner. Scenic height is excluded from planar flight distance.

Map and live Genesis property inputs display kilometres with two decimals and
invert the conversion on edit. Grid/cursor/orbit labels choose compact units.
Ship, character, construction and individual asteroid dimensions retain gameplay
metres; field population density/volume explicitly retain gameplay units. The
scale note identifies the astronomical context. Do not apply the astronomical
factor to construction geometry, rendering, reducers, zone membership, collision
or stored rows. Existing game instrumentation still shows gameplay units; future
astronomical navigation displays must import this same contract rather than
introducing another factor. No world data migration or flight-speed change is
included. Stock content cruise speed (30,000 gameplay m/s) is separate from the
requested 30 gameplay m/s comparison speed and is not silently changed.

Store pen geometry using existing ZoneAnchor offsets. This avoids a second curve
format and lets existing reducers validate/save geometry. Parent changes preserve
world transforms; a drop across systems is refused because current saves commit
one system document, so a two-document transfer would not be atomic.
