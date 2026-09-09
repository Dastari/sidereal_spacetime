import { describe, it, expect } from "vitest";
import {
  composeNativePlanet,
  nativePatchNeighbors,
  nativeFeatureDistribution,
  type NativePlanetKit,
} from "./native-planet-composition";
const positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
const kit: NativePlanetKit = {
  schema: "sidereal.native-planet-kit.v1",
  materials: [{ name: "snow", linearColor: [0.8, 0.9, 1], roughness: 0.8 }],
  variants: [
    {
      name: "quiet",
      positions,
      indices: [0, 1, 2, 0, 2, 3],
      triangleMaterials: [0, 0],
    },
    {
      name: "cavity",
      positions: positions.map((v, i) => (i % 3 === 2 ? -0.15 : v)),
      indices: [0, 1, 2, 0, 2, 3],
      triangleMaterials: [0, 0],
    },
  ],
};
describe("native Blender planet composition", () => {
  it("repeats authored seeded assembly and produces distinct alternate worlds", () => {
    const a = composeNativePlanet(kit, 131),
      b = composeNativePlanet(kit, 131),
      c = composeNativePlanet(kit, 9187);
    expect(a).toEqual(b);
    expect(a.tiles).not.toEqual(c.tiles);
    expect(a.triangles).toBe(48);
    expect(a.tiles.filter((v) => v > 0)).toHaveLength(10);
    expect(a.batches[0].positions.every(Number.isFinite)).toBe(true);
  });
  it("joins compatible native patch corners at cube-face boundaries", () => {
    const a = composeNativePlanet(kit, 131, 0),
      p = a.batches[0].positions;
    const points = new Map<string, number>();
    for (let i = 0; i < p.length; i += 3) {
      const key = p
        .slice(i, i + 3)
        .map((v) => v.toFixed(9))
        .join(",");
      points.set(key, (points.get(key) ?? 0) + 1);
      expect(Math.hypot(...p.slice(i, i + 3))).toBeCloseTo(1, 10);
    }
    expect(points.size).toBe(26);
    expect([...points.values()].every((n) => n >= 3)).toBe(true);
  });
  it("rejects malformed authored geometry and invalid bounded recipes", () => {
    expect(() => composeNativePlanet(kit, 131, 1.1)).toThrow();
    expect(() => composeNativePlanet(kit, 131, 0.5, 1)).toThrow();
    expect(() =>
      composeNativePlanet(
        {
          ...kit,
          variants: [
            kit.variants[0],
            { ...kit.variants[1], indices: [0, 1, 99] },
          ],
        },
        131,
      ),
    ).toThrow();
    expect(() =>
      composeNativePlanet(
        {
          ...kit,
          variants: [
            kit.variants[0],
            { ...kit.variants[1], positions: [NaN, 0, 0] },
          ],
        },
        131,
      ),
    ).toThrow();
  });
});

describe("authored shared-edge ravine ports", () => {
  const linked: NativePlanetKit = {
    ...kit,
    layout: "connected-ravines",
    variants: [[], [0], [0, 2], [0, 1], [], []].map((ports, i) => ({
      ...kit.variants[0],
      name: "native-" + i,
      ports,
    })),
  };
  it("pairs all cube-face edges and connects every opening to a matching neighboring port", () => {
    const neighbors = nativePatchNeighbors(),
      world = composeNativePlanet(linked, 131, 0.42, 0.65);
    expect(world.links.length).toBeGreaterThanOrEqual(6);
    expect(
      world.links.some(([a, , b]) => Math.floor(a / 4) !== Math.floor(b / 4)),
    ).toBe(true);
    for (let tile = 0; tile < 24; tile++)
      for (let port = 0; port < 4; port++) {
        const n = neighbors[tile][port];
        expect(neighbors[n.tile][n.port]).toEqual({ tile, port });
      }
    for (let tile = 0; tile < 24; tile++)
      for (const local of linked.variants[world.tiles[tile]].ports ?? []) {
        const port = (local + world.rotations[tile]) % 4,
          n = neighbors[tile][port];
        expect(
          (linked.variants[world.tiles[n.tile]].ports ?? []).map(
            (p) => (p + world.rotations[n.tile]) % 4,
          ),
        ).toContain(n.port);
      }
  });
  it("balances macro regions across views without extra geometry", () => {
    for (const seed of [131, 9187]) {
      const a = composeNativePlanet(linked, seed, 0.55, 0.65);
      expect(a).toEqual(composeNativePlanet(linked, seed, 0.55, 0.65));
      expect(nativeFeatureDistribution(a.tiles).minimum).toBeGreaterThanOrEqual(
        0.49,
      );
      expect(a.triangles).toBe(48);
    }
  });
  it("replaces compatible path ends with authored basins while preserving connected ports", () => {
    const basins = {...linked, variants: [...linked.variants, {...linked.variants[1], name: "basin-end", ports: [0]}]};
    const a = composeNativePlanet(basins, 131, .55, .65);
    expect(a.tiles.filter(v => v === 6).length).toBeGreaterThanOrEqual(4);
    expect(a.links).toEqual(composeNativePlanet(linked, 131, .55, .65).links);
    const neighbors = nativePatchNeighbors();
    for (let tile = 0; tile < 24; tile++) for (const local of basins.variants[a.tiles[tile]].ports ?? []) {
      const port = (local + a.rotations[tile]) % 4, neighbor = neighbors[tile][port];
      expect((basins.variants[a.tiles[neighbor.tile]].ports ?? []).map(p => (p + a.rotations[neighbor.tile]) % 4)).toContain(neighbor.port);
    }
  });
  it("rejects a kit whose declared connection profiles cannot satisfy assembly", () => {
    expect(() =>
      composeNativePlanet(
        {
          ...linked,
          variants: linked.variants.map((v, i) =>
            i === 2 ? { ...v, ports: [0, 1] } : v,
          ),
        },
        131,
      ),
    ).toThrow("shared-port");
  });
});
