import { describe, expect, it } from "vitest";
import {
  FEDERATION_FLEET,
  FEDERATION_FLEET_ACCESS,
  fleetAccessAuthorPoint,
  prefabById,
} from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import { WAYFARER_ACCESS_DOORS } from "@sidereal/content/wayfarer-access-profile";
import {
  prefabFormationBounds,
  formationBoundsAtHeading,
} from "./fleet-formation-bounds";
import { prefabShipObjects } from "./prefab-deck-objects";
import { compileAuthoredTemplatePlan } from "./authored-template-plan";
import { compilePrefabShipSystems } from "./prefab-ship-systems";
import { prefabEvaModel, evaSolidAt } from "./eva";
import templateSource from "../../../assets/runtime/ship-study/template-authored-r001/manifest.json";
import { readAuthoredTemplateKit } from "@sidereal/content/authored-template-kit";
const catalog = defaultPrefabComponentCatalog();
const contains = (
  bounds: ReturnType<typeof prefabFormationBounds>["author"],
  p: readonly number[],
) => {
  for (let i = 0; i < 3; i++) {
    expect(p[i]).toBeGreaterThanOrEqual(bounds.min[i] - 1e-9);
    expect(p[i]).toBeLessThanOrEqual(bounds.max[i] + 1e-9);
  }
};
describe("qualified actual-source formation geometry", () => {
  it("all four full-width cargo paths clear outboard nominal hulls and pinned native structure", () => {
    const pieces = new Map(
      readAuthoredTemplateKit(templateSource).pieces.map((p) => [p.id, p]),
    );
    for (const doc of FEDERATION_FLEET.filter((d) => d.sizeClass !== "S")) {
      const model = prefabEvaModel(doc, catalog);
      const door = model.entries.find((e) => e.id === "cargo-outer")!;
      expect(door.clearHalfM).toBe(1.875);
      const open = new Set([door.id]);
      // Cargo envelope spans the entire actual 3.75m opening, continuing 3m outside.
      for (let span = -1.875; span <= 1.875; span += 0.125)
        for (let depth = 0; depth <= 3; depth += 0.125)
          expect(
            evaSolidAt(
              model,
              [
                door.hatch[0] + door.along[0] * span + door.normal[0] * depth,
                door.hatch[1] + door.along[1] * span + door.normal[1] * depth,
              ],
              open,
            ),
            `${doc.id} span${span} outward${depth}`,
          ).toBe(false);
      const port = FEDERATION_FLEET_ACCESS[doc.id].find(
        (p) => p.id === "cargo",
      )!;
      const corners = [-1.875, 1.875].flatMap((span) =>
        [0, 3].map((depth) => fleetAccessAuthorPoint(port, span, depth)),
      );
      const laneMin = [
        Math.min(...corners.map((p) => p[0])),
        Math.min(...corners.map((p) => p[1])),
        0.2,
      ];
      const laneMax = [
        Math.max(...corners.map((p) => p[0])),
        Math.max(...corners.map((p) => p[1])),
        2.4375,
      ];
      for (const row of compileAuthoredTemplatePlan(doc, { catalog })
        .instances) {
        const piece = pieces.get(row.piece)!;
        const points = [piece.boundsMin[0], piece.boundsMax[0]].flatMap((x) =>
          [piece.boundsMin[1], piece.boundsMax[1]].flatMap((y) =>
            [piece.boundsMin[2], piece.boundsMax[2]].map((z) =>
              [0, 1, 2].map(
                (i) =>
                  row.matrix[i][0] * x +
                  row.matrix[i][1] * y +
                  row.matrix[i][2] * z +
                  row.matrix[i][3],
              ),
            ),
          ),
        );
        const min = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i])));
        const max = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])));
        // Unclipped source AABBs are conservative: even their reserved surfaces must clear.
        expect(
          [0, 1, 2].some(
            (i) => max[i] <= laneMin[i] + 1e-6 || min[i] >= laneMax[i] - 1e-6,
          ),
          `${doc.id} ${row.object} ${row.piece}`,
        ).toBe(true);
      }
    }
  });
  it("strictly contains all six recorded native Float32 flight envelopes", () => {
    // Actual Babylon r004 flightiso metrics, source bundle 7f4849803b1238d4...;
    // receipt SHA256 1282407f060261a710b03eba2cc03e3446d898afe93196e686eecea87263b2a8.
    // Ship XY/Z-up from Babylon X/up/-Y; no tolerance in these containment assertions.
    const measured = [
      [-5.5, -9.375, 5.5, 7.511000156402588, 4.375],
      [-7, -12.5, 7, 9.520999908447266, 3.5625],
      [-9, -19, 9, 15.020999908447266, 4.375],
      [-10, -16.5, 10, 13.520999908447266, 4.375],
      [-11, -22.5, 11, 18.520999908447266, 5.375],
      [-13, -25.5, 13, 21.520999908447266, 5.125],
    ];
    for (let i = 0; i < FEDERATION_FLEET.length; i++) {
      const b = prefabFormationBounds(FEDERATION_FLEET[i], catalog).ship;
      const [x0, y0, x1, y1, z1] = measured[i];
      const min = [x0, y0, -0.06300000101327896],
        max = [x1, y1, z1];
      for (let axis = 0; axis < 3; axis++) {
        expect(min[axis]).toBeGreaterThanOrEqual(b.min[axis]);
        expect(max[axis]).toBeLessThanOrEqual(b.max[axis]);
      }
    }
  });
  for (const doc of [
    ...FEDERATION_FLEET,
    prefabById("fed.s.wren")!,
    prefabById("fed.m.wayfarer")!,
  ])
    it(`${doc.id} encloses fitted objects and its full native outer door travel`, () => {
      const b = prefabFormationBounds(doc, catalog);
      expect(b.structuralSourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(
        [b.lengthM, b.beamM, b.heightM, b.radiusM].every(
          (n) => Number.isFinite(n) && n > 0,
        ),
      ).toBe(true);
      for (const object of prefabShipObjects(doc, catalog)) {
        contains(b.author, object.min);
        contains(b.author, object.max);
      }
      for (const port of FEDERATION_FLEET_ACCESS[doc.id] ?? []) {
        const v = WAYFARER_ACCESS_DOORS.variants.find(
          (v) => v.id === (port.id === "cargo" ? "cargo.4m" : "personnel"),
        )!;
        const sweep = (
          v as typeof v & { sweepBounds: { min: number[]; max: number[] } }
        ).sweepBounds;
        for (const x of [sweep.min[0], sweep.max[0]])
          for (const y of [sweep.min[1], sweep.max[1]]) {
            const p = fleetAccessAuthorPoint(port, x, y);
            for (const z of [sweep.min[2], sweep.max[2]])
              contains(b.author, [...p, z + 0.1875]);
          }
      }
      const [ox, oy] = prefabOrigin(doc);
      expect(b.ship.min).toEqual([
        -(b.author.max[1] - oy),
        b.author.min[0] - ox,
        b.author.min[2],
      ]);
      expect(b.ship.max).toEqual([
        -(b.author.min[1] - oy),
        b.author.max[0] - ox,
        b.author.max[2],
      ]);
      const rotated = formationBoundsAtHeading(b, Math.PI / 2);
      expect(rotated.min[0]).toBeCloseTo(-b.ship.max[1]);
      expect(rotated.max[1]).toBeCloseTo(b.ship.max[0]);
    });
  it("leaves positive clearance between every pair placed from their qualified edges", () => {
    const bounds = FEDERATION_FLEET.map((doc) =>
      prefabFormationBounds(doc, catalog),
    );
    let priorMax = -Infinity;
    let center = 0;
    for (const b of bounds) {
      center = Number.isFinite(priorMax)
        ? priorMax + 2 - b.ship.min[0]
        : -b.ship.min[0];
      expect(center + b.ship.min[0] - priorMax).toBeGreaterThanOrEqual(2);
      priorMax = center + b.ship.max[0];
    }
  });
  it("Petrel's concave waist uses finite native bevel posts, while roofs form larger panels", () => {
    const doc = FEDERATION_FLEET[1],
      plan = compileAuthoredTemplatePlan(doc, { catalog });
    for (const row of plan.instances.filter((r) => r.piece === "post.normal"))
      expect(Math.hypot(row.matrix[0][1], row.matrix[1][1])).toBeLessThan(5);
    for (const ship of [FEDERATION_FLEET[1], FEDERATION_FLEET[5]]) {
      const rows = compileAuthoredTemplatePlan(ship, {
        catalog,
      }).instances.filter(
        (r) => r.role === "roof" && r.piece.startsWith("roof.square"),
      );
      expect(
        rows.some(
          (r) => Math.abs(r.matrix[0][0]) >= 3 && Math.abs(r.matrix[1][1]) >= 2,
        ),
      ).toBe(true);
    }
  });
  it("all six real fitted power, thermal, fuel, data and ammunition budgets close", () => {
    for (const doc of FEDERATION_FLEET)
      expect(
        compilePrefabShipSystems(doc, "ship-components-v1@4").report.issues,
        doc.id,
      ).toEqual([]);
  });
});
