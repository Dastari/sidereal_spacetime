import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  createDistantStarfield,
  distantStarCatalog,
  DISTANT_STAR_COUNT,
} from "./starfield";

it("distant-star identities are fixed and cover all directions with bounded angular sizes", () => {
  const catalog = distantStarCatalog();
  expect(catalog).toEqual(distantStarCatalog());
  expect(catalog).not.toEqual(distantStarCatalog(DISTANT_STAR_COUNT, 118));
  for (const s of catalog) {
    expect(Math.hypot(...s.direction)).toBeCloseTo(1, 12);
    expect(s.angularRadius).toBeGreaterThanOrEqual(0.00045);
    expect(s.angularRadius).toBeLessThan(0.00155);
    expect(s.color.every((c) => Number.isFinite(c) && c > 0 && c <= 1.4)).toBe(
      true,
    );
  }
  // Reject a flattened distribution: each octant contains substantial sky coverage.
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        expect(
          catalog.filter(
            (s) =>
              s.direction[0] * x > 0 &&
              s.direction[1] * y > 0 &&
              s.direction[2] * z > 0,
          ).length,
        ).toBeGreaterThan(900);
  expect(() => distantStarCatalog(0)).toThrow();
  expect(() => distantStarCatalog(1, NaN)).toThrow();
});

it("one pooled background mesh follows translation without changing stars or owning lights", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("environment", scene);
  const field = createDistantStarfield(scene, root);
  const positions = field.mesh.getVerticesData(VertexBuffer.PositionKind)!;
  expect(positions.every(Number.isFinite)).toBe(true);
  expect(field.mesh.getTotalVertices()).toBe(DISTANT_STAR_COUNT * 4);
  expect(field.mesh.getTotalIndices()).toBe(DISTANT_STAR_COUNT * 6);
  expect(scene.meshes).toHaveLength(1);
  expect(scene.lights).toHaveLength(0);
  expect(scene.textures).toHaveLength(0);
  field.update(new Vector3(1e12, 99, -1e12));
  expect(field.mesh.position.asArray()).toEqual([1e12, 99, -1e12]);
  expect(field.mesh.rotation.asArray()).toEqual([0, 0, 0]);
  expect(field.mesh.getVerticesData(VertexBuffer.PositionKind)).toEqual(
    positions,
  );
  field.update(new Vector3(NaN, 0, 0));
  expect(field.mesh.position.asArray()).toEqual([1e12, 99, -1e12]);
  root.setEnabled(false);
  expect(field.mesh.isEnabled()).toBe(false);
  root.setEnabled(true);
  expect(field.mesh.isEnabled()).toBe(true);
  expect(field.mesh.isPickable).toBe(false);
  expect(field.mesh.material!.disableDepthWrite).toBe(true);
  field.dispose();
  field.dispose();
  field.update(Vector3.Zero());
  expect(scene.meshes).toHaveLength(0);
  expect(scene.materials).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});
