# Ship tileset interface contract

Status: required construction contract, proposed implementation specification. No asset is certified by this document alone. Owner reference and clarification: 2026-09-09.

This extends [the construction rebuild](ship_construction_rebuild.md). The owner must be able to request a faction tileset with named shapes and dimensions and receive native Blender assets that demonstrably assemble in the same Shipyard system. A visually similar collection is insufficient: connection geometry and functional interfaces must be machine-readable and validated.

## Reference and scale

Preserve the supplied reference at `/root/.t3/userdata/attachments/efaf3d5e-6a61-4702-9019-23e1be66416c-bd077295-cbaa-42d7-b33a-7b7ee9328c98.png` as source evidence in the art-library workflow before model authoring. It shows separate floor, systems, frame, armor and decoration layers; matched diagonal pieces; modular exterior silhouettes; and reusable faction kits. Do not treat its labels as measured geometry.

Keep the owner's previously specified **2 m structural module**, with 1 m and smaller explicitly permitted subdivisions on the existing 1/32 m lattice. One reference-image tile does not silently redefine one Shipyard module. Dimensions are always recorded in metres and lattice units; labels such as “1×2” additionally declare whether they mean metres or modules.

## The deliverable an asset agent receives

Before producing a kit, generate a versioned **kit specification** containing:

- Kit ID/version, interface-family version, units, source/runtime coordinate mapping, exact dependency hashes and requested faction/material variants.
- Named shapes with exact counter-clockwise nominal footprint vertices in ship-local XY lattice units. Floor top, underside, roof underside/top, wall seal planes, service void and clear room height are separate named datums.
- Canonical origin and orientation: plan-space minimum-X/minimum-Y datum at the specified layer elevation, independent of decorative visual bounds; explicit transform to Blender axes and glTF runtime axes. No automatic recentering from a mesh bounding box.
- Allowed quarter-turns and explicitly authored or validated reflections. Mirroring is not assumed safe for normals, asymmetric fittings, decals or service ports.
- Each boundary edge's endpoints, outward normal, connection family, seam profile, thickness/height range, seal/contact patches, socket positions and clearance envelope.
- Compatible mate types and adapters, including end caps, corner pieces, concave junctions, diagonal-to-straight transitions and vertical floor/wall/roof interfaces.
- Layer role: walk-support structure, pressure structure, partition, roof, armor, mounted system, cargo support or decoration. Appearance does not grant another role.
- Separate visual envelope, collision/support proxy, pressure boundary and optional damage representation. Gameplay ratings reference approved definitions; unknown ratings remain unresolved.
- Explicit damage mode: voxel for structural walls/floors/roofs, hull/armor and exterior hardware; entity health for interior equipment and containers. Definition-level mode survives relocation. Interior health assets need no deformation volume; later damaged model variants preserve instance/inventory IDs. See the owner refinement in the construction rebuild.
- Required reference renders, assembly test fixtures, validation command and output schema.

The specification is the asset agent's input. Its output is editable Blender sources, native material-preserving GLBs, interface metadata, pinned hashes and a validation report. The editor consumes the same metadata; there must not be one set of dimensions in an art prompt and another in snapping code.

## Initial shape coverage

Use exact polygon definitions, not just shape names. Begin with the existing floor kit's measured nominal interfaces and add missing companions rather than relabeling approved models.

| Family | Required coverage |
| --- | --- |
| Rectilinear | 2×2 m square; 2×1 and 1×1 m subdivisions; declared longer rectangles and strips |
| Diagonal | Right triangles, complementary left/right long and slender wedges, clipped corners |
| Taper | Explicit wide/narrow end widths and length; symmetric and handed trapezoids where requested |
| Boundary | Straight wall, convex/concave corner, matching diagonal wall, end cap, junction and opening frame |
| Roof | Matching floor footprints with roof-specific datums, support, thickness and closure interfaces |
| Armor | Plates and transitions attached outside the structural envelope, with matching edge profiles across permitted neighbors |
| Detail | Fins, shrouds, trim and antennas attached through named mounts without altering nominal floor topology |

For example, a 2 m square footprint is `[(0,0),(64,0),(64,64),(0,64)]` at 32 units/m. A half-square triangle can be `[(0,0),(64,0),(0,64)]`; its complementary mate is defined and tested explicitly. These are nominal topology examples, not a replacement visual mesh.

Do not promise arbitrary angles snap to a rational lattice. A 4 m run with 2 m rise is about 26.565°, not 22.5°. Exact 22.5°/67.5° edges require a separately supported geometric representation or a documented approximation with matching companion interfaces. Rotated diamonds, rounded corners and curves likewise need explicit polygons/curves and compatible edge definitions; they are not enabled by the reference illustration alone.

## Joining rules

Placement transforms map nominal interfaces to shared coordinates. Two compatible boundary intervals mate only where their positions, heights, opposing normals and profile/seal definitions agree. Different-length edges can mate over validated sub-intervals: two 1 m pieces may meet one 2 m edge, with no uncovered seal or ambiguous junction. An edge match must not imply an electrical/fluid connection.

The compiler unions floor polygons and removes internal coincident boundaries. It generates enclosure pieces only along exposed boundaries, using the correct straight/diagonal/corner adapter. Hole boundaries form inner enclosures. Interior partitions subdivide physical enclosures; room labels do not. A preview of the generated boundary must identify any gap for which the kit has no valid adapter instead of filling it with an unrelated box.

