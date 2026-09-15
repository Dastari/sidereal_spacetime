// Private imported-native review. Original qualified document is loaded intact.
// Filtering and equipment shifts below are presentation edits, never authority.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import "@babylonjs/loaders/glTF";
import { loadConstructionInstance } from "../../packages/render/src/construction-instance";
import { constructionHash } from "../../packages/sim/src/construction-transactions";
import { registerReferencedSceneMaterial } from "../../packages/render/src/scene-material-registration";
import { mergeStructuralPlacements } from "../../packages/render/src/structural-batches";

const params = new URLSearchParams(location.search);
const assemblyName = params.get("assembly") ?? "wayfarer";
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
  -2.75,
  0.955,
  55,
  new Vector3(0, 1, -1),
  scene,
);
camera.mode = 1;
camera.minZ = 0.1;
camera.maxZ = 200;
const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.65;
hemi.groundColor = new Color3(0.15, 0.18, 0.25);
const key = new DirectionalLight("key", new Vector3(0.7, -1, 0.3), scene);
key.intensity = 2;
const root = new TransformNode("review-ship", scene);
const layout = await (await fetch("/__armor-native/models.json")).json();
const assembly = layout.assemblies[assemblyName];
if (!assembly) throw Error("Unknown native assembly");
const hidden = new Set();
const removals = [];
const mounts = [];
let assembled, fixture;
if (assemblyName === "wayfarer") {
  fixture = await (await fetch("/__armor-review/document.json")).json();
  assembled = await loadConstructionInstance(scene, root, fixture);
  const special = new Set([
    "part-4c25a5fd9da0bce537f5",
    "part-540c83fc49ee792d9a4a",
    "part-ecd751f76e602db806a3",
    "part-63a0c40bbb71cfeba4dd",
    "part-437732483fa4d7acbcbc",
    "part-e965a5502d9fe4c25406",
    "part-9f79f3a40a72f9b7ad4a",
    "part-b3a1decd8a0336ac2030",
  ]);
  const oldPlacements = scene.transformNodes.filter((n) =>
    n.name.startsWith("placement-"),
  );
  const excluded = new Set(
    oldPlacements
      .filter(
        (n) => special.has(n.metadata?.assetId) || n.metadata?.role === "hull",
      )
      .map((n) => n.metadata.partId),
  );
  for (const mesh of [...scene.meshes]) {
    const ranges = mesh.metadata?.trianglePlacements;
    if (ranges?.some((r) => excluded.has(r.placementId))) {
      const indices = mesh.getIndices(),
        kept = [],
        next = [];
      if (
        !indices ||
        ranges.reduce((n, r) => n + r.count, 0) * 3 !== indices.length
      )
        throw Error("Incomplete identity ranges: " + mesh.name);
      for (const range of ranges) {
        if (excluded.has(range.placementId)) continue;
        next.push({ ...range, start: kept.length / 3 });
        for (let i = range.start * 3; i < (range.start + range.count) * 3; i++)
          kept.push(indices[i]);
      }
      removals.push({
        mesh: mesh.name,
        beforeTriangles: indices.length / 3,
        afterTriangles: kept.length / 3,
        placements: ranges
          .filter((r) => excluded.has(r.placementId))
          .map((r) => r.placementId),
      });
      if (!kept.length) hidden.add(mesh);
      else {
        mesh.makeGeometryUnique();
        mesh.setIndices(kept);
        mesh.metadata.trianglePlacements = next;
      }
    } else if (excluded.has(mesh.metadata?.partId)) hidden.add(mesh);
  }
  for (const node of oldPlacements) {
    if (excluded.has(node.metadata.partId))
      for (const mesh of node.getChildMeshes()) hidden.add(mesh);
    const suffix = Number(node.metadata.partId.slice(-3));
    if (suffix < 54 || suffix > 62) continue;
    node.unfreezeWorldMatrix();
    const meshes = node
      .getChildMeshes()
      .filter((m) => m.getTotalVertices() > 0);
    meshes.forEach((m) => {
      m.unfreezeWorldMatrix();
      m.computeWorldMatrix(true);
    });
    if (!meshes.length) throw Error("Missing retained equipment: " + node.name);
    const boxes = meshes.map((m) => m.getBoundingInfo().boundingBox);
    const previous = node.position.asArray();
    let axis, before, after;
    if (suffix <= 56) {
      axis = "rendererZ";
      before = Math.min(...boxes.map((b) => b.minimumWorld.z));
      after = 10;
      node.position.z += after - before;
    } else {
      axis = "rendererX";
      const sign = Math.sign(node.position.x);
      after = sign * 6;
      before =
        sign > 0
          ? Math.min(...boxes.map((b) => b.minimumWorld.x))
          : Math.max(...boxes.map((b) => b.maximumWorld.x));
      node.position.x += after - before;
    }
    node.computeWorldMatrix(true);
    meshes.forEach((m) => m.computeWorldMatrix(true));
    mounts.push({
      placementId: node.metadata.partId,
      assetId: node.metadata.assetId,
      axis,
      previousInnerFaceM: before,
      newMountFaceM: after,
      deltaM: after - before,
      previousRendererPosition: previous,
      reviewRendererPosition: node.position.asArray(),
      limitation:
        "Rigid review placement only; native geometry unchanged, mount authority unqualified.",
    });
  }
}
const originalMeshes = new Set(scene.meshes);
const originalVisibility = new Map(
  scene.meshes.map((mesh) => [mesh, mesh.isVisible]),
);
const bytes = new Uint8Array(
  await (await fetch("/__armor-native/hull.glb")).arrayBuffer(),
);
if (constructionHash(bytes) !== layout.packaging.sha256)
  throw Error("Native library hash mismatch");
