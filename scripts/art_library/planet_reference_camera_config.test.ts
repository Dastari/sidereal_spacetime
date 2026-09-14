import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { referenceInitialRadius } from "./planet_reference_camera_config";

test("cold approach camera starts far without changing the normal review camera", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new ArcRotateCamera("cold approach", 1, 1,
    referenceInitialRadius(new URLSearchParams("initialRadius=71")), Vector3.Zero(), scene);
  expect(camera.radius).toBe(71);
  expect(referenceInitialRadius(new URLSearchParams())).toBe(4.7);
  for (const value of ["", "0", "NaN", "Infinity", "1001"])
    expect(() => referenceInitialRadius(new URLSearchParams({ initialRadius: value }))).toThrow();
  scene.dispose(); engine.dispose();
});
