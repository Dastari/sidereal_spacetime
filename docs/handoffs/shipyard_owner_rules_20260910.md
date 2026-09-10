# Shipyard construction and Creator workspace direction

Owner direction: 2026-09-10. Accepted requirements; this document is not a completion claim. Apply together with `docs/ship_construction_rebuild.md` and the authority/Blender contracts. The owner selected an editable hull-size catalogue. Preserve the existing Wayfarer's fit and stored drafts; new catalogue limits are explicit authoring data, not invented faction balance.

## Owner's nine rules

1. Ships are primarily based on a hull size. Each hull size restricts usable grid width, length/depth and height across decks.
2. Designing a floorplan automatically generates exterior walls around the outside on every floor. These walls cannot be deleted individually; changing the floorplan changes its enclosing walls.
3. Wall models generate from the wall layout. Walls occupy grid edges between lattice intersections, never tile centres. Each wall can have separate panels on either side. Straight spans, corners, T junctions and cross junctions must join each other and the exterior wall system seamlessly.
4. Multiple door types and widths may be added to or removed from interior and exterior walls. Doors snap to wall-aligned tile slots, centred between the adjoining tiles. They cannot abut wall corners. Closed sealing doors contribute to the pressure system; room labels do not define seals.
5. Floors generate from the layout. Individual tile finishes/models can be overridden. Floors and walls are derived structural elements, not ordinary add/delete fitting objects.
6. Objects snap to the grid and support rotation. Selection feedback uses a proper object silhouette/outline, as in the game, rather than exposing mesh triangles or a wireframe model.
7. Exterior hull/armor pieces attach outside the floorplan's structural walls and define the outer appearance. Decorative/armor shape is distinct from the pressure enclosure.
8. Systems mode shows service-bearing equipment and external components as outlined footprints with names and ports, with power/data/fuel/coolant/ventilation routes between them. Solid model detail is suppressed in this schematic by default. Crossings do not connect without a real junction; cross-deck routing remains spatial.
9. Floor design, wall placement and Systems transition to Top view and hide irrelevant layers by default. Users may turn layers back on. This explicitly supersedes the previous instruction to retain the same projection across every tab. Preserve camera continuity where compatible and allow explicit user overrides rather than resetting on each document edit.

## Visual direction

One Creator theme across Workspaces, Shipyard, Genesis, model studies, assembly and components: deep navy surfaces, cyan active controls, crisp restrained borders, readable light text and consistent typography/control sizing. The first supplied mockup sets the shell, tool rail, central viewport, inspector and deck-control hierarchy. Its sample ship statistics and fake operational statuses are not data to fabricate in the application.

- Creator mockup: `/root/.t3/userdata/attachments/efaf3d5e-6a61-4702-9019-23e1be66416c-e866e73d-c733-4aed-8497-442da66bbeaf.png`
- Systems schematic reference: `/root/.t3/userdata/attachments/efaf3d5e-6a61-4702-9019-23e1be66416c-45c8db14-576d-49d1-bc7a-17376faec4a9.png`

The structural module remains 2m with explicit supported subdivisions. Wall/door selection must handle valid diagonal edges from triangular/trapezoidal floor shapes. Door clearance includes jamb/corner/junction offsets and opening sweep, not only a midpoint test. Generated visuals select/assemble authored native Blender modules; this does not authorize returning to TypeScript voxel solids as the final art source. Missing native junction, panel or door variants require explicit asset work rather than silently claiming visual completeness.

## Integration ownership and acceptance

- `stair_document`: hull envelope and structural semantic contracts/compiler/validation; additive compatibility and pure tests. Do not replace the old qualified template globally.
- `shared_space_rules`: structural editor state, palette/inspector actions and undo/import-safe tools; consumes the core contract. Existing wall batching is checkpointed separately.
- Parent: global Creator theme/shell, editor viewport/mode policy, systems schematic and silhouette integration; shared wiring and final combined acceptance.
- `release_rollout`: finish the already-qualified camera/TAA client release, then help with independent dashboard release checks. Do not combine unqualified new ship authority with that client release.

Required evidence includes hull overflow in all three axes; exterior regeneration on every deck; no direct deletion of generated walls/floors; independent wall-face finishes; straight/corner/T/cross/diagonal connections; multi-width door setback rejection and atomic edits; grid/rotation and silhouette feedback; Systems port/route visibility; per-mode Top/layer defaults with manual overrides; consistent theme across routes; draft recovery/undo/import preservation. Pressure, door operation, damage and live publication continue through server validators and their own tests; a drawing is not implemented gameplay.
