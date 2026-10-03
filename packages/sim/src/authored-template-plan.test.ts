import { describe, expect, it } from "vitest";
import { EDITABLE_PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  G,
  SHAPE_TILE_IDS,
  placedTilePolygon,
  shapeTileLocalPolygon,
  type Pt,
  type ShapeTilePlacement,
} from "@sidereal/content/construction-grammar";
import { bowHeights } from "@sidereal/content/bow-profiles";
import {
  canonicalShipPrefabJson,
  deriveInterior,
  prefabStats,
  volumeGeometry,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabLayout } from "./prefab-construction";
import { prefabDeckObstacles, prefabShipObjects } from "./prefab-deck-objects";
import { prefabBedSeats } from "./prefab-seats";
import { compilePrefabFlight } from "./prefab-handling";
import {
  authoredTemplateTileMatrix,
  compileAuthoredTemplatePlan,
  type AuthoredTemplateInstance,
  type AuthoredTemplateMatrix,
} from "./authored-template-plan";

const catalog = defaultPrefabComponentCatalog();
const transform = (m: AuthoredTemplateMatrix, p: Pt): Pt => [
  m[0][0] * p[0] + m[0][1] * p[1] + m[0][3],
  m[1][0] * p[0] + m[1][1] * p[1] + m[1][3],
];
const canonicalPoints = (p: readonly Pt[]) =>
  p.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort();
const signature = (doc: ShipPrefabDocumentV1) => ({
  document: canonicalShipPrefabJson(doc),
  interior: deriveInterior(doc, 0, catalog),
  layout: prefabLayout(doc, catalog),
  obstacles: prefabDeckObstacles(doc, catalog),
  objects: prefabShipObjects(doc, catalog),
  seats: prefabBedSeats(doc, catalog),
  hardware: compilePrefabFlight(doc, catalog),
  stats: prefabStats(doc, catalog),
});
function simple(
  tiles: ShapeTilePlacement[],
  extra: ShipPrefabDocumentV1["volumes"] = [],
): ShipPrefabDocumentV1 {
  const doc = structuredClone(prefabById("fed.s.wren")!);
  doc.rooms = [];
  doc.edges = [];
  doc.mounts = [];
  doc.mountTiles = [];
  doc.skylights = [];
  doc.fixtures = [];
  doc.logic = undefined;
  doc.volumes = [
    { id: "hull", kind: "hull", height: "deck", deck: 0, tiles },
    ...extra,
  ];
  return doc;
}
const sourcePoint = (
  row: AuthoredTemplateInstance,
  x: number,
  y: number,
  z = 0,
) => {
  const m = row.matrix;
  return [
    m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
    m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
    m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
  ];
};
const kept = (row: AuthoredTemplateInstance, p: readonly number[]) =>
  (row.clipPlanes ?? []).every(
    ([nx, ny, nz, d]) => nx * p[0] + ny * p[1] + nz * p[2] + d >= -1e-7,
  );

