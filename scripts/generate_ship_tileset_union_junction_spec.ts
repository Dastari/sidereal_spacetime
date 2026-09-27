import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const cornerPath = "packages/content/src/ship-tileset-corner-spec.v1.json";
const internalPath = "packages/content/src/ship-tileset-internal-spec.v1.json";
const corner = JSON.parse(readFileSync(cornerPath, "utf8"));
const internal = JSON.parse(readFileSync(internalPath, "utf8"));
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const contact = (a: number[], b: number[], normal: number[]) => ({
  a,
  b,
  outwardNormal: normal,
  fullHeight: true,
  roles: ["nominal-native-contact"],
  physicalQualification: "pending",
});
const rectangle = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
type Piece = {
  family: string;
  profileId: string;
  originM: number[];
  quarterTurns: number;
};
const piece = (
  family: string,
  profileId: string,
  x: number,
  y: number,
  quarterTurns = 0,
): Piece => ({ family, profileId, originM: [x, y], quarterTurns });
const spanId = (length: number) => {
  const p = corner.profiles.find(
    (p: { lengthM?: number }) => Math.abs((p.lengthM ?? -1) - length) < 1e-12,
  );
  if (!p) throw Error(`Missing unchanged exterior span ${length}`);
  return p.id as string;
};
const exterior = (length: number, x: number, y: number, q: number) =>
  piece("convex-r004", spanId(length), x, y, q);
const convexIds = [
  "corner-7daf02f77db4",
  "corner-2d29d106ea4c",
  "corner-5b03c711aa8b",
  "corner-0792c389209e",
];
const convex = (index: number, x: number, y: number) =>
  piece("convex-r004", convexIds[index], x, y);
const shapes = [
  {
    id: "concave-90",
    reservationPolygonM: [
      [0, 0],
      [0, 0.125],
      [-0.25, 0.125],
      [-0.25, -0.25],
      [0.125, -0.25],
      [0.125, 0],
    ],
    description:
      "Reentrant vertex at origin; excluded quadrant NE, rays +X/+Y, inward normals -Y/-X; 0.125m ray cutbacks.",
    contacts: [
      contact([0, 0.125], [-0.25, 0.125], [0, 1]),
      contact([0.125, -0.25], [0.125, 0], [1, 0]),
    ],
  },
  {
    id: "exterior-t",
    reservationPolygonM: rectangle(-0.125, 0, 0.125, 0.375),
    description:
      "Fixed outer mating plane Y0; external arms at X±.125, centered inward branch starts Y.375. Side contacts occupy only Y0...25.",
    contacts: [
      contact([-0.125, 0], [-0.125, 0.25], [-1, 0]),
      contact([0.125, 0.25], [0.125, 0], [1, 0]),
      contact([0.125, 0.375], [-0.125, 0.375], [0, 1]),
    ],
  },
  ...[0.25, 0.5, 1.25, 1.5].map((lengthM) => ({
    id: `internal-span-${lengthM}`,
    lengthM,
    reservationPolygonM: rectangle(0, -0.125, lengthM, 0.125),
    description:
      "Explicit centered internal residual span; full terminal faces and native recessed side panels.",
    contacts: [
      contact([0, 0.125], [0, -0.125], [-1, 0]),
      contact([lengthM, -0.125], [lengthM, 0.125], [1, 0]),
    ],
  })),
];
const floor = (id: string, x: number, y: number) => ({
  id,
  originM: [x, y],
  quarterTurns: 0,
});
const fixtures = [
  {
    id: "concave-l-three-quarter-floors",
    footprintM: [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ],
    floors: [
      floor("quarter-1m", 0, 0),
      floor("quarter-1m", 1, 0),
      floor("quarter-1m", 0, 1),
    ],
    internalReservationsM: [] as number[][][],
    pieces: [
      convex(0, 0, 0),
      convex(1, 2, 0),
      convex(2, 2, 1),
      piece("new", "concave-90", 1, 1),
      convex(2, 1, 2),
      convex(3, 0, 2),
      exterior(1.5, 0.25, 0, 0),
      exterior(0.5, 2, 0.25, 1),
      exterior(0.625, 1.75, 1, 2),
      exterior(0.625, 1, 1.125, 1),
      exterior(0.5, 0.75, 2, 2),
      exterior(1.5, 0, 1.75, 3),
    ],
  },
];
for (const d of [1, 2]) {
  const common = (depth: number) => [
    convex(0, 0, 0),
    convex(1, 2, 0),
    convex(2, 2, depth),
    convex(3, 0, depth),
    piece("new", "exterior-t", 1, 0),
    exterior(0.625, 0.25, 0, 0),
    exterior(0.625, 1.125, 0, 0),
  ];
  fixtures.push({
    id: `opposing-exterior-t-${d}m`,
    footprintM: rectangle(0, 0, 2, d),
    floors: [floor(d === 1 ? "half-2x1" : "square-2m", 0, 0)],
    internalReservationsM: [rectangle(0.875, 0, 1.125, d)],
    pieces: [
      ...common(d),
      exterior(d - 0.5, 2, 0.25, 1),
      exterior(d - 0.5, 0, d - 0.25, 3),
      piece("new", "exterior-t", 1, d, 2),
      exterior(0.625, 1.75, d, 2),
      exterior(0.625, 0.875, d, 2),
      piece("new", `internal-span-${d - 0.75}`, 1, 0.375, 1),
    ],
  });
  // A terminating branch exercises the other two residual lengths. Side walls use
  // exact 1m/2m pieces with declared complete end contacts, not scaled residuals.
  const depth = d + 1;
  const sidePieces =
    depth === 2
      ? [exterior(1.5, 2, 0.25, 1), exterior(1.5, 0, 1.75, 3)]
      : [
          exterior(1.5, 2, 0.25, 1),
          exterior(0.5, 2, 1.75, 1),
          exterior(0.5, 2, 2.25, 1),
          exterior(1.5, 0, 2.75, 3),
          exterior(0.5, 0, 1.25, 3),
          exterior(0.5, 0, 0.75, 3),
        ];
  fixtures.push({
    id: `exterior-t-capped-branch-${d}m`,
    footprintM: rectangle(0, 0, 2, depth),
    floors: Array.from({ length: depth }, (_, y) => floor("half-2x1", 0, y)),
    internalReservationsM: [rectangle(0.875, 0, 1.125, d)],
    pieces: [
      ...common(depth),
      ...sidePieces,
      exterior(1.5, 1.75, depth, 2),
      piece("new", `internal-span-${d - 0.5}`, 1, 0.375, 1),
      piece("internal-r000", "internal-end", 1, d, 3),
    ],
  });
}
const nativeDependencies = new Set<string>([
  "assets/art-library/designs/shipyard.floor.mapped-deck-kit/revisions/r002/glb.glb",
]);
for (const fixture of fixtures)
  for (const p of fixture.pieces)
    for (const q of [1, 2, 3, 4]) {
      if (p.family === "convex-r004")
        nativeDependencies.add(
          `assets/art-library/designs/shipyard.structure.convex-inset-boundary/revisions/r004/profiles/${p.profileId}-q${q}.glb`,
        );
      if (p.family === "internal-r000")
        nativeDependencies.add(
          `assets/art-library/designs/shipyard.structure.internal250/revisions/r000/${p.profileId}-q${q}.glb`,
        );
    }
