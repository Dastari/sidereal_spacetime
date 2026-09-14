import { Engine } from "/node_modules/.vite/deps/@babylonjs_core_Engines_engine.js";
import { Scene } from "/node_modules/.vite/deps/@babylonjs_core_scene.js";
import { ArcRotateCamera } from "/node_modules/.vite/deps/@babylonjs_core_Cameras_arcRotateCamera.js";
import { Vector3 } from "/node_modules/.vite/deps/@babylonjs_core_Maths_math__vector.js";
import { Color4 } from "/node_modules/.vite/deps/@babylonjs_core_Maths_math__color.js";
import { HemisphericLight } from "/node_modules/.vite/deps/@babylonjs_core_Lights_hemisphericLight.js";
import { DirectionalLight } from "/node_modules/.vite/deps/@babylonjs_core_Lights_directionalLight.js";
import { HDRCubeTexture } from "/node_modules/.vite/deps/@babylonjs_core_Materials_Textures_hdrCubeTexture.js";
import { SceneLoader } from "/node_modules/.vite/deps/@babylonjs_core_Loading_sceneLoader.js";
import "/node_modules/.vite/deps/@babylonjs_loaders_glTF.js";
const engine = new Engine(document.querySelector("canvas"), true, {
  preserveDrawingBuffer: true,
});
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.045, 0.075, 0.11, 1);
const camera = new ArcRotateCamera(
  "panel-camera",
  Math.atan2(4, 8),
  1.32,
  10,
  new Vector3(0.125, 1.5, 0),
  scene,
);
camera.mode = 1;
camera.orthoLeft = -1.75;
camera.orthoRight = 1.75;
camera.orthoTop = 2.1875;
camera.orthoBottom = -2.1875;
camera.minZ = 0.05;
new HemisphericLight("fill", new Vector3(0, 1, 0), scene).intensity = 0.65;
new DirectionalLight("key", new Vector3(-0.6, -1, -0.3), scene).intensity = 1.6;
scene.environmentTexture = new HDRCubeTexture(
  "/assets/materials/frontier-workshop.hdr",
  scene,
  128,
  false,
  true,
  false,
  true,
);
scene.environmentIntensity = 0.55;
let containers = [];
function clear() {
  for (const c of containers) c.dispose();
  containers = [];
}
async function add(slug) {
  const c = await SceneLoader.LoadAssetContainerAsync(
    "/__hull-study/panels/",
    slug + ".glb",
    scene,
  );
  c.addAllToScene();
  containers.push(c);
  return c;
}
window.study = {
  scene,
  engine,
  ready: true,
  async load(slug) {
    clear();
    const c = await add(slug);
    await scene.whenReadyAsync();
    scene.render();
    scene.render();
    document.querySelector("h1").textContent = slug;
    return {
      slug,
      triangles: c.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      normalMapped: c.materials.filter((m) => m.bumpTexture).length,
      webgl: engine.webGLVersion,
      textures: c.textures.map((t) => ({ name: t.name, size: t.getSize() })),
    };
  },
  async assembly() {
    clear();
    let cursor = -1.75;
    const rows = [];
    for (const width of [2, 1, 0.5]) {
      const c = await add(
        "explorer-w" + String(width * 32).padStart(3, "0") + "-h096-intact",
      );
      const midpoint = cursor + width / 2;
      // GLB converts Blender local +Y to runtime -Z. Translate the GLB root only.
      for (const node of [...c.meshes, ...c.transformNodes])
        if (!node.parent) node.position.z = -midpoint;
      const socketPositions = {};
      for (const node of c.transformNodes) {
        if (!node.name.startsWith("HULL_")) continue;
        node.computeWorldMatrix(true);
        socketPositions[node.name.split(".")[0]] = node.getAbsolutePosition().asArray();
      }
      rows.push({
        width,
        start: cursor,
        end: cursor + width,
        translationY: midpoint,
        socketPositions,
      });
      cursor += width;
    }
    camera.alpha = 0.64;
    camera.orthoLeft = -2.4;
    camera.orthoRight = 2.4;
    camera.orthoTop = 3;
    camera.orthoBottom = -3;
    document.querySelector("h1").textContent =
      "2 m + 1 m + 0.5 m · sockets joined · no scaling";
    await scene.whenReadyAsync();
    scene.render();
    scene.render();
    return rows;
  },
};