describe("authored template presentation", () => {
  for (const prefab of EDITABLE_PREFAB_SHIPS)
    it(`${prefab.id} preserves navigation, collision, stations, seats, inventory identities and hardware`, () => {
      const before = signature(prefab),
        plan = compileAuthoredTemplatePlan(prefab, { catalog });
      expect(signature(prefab)).toEqual(before);
      expect(plan.interiors[0]).toEqual(before.interior);
      expect(plan).toEqual(compileAuthoredTemplatePlan(prefab, { catalog }));
      expect(plan.instances.length).toBeGreaterThan(30);
      expect(new Set(plan.instances.map((i) => i.object)).size).toBe(
        plan.instances.length,
      );
      for (const row of plan.instances) {
        expect(row.matrix.flat().every(Number.isFinite)).toBe(true);
        expect(row.clipPlanes?.flat().every(Number.isFinite) ?? true).toBe(
          true,
        );
        expect(row.piece).toMatch(/^(floor|roof|hull|wall|post|canopy)\./);
      }
      expect(
        plan.instances.some((i) => i.role === "roof" && i.view === "flight"),
      ).toBe(true);
      expect(
        plan.instances.some((i) => i.role === "floor" && i.view === "deck"),
      ).toBe(true);
      expect(
        plan.retainedLegacyPieces.every(
          (id) =>
            id.startsWith("canopy.") ||
            id.startsWith("int.door.") ||
            id.startsWith("mount.") ||
            id.startsWith("roof.skylight.") ||
            id.startsWith("bow.") ||
            id === "exterior.airlock",
        ),
      ).toBe(true);
    });

  for (const shape of SHAPE_TILE_IDS)
    for (const rot of [0, 1, 2, 3] as const)
      for (const reflected of [false, true])
        it(`${shape} rotation ${rot} reflection ${reflected} uses exact grammar placement`, () => {
          const tile = { x: 3, y: -4, shape, rot, reflected };
          expect(
            canonicalPoints(
              shapeTileLocalPolygon(shape).map((p) =>
                transform(authoredTemplateTileMatrix(tile), p),
              ),
            ),
          ).toEqual(canonicalPoints(placedTilePolygon(tile)));
          const plan = compileAuthoredTemplatePlan(simple([tile]), { catalog });
          expect(
            plan.instances.some((i) => i.piece === `floor.${shape}.plate`),
          ).toBe(true);
          expect(
            plan.instances.some((i) => i.piece === `roof.${shape}.plate`),
          ).toBe(true);
          if (G.shapeTiles[shape].kind === "arc")
            expect(
              plan.instances.filter((i) =>
                i.piece.startsWith(`hull.${shape}.`),
              ),
            ).toHaveLength(1);
          const vg = volumeGeometry(simple([tile]).volumes[0]);
          const roof = plan.instances.filter((i) => i.role === "roof");
          for (const i of roof) expect(i.matrix[2][3]).toBe(vg.z[1] / 16);
        });

  it("keeps both complementary triangles in a cell rather than claiming the whole cell", () => {
    const tiles: ShapeTilePlacement[] = [
      { x: 0, y: 0, shape: "slope1", rot: 0, reflected: false },
      { x: 0, y: 0, shape: "slope1", rot: 2, reflected: false },
    ];
    const plan = compileAuthoredTemplatePlan(simple(tiles), { catalog });
    expect(plan.instances.filter((i) => i.role === "roof")).toHaveLength(2);
    expect(
      plan.instances.filter(
        (i) => i.role === "hull" && i.piece.startsWith("floor."),
      ),
    ).toHaveLength(2);
  });

  it("hides only the height band covered by an adjoining low wing", () => {
    const square: ShapeTilePlacement = {
      x: 0,
      y: 0,
      shape: "square",
      rot: 0,
      reflected: false,
    };
    const plan = compileAuthoredTemplatePlan(
      simple(
        [square],
        [
          {
            id: "wing",
            kind: "plate",
            height: "wing",
            deck: 0,
            tiles: [{ ...square, y: 1 }],
          },
        ],
      ),
      { catalog },
    );
    const sharedHull = plan.instances.filter(
      (row) =>
        row.object.startsWith("hull:edge") &&
        row.piece.startsWith("hull.straight.") &&
        Math.abs(row.matrix[1][3] - 1) < 1e-6 &&
        Math.abs(row.matrix[1][0]) < 1e-6,
    );
    const bands = sharedHull.map((row) => [
      row.matrix[2][3],
      row.matrix[2][3] + row.matrix[2][2],
    ]);
    expect(bands).toEqual([
      [0, 10 / 16],
      [28 / 16, 43 / 16],
    ]);
    const buriedWing = plan.instances.filter(
      (row) =>
        row.object.startsWith("wing:edge") &&
        row.piece.startsWith("hull.straight.") &&
        Math.abs(row.matrix[1][3] - 1) < 1e-6 &&
        Math.abs(row.matrix[1][0]) < 1e-6,
    );
    expect(buriedWing).toEqual([]);
  });

  it("subtracts overlapping coplanar volume surfaces without discarding uncovered regions", () => {
    const square: ShapeTilePlacement = {
        x: 0,
        y: 0,
        shape: "square",
        rot: 0,
        reflected: false,
      },
      slope: ShapeTilePlacement = { ...square, shape: "slope1" };
    const plan = compileAuthoredTemplatePlan(
      simple(
        [slope],
        [
          {
            id: "overlap",
            kind: "hull",
            height: "deck",
            deck: 0,
            tiles: [square],
          },
        ],
      ),
      { catalog },
    );
    const roofs = plan.instances.filter((i) => i.role === "roof");
    expect(roofs.some((i) => i.object.includes(":fragment"))).toBe(true);
    for (const p of [
      [0.2, 0.2],
      [0.8, 0.8],
      [0.1, 0.7],
    ] as Pt[])
      expect(
        roofs.filter(
          (i) =>
            kept(i, [...p, 43 / 16]) &&
            (i.piece.includes("square") || p[0] + p[1] < 1),
        ).length,
      ).toBe(1);
  });

  it("uses the Wren's lowered authored roof and keel profiles", () => {
    const doc = structuredClone(prefabById("fed.s.wren")!),
      plan = compileAuthoredTemplatePlan(doc, { catalog });
    const t = doc.volumes[0].tiles.find((t) => t.bow?.step === 3)!;
    const index = doc.volumes[0].tiles.indexOf(t);
    const rows = plan.instances.filter(
      (i) => i.object.startsWith(`hull:tile${index}:`) && i.role === "roof",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      for (const p of shapeTileLocalPolygon(t.shape)) {
        const world = transform(row.matrix, p),
          point = sourcePoint(row, p[0], p[1]);
        expect(point[2]).toBeCloseTo(bowHeights(t, "deck", world)[1] / 16, 8);
      }
    expect(
      plan.retainedLegacyPieces.some((i) => i === "bow.square.deck.s2.a0.roof"),
    ).toBe(true);
    expect(plan.instances.filter((i) => i.verticalProfile)).not.toHaveLength(0);
  });

  it("omits opaque facade intervals behind exterior doors and canopy glass", () => {
    const doc = structuredClone(prefabById("rj.s.jackal")!),
      plan = compileAuthoredTemplatePlan(doc, { catalog });
    const doors = deriveInterior(doc, 0, catalog).doors.filter(
      (d) => d.exterior,
    );
    for (const d of doors) {
      const x = (d.a[0] + d.b[0]) / 2,
        y = (d.a[1] + d.b[1]) / 2;
      expect(
        plan.instances.filter(
          (i) =>
            i.piece.startsWith("hull.straight.") &&
            Math.abs(i.matrix[0][3] - x) < 1e-6 &&
            Math.abs(i.matrix[1][3] - y) < 1e-6,
        ),
      ).toEqual([]);
    }
    const lumen = compileAuthoredTemplatePlan(prefabById("au.s.lumen")!, {
      catalog,
    });
    expect(
      lumen.retainedLegacyPieces.some((p) => p.startsWith("canopy.arc3.")),
    ).toBe(true);
    expect(lumen.instances.some((i) => i.piece.startsWith("hull.arc3."))).toBe(
      false,
    );
  });

  it("caps hardware roof cells while preserving real skylight openings", () => {
    const plan = compileAuthoredTemplatePlan(prefabById("fed.m.crest")!, {
      catalog,
    });
    expect(
      plan.instances.some(
        (i) => i.role === "roof" && i.piece.startsWith("floor."),
      ),
    ).toBe(true);
    const s = prefabById("fed.m.crest")!.skylights[0],
      point = [s.at[0] + 0.5, s.at[1] + 0.5, 43 / 16];
    expect(
      plan.instances.filter(
        (i) =>
          i.role === "roof" && i.object.startsWith("hull:") && kept(i, point),
      ),
    ).toEqual([]);
    expect(
      plan.retainedLegacyPieces.some((i) => i.startsWith("roof.skylight.")),
    ).toBe(true);
  });

  it("rejects the exact live Wayfarer profile rather than recompiling its pinned assembly", () => {
    expect(() =>
      compileAuthoredTemplatePlan(prefabById("fed.m.wayfarer")!, { catalog }),
    ).toThrow("own presentation");
  });
});
