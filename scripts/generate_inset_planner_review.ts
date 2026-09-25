import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  emptyLayout,
  stampTile,
  transformPoint,
  type Point,
} from "../packages/content/src/ship-layout";
import type { LayoutStructureV2 } from "../packages/content/src/layout-structure";
import { compileLayout } from "../packages/sim/src/layout-compiler";
import { readLayout } from "../packages/sim/src/layout-validation";
import { planInsetNativeBoundary } from "../packages/sim/src/layout-inset-native-plan";
import union from "../packages/content/src/ship-tileset-union-junction-spec.v1.json";
import floors from "../packages/content/src/construction-floor-interfaces.json";

const root = process.cwd();
const output = resolve(process.argv[2] ?? "");
if (!process.argv[2] || existsSync(output))
  throw Error(
    "Provide a new output JSON path; existing reviews are immutable.",
  );
const base = dirname(output);
const sha = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const sourcePins: Record<string, string> = {};
const pins: Record<string, string> = {};
function source(path: string) {
  const bytes = readFileSync(resolve(root, path));
  sourcePins[path] = sha(bytes);
  return JSON.parse(bytes.toString());
}
const families = {
  "convex-r004": "shipyard.structure.convex-inset-boundary/revisions/r004",
  "internal-r000": "shipyard.structure.internal250/revisions/r000",
  "union-r001": "shipyard.structure.union-junction250/revisions/r001",
};
const expected = new Map<string, string>();
for (const dir of [
  ...Object.values(families),
  "shipyard.structure.roof125/revisions/r000",
]) {
  const folder = "assets/art-library/designs/" + dir;
  const delivery = source(folder + "/delivery-manifest.json");
  const entries = Array.isArray(delivery.files)
    ? delivery.files.map(
        (p: { path?: string; file?: string; sha256: string }) => [
          p.path ?? p.file,
          p,
        ],
      )
    : Object.entries(delivery.files);
  for (const [name, entry] of entries as [string, { sha256: string }][]) {
    if (name.endsWith(".glb")) expected.set(folder + "/" + name, entry.sha256);
  }
}
const filler =
  "assets/art-library/designs/shipyard.structure.floor-contact250/revisions/r011";
for (const p of source(filler + "/export-audit.json").profiles)
  expected.set(filler + "/" + p.floorId + ".glb", p.glbSha256);
const floorPath =
  "assets/art-library/designs/shipyard.floor.mapped-deck-kit/revisions/r002/glb.glb";
expected.set(floorPath, floors.parts[0].native.sha256);
function place(
  path: string,
  originM: number[],
  yawRadians: number,
  role: string,
  prefix?: string,
) {
  const actual = sha(readFileSync(resolve(root, path)));
  if (actual !== expected.get(path))
    throw Error("Unknown or changed native pin: " + path);
  const url = relative(base, resolve(root, path));
  pins[url] = actual;
  return {
    path: url,
    originM,
    yawRadians,
    role,
    ...(prefix ? { prefix } : {}),
  };
}
type Input = {
  id: string;
  footprintM: number[][];
  floors: { id: string; originM: number[]; quarterTurns: number }[];
  partitions: Point[][];
};
const inputs: Input[] = union.fixtures.map((f) => ({
  ...f,
  partitions: f.internalReservationsM.map((polygon) => {
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    const a = Math.min(...xs),
      b = Math.max(...xs),
      c = Math.min(...ys),
      d = Math.max(...ys);
    if (b - a !== 0.25)
      throw Error("Fixture partition must have explicit 250mm centered width");
    return [
      [(a + b) * 16, c * 32],
      [(a + b) * 16, d * 32],
    ] as Point[];
  }),
}));
for (const arms of [3, 4])
  inputs.push({
    id: arms === 3 ? "centered-internal-t" : "centered-internal-cross",
    footprintM: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
    floors: [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ].map((originM) => ({ id: "square-2m", originM, quarterTurns: 0 })),
    partitions: [
      [
        [64, 64],
        [32, 64],
      ],
      [
        [64, 64],
        [96, 64],
      ],
      [
        [64, 64],
        [64, 96],
      ],
      ...(arms === 4
        ? [
            [
              [64, 64],
              [64, 32],
            ] as Point[],
          ]
        : []),
    ],
  });
const fixtures = [],
  documents = [];
