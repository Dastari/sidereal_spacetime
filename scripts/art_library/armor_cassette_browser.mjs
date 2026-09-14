// Private art review. The build helper resolves game modules from the explicitly
// selected candidate; no server state, placement, or source qualification changes.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import '@babylonjs/loaders/glTF';
import { loadConstructionInstance } from '../../packages/render/src/construction-instance';
import { constructionHash } from '../../packages/sim/src/construction-transactions';
import { nativeMeshInGroup } from '../../packages/render/src/native-mesh-group';
import { registerReferencedSceneMaterial } from '../../packages/render/src/scene-material-registration';

const mode = new URLSearchParams(location.search).get('mode') ?? 'whole';
if (!['whole', 'bare', 'armor', 'exploded'].includes(mode)) throw Error('Unknown review mode');
const engine = new Engine(document.querySelector('canvas'), true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(.022, .036, .058, 1);
scene.environmentTexture = new HDRCubeTexture('/assets/materials/frontier-workshop.hdr', scene, 128, false, true, false, true);
scene.environmentIntensity = .7;
scene.imageProcessingConfiguration.exposure = 1;
const camera = new ArcRotateCamera('review', -2.34, .955, 40, new Vector3(0, 1, 0), scene);
camera.mode = 1;
camera.minZ = .1;
camera.maxZ = 200;
camera.attachControl(engine.getRenderingCanvas(), true);
const hemi = new HemisphericLight('sky', new Vector3(0, 1, 0), scene);
hemi.intensity = .65;
hemi.groundColor = new Color3(.15, .18, .25);
const key = new DirectionalLight('key', new Vector3(.7, -1, .3), scene);
key.intensity = 2;
const root = new TransformNode('ship', scene);
const fixture = await (await fetch('/__armor-review/document.json')).json();
const layout = await (await fetch('/__armor-review/armor-layout.json')).json();
let assembled;
if (mode !== 'armor') {
  assembled = await loadConstructionInstance(scene, root, fixture);
  if (mode !== 'whole') {
    // The bare/exploded bundle selects only front LINER before structural
    // batching. Hide separate superstructure armor via its normal mesh role.
    for (const mesh of scene.meshes) if (mesh.metadata?.role === 'hull') mesh.setEnabled(false);
  }
}
if (mode === 'armor' || mode === 'exploded') {
  const libraries = new Map();
  for (const part of layout.parts) {
    let library = libraries.get(part.visual.url);
    if (!library) {
      const bytes = new Uint8Array(await (await fetch(part.visual.url)).arrayBuffer());
      if (constructionHash(bytes) !== part.visual.sha256) throw Error('Review native hash mismatch');
      const container = await SceneLoader.LoadAssetContainerAsync('', bytes, scene, undefined, '.glb');
      library = container.meshes.filter(m => m instanceof Mesh && m.getTotalVertices() > 0);
      libraries.set(part.visual.url, library);
    }
    const node = new TransformNode('armor-' + part.id, scene);
    node.parent = root;
    node.position.set(part.position[0], part.position[2], -part.position[1]);
    node.rotation.y = part.rotation;
    node.scaling.x = part.flipped ? -1 : 1;
    if (mode === 'exploded') {
      // One rigid offset per side/bow group makes separation visible without
      // resizing components or changing their relative mating positions.
      if (part.isSide) node.position.x += Math.sign(part.position[0]) * 1.5;
      else node.position.z -= 1.5;
    }
    const selected = library.filter(m => nativeMeshInGroup(m.name, part.armorGroup));
    if (!selected.length) throw Error('Missing native armor group: ' + part.slug);
    for (const source of selected) {
      const transform = source.computeWorldMatrix(true).clone();
      const mesh = source.clone(part.id + '--' + source.name, node, true);
      registerReferencedSceneMaterial(scene, mesh.material);
      const q = new Quaternion();
      transform.decompose(mesh.scaling, q, mesh.position);
      mesh.rotationQuaternion = q;
      mesh.isVisible = true;
    }
  }
}
const instruments = new SceneInstrumentation(scene);
instruments.captureRenderTime = true;
const views = {
  concept: [-2.75, .955, 0, 1, -1, 24],
  starboard: [-.39, .955, 0, 1, -1, 24],
  gameplay: [-2.34, .955, 0, 1, -1, 27],
  bow: [-2.12, 1.02, 0, 1, -8, 11],
  side: [-Math.PI, 1.24, -5, 1.6, -1, 24],
  joined: [-2.9, 1.12, -5, 1.5, -1, 9],
  rear: [2.34, 1.05, 0, 1, 4, 28],
  top: [-Math.PI / 2, .025, 0, 0, 0, 28],
};
function metrics() {
  return { draws: engine._drawCalls.current, triangles: scene.getActiveIndices() / 3,
    activeMeshes: scene.getActiveMeshes().length, renderMs: instruments.renderTimeCounter.current };
}
async function view(name) {
  const v = views[name];
  if (!v) throw Error('Unknown review camera');
  camera.alpha = v[0]; camera.beta = v[1]; camera.target.set(v[2], v[3], v[4]);
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  camera.orthoTop = v[5] / 2; camera.orthoBottom = -v[5] / 2;
  camera.orthoLeft = -v[5] / 2 * aspect; camera.orthoRight = v[5] / 2 * aspect;
  assembled?.setView?.(camera.position, true);
  if (mode === 'bare' || mode === 'exploded')
    for (const mesh of scene.meshes) if (mesh.metadata?.role === 'hull') mesh.setEnabled(false);
  await scene.whenReadyAsync();
  for (let i = 0; i < 2; i++) { engine.beginFrame(); scene.render(); engine.endFrame(); }
  return { mode, camera: v, ...metrics() };
}
window.review = { scene, engine, camera, root, assembled, fixture, layout, views, view, metrics, mode, ready: true };
await view('concept');
window.addEventListener('resize', () => engine.resize());
