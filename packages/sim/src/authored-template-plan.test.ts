import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  readAuthoredTemplateKit,
  AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
} from "@sidereal/content/authored-template-kit";
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

  it("retains the native top caps at every constant deck facade cut", () => {
    let checked = 0;
    for (const doc of EDITABLE_PREFAB_SHIPS) {
      const plan = compileAuthoredTemplatePlan(doc, { catalog });
      for (const row of plan.instances.filter(
        (r) =>
          r.view === "deck" &&
          !r.verticalProfile &&
          (r.piece.startsWith("hull.") || r.object.includes(":corner")),
      )) {
        const full = plan.instances.find(
          (r) => r.object === row.object.replace(/:deck$/, ":flight"),
        )!;
        expect(full).toBeDefined();
        const volume = doc.volumes.find((v) => v.id === row.region)!;
        const top = Math.min(
          full.matrix[2][3] + full.matrix[2][2],
          (G.deck.shellCutTexels + volume.deck * G.deck.pitchTexels) / 16,
        );
        expect(sourcePoint(row, 0, 0, 1)[2]).toBeCloseTo(top, 9);
        expect((row.clipPlanes ?? []).every((p) => p[2] === 0)).toBe(true);
        if (row.piece.startsWith("hull.straight.")) {
          // Independently clip the native closed core's top cap. Corner overrun
          // can move the surviving cap away from the source span's midpoint.
          let cap = [
            [0, -0.2],
            [1, -0.2],
            [1, 0],
            [0, 0],
          ].map(([x, y]) => sourcePoint(row, x, y, 1));
          for (const [nx, ny, nz, d] of row.clipPlanes ?? []) {
            const result: number[][] = [];
            for (let i = 0; i < cap.length; i++) {
              const a = cap[i],
                b = cap[(i + 1) % cap.length],
                da = nx * a[0] + ny * a[1] + nz * a[2] + d,
                db = nx * b[0] + ny * b[1] + nz * b[2] + d;
              if (da >= -1e-9) result.push(a);
              if (da >= -1e-9 !== db >= -1e-9) {
                const t = da / (da - db);
                result.push(a.map((n, j) => n + t * (b[j] - n)));
              }
            }
            cap = result;
          }
          const area = Math.abs(
            cap.reduce((sum, a, i) => {
              const b = cap[(i + 1) % cap.length];
              return sum + a[0] * b[1] - a[1] * b[0];
            }, 0) / 2,
          );
          expect(area).toBeGreaterThan(1e-9);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  for (const shape of ["square", "slope1", "slope4"] as const)
    it(`closes ${shape} facade miters through the full authored outward band`, () => {
      const doc = simple([{ x: 0, y: 0, shape, rot: 0, reflected: false }]),
        plan = compileAuthoredTemplatePlan(doc, { catalog }),
        loop = volumeGeometry(doc.volumes[0]).outline!.outer;
      const inSource = (r: AuthoredTemplateInstance, p: Pt, post: boolean) => {
        const m = r.matrix,
          dx = p[0] - m[0][3],
          dy = p[1] - m[1][3],
          det = m[0][0] * m[1][1] - m[0][1] * m[1][0],
          x = (dx * m[1][1] - dy * m[0][1]) / det,
          y = (dy * m[0][0] - dx * m[1][0]) / det;
        return post
          ? Math.abs(x) <= 0.125 + 1e-6 && Math.abs(y) <= 0.125 + 1e-6
          : x >= -1e-6 &&
              x <= 1 + 1e-6 &&
              y >= -0.25 - 1e-6 &&
              y <= 0.431 + 1e-6;
      };
      for (let i = 0; i < loop.length; i++) {
        const prev = loop[(i - 1 + loop.length) % loop.length],
          p = loop[i],
          next = loop[(i + 1) % loop.length],
          a = [p[0] - prev[0], p[1] - prev[1]],
          b = [next[0] - p[0], next[1] - p[1]];
        const al = Math.hypot(...a),
          bl = Math.hypot(...b);
        a[0] /= al;
        a[1] /= al;
        b[0] /= bl;
        b[1] /= bl;
        const cosine = Math.sqrt((1 + a[0] * b[0] + a[1] * b[1]) / 2);
        if (cosine > 1 - 1e-6) continue;
        const n = [(a[0] + b[0]) / (2 * cosine), (a[1] + b[1]) / (2 * cosine)],
          trim = plan.instances.find((r) => r.object === `hull:corner${i}:0`)!;
        expect(trim).toBeDefined();
        expect(trim.clipPlanes ?? []).toEqual([]);
        for (const depth of [-0.249, 0, 0.43]) {
          const seam: Pt = [
            p[0] + (n[1] * depth) / cosine,
            p[1] - (n[0] * depth) / cosine,
          ];
          expect(inSource(trim, seam, true)).toBe(true);
          const candidates = plan.instances.filter(
            (r) =>
              r.piece.startsWith("hull.straight.") &&
              inSource(r, seam, false) &&
              kept(r, [...seam, 1]),
          );
          // Both adjoining native bands reach the shared miter; the closed post covers its cut.
          expect(candidates.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

  it("adds concave seam caps without repeating columns along smooth native arcs", () => {
    const square = { shape: "square", rot: 0, reflected: false } as const;
    const doc = simple([
        { ...square, x: 0, y: 0 },
        { ...square, x: 1, y: 0 },
        { ...square, x: 0, y: 1 },
      ]),
      plan = compileAuthoredTemplatePlan(doc, { catalog });
    expect(
      plan.instances.filter((r) => r.object.includes(":corner")),
    ).toHaveLength(6);
    const arc = compileAuthoredTemplatePlan(
      simple([{ x: 0, y: 0, shape: "arc4", rot: 0, reflected: false }]),
      { catalog },
    );
    expect(
      arc.instances.filter((r) => r.object.includes(":corner")),
    ).toHaveLength(3);
    expect(
      arc.instances.filter((r) => r.piece.startsWith("hull.arc4.")),
    ).toHaveLength(1);
  });

  it("keeps hole-boundary seams and facades uniquely identified", () => {
    const tiles: ShapeTilePlacement[] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        if (x !== 1 || y !== 1)
          tiles.push({ x, y, shape: "square", rot: 0, reflected: false });
    const doc = simple(tiles),
      plan = compileAuthoredTemplatePlan(doc, { catalog });
    expect(volumeGeometry(doc.volumes[0]).outline!.holes).toHaveLength(1);
    expect(new Set(plan.instances.map((r) => r.object)).size).toBe(
      plan.instances.length,
    );
    expect(
      plan.instances.filter(
        (r) => r.object.includes(":corner") && r.object.includes(":loop1"),
      ),
    ).toHaveLength(4);
  });

  it("partitions the Wren bow at the deck cut while retaining both native cap profiles", () => {
    const doc = prefabById("fed.s.wren")!,
      plan = compileAuthoredTemplatePlan(doc, { catalog });
    let originalCaps = 0,
      cutCaps = 0;
    const capPoint = (r: AuthoredTemplateInstance, x: number, y: number) => {
      const p = sourcePoint(r, x, y, 1),
        h = r.verticalProfile!.top;
      p[2] = h[0] * p[0] + h[1] * p[1] + h[2];
      return p;
    };
    for (const flight of plan.instances.filter(
      (r) =>
        r.view === "flight" &&
        r.verticalProfile &&
        r.piece.startsWith("hull.straight."),
    )) {
      const prefix = flight.object.replace(/:flight$/, ":deck"),
        rows = plan.instances.filter((r) => r.object.startsWith(prefix)),
        volume = doc.volumes.find((v) => v.id === flight.region)!,
        cut = (G.deck.shellCutTexels + volume.deck * G.deck.pitchTexels) / 16;
      expect(rows).not.toHaveLength(0);
      for (const row of rows)
        expect((row.clipPlanes ?? []).every((p) => p[2] >= 0)).toBe(true);
      for (let i = 0; i <= 20; i++) {
        const x = i / 20,
          original = capPoint(flight, x, -0.1);
        if (!kept(flight, original)) continue;
        const matching = rows.filter((r) => kept(r, capPoint(r, x, -0.1)));
        expect(matching.length).toBeGreaterThanOrEqual(1);
        for (const row of matching) {
          expect(capPoint(row, x, -0.1)[2]).toBeCloseTo(
            Math.min(original[2], cut),
            8,
          );
          if (row.object.endsWith(":below")) originalCaps++;
          if (row.object.endsWith(":above")) cutCaps++;
        }
      }
    }
    expect(originalCaps).toBeGreaterThan(0);
    expect(cutCaps).toBeGreaterThan(0);
  });

  for (const shape of ["square", "arc3"] as const)
    it(`assigns coincident ${shape} facades and corner seams to one volume`, () => {
      const tile = { x: 0, y: 0, shape, rot: 0, reflected: false } as const;
      const doc = simple(
          [tile],
          [
            {
              id: "duplicate",
              kind: "hull",
              height: "deck",
              deck: 0,
              tiles: [tile],
            },
          ],
        ),
        before = signature(doc),
        plan = compileAuthoredTemplatePlan(doc, { catalog });
      expect(
        plan.instances.filter(
          (r) =>
            r.object.startsWith("duplicate:") &&
            (r.piece.startsWith("hull.") || r.object.includes(":corner")),
        ),
      ).toEqual([]);
      expect(signature(doc)).toEqual(before);
      expect(plan).toEqual(compileAuthoredTemplatePlan(doc, { catalog }));
    });

  it("keeps the uncovered lower and upper facade bands around a coincident low owner", () => {
    const tile = {
      x: 0,
      y: 0,
      shape: "square",
      rot: 0,
      reflected: false,
    } as const;
    const doc = simple(
      [tile],
      [{ id: "tall", kind: "hull", height: "deck", deck: 0, tiles: [tile] }],
    );
    doc.volumes[0].height = "wing";
    doc.volumes[0].kind = "plate";
    const plan = compileAuthoredTemplatePlan(doc, { catalog });
    const bands = plan.instances
      .filter((r) => r.object.startsWith("tall:edge0:"))
      .map((r) => [r.matrix[2][3], r.matrix[2][3] + r.matrix[2][2]]);
    expect(bands).toEqual([
      [0, 10 / 16],
      [28 / 16, 43 / 16],
    ]);
    expect(
      plan.instances
        .filter((r) => r.object.startsWith("tall:corner0:"))
        .map((r) => [r.matrix[2][3], r.matrix[2][3] + r.matrix[2][2]]),
    ).toEqual(bands);
  });

  it("uses predominantly light roof fields with sparse native service modules", () => {
    const all = EDITABLE_PREFAB_SHIPS.flatMap(
        (doc) => compileAuthoredTemplatePlan(doc, { catalog }).instances,
      ),
      roofs = all.filter(
        (r) => r.role === "roof" && r.piece.startsWith("roof."),
      ),
      light = roofs.filter((r) => r.piece.endsWith(".light")),
      raised = roofs.filter((r) =>
        /^roof\.square\.(vent|hatch|fan|box)$/.test(r.piece),
      );
    expect(light.length).toBeGreaterThan(roofs.length * 0.6);
    expect(raised.length).toBeGreaterThan(0);
    expect(raised.length).toBeLessThan(roofs.length * 0.1);
    expect(roofs.some((r) => r.piece.endsWith(".accent"))).toBe(true);
    for (const r of raised) expect(r.verticalProfile).toBeUndefined();
  });

  it("resolves every default template placement to the pinned native source pack", () => {
    const bytes = readFileSync(
        new URL(
          "../../../assets/runtime/ship-study/template-authored-r001/manifest.json",
          import.meta.url,
        ),
      ),
      kit = readAuthoredTemplateKit(JSON.parse(bytes.toString("utf8"))),
      ids = new Set(kit.pieces.map((p) => p.id));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
    );
    for (const doc of EDITABLE_PREFAB_SHIPS)
      for (const row of compileAuthoredTemplatePlan(doc, { catalog }).instances)
        expect(
          ids.has(row.piece),
          `${doc.id}: ${row.object} -> ${row.piece}`,
        ).toBe(true);
  });
});
