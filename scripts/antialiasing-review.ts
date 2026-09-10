/** Opt-in browser-only GPU fixture. No account, world connection or authority. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createAntialiasing } from "../packages/render/src/antialiasing-pipeline";
import { CanvasUI } from "../packages/canvas-ui/src/toolkit";
import { drawAntialiasingMenu } from "../packages/canvas-ui/src/antialiasing-menu";
export function createAntialiasingReview(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.015, 0.025, 0.045, 1);
  const camera = new ArcRotateCamera(
    "aa-camera",
    -0.9,
    1.05,
    12,
    new Vector3(0, 0, 0),
    scene,
  );
  const material = new StandardMaterial("aa-white", scene);
  material.disableLighting = true;
  material.emissiveColor = new Color3(0.9, 0.95, 1);
  const rods = [];
  for (let i = 0; i < 12; i++) {
    const rod = MeshBuilder.CreateBox(
      "edge-" + i,
      { width: 0.035, height: 4, depth: 0.035 },
      scene,
    );
    rod.position.x = -3 + i * 0.45;
    rod.rotation.z = i * 0.08;
    rod.material = material;
    rods.push(rod);
  }
  const moving = MeshBuilder.CreateSphere(
    "moving",
    { diameter: 0.7, segments: 24 },
    scene,
  );
  moving.material = material;
  moving.position.z = -1;
  moving.position.y = -2.6;
  const aa = createAntialiasing(scene, camera, {
    temporalResetIntegrated: true,
  });
  const ui = new CanvasUI(canvas, scene);
  ui.draw = () =>
    drawAntialiasingMenu(
      ui,
      { x: 20, y: 20, w: 280, h: 340 },
      {
        state: aa.snapshot(),
        set(patch) {
          aa.set(patch);
          ui.invalidate();
        },
      },
    );
  const frame = (time = 0) => {
    moving.position.x = Math.sin(time) * 2;
    ui.invalidate();
    scene.render();
  };
  return {
    scene,
    engine,
    camera,
    aa,
    moving,
    frame,
    screenPoint() {
      return Vector3.Project(
        moving.position,
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(
          engine.getRenderWidth(),
          engine.getRenderHeight(),
        ),
      );
    },
    capture() {
      return {
        ...aa.snapshot(),
        hardwareScale: engine.getHardwareScalingLevel(),
        renderWidth: engine.getRenderWidth(),
        renderHeight: engine.getRenderHeight(),
        passes: camera._postProcesses.filter(Boolean).map((p) => ({
          name: p!.name,
          samples: p!.samples,
          width: p!.width,
          height: p!.height,
        })),
        materials: scene.materials.length,
        postProcesses: scene.postProcesses.length,
      };
    },
    dispose() {
      ui.dispose();
      aa.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
