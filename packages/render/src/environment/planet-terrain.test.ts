import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  buildLayeredTerrain,
  terrainNeighborDirection,
  MAX_TERRAIN_FACES,
  type Vec,
} from "./planet-terrain";
import { createLayeredPlanet, planetLOD } from "./layered-planet";
import {
  planetRecipe,
  planetEffects,
  PLANET_STYLES,
} from "../../../content/src/environment";
const normal = (p: Vec) => {
  const length = Math.hypot(...p);
  return p.map((v) => v / length) as Vec;
};
describe("layered cube-sphere terrain", () => {
  it("matches exact neighboring cube-face cell centers across every edge", () => {
    const n = 32,
      step = 2 / n;
    for (let face = 0; face < 6; face++)
      for (let edge = 0; edge < 4; edge++)
        for (let cell = 0; cell < n; cell++) {
          const along = -1 + (cell + 0.5) * step;
          const u =
            edge === 1 ? 1 - step / 2 : edge === 3 ? -1 + step / 2 : along;
          const v =
            edge === 0 ? -1 + step / 2 : edge === 2 ? 1 - step / 2 : along;
          const d = terrainNeighborDirection(face, u, v, edge, n);
          const axis = d.map(Math.abs).indexOf(Math.max(...d.map(Math.abs))),
            sign = Math.sign(d[axis]),
            neighborFace = axis * 2 + (sign > 0 ? 1 : 0);
          const cube = d.map((q) => q / Math.abs(d[axis]));
          const nu = cube[(axis + 1) % 3],
            nv = cube[(axis + 2) % 3];
          const origin: Vec = [0, 0, 0];
          origin[Math.floor(face / 2)] = face % 2 ? 1 : -1;
          origin[(Math.floor(face / 2) + 1) % 3] = u;
          origin[(Math.floor(face / 2) + 2) % 3] = v;
          const target = normal(origin);
          expect(
            [0, 1, 2, 3].some(
              (e) =>
                Math.hypot(
                  ...terrainNeighborDirection(neighborFace, nu, nv, e, n).map(
                    (q, i) => q - target[i],
                  ),
                ) < 1e-10,
            ),
          ).toBe(true);
        }
  });
  it("produces finer finite terraces and independent real forest placements", () => {
    const recipe = planetRecipe("temperate", 348112),
      g = buildLayeredTerrain(recipe, 64);
    expect(g.samples).toBe(6 * 64 * 64);
    expect(g.terrain.faces).toBeLessThan(MAX_TERRAIN_FACES);
    expect(g.trees.length).toBeGreaterThan(100);
    expect(g.trees.length).toBeLessThanOrEqual(2400);
    expect(g.terrain.positions.every(Number.isFinite)).toBe(true);
    expect(g.terrain.normals.every(Number.isFinite)).toBe(true);
    expect(
      g.terrain.indices.every(
        (i) => i >= 0 && i < g.terrain.positions.length / 3,
      ),
    ).toBe(true);
    expect(g.terrain.indices.length).toBe(g.terrain.faces * 6);
    for (let i = 0; i < g.terrain.indices.length; i += 6) {
      const ids = g.terrain.indices.slice(i, i + 3).map((index) => index * 3),
        p = g.terrain.positions,
        n = g.terrain.normals;
      const [a, b, c] = ids,
        u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]],
        v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      expect(
        (u[1] * v[2] - u[2] * v[1]) * n[a] +
          (u[2] * v[0] - u[0] * v[2]) * n[a + 1] +
          (u[0] * v[1] - u[1] * v[0]) * n[a + 2],
      ).toBeGreaterThan(0);
    }
  });
  it("composes volcanic fissures and crystals onto a temperate base independently", () => {
    const recipe = planetRecipe("temperate", 17),
      base = buildLayeredTerrain(recipe, 32);
    const mixed = buildLayeredTerrain(
      {
        ...recipe,
        effects: {
          ...planetEffects(recipe),
          volcanicCoverage: 0.45,
          crystalCoverage: 0.6,
        },
      },
      32,
    );
    expect(base.lava.faces).toBe(0);
    expect(mixed.lava.faces).toBeGreaterThan(0);
    expect(mixed.crystals.length).toBeGreaterThan(0);
    expect(
      buildLayeredTerrain(
        { ...recipe, effects: { ...planetEffects(recipe), vegetation: 0 } },
        32,
      ).trees.length,
    ).toBe(0);
    expect(mixed.terrain.faces).toBeGreaterThan(0);
  });
  it.each(
    PLANET_STYLES.filter((style) => style !== "gas").flatMap((style) =>
      [false, true].map((extreme) => ({ style, extreme })),
    ),
  )(
    "degrades $style hero detail deterministically (extreme=$extreme)",
    ({ style, extreme }) => {
      const engine = new NullEngine(),
        scene = new Scene(engine);
      try {
        const recipe = {
          ...planetRecipe(style, 348112),
          resolution: 96,
          ...(extreme ? { terrain: 1, mountains: 1, seaLevel: 0 } : {}),
        };
        const generated = createLayeredPlanet(
          scene,
          "budget-" + style,
          recipe,
          0,
        );
        expect(generated.root.metadata.resolution).toBeLessThanOrEqual(96);
        expect(generated.root.metadata.requestedResolution).toBe(96);
        expect(generated.generated.terrain.faces).toBeLessThanOrEqual(
          MAX_TERRAIN_FACES,
        );
        expect(generated.generated.terrain.faces).toBeGreaterThan(0);
        generated.dispose();
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
    20000,
  );
  it("uses overlapping projected-size LOD bands", () => {
    expect(planetLOD(250, 2)).toBe(0);
    expect(planetLOD(170, 0)).toBe(0);
    expect(planetLOD(170, 1)).toBe(1);
    expect(planetLOD(45, 1)).toBe(1);
    expect(planetLOD(45, 2)).toBe(2);
    expect(planetLOD(10, 0)).toBe(2);
  });
});
