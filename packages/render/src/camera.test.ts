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
import {
  cameraAlpha,
  screenToDeck,
  angleDelta,
  RPG_BETA,
  easeCameraZoom,
  createObservationCamera,
} from "./camera";
test("wheel zoom converges consistently across frame rates and reverses without overshoot", () => {
  const results = [30, 60, 144].map((fps) => {
    let zoom = 55;
    for (let frame = 0; frame < fps / 2; frame++)
      zoom = easeCameraZoom(zoom, 100, 1 / fps);
    return zoom;
  });
  for (const result of results) {
    expect(result).toBeCloseTo(results[0], 9);
    expect(result).toBeGreaterThan(99);
    expect(result).toBeLessThan(100);
    const reversed = easeCameraZoom(result, 18, 1 / 60);
    expect(reversed).toBeLessThan(result);
    expect(reversed).toBeGreaterThan(18);
  }
  expect(easeCameraZoom(55, 650, 0)).toBe(55);
  expect(easeCameraZoom(55, 650, 1 / 60)).toBeLessThan(200);
  expect(easeCameraZoom(55, 650, 10)).toBe(650);
});
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
  camera.mode = Camera.PERSPECTIVE_CAMERA;
  camera.fov = 0.5;
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
test("screen-relative walking follows an angled, orbiting camera at any ship heading", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new ArcRotateCamera(
    "rpg",
    0,
    RPG_BETA,
    70,
    Vector3.Zero(),
    scene,
  );
  camera.mode = Camera.PERSPECTIVE_CAMERA;
  camera.fov = 0.5;
  try {
    for (const heading of [0, 0.6, 2.9])
      for (const orbit of [0, 0.3, Math.PI / 2, Math.PI]) {
        camera.alpha = cameraAlpha(heading, true, orbit);
        scene.render();
        for (const [h, v] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ]) {
          const { dx, dy } = screenToDeck(h, v, camera.alpha, heading);
          expect(Math.hypot(dx, dy)).toBeCloseTo(1);
          const p = Vector3.Project(
            new Vector3(dx, 0, -dy),
            Matrix.RotationY(heading),
            scene.getTransformMatrix(),
            new Viewport(0, 0, 1000, 1000),
          );
          if (h) {
            expect((p.x - 500) * h).toBeGreaterThan(0);
            expect(p.y).toBeCloseTo(500, 3);
          } else {
            expect((500 - p.y) * v).toBeGreaterThan(0);
            expect(p.x).toBeCloseTo(500, 3);
          }
        }
      }
    expect(angleDelta(Math.PI - 0.01, -Math.PI + 0.01)).toBeCloseTo(0.02);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
test("diagonal walking remains inside server input limits after orbit rotation", () => {
  for (const alpha of [0, 0.4, Math.PI / 4, Math.PI, 5]) {
    const d = screenToDeck(1, 1, alpha, 0.3);
    expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(1);
    expect(Math.abs(d.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(d.dy)).toBeLessThanOrEqual(1);
  }
  expect(Math.PI / 2 - RPG_BETA).toBeCloseTo(0.61547970867);
});

test("Observe orbit and zoom are independent, bounded, and reset without ship camera state", () => {
  const observation = createObservationCamera();
  const initial = observation.frame(70, 0);
  expect(initial.radius).toBe(350);
  observation.drag(100, -10000);
  observation.wheel(-10000);
  const close = observation.frame(70, 1, true);
  expect(close.alpha).toBeCloseTo(initial.alpha - 0.7);
  expect(close.beta).toBeCloseTo(Math.PI - 0.12);
  expect(close.radius).toBeLessThan(initial.radius);
  for (let i = 0; i < 30; i++) observation.wheel(-300);
  expect(observation.frame(70, 1, true).radius).toBeCloseTo(112);
  for (let i = 0; i < 30; i++) observation.wheel(300);
  observation.drag(0, 10000);
  const far = observation.frame(70, 1, true);
  expect(far.radius).toBe(1680);
  expect(far.beta).toBe(0.12);
  const otherObserver = createObservationCamera();
  expect(otherObserver.frame(70, 0)).toEqual(initial);
  observation.reset();
  expect(observation.frame(70, 0)).toEqual(initial);
});

test("Observe wheel targets converge consistently and preserve orbit through smoothing", () => {
  const results = [30, 60, 144].map((fps) => {
    const observation = createObservationCamera();
    observation.drag(80, 20);
    observation.wheel(200);
    let frame = observation.frame(50, 0);
    for (let i = 0; i < fps; i++) frame = observation.frame(50, 1 / fps);
    expect(frame.alpha).toBeCloseTo(0.45 - 0.56);
    expect(frame.beta).toBeCloseTo(RPG_BETA - 0.1);
    return frame.radius;
  });
  expect(results[0]).toBeCloseTo(results[1], 8);
  expect(results[1]).toBeCloseTo(results[2], 8);
});