const container = await SceneLoader.LoadAssetContainerAsync(
  "",
  bytes,
  scene,
  undefined,
  ".glb",
);
const sources = container.meshes.filter(
  (m) => m instanceof Mesh && m.getTotalVertices() > 0,
);
let native = [];
for (const placement of assembly.placements) {
  const model = layout.models.find((m) => m.modelId === placement.modelId);
  if (!model || placement.scale.some((v) => v !== 1))
    throw Error("Missing or scaled native module");
  const node = new TransformNode(placement.placementId, scene);
  node.parent = root;
  node.position.set(
    placement.position[0],
    placement.position[2],
    -placement.position[1],
  );
  node.rotation.y = placement.rotationZRad;
  const selected = sources.filter((m) => m.name.startsWith(model.nodePrefix));
  if (!selected.length)
    throw Error("Missing native geometry: " + model.modelId);
  for (const source of selected) {
    const matrix = source.computeWorldMatrix(true).clone();
    const mesh = source.clone(
      placement.placementId + "--" + source.name,
      node,
      true,
    );
    registerReferencedSceneMaterial(scene, mesh.material);
    const q = new Quaternion();
    matrix.decompose(mesh.scaling, q, mesh.position);
    mesh.rotationQuaternion = q;
    mesh.isVisible = true;
    const backing = source.name.includes("--BACKING--");
    if (!backing && !source.name.includes("--FINISH--"))
      throw Error("Missing semantic group: " + source.name);
    mesh.metadata = {
      partId: placement.placementId,
      role: "hull",
      category: "armor",
      deckId: "native-review",
      instanceId: assemblyName,
      visibilityGroup: backing ? "BACKING" : "FINISH",
      lightGroup: "native-review",
    };
    native.push({
      mesh,
      backing,
      originalPosition: mesh.position.clone(),
      placementId: placement.placementId,
    });
  }
}
const importedNativeMeshes = native.length;
// The same game batcher preserves authored vertex channels and placement triangle
// identities. Backing and finish have distinct visibility policies and stay apart.
const batched = mergeStructuralPlacements(
  root,
  native.map((p) => p.mesh),
);
native = batched.meshes.map((mesh) => ({
  mesh,
  backing: mesh.metadata.visibilityGroup === "BACKING",
  originalPosition: mesh.position.clone(),
}));
const instruments = new SceneInstrumentation(scene);
instruments.captureRenderTime = true;
let mode = "whole";
function show(next) {
  if (!["whole", "backing", "finish", "exploded", "bare"].includes(next))
    throw Error("Unknown mode");
  mode = next;
  for (const mesh of originalMeshes)
    mesh.isVisible =
      originalVisibility.get(mesh) &&
      !hidden.has(mesh) &&
      ["whole", "exploded", "bare"].includes(mode);
  for (const part of native) {
    part.mesh.isVisible =
      mode !== "bare" &&
      (mode !== "backing" || part.backing) &&
      (mode !== "finish" || !part.backing);
    part.mesh.position.copyFrom(part.originalPosition);
    if (mode === "exploded" && !part.backing) part.mesh.position.y += 4;
  }
}
const views = {
  concept: [-2.75, 0.955, 0, 1, -1, 26],
  starboard: [-0.39, 0.955, 0, 1, -1, 26],
  gameplay: [-2.34, 0.955, 0, 1, -1, 28],
  bow: [-2.12, 1.02, 0, 1, -9, 13],
  joined: [-2.9, 1.12, -5, 1.5, -1, 11],
  top: [-Math.PI / 2, 0.025, 0, 0, 0, 30],
  alternate: [-2.75, 0.8, 0, 1, -3, 23],
  exploded: [-2.75, 0.955, 0, 3, -1, 28],
};
const bounds = native.map((p) => {
  p.mesh.computeWorldMatrix(true);
  return p.mesh.getBoundingInfo().boundingBox;
});
const lo = [0, 1, 2].map((i) =>
  Math.min(...bounds.map((b) => b.minimumWorld.asArray()[i])),
);
const hi = [0, 1, 2].map((i) =>
  Math.max(...bounds.map((b) => b.maximumWorld.asArray()[i])),
);
const center = lo.map((v, i) => (v + hi[i]) / 2);
views.fixture = [
  -2.75,
  0.85,
  ...center,
  Math.max(...hi.map((v, i) => v - lo[i])) * 1.2,
];
async function view(name, next = mode) {
  const v = views[name];
  if (!v) throw Error("Unknown view");
  camera.alpha = v[0];
  camera.beta = v[1];
  camera.target.set(v[2], v[3], v[4]);
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  camera.orthoTop = v[5] / 2;
  camera.orthoBottom = -v[5] / 2;
  camera.orthoLeft = (-v[5] / 2) * aspect;
  camera.orthoRight = (v[5] / 2) * aspect;
  assembled?.setView?.(camera.position, true);
  show(next);
  await scene.whenReadyAsync();
  for (let i = 0; i < 2; i++) {
    engine.beginFrame();
    scene.render();
    engine.endFrame();
  }
  return {
    assembly: assemblyName,
    mode,
    camera: v,
    nativePlacements: assembly.placements.length,
    importedNativeMeshes,
    nativeDrawMeshes: native.length,
    draws: engine._drawCalls.current,
    renderMs: instruments.renderTimeCounter.current,
    triangles: scene.getActiveIndices() / 3,
    removals,
    mounts,
  };
}
window.review = {
  scene,
  engine,
  camera,
  layout,
  assembly,
  view,
  show,
  views,
  removals,
  mounts,
  ready: true,
};
await view(assemblyName === "wayfarer" ? "concept" : "alternate");
