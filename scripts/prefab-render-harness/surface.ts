/** Native diagnostic, no database/assets/publication. Uses the production surface helpers.
 * ?backend=webgl|webgpu. The enabled map is an asymmetric quantized raised-arrow normal.
 * Window API supports matched default-off captures and deterministic light/ship movement. */
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Constants } from "@babylonjs/core/Engines/constants";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createRenderEngine } from "../../packages/render/src/render-engine";
import { roleSlotMaterial } from "../../packages/render/src/prefab-ship/materials";
import {
  normalDetailMaterial,
  type NormalDetailSelection,
} from "../../packages/render/src/prefab-ship/normal-detail";
import {
  appendTransformed,
  type MergeGroup,
} from "../../packages/render/src/prefab-ship/batch";
import { latticeFaceUvs } from "../../packages/render/src/prefab-ship/surface-coordinates";

async function start() {
  const query = new URLSearchParams(location.search);
  const backend = query.get("backend") === "webgpu" ? "webgpu" : "webgl";
  const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
  canvas.width = 1000;
  canvas.height = 720;
  const created = await createRenderEngine(canvas, backend);
  if (!created.engine || created.active !== backend)
    throw Error(
      `Requested ${backend}, received ${created.active}: ${created.reason}`,
    );
  const engine = created.engine;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.045, 0.065, 0.09, 1);
  const camera = new FreeCamera("review", new Vector3(0, 0, 10), scene);
  camera.setTarget(Vector3.Zero());
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -3.65;
  camera.orthoRight = 3.65;
  camera.orthoTop = 2.63;
  camera.orthoBottom = -2.63;
  camera.minZ = 0.1;
  camera.maxZ = 100;
  scene.activeCamera = camera;
  const key = new DirectionalLight("key", new Vector3(0.55, -0.5, -1), scene);
  key.intensity = 1.1;
  const fill = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
  fill.intensity = 0.2;
  fill.specular = Color3.Black();
  const root = new TransformNode("ship", scene);

  // A quantized right-pointing arrow with an offset square recess. PNG authored in +Y tangent convention.
  const size = 64,
    imageCanvas = document.createElement("canvas");
  imageCanvas.width = imageCanvas.height = size;
  const context = imageCanvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  const heightAt = (x: number, y: number) => {
    x = (x + size) % size;
    y = (y + size) % size;
    const stem = x >= 8 && x <= 35 && y >= 25 && y <= 37;
    const head = x >= 30 && x <= 52 && Math.abs(y - 31) <= 52 - x;
    return stem || head
      ? 1
      : x >= 10 && x <= 19 && y >= 10 && y <= 18
        ? -0.5
        : 0;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = -(heightAt(x + 1, y) - heightAt(x - 1, y)) * 0.65;
      const ny = (heightAt(x, y + 1) - heightAt(x, y - 1)) * 0.65;
      const length = Math.hypot(nx, ny, 1);
      const i = (x + y * size) * 4;
      image.data.set(
        [
          Math.round((nx / length + 1) * 127.5),
          Math.round((ny / length + 1) * 127.5),
          Math.round((1 / length + 1) * 127.5),
          255,
        ],
        i,
      );
    }
  context.putImageData(image, 0, 0);
  const url = imageCanvas.toDataURL("image/png");
  const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  const selection: NormalDetailSelection = {
    enabled: true,
    profile: "federation",
    family: "panel",
    revision: "native-fixture-r001",
    normalUrl: url,
    normalSha256: bytesToHex(sha256(bytes)),
  };
  const positions = [
    -0.82, -0.82, 0, 0.82, -0.82, 0, 0.82, 0.82, 0, -0.82, 0.82, 0,
  ];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 1, 1, 1, 1, 0, 0, 0],
    uvs2 = [1, 1, 1, 0, 0, 0, 0, 1];
  const definitions = [
    { label: "Legacy • UV absent", x: -2.2, y: 1.15, uv: false },
    {
      label: "Explicitly disabled • authored UV",
      x: 0,
      y: 1.15,
      disabled: true,
    },
    { label: "Enabled • UV0 right arrow", x: 2.2, y: 1.15 },
    { label: "Enabled • reflected UV0", x: -2.2, y: -1.15, mirror: true },
    { label: "Enabled • UV1 rotated", x: 0, y: -1.15, second: true },
    { label: "Enabled • nonuniform rotated", x: 2.2, y: -1.15, affine: true },
  ];
  const base = roleSlotMaterial(scene, "federation", "primary", "wall");
  const meshes: Mesh[] = [],
    defaultMaterials = [];
  for (const def of definitions) {
    const group: MergeGroup = {
      key: def.label,
      positions: [],
      normals: [],
      indices: [],
    };
    const transform = def.mirror
      ? Matrix.Scaling(-1, 1, 1)
      : def.affine
        ? Matrix.Scaling(0.92, 0.62, 1).multiply(Matrix.RotationY(0.22))
        : Matrix.Identity();
    transform.setTranslation(new Vector3(def.x, def.y, 0));
    appendTransformed(
      group,
      positions,
      normals,
      [0, 1, 2, 0, 2, 3],
      transform.asArray(),
      def.uv === false ? {} : { uvs, uvs2 },
      { correctNormals: true },
    );
    const mesh = new Mesh(def.label, scene);
    const data = new VertexData();
    data.positions = group.positions;
    data.normals = group.normals;
    data.indices = group.indices;
    if (group.uvs) data.uvs = group.uvs;
    if (group.uvs2) data.uvs2 = group.uvs2;
    data.applyToMesh(mesh);
    mesh.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation;
    mesh.parent = root;
    const selected = {
      ...selection,
      enabled: !def.disabled,
      coordinatesIndex: (def.second ? 1 : 0) as 0 | 1,
    };
    mesh.material =
      def.uv === false ? base : normalDetailMaterial(base, selected, group);
    meshes.push(mesh);
    defaultMaterials.push(mesh.material);
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = def.label;
    label.style.left = `${((def.x + 3.65) / 7.3) * 100}%`;
    label.style.top = `${((2.63 - def.y + 0.96) / 5.26) * 100}%`;
    document.querySelector("#labels")!.append(label);
  }
  const signedProbe = Array.from(
    latticeFaceUvs(
      [
        [-32, -16, 0],
        [32, -16, 0],
      ],
      [0, 0, 1],
    ),
  );
  await scene.whenReadyAsync();
  const submit = async () => {
    for (let i = 0; i < 3; i++) {
      engine.beginFrame();
      scene.render();
      engine.endFrame();
    }
    if ("_device" in engine)
      await (
        engine as unknown as { _device: GPUDevice }
      )._device.queue.onSubmittedWorkDone();
  };
  await submit();
  const metrics = () => ({
    backend: created.active,
    ready: scene.isReady(),
    pending: scene.getWaitingItemsCount(),
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
    indices: meshes.reduce((n, m) => n + m.getTotalIndices(), 0),
    derivativeBasis: meshes.every((m) => !m.isVerticesDataPresent("tangent")),
    signedProbe,
    errors: meshes
      .map((m) => m.material?.getEffect()?.getCompilationError())
      .filter(Boolean),
  });
  const review = {
    scene,
    engine,
    meshes,
    root,
    metrics,
    async mode(mode: "default" | "off" | "disabled") {
      meshes.forEach((mesh, i) => {
        mesh.material =
          mode === "default"
            ? defaultMaterials[i]
            : mode === "off"
              ? base
              : normalDetailMaterial(
                  base,
                  { ...selection, enabled: false },
                  { uvs },
                );
      });
      await submit();
      return metrics();
    },
    async light(x: number, y: number) {
      key.direction.set(x, y, -1);
      await submit();
      return metrics();
    },
    async move() {
      root.position.set(1500, 250, -700);
      camera.position.addInPlace(root.position);
      camera.setTarget(root.position);
      await submit();
      return metrics();
    },
    async capture() {
      await submit();
      const pixels = await engine.readPixels(
        0,
        0,
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      );
      return {
        hash: bytesToHex(
          sha256(
            new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
          ),
        ),
        png: canvas.toDataURL("image/png"),
        metrics: metrics(),
      };
    },
    dispose() {
      scene.dispose();
      engine.dispose();
      return { scenes: engine.scenes.length, textures: scene.textures.length };
    },
  };
  (window as unknown as { __surfaceReview: typeof review }).__surfaceReview =
    review;
  document.querySelector("#status")!.textContent =
    `${created.active.toUpperCase()} • ready • derivative normal basis • no production art changes`;
}
start().catch((error) => {
  (window as unknown as { __surfaceError: string }).__surfaceError = String(
    error?.stack ?? error,
  );
  document.querySelector("#status")!.textContent = String(error);
});
