import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { PointsCloudSystem } from "@babylonjs/core/Particles/pointsCloudSystem";
import { cameraAlpha } from "./camera";
import "@babylonjs/loaders/glTF";
export type SceneState = {
  heading: number;
  x: number;
  y: number;
  localX: number;
  localY: number;
  interior: boolean;
  inspect: boolean;
  grid: boolean;
};
export async function createWorld(
  canvas: HTMLCanvasElement,
  onReady: (text: string) => void,
) {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.018, 0.043, 0.069, 1);
  const camera = new ArcRotateCamera(
    "flight-camera",
    Math.PI / 2,
    0.015,
    70,
    Vector3.Zero(),
    scene,
  );
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 1500;
  const ambient = new HemisphericLight(
    "cabin-neutral-fill",
    new Vector3(0, 1, 0),
    scene,
  );
  ambient.intensity = 0.8;
  ambient.groundColor = new Color3(0.24, 0.31, 0.37);
  const sun = new DirectionalLight(
    "exterior-light",
    new Vector3(-0.4, -1, 0.3),
    scene,
  );
  sun.diffuse = new Color3(0.92, 0.96, 1);
  sun.intensity = 0.9;
  const shipRoot = new TransformNode("ship-frame", scene);
  const cabinRoot = new TransformNode("interior", scene);
  cabinRoot.parent = shipRoot;
  const steel = new StandardMaterial("deck-steel", scene);
  steel.diffuseColor = Color3.FromHexString("#536d79");
  steel.specularColor = Color3.Black();
  const trim = new StandardMaterial("trim", scene);
  trim.diffuseColor = Color3.FromHexString("#6e929f");
  trim.specularColor = Color3.Black();
  for (let x = -4; x <= 4; x += 2)
    for (let y = -8; y <= 8; y += 2) {
      const tile = CreateBox(
        `deck-${x}-${y}`,
        { width: 1.96, height: 0.18, depth: 1.96 },
        scene,
      );
      tile.position.set(x, 0, -y);
      tile.material = steel;
      tile.parent = cabinRoot;
    }
  for (const x of [-5, 5]) {
    const wall = CreateBox(
      "perimeter",
      { width: 0.22, height: 1.2, depth: 18 },
      scene,
    );
    wall.position.set(x, 0.5, 0);
    wall.parent = cabinRoot;
    wall.material = trim;
  }
  for (const z of [-9, 9]) {
    const wall = CreateBox(
      "perimeter",
      { width: 10, height: 1.2, depth: 0.22 },
      scene,
    );
    wall.position.set(0, 0.5, z);
    wall.parent = cabinRoot;
    wall.material = trim;
  }
  const chair = CreateBox(
    "control-station",
    { width: 1.4, height: 0.8, depth: 1.2 },
    scene,
  );
  chair.position.set(0, 0.5, -6);
  chair.material = trim;
  chair.parent = cabinRoot;
  const avatar = CreateCapsule(
    "crew-proxy",
    { height: 1.8, radius: 0.33 },
    scene,
  );
  const suit = new StandardMaterial("crew-suit", scene);
  suit.diffuseColor = Color3.FromHexString("#e6d6a6");
  avatar.material = suit;
  avatar.parent = cabinRoot;
  const marker = CreateTorus(
    "crew-marker",
    { diameter: 1.2, thickness: 0.045, tessellation: 32 },
    scene,
  );
  const cyan = new StandardMaterial("crew-marker-mat", scene);
  cyan.emissiveColor = Color3.FromHexString("#68ded0");
  marker.material = cyan;
  marker.parent = cabinRoot;
  const stars = new PointsCloudSystem("stars", 1, scene);
  let seed = 17;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  stars.addPoints(700, (p: { position: Vector3; color: Color4 }) => {
    p.position = new Vector3(
      (random() - 0.5) * 260,
      -60,
      (random() - 0.5) * 260,
    );
    p.color = new Color4(0.5 + random() * 0.4, 0.7, 0.82, 0.65);
  });
  await stars.buildMeshAsync();
  let model: TransformNode | undefined;
  try {
    const imported = await SceneLoader.ImportMeshAsync(
      "",
      "/assets/",
      "wayfarer.glb",
      scene,
    );
    model = new TransformNode("blender-assembly", scene);
    for (const mesh of imported.meshes) {
      if (!mesh.parent) mesh.parent = model;
    }
    const bound = model.getHierarchyBoundingVectors();
    const center = bound.min.add(bound.max).scale(0.5);
    const span = Math.max(bound.max.x - bound.min.x, bound.max.z - bound.min.z);
    const scale = 24 / span;
    model.scaling.setAll(scale);
    model.position.copyFrom(center.scale(-scale));
    const holder = new TransformNode("exterior", scene);
    model.parent = holder;
    holder.parent = shipRoot;
    model = holder;
  } catch (error) {
    onReady("Model load failed: " + String(error));
    cabinRoot.setEnabled(true);
  }
  let state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: 6,
    interior: false,
    inspect: false,
    grid: false,
  };
  const size = () => {
    engine.resize();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const half = state.interior ? 12 : 21;
    camera.orthoLeft = -half * aspect;
    camera.orthoRight = half * aspect;
    camera.orthoTop = half;
    camera.orthoBottom = -half;
  };
  const observer = new ResizeObserver(size);
  observer.observe(canvas);
  let firstFrame = true;
  engine.runRenderLoop(() => {
    shipRoot.rotation.y = state.heading;
    cabinRoot.setEnabled(state.interior || !model);
    model?.setEnabled(!state.interior);
    avatar.position.set(state.localX, 1.2, -state.localY);
    marker.position.set(state.localX, 0.16, -state.localY);
    camera.beta = state.inspect ? 0.6 : 0.015;
    camera.alpha = cameraAlpha(state.heading, state.interior);
    camera.upVector = Vector3.Up();
    if (stars.mesh) {
      stars.mesh.position.x = -(state.x * 0.02) % 100;
      stars.mesh.position.z = (state.y * 0.02) % 100;
    }
    sun.setEnabled(!state.interior);
    scene.render();
    if (firstFrame) {
      firstFrame = false;
      if (model) onReady("Blender study loaded");
    }
  });
  size();
  return {
    update(next: SceneState) {
      const resized = next.interior !== state.interior;
      state = next;
      if (resized) size();
    },
    dispose() {
      observer.disconnect();
      scene.dispose();
      engine.dispose();
    },
  };
}
