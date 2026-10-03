import { describe, expect, it } from "vitest";
import {
  fittedObjectMatrix,
  TEMPLATE_OBJECT_PIECES,
  authoredInteriorComponentPiece,
} from "./authored-template-objects";
import { DECK_OBJECT_DESIGNS } from "@sidereal/content/ship-furniture";
const piece = {
  boundsMin: [-0.3, -0.2, 0] as const,
  boundsMax: [0.4, 0.3, 0.7] as const,
};
const point = (m: number[][], p: number[]) =>
  m.slice(0, 3).map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + r[3]);
describe("template furnishing socket fit", () => {
  it("maps all room furniture, with dedicated reactor machinery retained", () => {
    expect(
      DECK_OBJECT_DESIGNS.filter((id) => !TEMPLATE_OBJECT_PIECES[id]),
    ).toEqual(["shipyard.equipment.reactor"]);
    expect(authoredInteriorComponentPiece("reactor.fission.sm")).toBeNull();
    expect(authoredInteriorComponentPiece("console.navigation.sm")).toBe(
      "prop.props_bridge.pilot_chair",
    );
  });
  it.each([0, 1, 2, 3])(
    "fits every turned asymmetric object inside its unchanged socket (%i)",
    (turns) => {
      const matrix = fittedObjectMatrix(
        piece,
        [5, 7],
        [0.5, 0.8],
        0.65,
        turns,
        0.1875,
      );
      const corners = [-0.3, 0.4].flatMap((x) =>
        [-0.2, 0.3].flatMap((y) =>
          [0, 0.7].map((z) => point(matrix, [x, y, z])),
        ),
      );
      for (const [x, y, z] of corners) {
        expect(Math.abs(x - 5)).toBeLessThanOrEqual(0.25 + 1e-9);
        expect(Math.abs(y - 7)).toBeLessThanOrEqual(0.4 + 1e-9);
        expect(z).toBeGreaterThanOrEqual(0.1875);
        expect(z).toBeLessThanOrEqual(0.8375 + 1e-9);
      }
    },
  );
  it("keeps the smaller native crate at source size in a larger reserved socket", () => {
    const m = fittedObjectMatrix(piece, [0, 0], [2, 2], 2, 0, 0.1875);
    const a = point(m, piece.boundsMin as unknown as number[]),
      b = point(m, piece.boundsMax as unknown as number[]);
    expect(Math.abs(b[0] - a[0])).toBeCloseTo(0.5);
    expect(Math.abs(b[1] - a[1])).toBeCloseTo(0.7);
    expect(Math.abs(b[2] - a[2])).toBeCloseTo(0.7);
  });
});
