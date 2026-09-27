import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Material } from "@babylonjs/core/Materials/material";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import {
  createLayoutFloorSlabs,
  floorSlabGeometry,
} from "./layout-floor-slabs";
import type { Point } from "@sidereal/content/ship-layout";

function volume(data: ReturnType<typeof floorSlabGeometry>) {
  const p = Array.from(data.positions!),
    ix = Array.from(data.indices!);
  let sum = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = p.slice(ix[i] * 3, ix[i] * 3 + 3),
      b = p.slice(ix[i + 1] * 3, ix[i + 1] * 3 + 3),
      c = p.slice(ix[i + 2] * 3, ix[i + 2] * 3 + 3);
    sum +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return sum;
}

/** Ray-test only the triangle faces the GPU's configured culling would draw. */
function visibleSurfaceDistance(mesh: Mesh, ray: Ray) {
  const vertices = mesh.getVerticesData("position")!,
    indices = mesh.getIndices()!;
  const orientation = mesh.material!.sideOrientation ?? mesh.sideOrientation;
  let distance = Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((offset) =>
      Vector3.FromArray(vertices, indices[i + offset] * 3),
    );
    const facing = Vector3.Dot(
      Vector3.Cross(b.subtract(a), c.subtract(a)),
      ray.direction,
    );
    const front =
      orientation === Material.CounterClockWiseSideOrientation
        ? facing < 0
        : facing > 0;
    if (mesh.material!.backFaceCulling && !front) continue;
    const hit = ray.intersectsTriangle(a, b, c);
    if (hit) distance = Math.min(distance, hit.distance);
  }
  return distance;
}
describe("shape independent floor slabs", () => {
  it("closes a concave floor with correct volume, outward normals and datum in both windings", () => {
    const polygon: Point[] = [
      [0, 0],
      [96, 0],
      [96, 32],
      [32, 32],
      [32, 96],
      [0, 96],
    ];
    for (const p of [polygon, [...polygon].reverse()]) {
      const data = floorSlabGeometry(p, 3.5),
        positions = Array.from(data.positions!),
        normals = Array.from(data.normals!);
      expect(volume(data)).toBeCloseTo(5 * 0.1875, 8);
      expect(Math.min(...positions.filter((_, i) => i % 3 === 1))).toBe(3.5);
      expect(Math.max(...positions.filter((_, i) => i % 3 === 1))).toBe(3.6875);
      expect(normals[1]).toBe(1);
      expect(normals[10]).toBe(-1);
      // Every geometric edge is paired, despite flat-face vertex duplication.
      const edges = new Map<string, number>(),
        indices = Array.from(data.indices!);
      for (let i = 0; i < indices.length; i += 3)
        for (let j = 0; j < 3; j++) {
          const a = positions
              .slice(indices[i + j] * 3, indices[i + j] * 3 + 3)
              .join(","),
            b = positions
              .slice(
                indices[i + ((j + 1) % 3)] * 3,
                indices[i + ((j + 1) % 3)] * 3 + 3,
              )
              .join(",");
          const k = [a, b].sort().join("|");
          edges.set(k, (edges.get(k) ?? 0) + 1);
        }
      expect([...edges.values()].every((n) => n === 2)).toBe(true);
    }
  });
  it("uses world aligned UVs for arbitrary diagonal shapes and rejects only malformed individual polygons", () => {
    const p: Point[] = [
      [-32, 0],
      [96, 0],
      [53, 67],
    ];
    const data = floorSlabGeometry(p);
    expect(volume(data)).toBeCloseTo(((128 * 67) / 2048) * 0.1875, 8);
    const positions = Array.from(data.positions!),
      uvs = Array.from(data.uvs!);
    for (let i = 0; i < 6; i++) {
      expect(uvs[i * 2]).toBe(positions[i * 3] / 2);
      expect(uvs[i * 2 + 1]).toBe(-positions[i * 3 + 2] / 2);
    }
    expect(() =>
      floorSlabGeometry([
        [0, 0],
        [64, 64],
        [0, 64],
        [64, 0],
      ]),
    ).toThrow();
    expect(() =>
      floorSlabGeometry([
        [0, 0],
        [32, 0],
        [64, 0],
      ]),
    ).toThrow();
    expect(() =>
      floorSlabGeometry([
        [0, 0],
        [0, 0],
        [32, 32],
      ]),
    ).toThrow();
  });
});

it("retains disconnected floors, shares finish, switches deck/visibility, and disposes removed geometry", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const view = createLayoutFloorSlabs(scene),
    doc = emptyLayout("slabs", "main");
  doc.tiles = [
    stampTile("one", "main", "rectangle", [0, 0]),
    stampTile("two", "main", "triangle", [320, 320]),
  ];
  try {
    expect(view.update({ document: doc, deckId: "main" }, true)).toEqual([]);
    expect(view.meshes).toHaveLength(2);
    const [one, two] = view.meshes;
    expect(one.material).toBe(two.material);
    // A closed polygon alone is insufficient: a reversed renderer cull mode
    // shows the bottom from above, producing the reported dark open tray.
    expect(one.material!.backFaceCulling).toBe(true);
    expect(
      visibleSurfaceDistance(
        one,
        new Ray(new Vector3(1, 10, -1), new Vector3(0, -1, 0)),
      ),
    ).toBeCloseTo(10 - 0.1875, 8);
    expect(
      visibleSurfaceDistance(
        one,
        new Ray(new Vector3(1, -10, -1), new Vector3(0, 1, 0)),
      ),
    ).toBeCloseTo(10, 8);
    view.update({ document: doc, deckId: "main" }, false, [10, 2, -6]);
    expect(view.meshes[0]).toBe(one);
    expect(one.isEnabled()).toBe(false);
    expect(one.position.asArray()).toEqual([-10, -2, 6]);
    doc.tiles = [doc.tiles[1]];
    view.update({ document: doc, deckId: "main" }, true);
    expect(one.isDisposed()).toBe(true);
    expect(view.meshes).toEqual([two]);
    view.update({ document: doc, deckId: "missing" }, true);
    expect(view.meshes).toHaveLength(0);
    expect(two.isDisposed()).toBe(true);
    expect(
      scene.materials.filter((m) => m.name.startsWith("floor-finish")),
    ).toHaveLength(0);
  } finally {
    view.dispose();
    scene.dispose();
    engine.dispose();
  }
});
