import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EDITABLE_PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import { prefabComponentCatalogAt } from "@sidereal/content/ship-prefab-catalog";
import type { AuthoredStudyPiece } from "@sidereal/content/wayfarer-authored-study";
import { dressShip, type ComponentPlacement } from "@sidereal/sim/ship-dresser";
import { prefabFlightModel } from "@sidereal/sim/prefab-flight";
import {
  componentMatrix,
  mountRotation,
  multiply,
  transformPoint,
  det3,
  type Mat4,
} from "./frames";
import {
  authoredTemplatePropulsion,
  fittedPropulsionMatrix,
  TEMPLATE_MAIN_ENGINE_PIECE,
  TEMPLATE_RCS_PIECE,
} from "./authored-template-propulsion";

const catalog = prefabComponentCatalogAt(4),
  defs = new Map(buildShipComponentCatalog(4).components.map((c) => [c.id, c]));
const raw = JSON.parse(
  readFileSync(
    new URL(
      "../../../../assets/runtime/ship-study/wayfarer-authored-r001/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const source = raw.pieces.find(
  (p: { id: string }) => p.id === TEMPLATE_MAIN_ENGINE_PIECE,
);
const main: AuthoredStudyPiece = {
  id: source.id,
  file: source.file,
  sha256: source.sha256,
  triangles: source.triangles,
  frame: "piece-local",
  boundsMin: source.bounds_min,
  boundsMax: source.bounds_max,
  materials: source.materials,
};
const pieces = new Map([[main.id, main]]);
const matrix = (rows: readonly (readonly number[])[]): Mat4 =>
  Array.from({ length: 16 }, (_, i) => rows[i % 4][Math.floor(i / 4)]);
function boundsCorners(
  min: readonly number[],
  max: readonly number[],
): [number, number, number][] {
  return [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) =>
      [min[2], max[2]].map((z) => [x, y, z] as [number, number, number]),
    ),
  );
}
function expectedComponentMatrix(component: ComponentPlacement) {
  const def = defs.get(component.component)!;
  const socket =
    component.placement.mount.attach === "face"
      ? component.placement.rear
        ? "rear"
        : "face"
      : component.placement.mount.attach;
  return multiply(
    mountRotation(def.mount.frame, socket),
    componentMatrix(
      component.placement.anchor,
      component.placement.anchorZ / 16,
      component.placement.quarterTurns,
    ),
  );
}
function bounding(points: readonly (readonly number[])[]) {
  return [0, 1, 2].flatMap((i) => [
    Math.min(...points.map((p) => p[i])),
    Math.max(...points.map((p) => p[i])),
  ]);
}

