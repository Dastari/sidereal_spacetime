import { expect, test } from "vitest";
import {
  NullEngine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Camera,
  Matrix,
  Viewport,
} from "@babylonjs/core";
import { cameraAlpha } from "./camera";
test("top-down camera projects north up and keeps cabin bow left as the ship turns", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new ArcRotateCamera(
    "test",
    0,
    0.015,
    70,
    Vector3.Zero(),
    scene,
  );
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -20;
  camera.orthoRight = 20;
  camera.orthoTop = 20;
  camera.orthoBottom = -20;
  try {
    for (const heading of [0, 0.6, 1.7])
      for (const interior of [false, true]) {
        camera.alpha = cameraAlpha(heading, interior);
        scene.render();
        const bow = Vector3.Project(
          new Vector3(0, 0, -6),
          Matrix.RotationY(interior ? heading : 0),
          scene.getTransformMatrix(),
          new Viewport(0, 0, 1000, 1000),
        );
        if (interior) {
          expect(bow.x).toBeLessThan(500);
          expect(bow.y).toBeCloseTo(500, 3);
        } else {
          expect(bow.y).toBeLessThan(500);
          expect(bow.x).toBeCloseTo(500, 3);
        }
      }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
