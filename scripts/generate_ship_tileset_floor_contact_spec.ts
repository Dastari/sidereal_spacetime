import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const floorPath = "packages/content/src/construction-floor-interfaces.json";
const nativePath =
  "assets/art-library/designs/shipyard.floor.mapped-deck-kit/revisions/r002/glb.glb";
const floors = JSON.parse(readFileSync(floorPath, "utf8"));
const spec = {
  schema: "sidereal.tileset-floor-contact-request.v1",
  revision: "r001-corner-continuation",
  supersedesRequestSha256:
    "a38f936d8f0323ed81eab4d93208f75f2c0ee2dd1498bf12b94060211f0f8f7f",
  latticePerMeter: 32,
  perimeterBandM: 0.25,
  sourceFrame:
    "Blender XY floor plane, Z up; metres; same floor-bottom origin as retained native floor, not wall-floor-top origin",
  floorTopM: 0.1875,
  floorBottomM: 0,
  source: {
    interfacePath: floorPath,
    interfaceSha256: hash(floorPath),
    nativePath,
    nativeSha256: hash(nativePath),
  },
  profiles: floors.parts.map(
    (part: {
      id: string;
      footprint: number[][];
      native: { nodePrefix: string; sourceToNominal: unknown };
    }) => ({
      id: `floor-contact-${part.id}`,
      floorId: part.id,
      footprintM: part.footprint.map((p) => p.map((n) => n / 32)),
      nodePrefix: part.native.nodePrefix,
      sourceToNominal: part.native.sourceToNominal,
    }),
  ),
  solidDefinition:
    "For each convex floor polygon P, let B=P minus its 250mm inward miter inset (empty inset means B=P). Where a native upper surface exists, the adapter fills only its measured void up to Z0.1875 within B. At measured nominal corner columns with no native projection at any Z, explicitly extend the edge-contact filler from the adjacent connected upper-bevel start elevation to Z0.1875 (square witness aboutZ0.1835). Determine and pin this lower datum from each profile's actual adjacent upper-bevel faces, not from an assumed global4mm bevel. Clip all occupied native volume out. Require connected side/bevel contact to retained native boundary; no detached filler islands, full-height corner posts or overlapping cap plates. Other ambiguous/non-height-field regions must still be reported.",
  absentCornerColumns: {
    policy: "bounded-upper-bevel-edge-contact-continuation",
    provenance:
      "floor-contact250/r000/preflight.json: square nominal corner projection deficit1.8745169346e-5m2; this is real geometry, not export noise",
    physicalQualification:
      "pending; this geometrical continuation does not grant rated bearing/support or pressure capability",
  },
  measurement:
    "Native r002 square top cap [0.004,1.996]^2 leaves a 4mm perimeter bevel and an8mm top gap at adjacent module seam. A frame atX1...3/Y0...25 has measured native contact0.4900320122434124m2 of required0.5m2. Treat this as one observed source case, not permission to assume every shape has the same bevel.",
  fixtures: [
    {
      id: "individual-native-floor-pairs",
      description:
        "Each of12 actual floor GLB selections plus matching adapter, including acute diagonals. All nodes/caps/undersides and native surfaces retained.",
    },
    {
      id: "two-square-frame-contact",
      floors: [
        { floorId: "square-2m", originM: [0, 0] },
        { floorId: "square-2m", originM: [2, 0] },
      ],
      contactMinM: [1, 0, 0.1875],
      contactMaxM: [3, 0.25, 0.1875],
      expectedAreaM2: 0.5,
    },
    {
      id: "native-wall-band-contact",
      description:
        "Perimeter-band contact coverage for all12 floors, under matching inward250 native loops. Every new adapter source and retained native part is pinned; unsupported physical roles remain explicit.",
    },
    {
      id: "complementary-native-tiles",
      description:
        "Actual square/half/quarter/subdivision/complementary-triangle native floor joins, including rotated/mirrored fixture placements. Shared side contacts remain unchanged; new filler must not overlap its neighbor.",
    },
  ],
  requirements: [
    "Author editable native filler geometry in Blender from the pinned native surfaces; preserve the original floor/source files and meaningful failed revisions. New source contains original reference meshes and separately named adapters/metadata.",
    "Export12 reusable native adapters, one per existing floor shape, and retain exact node/material/image provenance. Use the existing native floor edge/frame material; do not add studs or invent surface art.",
    "The complete original floor plus adapter must have full nominal top contact across its inward250 perimeter band, without positive-volume overlap, floor footprint overhang, or vertices above floorTop. Fill measured recesses plus the explicitly defined thin absent-corner continuation; zero-thickness duplicate faces are not solids. Preserve witnesses and measured per-profile lower datums for the continuation.",
    "Validate every actual exported vertex/edge/triangle, manifoldness, nondegenerate triangulation, exact upper contact area and bottom match to the native surface. The base floor retains all authored geometry and PBR materials.",
    "Test all12 pairs and transformed/complementary seams plus the measured0.5m2 window/frame contact. Record positive/negative native comparisons, original1micrometre export allowance, and1mm gap/overlap/height/winding controls. No tolerance increase.",
    "Show actual opaque-background Blender renders: original versus adapter versus combined, seam close-ups, underside/contact section and assembled wall/frame footprint. Exposed seam appearance changes must be visible and recorded as unapproved art.",
    "Do not alter any original floor, wall, window, doorway, shared catalog, runtime asset or authority binding. Publish only into the new owned design ledger. Root coordinates later exact native contact re-audit with window/door authors.",
    "All pressure, collision, support, damage and game capabilities remain unqualified until root adapters and exactcandidate evidence. Contact-surface completion alone is not a whole-compartment pressure proof.",
  ],
};
const output = "packages/content/src/ship-tileset-floor-contact-spec.v1.json";
for (const [path, content] of [
  [output, JSON.stringify(spec, null, 2) + "\n"],
  [
    "docs/ship_tileset_floor_contact_authoring_requirements.md",
    `# Native floor contact adapters\n\nGenerated by scripts/generate_ship_tileset_floor_contact_spec.ts. Machine-readable source: ${output}.\n\nTwelve unapproved native fillers close measured floor-top perimeter recesses without changing original floor geometry or overlapping it. Source r002 and0.1875m floor-top datum remain fixed.\n\n${spec.requirements.map((s) => `- ${s}`).join("\n")}\n`,
  ],
]) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== content)
      throw Error(`Stale request: ${path}`);
  } else writeFileSync(path, content);
}
console.log(hash(output));
