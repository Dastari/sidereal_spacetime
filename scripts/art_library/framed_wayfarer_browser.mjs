import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { loadConstructionInstance } from "../../packages/render/src/construction-instance";
import { createFlightEffects } from "../../packages/render/src/flight-effects";
import { LAB_FLIGHT_ACTUATORS } from "../../packages/content/src/flight";
const engine = new Engine(document.querySelector("canvas"), true, {
  preserveDrawingBuffer: true,
});
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.022, 0.036, 0.058, 1);
scene.environmentTexture = new HDRCubeTexture(
  "/assets/materials/frontier-workshop.hdr",
  scene,
  128,
  false,
  true,
  false,
  true,
);
scene.environmentIntensity = 0.7;
scene.imageProcessingConfiguration.exposure = 1;
const camera = new ArcRotateCamera(
  "review",
  -0.8,
  0.95,
  40,
  new Vector3(0, 1, 0),
  scene,
);
camera.mode = 1;
camera.minZ = 0.1;
camera.maxZ = 200;
camera.attachControl(engine.getRenderingCanvas(), true);
const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.65;
hemi.groundColor = new Color3(0.15, 0.18, 0.25);
const key = new DirectionalLight("key", new Vector3(-0.7, -1, 0.3), scene);
key.intensity = 2;
const root = new TransformNode("ship", scene);
const fixture = await (await fetch("/__framed-review/document.json")).json();
const assembled = await loadConstructionInstance(scene, root, fixture);
const effect = createFlightEffects(scene, root);
const instruments = new SceneInstrumentation(scene);
instruments.captureFrameTime = true;
instruments.captureRenderTime = true;
new EngineInstrumentation(engine);
function viewport(span) {
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  camera.orthoTop = span / 2;
  camera.orthoBottom = -span / 2;
  camera.orthoLeft = (-span / 2) * aspect;
  camera.orthoRight = (span / 2) * aspect;
}
function metrics() {
  return {
    meshes: scene.meshes.length,
    activeMeshes: scene.getActiveMeshes().length,
    draws: engine._drawCalls.current,
    renderMs: instruments.renderTimeCounter.current,
    frameMs: instruments.frameTimeCounter.current,
    triangles: scene.getActiveIndices() / 3,
  };
}
async function view(name, throttle = 0) {
  const views = {
    front: [-0.8, 0.94, 0, 1, -1, 28],
    rear: [0.82, 1.05, 0, 1, 4, 29],
    bow: [-1.18, 1.08, 0, 1, -8, 12],
    engines: [0.95, 1.13, 0, 1, 12, 14],
    side: [-0.05, 1.2, 5, 1, 0, 24],
    top: [-0.8, 0.025, 0, 0, 0, 30],
  };
  const v = views[name];
  camera.alpha = v[0];
  camera.beta = v[1];
  camera.target.set(v[2], v[3], v[4]);
  viewport(v[5]);
  effect.update(
    LAB_FLIGHT_ACTUATORS.filter((a) => a.id.startsWith("drives-main")).map(
      (a) => ({ actuatorId: a.id, throttle }),
    ),
    true,
  );
  assembled.setView?.(camera.position, true);
  await scene.whenReadyAsync();
  for (let i = 0; i < 2; i++) {
    engine.beginFrame();
    scene.render();
    engine.endFrame();
  }
  return metrics();
}
async function benchmark() {
  const samples = [];
  for (let i = 0; i < 15; i++) {
    engine.beginFrame();
    scene.render();
    engine.endFrame();
    if (i >= 5) samples.push(metrics());
    await new Promise((r) => setTimeout(r, 0));
  }
  const median = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[5];
  return {
    frames: samples.length,
    draws: median("draws"),
    triangles: median("triangles"),
    renderMs: median("renderMs"),
    frameMs: median("frameMs"),
  };
}
window.review = {
  scene,
  engine,
  camera,
  root,
  assembled,
  effect,
  view,
  metrics,
  benchmark,
  fixture,
  ready: true,
};
await view("front");
// Review renders only on explicit state changes; no background GPU workload.
window.addEventListener("resize", () => engine.resize());