describe("authored template propulsion", () => {
  for (const doc of EDITABLE_PREFAB_SHIPS)
    it(`${doc.id} uses native engines/RCS with unchanged envelopes, hardpoints and actuators`, () => {
      const dressed = dressShip(doc, { catalog }),
        before = JSON.stringify({
          dressed,
          flight: prefabFlightModel(doc, catalog),
        });
      const plan = authoredTemplatePropulsion(dressed, pieces, catalog);
      const propulsion = dressed.components.filter(
        (c) => defs.get(c.component)?.family === "propulsion",
      );
      expect(plan.replacedMounts).toEqual(
        new Set(propulsion.map((c) => c.mount)),
      );
      expect(plan.instances).toHaveLength(propulsion.length);
      expect(plan).toEqual(
        authoredTemplatePropulsion(dressed, pieces, catalog),
      );
      expect(
        JSON.stringify({ dressed, flight: prefabFlightModel(doc, catalog) }),
      ).toBe(before);
      for (const c of propulsion) {
        const row = plan.instances.find(
            (r) => r.object === `propulsion:${c.mount}`,
          )!,
          piece = row.piece === main.id ? main : TEMPLATE_RCS_PIECE;
        const def = defs.get(c.component)!,
          placement = expectedComponentMatrix(c);
        const actual = bounding(
          boundsCorners(piece.boundsMin, piece.boundsMax).map((p) =>
            transformPoint(matrix(row.matrix), p),
          ),
        );
        const expected = bounding(
          boundsCorners(...def.mount.envelopeM).map((p) =>
            transformPoint(placement, p),
          ),
        );
        actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
        expect(det3(matrix(row.matrix))).toBeGreaterThan(0);
        expect(row.view).toBe(c.view);
        expect(row.role).toBe("equipment");
      }
    });

  for (const turns of [0, 1, 2, 3])
    it(`keeps the main nozzle exit at the original aft extreme, yaw ${turns}`, () => {
      const c = structuredClone(
        dressShip(EDITABLE_PREFAB_SHIPS[0], { catalog }).components.find((c) =>
          c.component.startsWith("thrust-block."),
        )!,
      );
      c.placement.quarterTurns = turns as 0 | 1 | 2 | 3;
      c.placement.rear = true;
      c.placement.mount.attach = "face";
      const def = defs.get(c.component)!,
        m = matrix(fittedPropulsionMatrix(main, def, c));
      const sourceExit: [number, number, number] = [
        main.boundsMin[0],
        (main.boundsMin[1] + main.boundsMax[1]) / 2,
        (main.boundsMin[2] + main.boundsMax[2]) / 2,
      ];
      const expected = transformPoint(expectedComponentMatrix(c), [
        0,
        def.mount.envelopeM[0][1],
        0,
      ]);
      transformPoint(m, sourceExit).forEach((v, i) =>
        expect(v).toBeCloseTo(expected[i], 9),
      );
      const mountEnd = transformPoint(m, [
        main.boundsMax[0],
        sourceExit[1],
        sourceExit[2],
      ]);
      mountEnd.forEach((v, i) =>
        expect(v).toBeCloseTo(
          transformPoint(expectedComponentMatrix(c), [0, 0, 0])[i],
          9,
        ),
      );
    });

  it("fits legacy catalogue revisions without silently using the current envelope", () => {
    for (const revision of [1, 2, 3, 4] as const) {
      const cat = prefabComponentCatalogAt(revision),
        dressed = dressShip(EDITABLE_PREFAB_SHIPS[0], { catalog: cat });
      expect(
        authoredTemplatePropulsion(dressed, pieces, cat).instances.length,
      ).toBeGreaterThan(0);
    }
  });

  it("leaves composed/custom equipment on its dedicated art instead of guessing its dimensions", () => {
    const dressed = dressShip(EDITABLE_PREFAB_SHIPS[0], { catalog }),
      custom = { ...catalog, revision: catalog.revision + "+custom" };
    expect(authoredTemplatePropulsion(dressed, pieces, custom)).toEqual({
      pieces: [],
      instances: [],
      replacedMounts: new Set(),
    });
  });

  it("pins the native sources and verifies the RCS geometry, material families and embedded glow", () => {
    for (const piece of [main, TEMPLATE_RCS_PIECE]) {
      const buffer = readFileSync(
        new URL(
          "../../../../assets/runtime/ship-study/wayfarer-authored-r001/" +
            piece.file,
          import.meta.url,
        ),
      );
      expect(createHash("sha256").update(buffer).digest("hex")).toBe(
        piece.sha256,
      );
      const json = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      );
      const count = json.meshes
        .flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
        .reduce(
          (n: number, p: { indices: number }) =>
            n + json.accessors[p.indices].count / 3,
          0,
        );
      expect(count).toBe(piece.triangles);
      if (piece.id === TEMPLATE_RCS_PIECE.id) {
        expect(json.materials.map((m: { name: string }) => m.name)).toEqual([
          ...piece.materials,
        ]);
        expect(
          json.materials.every(
            (m: { extras: { sr_family: string } }) => !!m.extras.sr_family,
          ),
        ).toBe(true);
        expect(
          json.materials
            .find((m: { name: string }) => m.name === "rcs_lens")
            .emissiveFactor.some((v: number) => v > 0),
        ).toBe(true);
        const accessors = json.meshes
          .flatMap(
            (m: { primitives: { attributes: { POSITION: number } }[] }) =>
              m.primitives,
          )
          .map(
            (p: { attributes: { POSITION: number } }) =>
              json.accessors[p.attributes.POSITION],
          );
        const min = [0, 1, 2].map((i) =>
            Math.min(...accessors.map((a: { min: number[] }) => a.min[i])),
          ),
          max = [0, 1, 2].map((i) =>
            Math.max(...accessors.map((a: { max: number[] }) => a.max[i])),
          );
        expect([min[0], -max[2], min[1]]).toEqual([...piece.boundsMin]);
        expect([max[0], -min[2] + 0, max[1]]).toEqual([...piece.boundsMax]);
      }
    }
  });

  it("rejects invalid source envelopes before loading native geometry", () => {
    const c = dressShip(EDITABLE_PREFAB_SHIPS[0], { catalog }).components.find(
      (c) => c.component.startsWith("thrust-block."),
    )!;
    expect(() =>
      fittedPropulsionMatrix(
        { ...main, boundsMax: main.boundsMin },
        defs.get(c.component)!,
        c,
      ),
    ).toThrow("Invalid native propulsion envelope");
  });
});
