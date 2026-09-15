# Sidereal Shipyard

Shipyard is the ship layout editor. Design floor shapes and decks, place parts,
and inspect the resulting layout. Local drafts can be saved and recovered.

- **Structure:** draw floors, partitions and door openings in a fixed top view.
  Select floor tiles to give an area a room name for the ship map.
- **Objects:** place and move equipment, furniture, cargo, engines and thrusters.
- **Hull:** place exterior panels and cockpit components. Qualified
  panels snap their attachment plane to the outside of a structural wall.
- **Systems:** inspect device inputs and outputs and connect compatible ports.
  Power connections currently represent an on/off supply; capacities and other
  resource flows are still under development.

The layer controls remain available in every mode. They change visibility
without removing parts or changing the structure. Room names are map labels;
they do not declare a sealed pressure compartment.

Select an internal wall to reveal its two endpoint handles. Drag either handle
to resize the wall on the snap grid. Drag the wall itself to move both ends,
its doors and its wall treatments together. All placements must remain supported.

In Objects and Hull, drag a component to move it across the deck. Hold **Shift**
before dragging to move it up or down; **Shift + Up/Down** moves one snap step.
Use the Height field for an exact value. Older floorplan fittings remain tied to
their named deck.

Choose **Measure vertices** in the viewport toolbar, then click highlighted
vertices on visible parts. Each click extends the measurement path; the readout
shows segment distances, vertical differences and total length. **Backspace**
removes the last point and **Escape** clears the path. Measurements do not change
your draft.

The standard native doorway needs a 1.25 m clear opening and 375 mm of wall on
each side for its frame. Native fit messages identify unsupported placements.
Existing Wayfarer passages are not automatically replaced with doors.

Authorized workspaces also support server drafts and immutable blueprint
publication. Publishing a blueprint does not refit an existing ship. Access to
publishing and spawning requires separate workspace permissions.

Authored ship gameplay is being introduced in stages. Current review features
support native floors and walking boundaries. Complete working decks, sealed
compartments, airlocks, cargo stacking and connected utilities are still under
development. A visual preview does not mean those systems are functional.

Keep an exported copy of important drafts. Review validation messages before
publishing, and retain unsupported drafts when a catalog changes.


## Review the new Wayfarer armor

Choose **New → Open Wayfarer armor review**. Your current design stays saved. The new design opens in Hull / 3D with the reviewed armor assembled. Select a block to move it, use its Height field or Shift-drag to lift it, and use Undo to restore the assembly. Search the Hull palette for **Armor** to try other native heights, spans and corners. These are editable local visual parts; automatic corner assembly and game installation are still pending. The Publish button explains this restriction. Save draft and export remain available.

Drag the divider beside the library to resize it in Structure, Objects or Hull.
The width is remembered across tabs and reloads. You can also focus the divider
and use arrow keys, Home or End. Hull armor cards show the actual native panel,
including its finish and corner shape.

Armor choices show total depth as well as width, height and finish. Equivalent
native variants share one palette card; existing placed parts retain their original
asset references. Thinner bulkhead panels remain separate choices.
