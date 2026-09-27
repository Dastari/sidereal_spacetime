import { it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Culling/ray";
import { composeToxicReference } from "./toxic_reference_composition_r006";
it("records native source identity for the actual review camera without browser rendering", () => {
  const kit = JSON.parse(
      readFileSync(
        "output/playwright/planet-reference-20260914/toxic-r006/kit.json",
        "utf8",
      ),
    ),
    engine = new NullEngine({
      renderWidth: 900,
      renderHeight: 900,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    }),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const camera = new ArcRotateCamera(
      "review",
      Math.atan2(4.3, 2.45),
      Math.acos(2.1 / Math.hypot(2.45, 4.3, 2.1)),
      5.5,
      Vector3.Zero(),
      scene,
    );
    camera.fov = 0.52;
    camera.minZ = 0.01;
    for (const [i, b] of composeToxicReference(kit, 38, 0).entries()) {
      const mesh = new Mesh("native", scene);
      mesh.metadata = { role: "planet", materialRole: i, ranges: b.ranges };
      mesh.material = new PBRMaterial("native", scene);
      const data = new VertexData();
      Object.assign(data, b);
      data.applyToMesh(mesh);
    }
    scene.render();
    const picks = [
      [300, 450],
      [450, 450],
      [560, 400],
      [350, 330],
      [350, 600],
      [450, 650],
    ].map(([x, y]) => {
      const hit = scene.pick(x, y);
      return {
        x,
        y,
        partId: hit?.pickedMesh?.metadata.ranges.find(
          (r: { firstTriangle: number; triangleCount: number }) =>
            hit.faceId >= r.firstTriangle &&
            hit.faceId < r.firstTriangle + r.triangleCount,
        )?.partId,
        materialRole: hit?.pickedMesh?.metadata.materialRole,
        point: hit?.pickedPoint?.asArray(),
      };
    });
    mkdirSync("output/playwright/planet-reference-20260914/toxic-r007", {
      recursive: true,
    });
    writeFileSync(
      "output/playwright/planet-reference-20260914/toxic-r007/source-picks-before.json",
      JSON.stringify(picks, null, 2),
    );
    expect(picks.every((p) => p.partId)).toBe(true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