Visual bevels may retreat from the nominal seam; a mating backing/lip profile must prevent exposed cracks where required. Every exported surface must remain inside its asset's declared reserved polygon and height, including bevels, handles, trim, fasteners and decals. There is no decorative-overhang exception for a floor reservation. Separate exterior decoration assets require their own reserved volumes and mounts outside usable floor space. Pressure seals derive from their explicit continuous boundary, never visible beveled triangles or screen-space contact.

Faction substitution preserves the interface-family contract, structural datum and required clearances. It can change approved visual forms/materials and separately approved armor definitions. An incompatible faction part needs an adapter or fails placement; silent scaling is prohibited.

Systems ports define medium, connector family, pose, diameter/clearance, direction and functional definition. Under-floor channels and wall risers join through explicit compatible connectors. Bulkhead feedthroughs state whether they preserve the seal. Ports merely occupying the same coordinates do not automatically join, and crossing routes do not create junctions.

## Certification and editor behavior

Implement the validator in the construction/content tooling, reusing pure topology rules rather than a second ad hoc Blender-only geometry compiler. Validate at least:

1. Units, integer lattice vertices, winding, nondegenerate/non-self-intersecting polygons, datums, transforms and finite bounded metadata.
2. Every declared allowed rotation/reflection and compatible pair, including subdivided edges, T junctions, corners and diagonal transitions. Reject gaps, excessive overlaps, inconsistent heights, inward normals and missing adapters.
3. Assembled floor/wall/roof fixtures: walking continuity, closure of pressure boundaries, correct holes/openings, floor support and clearance for doors and service routes. Closed airlock fixture must have a valid chamber; this does not replace runtime cycling tests.
4. Visual-to-interface agreement within explicitly recorded tolerances; no arbitrary large tolerance to pass a poor fit. Collision/support dimensions are authoritative proxies, not inferred from decorative AABBs.
5. GLB material roles, normal maps/tangents, mirrored handedness, named nodes/sockets and immutable source revision/hash correspondence.
6. Native rendered contact sheets and close seam views under directional light for all shape families, plus example assembled layouts in Shipyard and the actual game. Numeric fitting does not certify visual quality.
7. Mutation tests: shift an endpoint, change a datum, reverse a profile, remove a corner adapter or put a decoration in the walking envelope; each must fail the appropriate gate with the offending IDs.

Report separate states: geometry-valid, visually reviewed, collision-ready, pressure-ready, service-ready and owner art-approved. A kit may be available in draft preview with explicit missing-capability diagnostics, while publication rejects missing interfaces required by that blueprint. Passing a fit report never invents owner approval or gameplay ratings.

The Shipyard library displays interface compatibility and dimensions. Snapping previews valid mates; invalid placement shows the exact mismatched edge/height/connector. Faction replacement and mirrored placement use the same validator. Keep reusable asset IDs separate from placed IDs even when rendering uses instancing or batching.

## Acceptance milestone

An external asset agent must be able to build a second visual tileset from the specification without editing Shipyard snapping/compiler code. Both kits must assemble the same square/triangle/taper test layout, form matching floor/wall/roof closures and preserve functional interfaces. Then use certified adapters to rebuild Wayfarer and prove two independently spawned instances as required by the construction plan. Unsupported curved families remain explicit future extensions.

Implementation owner: `integration_continuation`, coordinated with `authoritative_ifcs` for pure/compiler and authoritative validation. Native asset revisions remain with their art owners. This contract is a prerequisite for broad new tileset production, not a request to redesign every approved asset now.

## Owner authoring correction — 2026-09-10

The primary fit contract belongs to the model, before placement. A reserved 2 m floor shape cannot export 2.04 m of geometry and rely on editor offsets to compensate. Smaller and irregular shapes are allowed with explicit polygons and an unchanged declared origin. Measure the complete native export at that origin, not a simplified collision proxy, selected shell or nominal bounding-box label. Concave families need validated polygon decomposition; a bounding rectangle is insufficient for diagonal pieces. Height bounds apply to every exported component as well.

The floor boundary is the **usable interior edge**. Exterior structural wall thickness, trims and attachment hardware occupy a separate outward reservation. A hidden bearing lip may overlap the structural slab at or below its support datum through a qualified contact interface; it cannot intrude into the advertised usable volume above the deck. Armor attaches beyond the structural reservation. Internal partitions reserve an explicit strip and update usable regions; a wall-containing composite cannot masquerade as an empty usable floor tile.

Each corrected wall asset therefore needs an interior boundary plane, outward normal, base and roof mating datums, full reserved volume, and separate structural support/seal patches. Each mounted equipment asset needs a complete body reservation, mount pose/normal, mating family, swept access volume and permitted contact patches. A socket name alone is insufficient. Ordinary grid placement must then fit without per-placement nudges, hidden scaling or floor-area erosion.

Catalog admission must reject an export that exceeds its reserved volume. Blueprint validation must reject incompatible wall/floor/roof datums, inward wall intrusion, unsupported mounting or visible coplanar conflicts before publication. Older uncertified assets may remain inspectable with explicit diagnostics; existing live state is preserved until a separately validated authoritative asset-revision migration. Keep placed/item/container IDs stable and correct Blender source revisions, rather than moving furniture to conceal bad interfaces.

The current evidence is in [the native authoring audit](handoffs/wayfarer_authored_interface_audit.md). All twelve r002 floor shapes pass raw export containment. Twenty-one boundary-bearing legacy wall groups intersect the nominal main-deck usable prism; some also contain partitions and need their roles separated. Six native lockers intersect those walls. This is measured nonconformance, not permission to certify the old layout or compensate with offsets.
