# Sidereal Shipyard

Shipyard is the ship layout editor. Design floor shapes and decks, place parts,
and inspect the resulting layout. Local drafts can be saved and recovered.

- **Structure:** draw floors, partitions and door openings in a fixed top view.
  Select floor tiles to give an area a room name for the ship map.
- **Objects:** place equipment, furniture and cargo inside the ship.
- **Hull:** place exterior panels, engines and cockpit components. Qualified
  panels snap their attachment plane to the outside of a structural wall.
- **Systems:** inspect device inputs and outputs and connect compatible ports.
  Power connections currently represent an on/off supply; capacities and other
  resource flows are still under development.

The layer controls remain available in every mode. They change visibility
without removing parts or changing the structure. Room names are map labels;
they do not declare a sealed pressure compartment.

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
