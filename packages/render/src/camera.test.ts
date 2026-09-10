import { expect, test } from "vitest";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
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
  deckCameraActorWeight,
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

test("Deck close framing converges to the actor while normal overview remains unchanged", () => {
  expect(deckCameraActorWeight(2)).toBe(1);
  expect(deckCameraActorWeight(12)).toBe(0.6);
  expect(deckCameraActorWeight(55)).toBe(0.6);
  expect(deckCameraActorWeight(7)).toBeCloseTo(0.8);
  expect(deckCameraActorWeight(6, 6)).toBe(0.6);
  expect(deckCameraActorWeight(2, 6)).toBe(1);
  let previous = 1;
  for (let half = 2; half <= 12; half += 0.01) {
    const weight = deckCameraActorWeight(half);
    expect(weight).toBeLessThanOrEqual(previous);
    expect(weight).toBeGreaterThanOrEqual(0.6);
    previous = weight;
  }
  expect(deckCameraActorWeight(2 + 0.001)).toBeCloseTo(1, 7);
  expect(deckCameraActorWeight(12 - 0.001)).toBeCloseTo(0.6, 7);
});

test("valid native cockpit approach can leave the close viewport under fixed overview targeting", () => {
  // Current canonical Wayfarer deck bounds are [-5,-9]..[5,13] m. These two
  // central approach points pass the actual native collision/threshold tests.
  // No wall mesh is present: this proves framing, not ordinary depth occlusion.
  const document = JSON.parse(WAYFARER_STARTER.documentJson) as {
    layout: { tiles: { vertices: [number, number][] }[] };
  };
  const vertices = document.layout.tiles.flatMap((tile) => tile.vertices);
  const center = [0, 1].map(
    (axis) =>
      (Math.min(...vertices.map((point) => point[axis])) +
        Math.max(...vertices.map((point) => point[axis]))) /
      64,
  );
  expect(center).toEqual([0, 2]);
  const evidence: { before: Vector3[]; after: Vector3[] }[] = [];
  for (const [width, height] of [
    [1600, 900],
    [1600, 1000],
    [900, 1600],
    [2744, 986],
  ]) {
    // NullEngine.setSize does not change its backing dimensions. A fresh engine
    // is necessary to test the real aspect-dependent Babylon projection.
    const engine = new NullEngine({
      renderWidth: width,
      renderHeight: height,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    });
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const camera = new ArcRotateCamera(
      "close-deck",
      0,
      RPG_BETA,
      1,
      Vector3.Zero(),
      scene,
    );
    camera.fov = 0.5;
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    try {
      expect(engine.getAspectRatio(camera)).toBeCloseTo(width / height);
      for (const north of [8.8, 9.35])
        for (const half of [2, 4, 7, 12])
          for (const heading of [0, 0.6, 2.9])
            for (const orbit of [0, 0.45, Math.PI / 2, Math.PI, -Math.PI / 2]) {
              const elevation = north === 8.8 ? 0.21875 : 0.1875;
              camera.alpha = cameraAlpha(heading, true, orbit);
              camera.beta = RPG_BETA;
              camera.radius = half / Math.tan(camera.fov / 2);
              camera.minZ = Math.max(0.1, camera.radius * 0.02);
              camera.maxZ = Math.max(1600, camera.radius + 1600);
              const project = (weight: number) => {
                const y = center[1] * (1 - weight) + north * weight;
                camera.target.set(
                  -y * Math.sin(heading),
                  elevation + 0.8,
                  -y * Math.cos(heading),
                );
                camera.getViewMatrix(true);
                scene.updateTransformMatrix(true);
                return [0, 0.9, 1.8].map((heightM) =>
                  Vector3.Project(
                    new Vector3(0, elevation + heightM, -north),
                    Matrix.RotationY(heading),
                    scene.getTransformMatrix(),
                    new Viewport(0, 0, 1, 1),
                  ),
                );
              };
              const before = project(0.6),
                after = project(deckCameraActorWeight(half));
              for (const point of after) {
                expect(point.x).toBeGreaterThan(0);
                expect(point.x).toBeLessThan(1);
                expect(point.y).toBeGreaterThan(0);
                expect(point.y).toBeLessThan(1);
                expect(point.z).toBeGreaterThan(0);
                expect(point.z).toBeLessThan(1);
              }
              evidence.push({ before, after });
            }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
  expect(
    evidence.some(({ before }) =>
      before.every((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1),
    ),
  ).toBe(true);
});