const spec = {
  schema: "sidereal.tileset-union-junction-request.v1",
  latticePerMeter: 32,
  thicknessM: 0.25,
  heightsM: internal.heightsM,
  placementFloorTopM: 0.1875,
  sourceFrame: "Blender XY floor plane, Z up; metres; applied transforms",
  sourceRequests: [cornerPath, internalPath].map((path) => ({
    path,
    sha256: hash(path),
  })),
  nativeDependencies: [...nativeDependencies]
    .sort()
    .map((path) => ({ path, sha256: hash(path) })),
  nativeFamilies: {
    "convex-r004":
      "assets/art-library/designs/shipyard.structure.convex-inset-boundary/revisions/r004/",
    "internal-r000":
      "assets/art-library/designs/shipyard.structure.internal250/revisions/r000/",
    "floor-r002":
      "assets/art-library/designs/shipyard.floor.mapped-deck-kit/revisions/r002/",
  },
  shapes,
  fixtures,
  fixtureTransforms: {
    quarterTurns: [0, 1, 2, 3],
    reflectedAcrossX: [false, true],
    meaning: "Qualification fixtures only; no runtime capability is granted.",
  },
  requirements: [
    "Preserve native r005/internal250 material roles and embedded normal/roughness texture payloads; editable Blender source is visual authority.",
    "Contact patches are complete flush actual native surfaces at every height. Decorative recession is forbidden on contact patches.",
    "All exported nodes/triangles/edges remain in reservation, including the concave notch. Source/export manifoldness and nondegenerate cap triangulation required.",
    "Assembled projected occupancy equals exact fixed-floor inward band union the explicitly declared internal reservations. No duplicate positive-volume body, unsupported floor, or undeclared inset intrusion.",
    "Rotate/mirror exact fixture placements; no scaling, floor-edge movement, hand nudges or tolerance increase. Existing pinned 1 micrometre export allowance remains.",
    "Negative controls: 1mm translation gap and overlap, height mismatch, winding and socket-normal mismatch; identify offending piece/contact IDs.",
    "Reject collapsed inset, point-touch floor union, overlapping cores, insufficient corner setback and unequal-height mate. General non-cardinal concave profiles remain unsupported.",
    "Opaque individual and actual GLB assembled views; separate unqualified collision/seal/damage/support metadata; exact hashes, references, retained revision history; no publication or owner approval.",
  ],
};
const outputs = new Map([
  [
    "packages/content/src/ship-tileset-union-junction-spec.v1.json",
    JSON.stringify(spec, null, 2) + "\n",
  ],
  [
    "docs/ship_tileset_union_junction_authoring_requirements.md",
    `# Inward union-junction native request\n\nGenerated by scripts/generate_ship_tileset_union_junction_spec.ts.\n\nSix profiles × four approved heights: concave90, exterior T and four centered residual spans. Five exact floor-union fixtures with cardinal/mirrored coverage. The outer boundary and 250mm thickness are unchanged. Full physical qualification remains pending.\n\nMachine-readable source: packages/content/src/ship-tileset-union-junction-spec.v1.json. Existing native families are retained; all new art is unapproved.\n\n${spec.requirements.map((s) => `- ${s}`).join("\n")}\n`,
  ],
]);
for (const [path, content] of outputs) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== content)
      throw Error(`Stale generated request: ${path}`);
  } else writeFileSync(path, content);
}
console.log(
  hash("packages/content/src/ship-tileset-union-junction-spec.v1.json"),
);
