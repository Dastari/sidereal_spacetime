import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { CreatePickingRay } from "@babylonjs/core/Culling/ray.core";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { layoutPickingCoordinates } from "./layout-picking-coordinates";
class ScaledNullEngine extends NullEngine {
  constructor(private scale: number) {
    super({
      renderWidth: 900,
      renderHeight: 620,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    });
  }
  override getHardwareScalingLevel() {
    return this.scale ?? 1;
  }
}
describe("editor pointer to Babylon picking coordinates", () => {
  for (const scale of [0.5, 1, 4 / 3, 2])
    for (const orthographic of [false, true])
      it(`roundtrips native points at scale ${scale}, ${orthographic ? "orthographic" : "perspective"}`, () => {
        const engine = new ScaledNullEngine(scale),
          scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const height = 3.1875;
        const camera = new ArcRotateCamera(
          "editor",
          Math.PI / 2,
          0.03,
          25,
          new Vector3(2, height, -3),
          scene,
        );
        camera.minZ = 0.02;
        camera.maxZ = 2000;
        camera.fov = 0.65;
        if (orthographic) {
          camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
          camera.orthoLeft = -12;
          camera.orthoRight = 12;
          camera.orthoTop = 8;
          camera.orthoBottom = -8;
        }
        const rect = { left: 143.5, top: 87.25, width: 1170, height: 806 };
        try {
          for (const [alpha, beta] of [
            [Math.PI / 2, 0.03],
            [-0.7, 1],
            [2.2, 1.25],
          ])
            for (const viewport of [
              new Viewport(0, 0, 1, 1),
              new Viewport(0.15, 0.2, 0.7, 0.6),
            ]) {
              camera.alpha = alpha;
              camera.beta = beta;
              camera.viewport = viewport;
              const global = viewport.toGlobal(
                engine.getRenderWidth(),
                engine.getRenderHeight(),
              );
              const screenViewport = new Viewport(
                global.x,
                engine.getRenderHeight() - global.y - global.height,
                global.width,
                global.height,
              );
              const transform = camera
                .getViewMatrix(true)
                .multiply(camera.getProjectionMatrix(true));
              for (const point of [
                new Vector3(0, height, -1),
                new Vector3(3, height, -4),
                new Vector3(-2, height, -5),
              ]) {
                const projected = Vector3.Project(
                  point,
                  Matrix.Identity(),
                  transform,
                  screenViewport,
                );
                const x =
                  rect.left +
                  (projected.x / engine.getRenderWidth()) * rect.width;
                const y =
                  rect.top +
                  (projected.y / engine.getRenderHeight()) * rect.height;
                const [pickX, pickY] = layoutPickingCoordinates(
                  x,
                  y,
                  rect,
                  engine.getRenderWidth(),
                  engine.getRenderHeight(),
                  engine.getHardwareScalingLevel(),
                )!;
                const ray = CreatePickingRay(
                  scene,
                  pickX,
                  pickY,
                  Matrix.Identity(),
                  camera,
                );
                const distance = ray.intersectsPlane(
                  new Plane(0, 1, 0, -height),
                );
                expect(distance).not.toBeNull();
                const actual = ray.origin.add(ray.direction.scale(distance!));
                // Float32 near/far unprojection loses millimetres; stay well below
                // the finest1/32m placement step while testing the actual API.
                expect(Vector3.Distance(actual, point)).toBeLessThan(0.005);
                if (scale !== 1) {
                  // Regression: framebuffer-only conversion is scaled a second
                  // time inside Babylon and misses the intended deck coordinate.
                  const oldRay = CreatePickingRay(
                    scene,
                    pickX / scale,
                    pickY / scale,
                    Matrix.Identity(),
                    camera,
                  );
                  const oldDistance = oldRay.intersectsPlane(
                    new Plane(0, 1, 0, -height),
                  );
                  const oldError =
                    oldDistance === null
                      ? Infinity
                      : Vector3.Distance(
                          oldRay.origin.add(
                            oldRay.direction.scale(oldDistance),
                          ),
                          point,
                        );
                  expect(oldError).toBeGreaterThan(0.01);
                }
              }
            }
        } finally {
          scene.dispose();
          engine.dispose();
        }
      });
  it("rejects hidden or invalid surfaces without clamping valid out-of-canvas pointer coordinates", () => {
    const rect = { left: 20, top: 40, width: 100, height: 50 };
    expect(layoutPickingCoordinates(10, 30, rect, 200, 100, 2)).toEqual([
      -40, -40,
    ]);
    expect(
      layoutPickingCoordinates(10, 30, { ...rect, width: 0 }, 200, 100, 2),
    ).toBeUndefined();
    expect(
      layoutPickingCoordinates(10, 30, rect, 200, 100, NaN),
    ).toBeUndefined();
    expect(layoutPickingCoordinates(10, 30, rect, 0, 100, 2)).toBeUndefined();
  });
});
