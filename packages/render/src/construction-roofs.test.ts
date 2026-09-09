import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONSTRUCTION_ROOF_INTERFACES as kit } from "@sidereal/content/construction-roof";
import { loadConstructionRoofs } from "./construction-roofs";

const bytes = readFileSync(
  "assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001/kit.glb",
);
afterEach(() => vi.unstubAllGlobals());
function mockFetch() {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }));
}
test("all native roof groups preserve single-sided materials and exact underside/height", async () => {
  mockFetch();
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const parent = new TransformNode("roof-instance", scene);
    const result = await loadConstructionRoofs(
      scene,
      parent,
      kit.parts.map((p, i) => ({
        key: "roof:" + i,
        floorId: "floor:" + i,
        partId: p.id,
        origin: [i * 200, 0, 224],
        quarterTurns: 0,
      })),
    );
    expect(result.placements).toHaveLength(12);
    for (const [i, p] of result.placements.entries()) {
      const points = p.meshes.flatMap((m) => {
        m.computeWorldMatrix(true);
        return m.getBoundingInfo().boundingBox.vectorsWorld as Vector3[];
      });
      expect(Math.min(...points.map((v) => v.y))).toBeCloseTo(7);
      expect(Math.max(...points.map((v) => v.y))).toBeLessThanOrEqual(7.187501);
      expect(Math.min(...points.map((v) => v.x))).toBeCloseTo((i * 200) / 32);
      expect(
        p.meshes.every(
          (m) =>
            m.material?.backFaceCulling &&
            m.getVerticesData("normal") &&
            m.getVerticesData("tangent") &&
            m.getVerticesData("uv"),
        ),
      ).toBe(true);
      expect(p.meshes.some((m) => (m.material as any).bumpTexture)).toBe(true);
      expect(p.node.metadata.floorId).toBe("floor:" + i);
    }
    expect(
      new Set(result.placements.map((p) => p.node.metadata.partId)).size,
    ).toBe(12);
    expect(scene.lights).toHaveLength(0);
    result.setVisible(false);
    expect(result.placements.every((p) => !p.node.isEnabled())).toBe(true);
    result.setVisible(true);
    expect(result.placements.every((p) => p.node.isEnabled())).toBe(true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
test("native roof loader rejects changed bytes before importing geometry", async () => {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }));
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    await expect(
      loadConstructionRoofs(scene, new TransformNode("bad", scene), []),
    ).rejects.toThrow(/hash/);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
