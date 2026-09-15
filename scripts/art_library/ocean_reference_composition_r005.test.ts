import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeOceanReference as previousComposition } from "./ocean_reference_composition_r004";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeOceanReference } from "./ocean_reference_composition_r005";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/ocean-r005/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
const levels = ([0, 1, 2] as const).map((lod) =>
  composeOceanReference(kit, 38, lod),
);
it("retains islands, beaches and groves with exact material identity across native LODs", () => {
  const features = (level: (typeof levels)[number]) =>
    level.map((b) =>
      b.ranges
        .filter((r) => r.partId !== "ground")
        .map((r) => ({
          id: r.partId,
          positions: b.positions.slice(
            r.firstTriangle * 9,
            (r.firstTriangle + r.triangleCount) * 9,
          ),
        })),
    );
  expect(features(levels[0])).toEqual(features(levels[2]));
  expect(composeOceanReference(kit, 38, 2)).toEqual(levels[2]);
  expect(composeOceanReference(kit, 39, 2)).not.toEqual(levels[2]);
});
it("keeps complete placement ranges, finite native CCW geometry and a bounded scene", () => {
  for (const level of levels) {
    expect(level.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
      111000,
    );
    for (const b of level) {
      expect([...b.positions, ...b.normals].every(Number.isFinite)).toBe(true);
      let end = 0;
      for (const r of b.ranges) {
        expect(r.firstTriangle).toBe(end);
        end += r.triangleCount;
      }
      expect(end).toBe(b.indices.length / 3);
      for (let i = 0; i < b.positions.length; i += 9) {
        const p = b.positions,
          n = b.normals,
          a = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]],
          c = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]],
          cross = [
            a[1] * c[2] - a[2] * c[1],
            a[2] * c[0] - a[0] * c[2],
            a[0] * c[1] - a[1] * c[0],
          ];
        expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 5);
        expect(
          cross[0] * n[i] + cross[1] * n[i + 1] + cross[2] * n[i + 2],
        ).toBeGreaterThan(0);
      }
    }
  }
});
it("places grove roots above water and retains a wider authored shallow shelf", () => {
  const trunks = levels[0][9];
  expect(trunks.ranges).toHaveLength(22);
  for (const r of trunks.ranges) {
    const p = trunks.positions.slice(
      r.firstTriangle * 9,
      (r.firstTriangle + r.triangleCount) * 9,
    );
    for (let i = 0; i < p.length; i += 3)
      expect(Math.hypot(p[i], p[i + 1], p[i + 2])).toBeGreaterThan(1.03);
  }
  // Source shallow shelf footprint must exceed the green plateau; a former
  // cumulative-scale bug collapsed its width around most of the circumference.
  const island = kit.variants.find((v) => v.name === "steep-island")!;
  const bounds = (role: number) => {
    let min = Infinity,
      max = -Infinity;
    for (let t = 0; t < island.triangleMaterials.length; t++)
      if (island.triangleMaterials[t] === role)
        for (let k = 0; k < 3; k++) {
          const x = island.positions[island.indices[t * 3 + k] * 3];
          min = Math.min(min, x);
          max = Math.max(max, x);
        }
    return max - min;
  };
  expect(bounds(2)).toBeGreaterThan(bounds(6) * 1.1);
  expect(() => composeOceanReference({ ...kit, variants: [] }, 1, 0)).toThrow(
    "Missing ocean native variant",
  );
});

it("widens native tangent footprints 1.4x while preserving every radial height and triangle identity", () => {
  const previous = previousComposition(kit, 38, 0),
    next = levels[0];
  let changed = 0;
  for (let i = 0; i < next.length; i++) {
    const a = next[i],
      b = previous[i];
    expect(a.indices).toEqual(b.indices);
    expect(a.ranges).toEqual(b.ranges);
    for (const range of a.ranges)
      for (
        let j = range.firstTriangle * 9;
        j < (range.firstTriangle + range.triangleCount) * 9;
        j += 3
      ) {
        expect(
          Math.hypot(a.positions[j], a.positions[j + 1], a.positions[j + 2]),
        ).toBeCloseTo(
          Math.hypot(b.positions[j], b.positions[j + 1], b.positions[j + 2]),
          6,
        );
        if (range.partId === "ground")
          expect(a.positions.slice(j, j + 3)).toEqual(
            b.positions.slice(j, j + 3),
          );
        else if (Math.abs(a.positions[j] - b.positions[j]) > 1e-5) changed++;
      }
  }
  expect(changed).toBeGreaterThan(1000);
  // First anchor derives from the stable seeded plan. Inverse radial mapping
  // recovers the tangent displacement independently of radius and normal shading.
  const phase =
    (((Math.imul(38, 1664525) + 1013904223) >>> 0) / 4294967296) * Math.PI * 2;
  const y = 1 - 1 / 12,
    r = Math.sqrt(1 - y * y),
    n = [Math.cos(phase) * r, y, Math.sin(phase) * r];
  const tangent = (p: Float32Array, j: number) => {
    const dot = p[j] * n[0] + p[j + 1] * n[1] + p[j + 2] * n[2];
    return [p[j] / dot - n[0], p[j + 1] / dot - n[1], p[j + 2] / dot - n[2]];
  };
  let tested = 0;
  for (let i = 0; i < next.length; i++)
    for (const range of next[i].ranges.filter(
      (r) => r.partId === "island-0" || r.partId.startsWith("grove-0-"),
    )) {
      for (
        let j = range.firstTriangle * 9;
        j < (range.firstTriangle + range.triangleCount) * 9;
        j += 3
      ) {
        const a = tangent(next[i].positions, j),
          b = tangent(previous[i].positions, j);
        for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k] * 1.4, 6);
        tested++;
      }
    }
  expect(tested).toBeGreaterThan(1000);
});
it("NullEngine resolves a widened native plateau ray hit to its stable island placement at every LOD", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    for (const level of levels) {
      const b = level[6],
        range = b.ranges.find((r) => r.partId === "island-0")!;
      const mesh = new Mesh("ocean-plateau", scene);
      mesh.metadata = { role: "planet", triangleRanges: b.ranges };
      mesh.material = new PBRMaterial("plateau", scene);
      const data = new VertexData();
      data.positions = b.positions;
      data.normals = b.normals;
      data.indices = b.indices;
      data.applyToMesh(mesh);
      mesh.computeWorldMatrix(true);
      const j = range.firstTriangle * 9,
        p = b.positions;
      const center = new Vector3(
        (p[j] + p[j + 3] + p[j + 6]) / 3,
        (p[j + 1] + p[j + 4] + p[j + 7]) / 3,
        (p[j + 2] + p[j + 5] + p[j + 8]) / 3,
      );
      const hit = new Ray(
        center.scale(2),
        center.normalizeToNew().negate(),
        3,
      ).intersectsMesh(mesh, false);
      expect(hit.hit).toBe(true);
      expect(hit.faceId).toBeGreaterThanOrEqual(range.firstTriangle);
      expect(hit.faceId).toBeLessThan(
        range.firstTriangle + range.triangleCount,
      );
      mesh.material.dispose();
      mesh.dispose();
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
