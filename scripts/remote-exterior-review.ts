/** Isolated browser geometry/draw review of public stock exteriors, no game connection. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { loadRemoteShipPrototype } from "../packages/render/src/remote-ships";

const canvas = document.querySelector("canvas")!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
engine.maxFPS = 2;
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.035, 0.055, 0.08, 1);
const camera = new ArcRotateCamera(
  "exterior-review-camera",
  -Math.PI / 2,
  0.72,
  60,
  new Vector3(0, 1, 0),
  scene,
);
camera.attachControl(canvas, true);
const sky = new HemisphericLight(
  "review-environment",
  new Vector3(0, 1, 0),
  scene,
);
sky.intensity = 0.8;
const sun = new DirectionalLight(
  "review-sun",
  new Vector3(-0.4, -1, 0.3),
  scene,
);
sun.intensity = 1.2;
const instrumentation = new SceneInstrumentation(scene);
const manifest = await fetch(
  "/assets/assembly/wayfarer-exterior-r001.json",
).then((r) => r.json());
const prototype = await loadRemoteShipPrototype(
  scene,
  manifest,
  manifest.assetId,
);
const roots = [
  prototype.instantiate("review-a"),
  prototype.instantiate("review-b"),
];
roots[0].position.x = -9;
roots[1].position.x = 9;
const capture = () => ({
  ready: scene.isReady(),
  activeMeshes: scene.getActiveMeshes().length,
  drawCalls: instrumentation.drawCallsCounter.current,
  importedLights: scene.lights.filter(
    (light) => !light.name.startsWith("review-"),
  ).length,
  totalSceneMeshes: scene.meshes.length,
  ships: roots.map((root) => ({
    id: root.name,
    meshes: root.getChildMeshes().length,
    subMeshes: root
      .getChildMeshes()
      .reduce((sum, mesh) => sum + mesh.subMeshes.length, 0),
    vertices: root
      .getChildMeshes()
      .reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
    triangles: root
      .getChildMeshes()
      .reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0),
    names: root.getChildMeshes().map((mesh) => mesh.name),
    materials: [
      ...new Set(root.getChildMeshes().map((mesh) => mesh.material?.name)),
    ],
  })),
});
Object.assign(globalThis, {
  remoteExteriorReview: { scene, engine, camera, roots, prototype, capture },
});
engine.runRenderLoop(() => scene.render());
