import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { TILESET_WALL_CONVENTION as c } from "../packages/content/src/tileset-interfaces";
type XY = [number, number];
const floorPath = "packages/content/src/construction-floor-interfaces.json";
const raw = readFileSync(floorPath, "utf8");
const floors = JSON.parse(raw).parts as { id: string; footprint: XY[] }[];
const scale = (p: XY, s: number): XY => [p[0] * s, p[1] * s];
const add = (a: XY, b: XY): XY => [a[0] + b[0], a[1] + b[1]];
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const unit = (p: XY) => scale(p, 1 / Math.hypot(...p));
const thickness = c.thicknessUnits / c.latticePerMeter;
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 12);
const profiles = new Map<string, object>();
const fixtures = floors.map((f) => {
  const vertices = f.footprint.map((p) => scale(p, 1 / 32));
  const corners = vertices.map((v, i) => {
    const prev = sub(vertices[(i + vertices.length - 1) % vertices.length], v),
      next = sub(vertices[(i + 1) % vertices.length], v);
    const a = unit(prev),
      b = unit(next),
      na: XY = [a[1], -a[0]],
      nb: XY = [-b[1], b[0]];
    const det = na[0] * nb[1] - na[1] * nb[0];
    if (det <= 0)
      throw Error("Initial corner request only covers convex floor vertices");
    const inner: XY = [
      (thickness * (nb[1] - na[1])) / det,
      (thickness * (na[0] - nb[0])) / det,
    ];
    const cutA = Math.ceil(dot(inner, a) * 32) / 32,
      cutB = Math.ceil(dot(inner, b) * 32) / 32;
    const atA = scale(a, cutA),
      atB = scale(b, cutB);
    const points: XY[] = [
      [0, 0],
      atB,
      add(atB, scale(nb, thickness)),
      inner,
      add(atA, scale(na, thickness)),
      atA,
    ];
    const polygon = points.filter(
      (p, i) =>
        Math.hypot(...sub(p, points[(i + points.length - 1) % points.length])) >
        1e-12,
    );
    const key = digest({ a, b, cutA, cutB });
    profiles.set(key, {
      id: `corner-${key}`,
      rays: [a, b],
      inwardNormals: [na, nb],
      cutbacksM: [cutA, cutB],
      reservationPolygonM: polygon,
      endProfiles: [
        { pointM: atA, normal: a, depthDirection: na, widthM: thickness },
        { pointM: atB, normal: b, depthDirection: nb, widthM: thickness },
      ],
      sourceFrame:
        "Blender XY deck plane, Z up; polygon relative to boundary vertex",
    });
    return {
      profileId: `corner-${key}`,
      originM: v,
      cutToPreviousM: cutA,
      cutToNextM: cutB,
    };
  });
  const spans = vertices.map((v, i) => {
    const end = vertices[(i + 1) % vertices.length],
      u = unit(sub(end, v)),
      length =
        Math.hypot(...sub(end, v)) -
        corners[i].cutToNextM -
        corners[(i + 1) % vertices.length].cutToPreviousM;
    if (length <= 0) throw Error(`Nonpositive residual span ${f.id}:${i}`);
    const id = `span-${digest(length)}`;
    profiles.set(id, {
      id,
      lengthM: length,
      reservationPolygonM: [
        [0, 0],
        [length, 0],
        [length, thickness],
        [0, thickness],
      ],
      sourceFrame:
        "Blender X run, Y inward, Z up; origin at first end, exterior edge",
      endProfiles: [
        {
          pointM: [0, 0],
          normal: [-1, 0],
          depthDirection: [0, 1],
          widthM: thickness,
        },
        {
          pointM: [length, 0],
          normal: [1, 0],
          depthDirection: [0, 1],
          widthM: thickness,
        },
      ],
    });
    return {
      profileId: id,
      originM: add(v, scale(u, corners[i].cutToNextM)),
      tangent: u,
      lengthM: length,
    };
  });
  return { id: f.id, footprintUnits: f.footprint, corners, spans };
});
const spec = {
  schema: "sidereal.tileset-convex-boundary-request.v1",
  wallConvention: c.schema,
  latticePerMeter: 32,
  thicknessM: thickness,
  heightsM: c.heightQuarters.map(
    (q) => ((c.standardDeck.clearHeightUnits / 32) * q) / 4,
  ),
  placementFloorTopM: c.standardDeck.floorThicknessUnits / 32,
  sourceFloorInterfaces: {
    path: floorPath,
    sha256: createHash("sha256").update(raw).digest("hex"),
  },
  cutbackRule:
    "Inner offset-line intersection; ceil each ray projection to 1/32m. This is distance along the ray, not XY snapping. Structural directions are exact floor-edge ratios, independent of furniture yaw.",
  profiles: [...profiles.values()],
  fixtures,
  exportToleranceMeters: 0.000001,
  tolerancePurpose: "Float encoding only; nominal interfaces coincide exactly",
  requirements: [
    "Authored Blender surfaces/materials inside each polygon extrusion; no TypeScript visual mesh",
    "Corner/straight end faces mate without nudging, scaling or positive-volume overlap",
    "Full 12 standalone floor-loop assemblies for every height; no claim of generic concave union support",
    "Separate collision/seal/bearing/damage metadata with qualification pending",
    "Editable source, exact hashes, all-node GLB containment and actual opaque render evidence",
  ],
  unsupported: [
    "concave union corners",
    "internal T/cross and exterior ties",
    "openings/glazing",
    "generic native installation/pressure",
  ],
  approval: "unapproved",
};
const json = JSON.stringify(spec, null, 2) + "\n",
  sha = createHash("sha256").update(json).digest("hex");
const guide = `# Convex inward boundary native request

Generated by scripts/generate_ship_tileset_corner_spec.ts. Request SHA-256: ${sha}.

Walls occupy 250 mm inside each fixed floor boundary. Each corner is the native band between two boundary rays and their inward offset lines. Its perpendicular ends are cut at the next 1/32 m distance at or beyond the inner miter. The residual straight length is the edge length minus both corner cuts. These endpoints stay continuous on diagonal rays; do not snap their XY coordinates or quantize them to furniture yaw.

The request supplies ${profiles.size} reusable corner/span profiles and exact placements for all twelve standalone floor footprints. Heights are 0.75/1.5/2.25/3 m; floor-top placement is 0.1875 m. Native Blender surfaces, trim and materials must remain in each declared extrusion. Validate every transformed exported node and the assembled union. End faces meet exactly; 1 µm only admits export float encoding. Convex formulae do not certify arbitrary floor unions: concave corners, internal junctions, openings and native installation remain separate qualified families.

Produce editable Blender source, material-preserving GLBs, hashes, separate unqualified physical metadata and actual opaque-background native assembly captures. Preserve every meaningful revision. New art is unapproved and no runtime catalog or live pin changes are authorized by this request.
`;
for (const [path, body] of [
  ["packages/content/src/ship-tileset-corner-spec.v1.json", json],
  ["docs/ship_tileset_corner_authoring_requirements.md", guide],
]) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== body)
      throw Error(`Stale corner request: ${path}`);
  } else writeFileSync(path, body);
}
console.log(
  JSON.stringify({
    sha256: sha,
    profiles: profiles.size,
    fixtures: fixtures.length,
  }),
);
