import { describe, expect, it } from "vitest";
import {
  findCoplanarOverlaps,
  resolveCoplanarLayers,
  type CoplanarLayer,
} from "./coplanar";

/** Upward-facing (+Z) quad [x0, x1] x [y0, y1] at height z, as two counter-clockwise triangles. */
function quad(x0: number, y0: number, x1: number, y1: number, z: number) {
  return {
    positions: [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

function layer(
  q: ReturnType<typeof quad>,
  priority: number,
  material = `m${priority}`,
): CoplanarLayer {
  return {
    positions: [...q.positions],
    indices: [...q.indices],
    first: 0,
    count: q.indices.length,
    priority,
    material,
  };
}

const sources = (layers: CoplanarLayer[]) =>
  layers.map((l, i) => ({
    source: `layer${i}`,
    positions: l.positions,
    indices: l.indices,
    material: l.material,
  }));

describe("coplanar overlap detection", () => {
  it("reports overlapping same-facing coplanar faces of different materials", () => {
    const found = findCoplanarOverlaps(
      [
        { source: "panel", ...quad(0, 0, 1, 1, 0), material: "primary" },
        { source: "trim", ...quad(0.5, 0, 1.5, 1, 0), material: "trim" },
      ],
      { exposedOnly: false },
    );
    expect(found).toHaveLength(1);
    expect(found[0].area).toBeCloseTo(0.5, 6);
  });

  it("ignores edge-sharing faces, back-to-back faces, separated planes and one material", () => {
    const flipped = quad(0, 0, 1, 1, 0);
    flipped.indices = [0, 2, 1, 0, 3, 2];
    expect(
      findCoplanarOverlaps(
        [
          { source: "a", ...quad(0, 0, 1, 1, 0), material: "a" },
          { source: "b", ...quad(1, 0, 2, 1, 0), material: "b" },
          { source: "c", ...flipped, material: "c" },
          { source: "d", ...quad(0, 0, 1, 1, 0.002), material: "d" },
          { source: "e", ...quad(0, 0, 1, 1, 0.002), material: "d" },
        ],
        { exposedOnly: false },
      ),
    ).toEqual([]);
  });

  it("skips overlaps buried inside other geometry", () => {
    // A closed unit cube whose inside holds a coplanar pair: neither face can be seen.
    const cube = {
      positions: [
        0, 0, -1, 1, 0, -1, 1, 1, -1, 0, 1, -1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1,
        1,
      ],
      indices: [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
      ],
    };
    const inner = [
      { source: "p", ...quad(0.2, 0.2, 0.8, 0.8, 0), material: "p" },
      { source: "q", ...quad(0.2, 0.2, 0.8, 0.8, 0), material: "q" },
    ];
    expect(
      findCoplanarOverlaps([...inner, { source: "cube", ...cube }]),
    ).toEqual([]);
    expect(findCoplanarOverlaps(inner)).toHaveLength(1);
  });
});

describe("coplanar layer resolution", () => {
  it("moves the higher-priority face one step in front and leaves no overlap", () => {
    const layers = [
      layer(quad(0, 0, 1, 1, 0), 0),
      layer(quad(0.5, 0, 1.5, 1, 0), 4),
    ];
    expect(resolveCoplanarLayers(layers)).toBe(2);
    expect(
      findCoplanarOverlaps(sources(layers), { exposedOnly: false }),
    ).toEqual([]);
    // The winner's triangles got their own vertices, one step up; the loser did not move.
    const z = (l: CoplanarLayer) =>
      [...l.indices].map((i) => l.positions[i * 3 + 2]);
    expect(z(layers[0]).every((v) => v === 0)).toBe(true);
    expect(z(layers[1]).every((v) => Math.abs(v - 0.001) < 1e-12)).toBe(true);
  });

  it("keeps stacked layers ordered, including a pre-existing sub-tolerance offset", () => {
    const layers = [
      layer(quad(0, 0, 2, 2, 0), 0),
      layer(quad(0, 0, 2, 2, 0.00025), 1), // already 0.25 mm in front
      layer(quad(0.5, 0.5, 1.5, 1.5, 0), 2),
    ];
    resolveCoplanarLayers(layers);
    expect(
      findCoplanarOverlaps(sources(layers), { exposedOnly: false }),
    ).toEqual([]);
    const top = (l: CoplanarLayer) =>
      Math.max(...[...l.indices].map((i) => l.positions[i * 3 + 2]));
    expect(top(layers[2])).toBeGreaterThan(top(layers[1]) + 0.0009);
    expect(top(layers[1])).toBeGreaterThan(top(layers[0]) + 0.0009);
  });

  it("does not move equal priorities or one material", () => {
    const layers = [
      layer(quad(0, 0, 1, 1, 0), 3, "same"),
      layer(quad(0.5, 0, 1.5, 1, 0), 5, "same"),
      layer(quad(0, 0, 1, 1, 1), 2, "a"),
      layer(quad(0, 0, 1, 1, 1), 2, "b"),
    ];
    expect(resolveCoplanarLayers(layers)).toBe(0);
  });
});
