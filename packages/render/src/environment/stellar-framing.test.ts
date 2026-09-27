import { expect, it } from "vitest";
import {
  NullEngine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Matrix,
  Viewport,
} from "@babylonjs/core";
import { createObservationCamera } from "../camera";
import {
  REVIEWED_YELLOW_STAR,
  celestialObservationRadius,
} from "./reviewed-star-catalog";

it.each([
  [1574, 907],
  [700, 1000],
])(
  "fits the enlarged stellar corona in Observe at %s by %s without changing body state",
  (width, height) => {
    const engine = new NullEngine({
      renderWidth: width,
      renderHeight: height,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    });
    const scene = new Scene(engine);
    try {
      const body = { appearance: REVIEWED_YELLOW_STAR.id, radius: 72 },
        before = { ...body };
      const frame = createObservationCamera().frame(
        celestialObservationRadius(body, width / height),
        0,
      );
      const center = new Vector3(0, -160, 0);
      const camera = new ArcRotateCamera(
        "observe",
        frame.alpha,
        frame.beta,
        frame.radius,
        center,
        scene,
      );
      camera.fov = 0.5;
      scene.activeCamera = camera;
      scene.updateTransformMatrix();
      const viewport = new Viewport(0, 0, width, height);
      for (const axis of [Vector3.Right(), Vector3.Up()])
        for (const sign of [-1, 1]) {
          const edge = center.add(
            camera
              .getDirection(axis)
              .scale(
                sign * body.radius * REVIEWED_YELLOW_STAR.visualRadiusScale,
              ),
          );
          const pixel = Vector3.Project(
            edge,
            Matrix.Identity(),
            scene.getTransformMatrix(),
            viewport,
          );
          expect(pixel.x).toBeGreaterThan(0);
          expect(pixel.x).toBeLessThan(width);
          expect(pixel.y).toBeGreaterThan(0);
          expect(pixel.y).toBeLessThan(height);
        }
      expect(body).toEqual(before);
      expect(
        celestialObservationRadius(
          { appearance: "temperate", radius: 36 },
          width / height,
        ),
      ).toBe(36);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  },
);
