import { it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createDistantStar } from "./distant-star";
it("keeps unresolved stellar light on its camera ray inside far clipping without moving authored coordinates", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(12, 8, 9), scene);
  scene.activeCamera = camera;
  camera.maxZ = 1600;
  const position = new Vector3(15e6, -160, 0),
    before = position.clone();
  const star = createDistantStar(scene, "star");
  try {
    star.update(position, camera.position, 0.001);
    expect(star.mesh.isEnabled()).toBe(true);
    expect(Vector3.Distance(star.mesh.position, camera.position)).toBeCloseTo(
      1360,
    );
    expect(
      Vector3.Dot(
        star.mesh.position.subtract(camera.position).normalize(),
        position.subtract(camera.position).normalize(),
      ),
    ).toBeCloseTo(1);
    expect(position.equals(before)).toBe(true);
    expect(star.mesh.metadata.partId).toBe("star:distant-light");
    star.update(position, camera.position, 3);
    expect(star.mesh.isEnabled()).toBe(false);
  } finally {
    star.dispose();
    scene.dispose();
    engine.dispose();
  }
});
