import { expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeCrystalReference as compose12 } from "./crystal_reference_composition_r012";
import { composeCrystalReference } from "./crystal_reference_composition_r013";
import { nativeRadialSurface } from "./native_radial_surface";
import type { Vec } from "./native_reference_assembly";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/crystal-r009/kit.json",
    "utf8",
  ),
);
type Batches = ReturnType<typeof composeCrystalReference>;
const authoredIds = Array.from({ length: 8 }, (_, i) =>
  Array.from(
    { length: 5 },
    (_, j) => `${i % 2 === 0 && j === 0 ? "colossal" : "medium"}-${i}-${j}`,
  ),
).flat();
function tips(batches: Batches, ids: string[]) {
  const values = new Map<string, Vec>();
  for (const role of [3, 4, 5, 6, 7])
    for (const range of batches[role].ranges) {
      if (!ids.includes(range.partId)) continue;
      for (
        let i = range.firstTriangle * 9;
        i < (range.firstTriangle + range.triangleCount) * 9;
        i += 3
      ) {
        const p = Array.from(batches[role].positions.slice(i, i + 3)) as Vec,
          old = values.get(range.partId);
        if (!old || Math.hypot(...p) > Math.hypot(...old))
          values.set(range.partId, p);
      }
    }
  return values;
}
function coverage(batches: Batches, bridgeIds: string[]) {
  const surface = nativeRadialSurface(batches, [0, 1, 2, 8]),
    points = [...tips(batches, [...authoredIds, ...bridgeIds]).values()]
      .filter(
        (p) =>
          Math.hypot(...p) >
          surface(p.map((v) => v / Math.hypot(...p)) as Vec) + 0.005,
      )
      .map((p) => p.map((v) => v / Math.hypot(...p)));
  let hole = 0;
  for (let i = 0; i < 4096; i++) {
    const y = 1 - (2 * (i + 0.5)) / 4096,
      theta = i * 2.399963229728653,
      r = Math.sqrt(1 - y * y),
      n = [Math.cos(theta) * r, y, Math.sin(theta) * r],
      nearest = Math.max(
        ...points.map((p) => p.reduce((sum, v, k) => sum + v * n[k], 0)),
      );
    hole = Math.max(hole, (Math.acos(Math.min(1, nearest)) * 180) / Math.PI);
  }
  return { visible: points.length, holeDegrees: hole };
}
it("optimizes global visible-emitter coverage across seeds instead of separating fourteen bridges alone", () => {
  const records = [];
  for (const seed of [1, 38, 91]) {
    const b = composeCrystalReference(kit, seed, 0),
      old = compose12(kit, seed, 0),
      bridgeIds = Array.from({ length: 24 }, (_, i) => `bridge-crystals-${i}`),
      oldIds = [
        ...new Set(
          old.flatMap((b) =>
            b.ranges
              .filter((r) => r.partId.startsWith("bridge-crystals-"))
              .map((r) => r.partId),
          ),
        ),
      ],
      before = coverage(old, oldIds),
      after = coverage(b, bridgeIds);
    records.push({
      seed,
      before,
      after,
      triangles: b.reduce((n, b) => n + b.indices.length / 3, 0),
    });
    expect(tips(b, bridgeIds).size).toBe(24);
    expect(after.holeDegrees).toBeLessThan(26);
    expect(after.holeDegrees).toBeLessThan(before.holeDegrees);
    expect(b.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
      150000,
    );
  }
  mkdirSync("output/playwright/planet-reference-20260914/crystal-r013", {
    recursive: true,
  });
  writeFileSync(
    "output/playwright/planet-reference-20260914/crystal-r013/coverage.json",
    JSON.stringify(records, null, 2),
  );
});
it("preserves every preexisting placement and shares the identical final buffers through LODs", () => {
  const old = compose12(kit, 38, 0),
    b = composeCrystalReference(kit, 38, 0),
    low = composeCrystalReference(kit, 38, 2);
  for (let role = 0; role < b.length; role++) {
    for (const r of old[role].ranges) {
      if (r.partId.startsWith("bridge-crystals-")) continue;
      const next = b[role].ranges.find((n) => n.partId === r.partId)!;
      expect(next).toEqual(r);
      for (const [field, stride] of [
        ["positions", 9],
        ["normals", 9],
        ["uvs", 6],
      ] as const)
        expect(
          b[role][field].slice(
            next.firstTriangle * stride,
            (next.firstTriangle + next.triangleCount) * stride,
          ),
        ).toEqual(
          old[role][field].slice(
            r.firstTriangle * stride,
            (r.firstTriangle + r.triangleCount) * stride,
          ),
        );
    }
    for (const field of ["positions", "normals", "uvs", "indices"] as const)
      expect(b[role][field]).toEqual(low[role][field]);
    expect(b[role].ranges).toEqual(low[role].ranges);
  }
});
it("NullEngine confirms each bridge tip is visible above final native terrain, not buried by later outcrops", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const batches = composeCrystalReference(kit, 38, 0),
      meshes = [0, 1, 2, 8].map((role) => {
        const b = batches[role],
          mesh = new Mesh("native-terrain", scene);
        mesh.metadata = { role: "planet", trianglePlacementRanges: b.ranges };
        mesh.material = new PBRMaterial("native-terrain-role", scene);
        const data = new VertexData();
        Object.assign(data, b);
        data.applyToMesh(mesh);
        mesh.computeWorldMatrix(true);
        return mesh;
      });
    for (const [id, p] of tips(
      batches,
      Array.from({ length: 24 }, (_, i) => `bridge-crystals-${i}`),
    )) {
      const point = Vector3.FromArray(p),
        n = point.normalizeToNew(),
        ray = new Ray(n.scale(3), n.negate(), 4),
        hit = meshes
          .map((m) => ray.intersectsMesh(m, false))
          .filter((h) => h.hit && h.pickedPoint)
          .sort((a, b) => a.distance - b.distance)[0];
      expect(hit, id).toBeTruthy();
      expect(point.length() - hit.pickedPoint!.length(), id).toBeGreaterThan(
        0.005,
      );
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
