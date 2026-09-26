import { describe, expect, it } from "vitest";
import {
  SHAPE_TILE_IDS,
  axisFaces,
  cassetteHeights,
  fullCells,
  hash01,
  outlineArea,
  placedTilePolygon,
  placedTileSize,
  signedArea,
  tileOverlaps,
  unionTiles,
  volumeTiers,
  type QuarterTurn,
  type ShapeTilePlacement,
} from "./construction-grammar";

const sq = (x: number, y: number): ShapeTilePlacement => ({ x, y, shape: "square", rot: 0, reflected: false });
const rect = (x0: number, y0: number, x1: number, y1: number) => {
  const out: ShapeTilePlacement[] = [];
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) out.push(sq(x, y));
  return out;
};

describe("construction grammar shape tiles", () => {
  it("every tile, rotation and mirror stays inside its placed bounding box and keeps its area", () => {
    for (const shape of SHAPE_TILE_IDS)
      for (const rot of [0, 1, 2, 3] as QuarterTurn[])
        for (const reflected of [false, true]) {
          const t = { x: 5, y: -3, shape, rot, reflected };
          const poly = placedTilePolygon(t);
          const [w, h] = placedTileSize(t);
          expect(signedArea(poly)).toBeGreaterThan(0);
          for (const [x, y] of poly) {
            expect(x).toBeGreaterThanOrEqual(5 - 1e-9);
            expect(x).toBeLessThanOrEqual(5 + w + 1e-9);
            expect(y).toBeGreaterThanOrEqual(-3 - 1e-9);
            expect(y).toBeLessThanOrEqual(-3 + h + 1e-9);
          }
          const base = signedArea(placedTilePolygon({ ...t, rot: 0, reflected: false }));
          expect(signedArea(poly)).toBeCloseTo(base, 9);
        }
  });

  it("a slope and its 180-degree complement fill the rectangle exactly", () => {
    for (const shape of ["slope1", "slope2", "slope3", "slope4"] as const) {
      const a = { x: 0, y: 0, shape, rot: 0 as QuarterTurn, reflected: false };
      const b = { ...a, rot: 2 as QuarterTurn };
      const u = unionTiles([a, b]);
      expect(u.outers).toHaveLength(1);
      expect(u.holes).toHaveLength(0);
      expect(u.outers[0]).toHaveLength(4);
      expect(tileOverlaps([a, b])).toEqual([]);
    }
  });

  it("convex and concave arcs of one radius tile the square", () => {
    const a = { x: 0, y: 0, shape: "arc3" as const, rot: 0 as QuarterTurn, reflected: false };
    const c = { x: 0, y: 0, shape: "arc3c" as const, rot: 0 as QuarterTurn, reflected: false };
    const u = unionTiles([a, c]);
    expect(u.outers).toHaveLength(1);
    expect(u.outers[0]).toEqual([[0, 0], [3, 0], [3, 3], [0, 3]]);
    expect(tileOverlaps([a, c])).toEqual([]);
  });

  it("unions a rectangle into one simplified loop and detects holes and overlaps", () => {
    const u = unionTiles(rect(0, 0, 6, 4));
    expect(u.outers).toEqual([[[0, 0], [6, 0], [6, 4], [0, 4]]]);
    const ring = rect(0, 0, 5, 5).filter((t) => !(t.x === 2 && t.y === 2));
    const r = unionTiles(ring);
    expect(r.outers).toHaveLength(1);
    expect(r.holes).toHaveLength(1);
    expect(outlineArea({ outer: r.outers[0], holes: r.holes })).toBeCloseTo(24);
    expect(tileOverlaps([sq(0, 0), sq(0, 0)])).toEqual([[0, 1]]);
    expect(tileOverlaps([sq(0, 0), { x: 0, y: 0, shape: "slope1", rot: 1, reflected: false }])).toEqual([[0, 1]]);
  });

  it("keeps corner-touching islands separate", () => {
    const u = unionTiles([sq(0, 0), sq(1, 1)]);
    expect(u.outers).toHaveLength(2);
  });

  it("a sloped bow keeps one diagonal face per side and axis faces with outward normals", () => {
    const tiles = [
      ...rect(0, 0, 4, 2),
      { x: 4, y: 1, shape: "slope2" as const, rot: 0 as QuarterTurn, reflected: false },
      { x: 4, y: 0, shape: "slope2" as const, rot: 2 as QuarterTurn, reflected: true },
    ];
    const u = unionTiles(tiles);
    expect(u.outers).toEqual([[[0, 0], [4, 0], [6, 1], [4, 2], [0, 2]]]);
    const faces = axisFaces(u.outers[0]);
    expect(faces.find((f) => f.normal === "aft")?.length).toBe(2);
    expect(faces.find((f) => f.normal === "starboard")?.length).toBe(4);
    const cells = fullCells({ outer: u.outers[0], holes: [] });
    expect(cells).toHaveLength(8);
  });
});

describe("construction grammar tiers and hashing", () => {
  it("tiers the full deck like the prototype", () => {
    expect(volumeTiers(5, 54)).toEqual({ tiers: [[5, 29], [29, 49]], rim: [49, 54] });
    expect(volumeTiers(10, 28)).toEqual({ tiers: [[10, 24]], rim: [24, 28] });
    expect(volumeTiers(12, 20)).toEqual({ tiers: [[12, 20]], rim: null });
  });
  it("enumerates a bounded set of cassette heights", () => {
    const h = cassetteHeights();
    expect(h.cassettes.length).toBeLessThan(12);
    expect(h.cassettes).toContain(24);
    expect(h.rims).toEqual([4, 5]);
  });
  it("hash01 matches the Python prototype H", () => {
    // Values printed by the Python prototype's H().
    expect(hash01("corvette", 0, 1)).toBe(0.6542);
    expect(hash01("a")).toBe(0.28525);
    expect(hash01(-3)).toBe(0.71764);
    expect(hash01(2.7, "x")).toBe(0.32514);
  });
});
