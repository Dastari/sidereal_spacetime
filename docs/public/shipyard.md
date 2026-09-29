# Sidereal Shipyard

Shipyard is the prefab ship editor. A ship is grammar data: hull volumes made of
1 m shape tiles, rooms, edges (walls, windows, doors, canopies), mounted
components and roof mount tiles. Open a developer template or a draft from the
library, or start a new hull. Local drafts save automatically and can be
exported.

## Tools

Press **?** in the editor for the full shortcut list.

- **Select (V):** click to select. Drag rooms, mounts and skylights to move
  them. Drag empty space to pan.
- **Hull paint (B):** drag to paint shape tiles into the active volume. **R**
  rotates, **F** mirrors, **[ ]** cycles shapes.
- **Erase tiles (E):** drag over tiles to remove them from the active volume.
- **Room (M):** drag a rectangle of cells to add a room of the chosen type.
  Rooms are labels; they do not declare a sealed pressure compartment.
- **Edge (D):** click a cell edge between rooms. Doors span two cells. Clicking
  the same edge again removes it.
- **Mount (P):** pick a component, then click a green anchor. **R** turns
  interior modules.
- **Mount tile (T):** weapons and sensors mount on roof tiles. Pick fixed or
  turret and a size, then click the roof; **R** turns the boresight.
- **Skylight (K):** click the roof to add a skylight.

**S** toggles port/starboard symmetry. **Ctrl+Z** and **Ctrl+Shift+Z** undo and
redo; **Ctrl+S** saves the draft now; **Home** fits the ship in view.

## Validation and preview

The stats panel shows mass, size class and validation messages as you edit.
The preview shows the dressed ship in its flight (roofed) and deck (cut-away)
views. A visual preview does not mean every system is functional in the game.

## Publishing

Signed-in, authorized workspaces can save server drafts and publish immutable
blueprints. Publishing a blueprint does not refit an existing ship. Access to
publishing and spawning requires separate workspace permissions. Keep an
exported copy of important drafts, and review validation messages before
publishing.
