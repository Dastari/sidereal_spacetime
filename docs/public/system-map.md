# System map editor

Open **Map editor** in Creator, or `/map`. Without authoring access, the chart is a labeled local reference. Live data requires sign-in plus explicit read permission for the `universe-map` workspace. Applying changes also requires its write permission.

Select a celestial body in the list to focus it. Drag the body or change its X, Y and height in metres. The system inspector defines the enclosing sphere and space background. Live ships are visible for reference and cannot be moved by this tool.

Add an ellipsoid or box, or draw a polygon with at least three points and choose **Finish field**. Drag polygon handles to reshape it. Set depth, density (asteroids per cubic kilometre), seed and asteroid radius range. Resource percentages are independent: one asteroid may contain several resource types. The same seed and settings reproduce the same population.

**Save draft** stores work locally. **Apply to world** validates and commits a new server revision. A revision conflict requires reloading the live map; it never silently overwrites another editor. Undo/redo changes the local draft; applying the result is another audited world edit.

Fields are currently authored static populations with nearby game visuals and private resource occurrences. Physical activation, mining quantities and depletion need a subsequent gameplay implementation. Limits:16 fields,2,048 asteroids per field,8,192 per system; excess density is rejected with a visible error.

## Backgrounds and orbital layout

Choose **Deep space** for stars without nebulae. Pick another system background, then select any asteroid field to inherit it or override it with a different background. Feather distance blends inward from the region edge; higher priority wins overlapping fields. **Preview height (m)** shows a horizontal slice through elevated volumes.

A system can anchor its center to a selected star and use an explicit radius. Set each planet/moon's parent with **Orbits around**; enable **Orbit guides** for design circles. These are static design guides. Moving a parent moves its descendants together and can be undone. Celestial portraits come from the actual asset renders (reference seed), with physical radius shown separately.
