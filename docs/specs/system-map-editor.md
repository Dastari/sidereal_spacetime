# System map editor

Status: implemented review candidate; normal-provider acceptance and production deployment pending. Owner request 2026-09-15.

## Outcome
Add `/map` to Creator navigation. A top-down metric grid displays the authoritative celestial chart and live ships. Selection exposes exact X/Y/height fields; celestial bodies drag on the grid. Ships are read-only live overlays. Local undo/redo and draft recovery precede an explicit Apply action.

Define named systems as spherical bounds (center, radius, metres) with a SPACE_VISTAS background ID. Bodies and asteroid volumes must fit completely within their system. Existing celestial IDs, appearances and physical properties are preserved when moved. No implicit N-body orbit simulation or automatic movement of moons with their parent.

Asteroid volumes support ellipsoids, axis-aligned boxes and simple concave polygon prisms. Polygon vertices are drawn in the map; height and depth remain explicit. Density is asteroids per cubic kilometre, with a deterministic integer seed, radius interval and independent percent occurrence for each named resource. Preview and authority use the same bounded generator. All generated centers must lie within the volume; full spheres must remain within system bounds. Reject malformed/self-intersecting footprints, invalid probabilities, excessively dense requests and invalid numeric inputs rather than silently reducing density.

## Architecture and application
Content owns document types/defaults; sim owns validation and deterministic generation. Separate private map definition and field population rows avoid adding thousands of rocks to the existing 64-body dynamic contact island. Populations are durable authored asteroids with stable IDs and resource occurrence metadata; mining quantities/depletion and physical activation are future authority work, not implied by resource occurrence. No population participates in dynamic collision until a bounded activation implementation exists.

The editor uses existing authenticated dashboard connections and construction grants in reserved workspace `universe-map`: draft.read for map/ship visibility, draft.write for Apply. No ship ownership or ordinary Shipyard workspace grant authorizes this. Private map tables are exposed only through filtered projections; world metadata is exposed to admitted players for background selection. Live ship projections omit owner, cargo, crew and private configuration.

Apply accepts an operation UUID, expected map revision and a bounded JSON document. The transaction validates all geometry, celestial membership, overlap safety against ships, and generated count before writing. Same-operation retries return the original receipt; mismatched payload/revision conflicts fail atomically. Application changes celestial motion and cell indices but never moves ships or character rows. Existing dynamic rocks remain intact. Field changes replace only generated field populations; unmodified fields preserve IDs. Map creation creates a system row; initial imports read canonical body positions.

## UI direction
Use existing Creator Barlow type and theme tokens. The chart is the main surface, framed by a compact searchable body/field list and context inspector. Cyan metric grid and system outline, warm celestial markers, white live-ship arrows, amber stippled asteroid volumes. Show units and world coordinates, fit/zoom/pan, independent layer toggles. At wide scales markers have minimum screen size while actual radius remains separately represented. Background swatch shows the selected existing nebula texture. Avoid decorative subtitles and duplicate controls.

## Validation/evidence
Test reproducible populations, concave/invalid polygons, volume/density arithmetic, resource extremes, coordinate bounds, permission isolation, stale revisions, retry mismatches, atomic failure and ship preservation. Browser exercise route, selection/drag, field drawing, settings, undo/redo, saved reload, and authorized isolated Apply with live views. Run npm check/build, CI quality checks and fresh isolated smoke. No live deployment or contract completion is claimed without exact candidate evidence.
