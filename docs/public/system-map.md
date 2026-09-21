# System map editor

Open **Map editor** in Creator, or `/map`. Without authoring access, the chart is a labeled local reference. Live data requires sign-in plus explicit read permission for the `universe-map` workspace. Applying changes also requires its write permission.

Select a celestial body in the list to focus it. Drag the body or change its X, Y and height in metres. The system inspector defines the enclosing sphere and space background. Live ships are visible for reference and cannot be moved by this tool.

Add an ellipsoid or box, or draw a polygon with at least three points and choose **Finish field**. Drag polygon handles to reshape it. Set depth, density (asteroids per cubic kilometre), seed and asteroid radius range. Resource percentages are independent: one asteroid may contain several resource types. The same seed and settings reproduce the same population.

**Save draft** stores work locally. **Apply to world** validates and commits a new server revision. A revision conflict requires reloading the live map; it never silently overwrites another editor. Undo/redo changes the local draft; applying the result is another audited world edit.

Fields are currently authored static populations with nearby game visuals and private resource occurrences. Physical activation, mining quantities and depletion need a subsequent gameplay implementation. Limits:16 fields,2,048 asteroids per field,8,192 per system; excess density is rejected with a visible error.

## Backgrounds and orbital layout

Choose **Deep space** for stars without nebulae. Pick another system background, then select any asteroid field to inherit it or override it with a different background. Feather distance blends inward from the region edge; higher priority wins overlapping fields. **Preview height (m)** shows a horizontal slice through elevated volumes.

A system can anchor its center to a selected star and use an explicit radius. Set each planet/moon's parent with **Orbits around**; enable **Orbit guides** for design circles. These are static design guides. Moving a parent moves its descendants together and can be undone. Celestial portraits come from the actual asset renders (reference seed), with physical radius shown separately.

## Selection and path controls

Use **V** to select and move objects, **A** to edit polygon anchors and handles, **P** to draw a polygon zone, and **H** to pan. Hold **Space** for temporary pan; the wheel zooms. Shift-click adds/removes selection; dragging empty space with V draws a marquee. Hidden layers are excluded. Arrow keys nudge one metre, or ten with Shift; in A they move the selected anchor. Ctrl/Cmd+D duplicates selected zone subtrees, Delete removes the selection, Ctrl/Cmd+Z undoes, Shift+Z or Ctrl+Y redoes, and Ctrl/Cmd+S saves the draft. Text fields retain native editing shortcuts. Escape cancels an active pointer gesture before changing the document.

While drawing, Backspace or Ctrl/Cmd+Z removes the last point, redo restores it, and Enter finishes the polygon.

The zone inspector edits name, color, parent and background. Systems are root sphere zones; asteroid fields and ordinary zones can contain child zones. The outline shows the hierarchy. Parenting preserves world positions, and children are clipped by ancestors. Moving a zone moves its child boundaries, including through numeric position fields; this never teleports ships or planets. Deleting or duplicating a zone includes its descendants as one undoable edit. Catalog celestial objects can be moved; their creation/deletion and live-ship movement are outside map draft controls.

For a polygon, select a point with A. **Curve next edge** converts the edge without changing its shape. Drag the circular handles or enter angle/length values. Independent, aligned and mirrored coupling control the opposite handle; Alt-drag breaks coupling. **Add point after** splits the segment without changing its shape; double-click an edge to insert near that location. **Remove point** preserves a minimum of three anchors. The compiler rejects self-intersections and excessive complexity. Draft errors stay visible and prevent world publication.

Zone membership is calculated on the server from accepted ship movement, including crossing a thin zone completely within one tick. The game shows current zone names and blends the same authored backgrounds. A system boundary changes geometric membership; it does not transfer control permissions or the ship's simulation scope. Cross-scope travel remains a separate lifecycle feature.