for (const input of inputs) {
  const doc = emptyLayout("native-planner-" + input.id, "main");
  doc.name = "Compiler native fixture: " + input.id;
  doc.decks[0].ceiling = 102;
  doc.decks[0].roof = true;
  doc.tiles = input.floors.map((p, i) => {
    const part = floors.parts.find((f) => f.id === p.id)!;
    const tile = stampTile("tile-" + i, "main", "rectangle", [0, 0]);
    tile.vertices = part.footprint.map((v) => {
      const rotated = transformPoint(v as Point, p.quarterTurns);
      return [rotated[0] + p.originM[0] * 32, rotated[1] + p.originM[1] * 32];
    });
    return tile;
  });
  doc.partitions = input.partitions.map(([a, b], i) => ({
    id: "partition-" + i,
    deckId: "main",
    a,
    b,
    seal: "design-sealed",
  }));
  const xs = input.footprintM.map((v) => v[0]),
    ys = input.footprintM.map((v) => v[1]);
  const structure: LayoutStructureV2 = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "review",
      name: "Native review",
      revision: "1",
      width: (Math.max(...xs) - Math.min(...xs)) * 32,
      length: (Math.max(...ys) - Math.min(...ys)) * 32,
      height: 112,
      origin: [Math.min(...xs) * 32, Math.min(...ys) * 32, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    boundaryTreatments: doc.partitions.map((p) => ({
      id: "side-" + p.id,
      deckId: p.deckId,
      source: "partition",
      sourceAnchorId: p.id,
      a: p.a,
      b: p.b,
      treatment: "auto",
      reservationSide: "center",
    })),
  };
  doc.structure = structure;
  readLayout(doc);
  const compiled = compileLayout(doc);
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw Error(JSON.stringify({ fixture: input.id, errors }));
  documents.push({
    id: input.id,
    document: doc,
    compilerFingerprint: compiled.fingerprint,
  });
  const placements: Record<string, ReturnType<typeof place>[]> = {};
  for (const quarter of [1, 2, 3, 4]) {
    // Change authored treatment heights, then compile again; never fabricate resolved walls.
    const authored = structuredClone(doc);
    if (authored.structure?.schema !== "sidereal.layout-structure.v2")
      throw Error("Missing v2");
    authored.structure.boundaryTreatments.push(
      ...compiled.walls
        .filter((w) => w.source === "perimeter")
        .map((w, i) => ({
          id: "height-" + i,
          deckId: w.deckId,
          source: w.source,
          sourceAnchorId: w.anchorId,
          a: w.a,
          b: w.b,
          treatment: "auto" as const,
          heightUnits: quarter * 24,
        })),
    );
    authored.structure.boundaryTreatments.forEach((t) => {
      t.heightUnits = quarter * 24;
    });
    const resolved = compileLayout(authored);
    readLayout(authored);
    const heightErrors = resolved.diagnostics.filter(
      (d) => d.severity === "error",
    );
    if (heightErrors.length)
      throw Error(JSON.stringify({ fixture: input.id, quarter, heightErrors }));
    const plan = planInsetNativeBoundary({
      walls: resolved.walls,
      deckId: "main",
      elevationUnits: 0,
      floorThicknessUnits: 6,
      floorPolygons: authored.tiles.map((t) => t.vertices),
    });
    if (plan.issues.length)
      throw Error(
        JSON.stringify({ fixture: input.id, quarter, issues: plan.issues }),
      );
    const pieces = input.floors.flatMap((p) => {
      const part = floors.parts.find((f) => f.id === p.id)!;
      return [
        place(
          floorPath,
          [...p.originM, 0],
          (p.quarterTurns * Math.PI) / 2,
          "floor",
          part.native.nodePrefix,
        ),
        place(
          filler + "/" + p.id + ".glb",
          [...p.originM, 0],
          (p.quarterTurns * Math.PI) / 2,
          "floor",
        ),
        place(
          "assets/art-library/designs/shipyard.structure.roof125/revisions/r000/" +
            p.id +
            ".glb",
          [...p.originM, 3.1875],
          (p.quarterTurns * Math.PI) / 2,
          "roof",
        ),
      ];
    });
    for (const p of plan.placements) {
      const folder = "assets/art-library/designs/" + families[p.family];
      pieces.push(
        place(
          folder +
            (p.family === "convex-r004" ? "/profiles/" : "/") +
            p.profileId +
            "-q" +
            p.quarterHeight +
            ".glb",
          p.originUnits.map((v) => v / 32),
          (p.quarterTurns * Math.PI) / 2,
          "wall",
        ),
      );
    }
    placements[String(quarter)] = pieces;
  }
  fixtures.push({
    id: "compiled-" + input.id,
    footprintUnits: input.footprintM.map((p) => p.map((v) => v * 32)),
    supportedHeights: [1, 2, 3, 4],
    placements,
    notes:
      "Actual v2 semantic document → boundary compiler → bounded orthogonal native planner. Exact delivered Blender profiles; no scaling. Native floor contact fillers included. Art unapproved; pressure, collision, traversal and game installation remain unqualified.",
  });
}
for (const path of [
  "scripts/generate_inset_planner_review.ts",
  "packages/sim/src/layout-inset-native-plan.ts",
  "packages/sim/src/layout-compiler.ts",
  "packages/sim/src/layout-boundary-treatments.ts",
  "packages/content/src/ship-tileset-corner-spec.v1.json",
  "packages/content/src/ship-tileset-internal-spec.v1.json",
  "packages/content/src/ship-tileset-union-junction-spec.v1.json",
  "packages/content/src/construction-floor-interfaces.json",
])
  sourcePins[path] = sha(readFileSync(path));
mkdirSync(base, { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      schema: "sidereal.inset-planner-native-review.v1",
      fixtures,
      documents,
      pins,
      sourcePins,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    output,
    fixtures: fixtures.length,
    combinations: fixtures.length * 4,
    sha256: sha(readFileSync(output)),
  }),
);
