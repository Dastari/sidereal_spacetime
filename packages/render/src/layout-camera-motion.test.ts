import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { configureLayoutCameraMotion } from "./layout-camera-motion";

const engines: NullEngine[] = [];
afterEach(() => engines.splice(0).forEach((e) => e.dispose()));

function cameraAt(frameMs: number) {
  const engine = new NullEngine();
  engines.push(engine);
  engine.getDeltaTime = () => frameMs;
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera("test", 0, 1, 40, Vector3.Zero(), scene);
  configureLayoutCameraMotion(camera);
  return camera;
}

describe("layout editor direct camera motion", () => {
  it.each([1000 / 144, 1000 / 60, 40, 200])(
    "consumes orbit, pan and zoom immediately without coasting at %s ms",
    (frameMs) => {
      const camera = cameraAt(frameMs), movement = camera.movement;
      // The same deltas supplied by Babylon's pointer/wheel input adapters.
      movement.rotationAccumulatedPixels.set(80 / camera.angularSensibilityX, 30 / camera.angularSensibilityY, 0);
      movement.panAccumulatedPixels.set(20 / camera.panningSensibility, 10 / camera.panningSensibility, 0);
      movement.zoomAccumulatedPixels = 120 / (camera.wheelPrecision * 40);
      movement.computeCurrentFrameDeltas();
      expect(movement.rotationDeltaCurrentFrame.x).toBeCloseTo(0.8, 12);
      expect(movement.rotationDeltaCurrentFrame.y).toBeCloseTo(0.3, 12);
      expect(movement.panDeltaCurrentFrame.x).toBeCloseTo(0.2, 12);
      expect(movement.zoomDeltaCurrentFrame).toBeCloseTo(2.5, 12);
      for (let frame = 0; frame < 30; frame++) {
        movement.computeCurrentFrameDeltas();
        expect(movement.rotationDeltaCurrentFrame.lengthSquared()).toBe(0);
        expect(movement.panDeltaCurrentFrame.lengthSquared()).toBe(0);
        expect(movement.zoomDeltaCurrentFrame).toBe(0);
      }
    },
  );

  it("equal pointer steps have equal travel and reverse immediately", () => {
    const { movement } = cameraAt(1000 / 60);
    for (const pixels of [10, 10, 10, -10, -10, 10]) {
      movement.rotationAccumulatedPixels.x = pixels / 100;
      movement.computeCurrentFrameDeltas();
      expect(movement.rotationDeltaCurrentFrame.x).toBeCloseTo(pixels / 100, 12);
    }
  });
});
