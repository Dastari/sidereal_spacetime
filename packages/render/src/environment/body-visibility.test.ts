import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import {
  bodyWithinRenderRange,
  setBodyRenderEnabled,
  updateBodyRangePlane,
} from "./body-visibility";

test("range admission keeps intersecting envelopes and restores the same cached body", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  camera.maxZ = 100;
  camera.minZ = 0.1;
  const far = updateBodyRangePlane(camera, new Plane(0, 0, 1, 0));
  expect(bodyWithinRenderRange(new Vector3(0, 0, 105), 1, 4, far)).toBe(true);
  expect(bodyWithinRenderRange(new Vector3(0, 0, 120), 1, 4, far)).toBe(false);
  // A radial-distance test would wrongly exclude off-axis geometry in front of the far plane.
  expect(bodyWithinRenderRange(new Vector3(80, 0, 90), 1, 4, far)).toBe(true);
  expect(bodyWithinRenderRange(new Vector3(0, 0, 50), 1, 0.01, far)).toBe(
    false,
  );
  const body = CreateSphere("cached body", {}, scene);
  body.metadata = { role: "planet", bodyId: "body-a" };
  const geometry = body.geometry,
    set = vi.spyOn(body, "setEnabled");
  setBodyRenderEnabled(body, false);
  setBodyRenderEnabled(body, false);
  expect(set).toHaveBeenCalledTimes(1);
  expect(body.isEnabled()).toBe(false);
  setBodyRenderEnabled(body, true);
  expect(body.isEnabled()).toBe(true);
  expect(body.geometry).toBe(geometry);
  expect(body.metadata.bodyId).toBe("body-a");
  scene.dispose();
  engine.dispose();
});
