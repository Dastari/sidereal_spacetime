import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createDebugFeatures } from "./debug-features";
import { createDebugVisibilityRevision } from "./debug-visibility-revision";
test("scalar revisions preserve F3 suppression and restore for in-place power/identity/cabin changes", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    equipment = new TransformNode("fixture", scene);
  const debug = createDebugFeatures(scene, [equipment]),
    revision = createDebugVisibilityRevision();
  const lights = [{ placementId: "a", enabled: true }];
  const first = revision(true, lights);
  debug.beforeFrame(first);
  debug.toggle("equipment");
  debug.beforeFrame(revision(true, [...lights]));
  expect(equipment.isEnabled()).toBe(false);
  lights[0].enabled = false;
  debug.beforeFrame(revision(true, lights));
  expect(equipment.isEnabled()).toBe(true);
  debug.afterFrame();
  const power = revision(true, lights);
  lights[0].placementId = "b";
  expect(revision(true, lights)).toBeGreaterThan(power);
  const identity = revision(true, lights);
  expect(revision(false, lights)).toBeGreaterThan(identity);
  const cabin = revision(false, lights);
  expect(revision(false, [])).toBeGreaterThan(cabin);
  debug.dispose();
  scene.dispose();
  engine.dispose();
});
