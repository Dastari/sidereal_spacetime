import { describe, expect, it } from "vitest";
import {
  emptyLayout,
  stampTile,
  transformPoint,
  type LayoutDocument,
  type Point,
} from "@sidereal/content/ship-layout";
import { compileLayout, fittingPolygon } from "@sidereal/sim/layout-compiler";
import { readLayout } from "@sidereal/sim/layout-validation";
import { wallEdgeSpan } from "./wall-edge-placement";

const errors = (doc: LayoutDocument) =>
  compileLayout(doc)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
const fitting = (): LayoutDocument["fittings"][number] => ({
  id: "f",
  deckId: "d",
  definitionId: "test",
  revision: "r1",
  position: [17, 19],
  footprint: [16, 8],
  quarterTurns: 0,
  reflected: false,
  clearance: 0,
  kind: "equipment",
  container: null,
});

describe("editor gestures retain shared layout admission", () => {
  it("matches compiler admission for diagonal interfaces through every rotation and reflection", () => {
    for (let turns = 0; turns < 4; turns++)
      for (const flip of [false, true]) {
        const transform = (p: Point) => transformPoint(p, turns, flip);
        const doc = emptyLayout("test", "d");
        doc.tiles = [
          {
            ...stampTile("a", "d", "triangle", [0, 0]),
            vertices: [
              [0, 0],
              [64, 0],
              [64, 64],
            ].map((p) => transform(p as Point)),
          },
          {
            ...stampTile("b", "d", "triangle", [0, 0]),
            vertices: [
              [0, 0],
              [64, 64],
              [0, 64],
            ].map((p) => transform(p as Point)),
          },
        ];
        const compiled = compileLayout(doc);
        expect(compiled.valid).toBe(true);
        for (const [a, b, accepted] of [
          [[0, 0], [64, 64], true],
          [[64, 64], [0, 0], true],
          [[0, 32], [64, 32], false],
          [[0, 0], [32, 32], false],
          [[0, 0], [64, 0], false],
        ] as [Point, Point, boolean][]) {
          const start = transform(a),
            end = transform(b);
          expect(wallEdgeSpan(compiled.edges, "d", start, end)).toBe(accepted);
          const changed = {
            ...doc,
            partitions: [
              {
                id: "p",
                deckId: "d",
                a: start,
                b: end,
                seal: "design-sealed" as const,
              },
            ],
          };
          expect(errors(changed).includes("partition-anchor")).toBe(!accepted);
        }
      }
  });
  it("keeps imported positions off the selected coarse grid and rotates the declared footprint around its explicit origin", () => {
    const doc = emptyLayout("test", "d");
    doc.tiles = [stampTile("floor", "d", "rectangle", [0, 0])];
    doc.fittings = [fitting()];
    const before = JSON.stringify(doc);
    expect(readLayout(structuredClone(doc)).fittings[0].position).toEqual([
      17, 19,
    ]);
    expect(compileLayout(doc).valid).toBe(true);
    expect(JSON.stringify(doc)).toBe(before);
    expect(fittingPolygon({ ...fitting(), quarterTurns: 1 })).toEqual([
      [17, 19],
      [17, 35],
      [9, 35],
      [9, 19],
    ]);
    expect(() =>
      readLayout({
        ...doc,
        fittings: [{ ...fitting(), position: [17.5, 19] }],
      }),
    ).toThrow();
    expect(() =>
      readLayout({ ...doc, fittings: [{ ...fitting(), quarterTurns: 0.5 }] }),
    ).toThrow();
  });
  it("rejects rotated equipment crossing a real partition even if its origin and all corners lie on supported floors", () => {
    const doc = emptyLayout("test", "d");
    doc.tiles = [
      stampTile("a", "d", "rectangle", [0, 0]),
      stampTile("b", "d", "rectangle", [64, 0]),
    ];
    doc.partitions = [
      { id: "p", deckId: "d", a: [64, 0], b: [64, 64], seal: "design-sealed" },
    ];
    doc.fittings = [{ ...fitting(), position: [68, 24], quarterTurns: 1 }];
    expect(errors(doc)).toContain("fitting-support");
  });
});
