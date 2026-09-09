import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  achievedThrottle,
  exhaustMount,
  createFlightEffects,
} from "./flight-effects";
import { LAB_FLIGHT_ACTUATORS } from "../../content/src/flight";

test("exhaust uses physical nozzle mounts and points opposite achieved force", () => {
  for (const device of LAB_FLIGHT_ACTUATORS) {
    const mount = exhaustMount(device);
    expect(mount.x).toBe(device.x);
    expect(mount.y).toBe(device.height);
    expect(mount.z).toBe(-device.y);
    // Convert exhaust back to authoritative XY and dot with force XY.
    expect(
      mount.directionX * -Math.sin(device.rotation) -
        mount.directionZ * Math.cos(device.rotation),
    ).toBeCloseTo(-1);
  }
});
test("missing and invalid telemetry cannot light a nozzle", () => {
  expect(achievedThrottle([], "a")).toBe(0);
  expect(achievedThrottle([{ actuatorId: "a", throttle: NaN }], "a")).toBe(0);
  expect(achievedThrottle([{ actuatorId: "a", throttle: 5 }], "a")).toBe(1);
  expect(achievedThrottle([{ actuatorId: "a", throttle: -1 }], "a")).toBe(0);
});
test("nine effects use only achieved outputs, clear immediately and add no lights", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    ship = new TransformNode("ship", scene);
  const effects = createFlightEffects(scene, ship);
  expect(effects.meshes).toHaveLength(27);
  expect(scene.lights).toHaveLength(0);
  expect(effects.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
  effects.update([{ actuatorId: "drives-retro-1", throttle: 0.5 }], true);
  expect(effects.meshes.filter((mesh) => mesh.isEnabled())).toHaveLength(3);
  expect(
    effects.meshes
      .filter((mesh) => mesh.isEnabled())
      .every((mesh) => mesh.name.includes("drives-retro-1")),
  ).toBe(true);
  effects.update([]);
  expect(effects.meshes.every((mesh) => !mesh.isEnabled())).toBe(true);
  effects.dispose();
  expect(scene.meshes).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});
