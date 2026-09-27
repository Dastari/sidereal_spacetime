import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { sha256 } from "@noble/hashes/sha2.js";
import "@babylonjs/loaders/glTF";

// Local authoring evidence only. No application, authority or runtime catalog imports.
type Placement = {
  path: string;
  originM: number[];
  yawRadians: number;
  prefix?: string;
  role: "floor" | "wall" | "roof";
  morph?: { name: string; value: number };
};
type Fixture = {
  id: string;
  footprintUnits: number[][];
  placements: Record<string, Placement[]>;
  supportedHeights: number[];
  notes: string;
  heightLabel?: string;
  displayHeightM?: number;
  roofUndersideM?: number;
  roofTopM?: number;
};
type Manifest = {
  fixtures: Fixture[];
  pins: Record<string, string>;
};
const select = document.querySelector<HTMLSelectElement>("#footprint")!;
const height = document.querySelector<HTMLSelectElement>("#height")!;
const roof = document.querySelector<HTMLInputElement>("#roof")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.149, 0.216, 0.278, 1);
const camera = new ArcRotateCamera(
  "review",
  -2.1,
  0.65,
  8,
  Vector3.Zero(),
  scene,
);
camera.minZ = 0.01;
camera.maxZ = 100;
camera.wheelPrecision = 35;
camera.attachControl(canvas, true);
const fill = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
fill.intensity = 1.05;
const key = new DirectionalLight("key", new Vector3(-0.4, -1, 0.3), scene);
key.intensity = 1.6;
let root: TransformNode | undefined;
let roofRoots: TransformNode[] = [];
let fit = () => {};
let libraries: AssetContainer[] = [];
let busy = false;
const review = {
  ready: false,
  fixture: "",
  quarterHeight: 4,
  loaded: [] as string[],
  error: "",
  meshes: 0,
  triangles: 0,
};
Object.assign(window, { __shipyardNativeReview: review });
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

async function main() {
  const response = await fetch("manifest.json");
  if (!response.ok) throw Error(`Manifest HTTP ${response.status}`);
  const manifest = (await response.json()) as Manifest;
  for (const f of manifest.fixtures)
    select.add(new Option(f.id.replaceAll("-", " "), f.id));
  document.querySelector("#pins")!.textContent = JSON.stringify(
    manifest.pins,
    null,
    2,
  );
  async function show() {
    if (busy) return;
    busy = true;
    select.disabled = height.disabled = true;
    review.ready = false;
    review.error = "";
    review.loaded = [];
    status.textContent = "Loading pinned native pieces…";
    root?.dispose();
    for (const library of libraries) library.dispose();
    libraries = [];
    root = new TransformNode("fixture", scene);
    const cache = new Map<string, AssetContainer>();
    try {
      const fixture = manifest.fixtures.find((f) => f.id === select.value)!;
      for (const option of height.options)
        option.disabled = !fixture.supportedHeights.includes(
          Number(option.value),
        );
      if (!fixture.supportedHeights.includes(Number(height.value)))
        height.value = String(fixture.supportedHeights[0]);
      const quarter = Number(height.value);
      async function place(
        path: string,
        origin: number[],
        yaw = 0,
        prefix?: string,
        morph?: Placement["morph"],
      ) {
        let library = cache.get(path);
        if (!library) {
          const response = await fetch(path);
          if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          const hash = Array.from(sha256(bytes), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
          if (hash !== manifest.pins[path])
            throw Error(`Native pin mismatch: ${path}`);
          library = await SceneLoader.LoadAssetContainerAsync(
            "",
            bytes,
            scene,
            undefined,
            ".glb",
          );
          libraries.push(library);
          cache.set(path, library);
          review.loaded.push(path);
        }
        const placed = new TransformNode(path, scene);
        placed.parent = root!;
        placed.position.set(origin[0], origin[2], -origin[1]);
        placed.rotation.y = yaw;
        let count = 0;
        let morphCount = 0;
        for (const source of library.meshes) {
          if (
            !(source instanceof Mesh) ||
            !source.getTotalVertices() ||
            (prefix && !source.name.startsWith(prefix))
          )
            continue;
          const matrix = source.computeWorldMatrix(true).clone();
          const clone = source.clone(`review-${source.name}`, placed, true)!;
          const rotation = new Quaternion();
          matrix.decompose(clone.scaling, rotation, clone.position);
          clone.rotationQuaternion = rotation;
          if (morph && source.morphTargetManager) {
            clone.morphTargetManager = source.morphTargetManager.clone();
            for (let i = 0; i < clone.morphTargetManager.numTargets; i++) {
              const target = clone.morphTargetManager.getTarget(i);
              if (target.name === morph.name) {
                target.influence = morph.value;
                morphCount++;
              }
            }
          }
          clone.isVisible = true;
          count++;
        }
        if (!count)
          throw Error(`No native meshes: ${path}, ${prefix ?? "all"}`);
        if (morph && !morphCount)
          throw Error(`Missing native morph ${morph.name}: ${path}`);
        return placed;
      }
      roofRoots = [];
      for (const p of fixture.placements[String(quarter)]) {
        const placed = await place(
          p.path,
          p.originM,
          p.yawRadians,
          p.prefix,
          p.morph,
        );
        if (p.role === "roof") {
          roofRoots.push(placed);
          placed.setEnabled(roof.checked);
        }
      }
      const xs = fixture.footprintUnits.map((p) => p[0] / 32);
      const ys = fixture.footprintUnits.map((p) => p[1] / 32);
      fit = () => {
        const visibleHeight =
          roof.checked && roofRoots.length
            ? (fixture.roofTopM ?? 3.3125)
            : (fixture.displayHeightM ?? quarter * 0.75 + 0.1875);
        camera.target.set(
          (Math.min(...xs) + Math.max(...xs)) / 2,
          visibleHeight / 2,
          -(Math.min(...ys) + Math.max(...ys)) / 2,
        );
        camera.radius = Math.max(
          3.25,
          Math.hypot(
            Math.max(...xs) - Math.min(...xs),
            Math.max(...ys) - Math.min(...ys),
            visibleHeight,
          ) * 1.65,
        );
      };
      fit();
      document.querySelector("#qualification")!.textContent = fixture.notes;
      const meshes = root!.getChildMeshes();
      Object.assign(review, {
        ready: true,
        fixture: fixture.id,
        quarterHeight: quarter,
        meshes: meshes.length,
        triangles: meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      });
      status.textContent = fixture.heightLabel
        ? `${fixture.heightLabel} · exact legacy geometry · roof underside ${fixture.roofUndersideM} m`
        : `${quarter * 0.75} m wall · 250 mm inward · roof underside 3.1875 m`;
      for (const option of height.options)
        option.text =
          fixture.heightLabel && Number(option.value) === quarter
            ? fixture.heightLabel
            : `${Number(option.value) * 0.75} m`;
    } catch (error) {
      review.error = String(error);
      status.textContent = review.error;
    } finally {
      busy = false;
      select.disabled = height.disabled = false;
    }
  }
  select.addEventListener("change", () => void show());
  height.addEventListener("change", () => void show());
  roof.addEventListener("change", () => {
    for (const root of roofRoots) root.setEnabled(roof.checked);
    fit();
  });
  document.querySelector("#top")!.addEventListener("click", () => {
    camera.beta = 0.01;
  });
  document.querySelector("#oblique")!.addEventListener("click", () => {
    camera.alpha = -2.1;
    camera.beta = 0.65;
  });
  await show();
}
void main().catch((error) => {
  review.error = String(error);
  status.textContent = review.error;
});
