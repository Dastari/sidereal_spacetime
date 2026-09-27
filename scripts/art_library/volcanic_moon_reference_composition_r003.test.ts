import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeVolcanicMoonReference } from "./volcanic_moon_reference_composition_r003";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const ids = ["volcanic-moon-1", "volcanic-moon-2"];
for (const id of ids) {
  const kit = JSON.parse(
    readFileSync(
      `output/playwright/planet-reference-20260914/${id}-r003/kit.json`,
      "utf8",
    ),
  ) as NativePlanetKit;
  it("retains complete native regional surfaces UVs normals and identities at every LOD", () => {
    const a = composeVolcanicMoonReference(kit, 38, 0),
      b = composeVolcanicMoonReference(kit, 38, 2),
      middle = composeVolcanicMoonReference(kit, 38, 1);
    for (let m = 0; m < a.length; m++) {
      for (const field of ["positions", "normals", "uvs", "indices"] as const) {
        expect(
          Buffer.from(a[m][field].buffer).equals(
            Buffer.from(b[m][field].buffer),
          ),
        ).toBe(true);
        expect(
          Buffer.from(a[m][field].buffer).equals(
            Buffer.from(middle[m][field].buffer),
          ),
        ).toBe(true);
      }
      expect(a[m].ranges).toEqual(b[m].ranges);
      expect(a[m].ranges).toEqual(middle[m].ranges);
      expect(a[m].uvs.length).toBe((a[m].positions.length / 3) * 2);
    }
    expect(
      a
        .flatMap((b) => b.ranges)
        .every((r) => r.partId.startsWith(`planets--${id}/`)),
    ).toBe(true);
    expect(a.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
      190000,
    );
  });
  it("NullEngine sees embedded deep crater floor before the cleared native substrate", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try {
      const meshes = composeVolcanicMoonReference(kit, 38, 0, true).map(
        (b, i) => {
          const mesh = new Mesh(`rocky-${i}`, scene);
          mesh.metadata = {
            role: "planet",
            materialRole: i,
            triangleRanges: b.ranges,
          };
          mesh.material = new PBRMaterial(`rocky-role-${i}`, scene);
          const data = new VertexData();
          data.positions = b.positions;
          data.normals = b.normals;
          data.uvs = b.uvs;
          data.indices = b.indices;
          data.applyToMesh(mesh);
          mesh.computeWorldMatrix(true);
          return mesh;
        },
      );
      const n = new Vector3(0.452, 0.388, 0.794).normalize(),
        ray = new Ray(n.scale(2), n.negate(), 3),
        hits = meshes
          .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
          .filter((v) => v.hit.hit && v.hit.pickedPoint)
          .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(hits[0].mesh.metadata.materialRole).toBe(2);
      expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(0.97);
      const ground = hits.find((v) => v.mesh.metadata.materialRole === 0)!;
      expect(ground.hit.distance - hits[0].hit.distance).toBeGreaterThan(0.003);
      const east = Vector3.Cross(Vector3.Up(), n).normalize(),
        north = Vector3.Cross(n, east),
        pd = n
          .add(east.scale(1.22 * 0.32))
          .add(north.scale(0.07 * 0.32))
          .normalize(),
        pr = new Ray(pd.scale(2), pd.negate(), 3),
        ph = meshes
          .map((mesh) => ({ mesh, hit: pr.intersectsMesh(mesh, false) }))
          .filter((v) => v.hit.hit && v.hit.pickedPoint)
          .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(ph[0].mesh.metadata.materialRole).toBe(2);
      expect(ph[0].hit.pickedPoint!.length()).toBeLessThan(1);
      const pg = ph.find((v) => v.mesh.metadata.materialRole === 0)!;
      expect(pg.hit.distance - ph[0].hit.distance).toBeGreaterThan(0.003);
      const sd = n
          .add(east.scale(-1.74 * 0.32))
          .add(north.scale(-0.42 * 0.32))
          .normalize(),
        sr = new Ray(sd.scale(2), sd.negate(), 3),
        sh = meshes
          .map((mesh) => ({ mesh, hit: sr.intersectsMesh(mesh, false) }))
          .filter((v) => v.hit.hit && v.hit.pickedPoint)
          .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(sh[0].mesh.metadata.materialRole).toBe(2);
      expect(sh[0].hit.pickedPoint!.length()).toBeGreaterThan(1);
      expect(sh[0].hit.pickedPoint!.length()).toBeLessThan(1 + 0.17 * 0.32);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it("rejects missing authored optical attributes", () => {
    expect(() =>
      composeVolcanicMoonReference(
        {
          ...kit,
          variants: kit.variants.map((v) => ({ ...v, normals: undefined })),
        },
        38,
        0,
      ),
    ).toThrow("Missing native rocky normals or UVs");
  });
}
it("keeps the large crater floor exposed in all24 seeded regional placements", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    for (const id of ids) {
      const kit = JSON.parse(
        readFileSync(
          `output/playwright/planet-reference-20260914/${id}-r003/kit.json`,
          "utf8",
        ),
      );
      const meshes = composeVolcanicMoonReference(kit, 38, 0).map((b, i) => {
        const mesh = new Mesh(`${id}-${i}`, scene);
        mesh.metadata = {
          role: "planet",
          materialRole: i,
          triangleRanges: b.ranges,
        };
        mesh.material = new PBRMaterial("moon-role", scene);
        const data = new VertexData();
        Object.assign(data, b);
        data.applyToMesh(mesh);
        mesh.computeWorldMatrix(true);
        return mesh;
      });
      let state = (38 ^ kit.compositionRecipe.layoutSeed) >>> 0;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const phase = (state / 4294967296) * Math.PI * 2;
      for (let i = 0; i < 12; i++) {
        const y = 1 - (2 * (i + 0.5)) / 12,
          angle = phase + i * 2.39996323,
          r = Math.sqrt(1 - y * y),
          n = new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r),
          ray = new Ray(n.scale(2), n.negate(), 3),
          hits = meshes
            .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
            .filter((v) => v.hit.hit && v.hit.pickedPoint)
            .sort((a, b) => a.hit.distance - b.hit.distance);
        expect(hits[0].mesh.metadata.materialRole, `${id}/crust-${i}`).toBe(2);
      }
      for (const mesh of meshes) {
        mesh.material?.dispose();
        mesh.dispose();
      }
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it("exposes the authored hot fracture surfaces above final overlapping crust", () => {
  const results: Record<
    string,
    { samples: number; visible: number; visibleAreaEstimate: number }
  > = {};
  for (const id of ids) {
    const kit = JSON.parse(
      readFileSync(
        `output/playwright/planet-reference-20260914/${id}-r003/kit.json`,
        "utf8",
      ),
    ) as NativePlanetKit;
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try {
      const batches = composeVolcanicMoonReference(kit, 38, 0),
        meshes = batches.map((b, i) => {
          const mesh = new Mesh(`fault-${i}`, scene);
          mesh.metadata = { role: "planet", materialRole: i };
          mesh.material = new PBRMaterial("fault", scene);
          const data = new VertexData();
          Object.assign(data, b);
          data.applyToMesh(mesh);
          mesh.computeWorldMatrix(true);
          return mesh;
        });
      const hot = batches[4],
        points: { p: Vector3; area: number }[] = [];
      for (let t = 0; t < hot.indices.length; t += 3) {
        const a = Vector3.FromArray(hot.positions, hot.indices[t] * 3),
          b = Vector3.FromArray(hot.positions, hot.indices[t + 1] * 3),
          c = Vector3.FromArray(hot.positions, hot.indices[t + 2] * 3),
          p = a
            .add(b)
            .add(c)
            .scale(1 / 3),
          normal = Vector3.Cross(b.subtract(a), c.subtract(a));
        if (Vector3.Dot(normal.normalizeToNew(), p.normalizeToNew()) > 0.35)
          points.push({ p, area: normal.length() / 2 });
      }
      let visible = 0,
        samples = 0;
      for (
        let i = 0;
        i < points.length;
        i += Math.max(1, Math.floor(points.length / 48))
      ) {
        const p = points[i].p,
          n = p.normalizeToNew(),
          ray = new Ray(n.scale(2), n.negate(), 3),
          hits = meshes
            .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
            .filter((h) => h.hit.hit && h.hit.pickedPoint)
            .sort((a, b) => a.hit.distance - b.hit.distance);
        samples++;
        if (hits[0]?.mesh.metadata.materialRole === 4) visible++;
      }
      results[id] = {
        samples,
        visible,
        visibleAreaEstimate:
          (points.reduce((n, p) => n + p.area, 0) * visible) / samples,
      };
      expect(visible / samples, id).toBeGreaterThan(0.7);
      expect(results[id].visibleAreaEstimate, id).toBeGreaterThan(
        id.endsWith("-1") ? 0.28 : 0.16,
      );
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
  writeFileSync(
    "output/playwright/planet-reference-20260914/volcanic-moons-r003-exposed-fracture-rays.json",
    JSON.stringify(results, null, 2),
  );
});

it("preserves the complete cold foundation, placement recipe and native material definitions", () => {
  for (const id of ids) {
    const old = JSON.parse(
        readFileSync(
          `output/playwright/planet-reference-20260914/${id}-r002/kit.json`,
          "utf8",
        ),
      ),
      next = JSON.parse(
        readFileSync(
          `output/playwright/planet-reference-20260914/${id}-r003/kit.json`,
          "utf8",
        ),
      );
    expect(next.materials).toEqual(old.materials);
    expect(next.compositionRecipe).toEqual(old.compositionRecipe);
    for (const v of old.variants)
      if (!v.name.startsWith("battered-region-"))
        expect(next.variants.find((n: any) => n.name === v.name)).toEqual(v);
    for (const material of old.materials)
      for (const field of ["baseColorTexture", "metallicRoughnessTexture"])
        if (material[field])
          expect(
            readFileSync(
              `output/playwright/planet-reference-20260914/${id}-r003/${material[field]}`,
            ).equals(
              readFileSync(
                `output/playwright/planet-reference-20260914/${id}-r002/${material[field]}`,
              ),
            ),
          ).toBe(true);
  }
});
