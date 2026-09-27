import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeOceanReference as previousComposition } from "./ocean_reference_composition_r006";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { composeOceanReference } from "./ocean_reference_composition_r007";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/ocean-r007/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
const levels = ([0, 1, 2] as const).map((lod) =>
  composeOceanReference(kit, 38, lod),
);
it("retains islands, beaches and groves with exact material identity across native LODs", () => {
  const digest = (level: (typeof levels)[number]) =>
    level.map((b) => {
      const hash = createHash("sha256");
      for (const r of b.ranges.filter((r) => r.partId !== "ground")) {
        hash.update(r.partId);
        for (const [values, width] of [
          [b.positions, 9],
          [b.normals, 9],
          [b.uvs, 6],
        ] as const) {
          const part = values.slice(
            r.firstTriangle * width,
            (r.firstTriangle + r.triangleCount) * width,
          );
          hash.update(Buffer.from(part.buffer));
        }
      }
      return hash.digest("hex");
    });
  expect(digest(levels[0])).toEqual(digest(levels[2]));
  expect(digest(composeOceanReference(kit, 38, 2))).toEqual(digest(levels[2]));
  expect(digest(composeOceanReference(kit, 39, 2))).not.toEqual(
    digest(levels[2]),
  );
});
it("keeps complete placement ranges, finite native CCW geometry and a bounded scene", () => {
  for (const level of levels) {
    expect(level.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
      160000,
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
  expect(
    bounds(
      kit.materials.findIndex(
        (m) => m.name === "island-finish-shallow-turquoise",
      ),
    ),
  ).toBeGreaterThan(
    bounds(
      kit.materials.findIndex((m) => m.name === "island-finish-plateau-green"),
    ) * 1.1,
  );
  expect(() => composeOceanReference({ ...kit, variants: [] }, 1, 0)).toThrow(
    "Missing ocean native variant",
  );
});

it("preserves the previous placement map and radial heights while transporting native corner attributes", () => {
  const previous = previousComposition(kit, 38, 0),
    next = levels[0];
  for (let i = 0; i < next.length; i++) {
    expect(next[i].positions).toEqual(previous[i].positions);
    expect(next[i].indices).toEqual(previous[i].indices);
    expect(next[i].ranges).toEqual(previous[i].ranges);
  }
  const composed = levels[0],
    native = kit.variants.find(
      (v) => v.name === "steep-island",
    )! as NativePlanetKit["variants"][number] & { uvs: number[] };
  for (let m = 0; m < kit.materials.length; m++) {
    const range = composed[m].ranges.find((r) => r.partId === "island-0");
    if (!range) continue;
    const expected: number[] = [];
    for (let t = 0; t < native.triangleMaterials.length; t++)
      if (native.triangleMaterials[t] === m)
        for (let j = 0; j < 3; j++) {
          const i = native.indices[t * 3 + j];
          expected.push(...native.uvs.slice(i * 2, i * 2 + 2));
        }
    expect(
      composed[m].uvs.slice(
        range.firstTriangle * 6,
        (range.firstTriangle + range.triangleCount) * 6,
      ),
    ).toEqual(Float32Array.from(expected));
  }
  expect(() =>
    composeOceanReference(
      {
        ...kit,
        variants: kit.variants.map((v) => ({ ...v, normals: undefined })),
      },
      38,
      0,
    ),
  ).toThrow("Missing authored ocean normals or UVs");
});
it("NullEngine resolves a widened native plateau ray hit to its stable island placement at every LOD", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    for (const level of levels) {
      const b =
          level[
            kit.materials.findIndex(
              (m) => m.name === "island-finish-plateau-green",
            )
          ],
        range = b.ranges.find((r) => r.partId === "island-0")!;
      const mesh = new Mesh("ocean-plateau", scene);
      mesh.metadata = { role: "planet", triangleRanges: b.ranges };
      mesh.material = new PBRMaterial("plateau", scene);
      const data = new VertexData();
      data.positions = b.positions;
      data.normals = b.normals;
      data.uvs = b.uvs;
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
it("preserves accepted Ocean6 water, reef and groves with the same topology count for island finishes", () => {
  const previousKit = JSON.parse(
    readFileSync(
      "output/playwright/planet-reference-20260914/ocean-r006/kit.json",
      "utf8",
    ),
  ) as NativePlanetKit;
  for (const v of kit.variants) {
    const prior = previousKit.variants.find((p) => p.name === v.name)!;
    expect(v.indices).toEqual(prior.indices);
    if (
      !["steep-island", "long-island", "archipelago", "tiny-islet"].includes(
        v.name,
      )
    )
      expect(v).toEqual(prior);
    else {
      let largest = 0;
      for (let j = 0; j < v.positions.length; j++)
        largest = Math.max(
          largest,
          Math.abs(v.positions[j] - prior.positions[j]),
        );
      expect(largest).toBeLessThan(0.03);
    }
  }
  expect(kit.materials.slice(0, 10)).toEqual(previousKit.materials);
  for (const file of [
    "lagoon-atoll.glb",
    "ground-sphere.glb",
    "ground-sphere-medium.glb",
    "ground-sphere-low.glb",
    "water-albedo.png",
    "water-normal.png",
    "water-orm.png",
  ])
    expect(
      readFileSync(
        "output/playwright/planet-reference-20260914/ocean-r007/" + file,
      ).equals(
        readFileSync(
          "output/playwright/planet-reference-20260914/ocean-r006/" + file,
        ),
      ),
    ).toBe(true);
});
