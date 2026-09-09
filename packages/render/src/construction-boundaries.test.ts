import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { loadConstructionBoundaries } from "./construction-boundaries";
const bytes = readFileSync(
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001/kit.glb",
);
afterEach(() => vi.unstubAllGlobals());
function bounds(meshes: any[]) {
  const points = meshes.flatMap((m) => {
    m.computeWorldMatrix(true);
    return m.getBoundingInfo().boundingBox.vectorsWorld as Vector3[];
  });
  return {
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p.asArray()[i]))),
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p.asArray()[i]))),
  };
}
test("actual native primitives preserve hinge bind transforms, complete aperture and authored deck datum", async () => {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }));
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const parent = new TransformNode("instance-one", scene),
      result = await loadConstructionBoundaries(scene, parent, [
        {
          key: "wall",
          partId: "wall-2m",
          origin: [0, 0, 128],
          quarterTurns: 0,
          cutawayNormals: [[0, -1]],
        },
        {
          key: "frame",
          partId: "door-frame-2m",
          origin: [64, 0, 128],
          quarterTurns: 0,
          openingId: "opening",
        },
        {
          key: "leaf",
          partId: "door-leaf",
          origin: [64, 0, 128],
          quarterTurns: 0,
          openingId: "opening",
        },
      ]);
    expect(result.placements).toHaveLength(3);
    const wall = bounds(result.placements[0].meshes);
    expect(wall.min[1]).toBeCloseTo(4.1875);
    expect(wall.max[1]).toBeCloseTo(7);
    const closed = bounds(result.placements[2].meshes);
    expect(closed.min[0]).toBeCloseTo(2.3125);
    expect(closed.max[0]).toBeCloseTo(3.623);
    expect(closed.min[1]).toBeCloseTo(4.1895);
    result.setDoors([{ openingId: "opening", fraction: 1 }]);
    const open = bounds(result.placements[2].meshes);
    expect(open.max[0]).toBeCloseTo(2.375);
    expect(open.min[1]).toBeCloseTo(closed.min[1]);
    expect(open.max[2]).toBeCloseTo(1.373);
    expect(
      new Set(result.placements.map((p) => p.node.metadata.partId)).size,
    ).toBe(3);
    expect(
      result.meshes.every(
        (m) =>
          m.material !== null &&
          m.getVerticesData("normal") !== null &&
          m.getVerticesData("tangent") !== null,
      ),
    ).toBe(true);
    expect(scene.lights).toHaveLength(0);
    result.setView(new Vector3(1, 10, 10), true);
    expect(result.placements[0].node.isEnabled()).toBe(false);
    expect(result.placements[1].node.isEnabled()).toBe(true);
    result.setView(new Vector3(1, 10, -10), true);
    expect(result.placements[0].node.isEnabled()).toBe(true);
    result.setView(new Vector3(1, 10, 10), false);
    expect(result.placements[0].node.isEnabled()).toBe(true);
    result.setDoors([]);
    expect(bounds(result.placements[2].meshes).max[0]).toBeCloseTo(
      closed.max[0],
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
}, 15000);
test("mismatched native bytes fail before loading or creating placements", async () => {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }));
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    await expect(
      loadConstructionBoundaries(
        scene,
        new TransformNode("instance", scene),
        [],
      ),
    ).rejects.toThrow("hash mismatch");
    expect(scene.meshes).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
