import { it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Constants } from "@babylonjs/core/Engines/constants";
import { createStellarCorona } from "./stellar-corona";

it("animates one owned additive corona without geometry churn or disabling occlusion", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const corona = createStellarCorona(scene, "helion");
    const geometry = corona.mesh.geometry;
    for (let frame = 0; frame < 120; frame++) corona.update(frame / 60);
    expect(scene.meshes).toHaveLength(1);
    expect(corona.mesh.geometry).toBe(geometry);
    expect(corona.material.disableDepthWrite).toBe(true);
    expect(corona.material.depthFunction).not.toBe(Constants.ALWAYS);
    expect(corona.mesh.metadata).toMatchObject({
      role: "effect",
      bodyId: "helion",
      partId: "helion:corona",
    });
    corona.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).not.toContain(corona.material);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
