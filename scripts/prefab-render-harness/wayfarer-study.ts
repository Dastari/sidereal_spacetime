/** Private source/voxel comparison. No gameplay, catalog or default activation. */
import { createWorld, type SceneState } from "@sidereal/render";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import {
  WAYFARER_STUDY_KIT,
  readWayfarerStudyCapture,
  type StudyPaletteEntry,
} from "@sidereal/content/wayfarer-study-kit";
import { WAYFARER_STUDY_FIXTURE } from "@sidereal/content/wayfarer-study-fixture";
import { compileWayfarerStudyStructure } from "@sidereal/sim/wayfarer-study-structure";
import {
  visualCellKey,
  type VisualVolume,
} from "@sidereal/sim/ship-visual-compiler";
import { meshSampledStructure } from "../../packages/render/src/prefab-ship/sampled-structure";
import { prefabToShipLocal } from "../../packages/render/src/prefab-ship/frames";
import {
  applySurfaceFinish,
  moldedLightRig,
} from "../../packages/render/src/molded-plastic";
import { setMeshRole } from "../../packages/render/src/mesh-roles";
import {
  setPbrLightBudget,
  GAME_PBR_LIGHT_LIMIT,
} from "../../packages/render/src/pbr-light-budget";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Scene } from "@babylonjs/core/scene";
import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";

interface Geometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}
interface Review {
  scene?: Scene;
  world?: Awaited<ReturnType<typeof createWorld>>;
  ready: boolean;
  error?: string;
  mode: string;
  metrics?: unknown;
}
declare global {
  interface Window {
    __wayfarerStudy?: Review;
  }
}
const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "voxel";
const review: Review = { ready: false, mode };
window.__wayfarerStudy = review;
const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document
  .querySelector(`a[href="?mode=${mode}"]`)
  ?.setAttribute("aria-current", "page");
const origin: [number, number] = [-1.5, 6.5];
const empty = (): Geometry => ({
  positions: [],
  normals: [],
  uvs: [],
  colors: [],
  indices: [],
});
const toRenderDirection = (v: ArrayLike<number>) => [-v[1], v[2], -v[0]];

async function pinnedJson(url: string, expected: string): Promise<unknown> {
  if (!/^[0-9a-f]{64}$/.test(expected))
    throw Error("Missing exact study artifact pin");
  const response = await fetch(url);
  if (!response.ok) throw Error(`Study asset unavailable: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytesToHex(sha256(bytes)) !== expected)
    throw Error(`Changed study asset: ${url}`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function pushCorner(
  out: Geometry,
  position: ArrayLike<number>,
  normal: ArrayLike<number>,
  uv: ArrayLike<number>,
  color: ArrayLike<number>,
) {
  out.indices.push(out.positions.length / 3);
  out.positions.push(
    ...prefabToShipLocal([position[0], position[1], position[2]], origin),
  );
  out.normals.push(...toRenderDirection(normal));
  out.uvs.push(uv[0], uv[1]);
  out.colors.push(color[0], color[1], color[2], color[3]);
}

/** Regroup exposed faces AFTER full-union meshing, retaining its occlusion and AO. */
function voxelGeometry(
  cells: VisualVolume,
  materialByFamily: ReadonlyMap<string, string>,
) {
  if (
    [...cells.values()].some(
      (c) => c.facet || c.normalHint || c.normalChart || c.normalSide,
    )
  )
    throw Error(
      "Study comparison requires unmodified axis-aligned sampled cells",
    );
  const output = new Map<string, Geometry>();
  for (const g of meshSampledStructure(cells, { ambientOcclusion: true })) {
    for (let i = 0; i < g.indices.length; i += 3) {
      const indices = Array.from(g.indices.subarray(i, i + 3));
      const p = indices.map((n) =>
        Array.from(g.positions.subarray(n * 3, n * 3 + 3)),
      );
      const a = p[1].map((v, j) => v - p[0][j]),
        b = p[2].map((v, j) => v - p[0][j]);
      const cross = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
      const length = Math.hypot(...cross),
        normal = cross.map((v) => v / length);
      if (
        !Number.isFinite(length) ||
        length <= 0 ||
        normal.filter((v) => v !== 0).length !== 1
      )
        throw Error("Non-axis or degenerate study face");
      const centre = [0, 1, 2].map(
        (j) => (p[0][j] + p[1][j] + p[2][j]) / 3 - normal[j] / 32,
      );
      const cell = cells.get(
        visualCellKey(
          ...(centre.map((v) => Math.floor(v * 16)) as [
            number,
            number,
            number,
          ]),
        ),
      );
      const material = cell && materialByFamily.get(cell.family);
      if (!cell || !material || cell.role !== g.role || cell.slot !== g.slot)
        throw Error("Exposed study face lost its original source owner");
      let out = output.get(material);
      if (!out) output.set(material, (out = empty()));
      for (const n of indices) {
        const shaderNormal = g.normals.subarray(n * 3, n * 3 + 3);
        if (normal.reduce((sum, v, j) => sum + v * shaderNormal[j], 0) < 0.999)
          throw Error("Study surface normal opposes its actual winding");
        pushCorner(
          out,
          g.positions.subarray(n * 3, n * 3 + 3),
          shaderNormal,
          g.uvs.subarray(n * 2, n * 2 + 2),
          g.colors?.subarray(n * 4, n * 4 + 4) ?? [1, 1, 1, 1],
        );
      }
    }
  }
  return output;
}

function material(scene: Scene, name: string, source: StudyPaletteEntry) {
  const m = new PBRMaterial(`wayfarer:${name}`, scene);
  m.albedoColor = new Color3(...source.colour);
  if (source.sourceFamily === "emissive") {
    m.emissiveColor = new Color3(...source.colour);
    m.emissiveIntensity = 1;
  }
  setPbrLightBudget(m, GAME_PBR_LIGHT_LIMIT);
  applySurfaceFinish(m, source.sourceFamily);
  return m;
}

async function main() {
  if (!["authored", "voxel", "cut"].includes(mode))
    throw Error("Unknown study comparison mode");
  const descriptor = WAYFARER_STUDY_KIT as typeof WAYFARER_STUDY_KIT & {
    samplesFileSha256?: string;
  };
  const capture = readWayfarerStudyCapture(
    await pinnedJson(
      "/assets/ship-study/wayfarer-r001/capture.json",
      descriptor.captureFileSha256,
    ),
  );
  let removed = new Set<string>(),
    cellsCount: number | undefined,
    intactCount: number | undefined;
  let geometry = new Map<string, Geometry>();
  if (mode === "authored") {
    for (const t of capture.sourceTriangles) {
      let out = geometry.get(t.material);
      if (!out) geometry.set(t.material, (out = empty()));
      for (let i = 0; i < 3; i++)
        pushCorner(
          out,
          t.vertices[i].map((v, j) => v + capture.placement[j]),
          t.normals[i],
          t.uvs[i],
          [1, 1, 1, 1],
        );
    }
  } else {
    const sampled = await pinnedJson(
      "/assets/ship-study/wayfarer-r001/samples.json",
      descriptor.samplesFileSha256 ?? "",
    );
    let compiled = compileWayfarerStudyStructure(sampled);
    intactCount = compiled.intact.size;
    if (mode === "cut") {
      const bounds = WAYFARER_STUDY_FIXTURE.cutBounds;
      removed = new Set(
        [...compiled.intact]
          .filter(([, c]) =>
            [c.x, c.y, c.z].every(
              (v, j) => v >= bounds[j] && v < bounds[j + 3],
            ),
          )
          .map(([key]) => key),
      );
      if (!removed.size)
        throw Error("Study cut misses the actual sampled cells");
      compiled = compileWayfarerStudyStructure(sampled, removed);
      if (
        compiled.cells.size !== compiled.intact.size - removed.size ||
        [...removed].some((key) => compiled.cells.has(key))
      )
        throw Error("Study cut did not remove the exact selected cells");
    }
    cellsCount = compiled.cells.size;
    geometry = voxelGeometry(compiled.cells, compiled.sourceMaterialByFamily);
  }
  const construction = prefabConstructionDocument(
    prefabById("fed.s.wren")!,
    defaultPrefabComponentCatalog(),
  );
  const world = await createWorld(
    canvas,
    (text) => (status.textContent = text),
    {
      construction: {
        instanceId: construction.layout.id,
        documentJson: JSON.stringify(construction),
        deckId: "deck-0",
      },
      onScene: (scene) => (review.scene = scene),
      onLoadError: (message) => (review.error = message),
      onPreviewError: (message) => (review.error = message),
    },
  );
  review.world = world;
  import.meta.hot?.dispose(() => world.dispose());
  const scene = review.scene!;
  const state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: 0,
    interior: false,
    inspect: true,
    grid: false,
  };
  world.update(state);
  const legacyRoots = scene.transformNodes.filter((node) => !node.parent);
  const fixtureMeshes: Mesh[] = [];
  for (const [name, g] of geometry) {
    const mesh = new Mesh(`wayfarer:${mode}:${name}`, scene),
      data = new VertexData();
    data.positions = Float32Array.from(g.positions);
    data.normals = Float32Array.from(g.normals);
    data.uvs = Float32Array.from(g.uvs);
    data.colors = Float32Array.from(g.colors);
    data.indices = Uint32Array.from(g.indices);
    data.applyToMesh(mesh);
    mesh.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation;
    mesh.material = material(scene, name, capture.palette[name]);
    mesh.receiveShadows = true;
    setMeshRole(mesh, "hull");
    fixtureMeshes.push(mesh);
  }
  moldedLightRig(scene).include(fixtureMeshes);
  for (const light of scene.lights) {
    const shadow = light.getShadowGenerator();
    const map = shadow?.getShadowMap();
    if (map) map.renderList = fixtureMeshes;
  }
  const camera = scene.activeCamera;
  if (!(camera instanceof ArcRotateCamera))
    throw Error("Normal game camera unavailable");
  const fixtureSet = new Set(fixtureMeshes);
  const isolate = () => {
    for (const root of legacyRoots) root.setEnabled(false);
    for (const mesh of scene.meshes)
      if (!fixtureSet.has(mesh as Mesh)) mesh.setEnabled(false);
    camera.target = new Vector3(-0.1, -0.15, -0.1);
    camera.alpha = 2.6;
    camera.beta = 1.18;
    camera.radius = 11;
  };
  isolate();
  scene.onBeforeRenderObservable.add(isolate);
  let frames = 0;
  scene.onAfterRenderObservable.add(() => {
    if (
      review.ready ||
      review.error ||
      !scene.isReady() ||
      fixtureMeshes.some((mesh) => !mesh.isReady(true))
    )
      return;
    if (++frames < 3) return;
    const leaks = scene.meshes.filter(
      (mesh) =>
        !fixtureMeshes.includes(mesh as Mesh) &&
        mesh.isEnabled() &&
        mesh.isVisible &&
        mesh.getTotalVertices() > 0,
    );
    if (leaks.length) {
      review.error = `Legacy meshes leaked into comparison: ${leaks.map((mesh) => mesh.name).join(",")}`;
      return;
    }
    review.metrics = {
      mode,
      piece: descriptor.piece,
      sceneUid: scene.uid,
      sourceCommit: descriptor.sourceCommit,
      snapshot: descriptor.snapshotManifestSha256,
      capture: descriptor.captureFileSha256,
      samples: descriptor.samplesFileSha256,
      cells: cellsCount,
      intactCells: intactCount,
      removedCells: removed.size,
      materials: geometry.size,
      triangles: fixtureMeshes.reduce(
        (sum, mesh) => sum + mesh.getTotalIndices() / 3,
        0,
      ),
      legacyVisibleMeshes: leaks.length,
      fixtureShadowCasters: scene.lights.flatMap(
        (light) =>
          light
            .getShadowGenerator()
            ?.getShadowMap()
            ?.renderList?.map((mesh) => mesh.name) ?? [],
      ),
      engine: scene.getEngine().constructor.name,
      frames,
      presentationOnly: true,
      geometryMode: mode,
    };
    review.ready = true;
    status.textContent =
      mode === "authored"
        ? "Captured authored source · normal game materials and lighting"
        : `${cellsCount?.toLocaleString()} cells · ${mode === "cut" ? `${removed.size.toLocaleString()} removed` : "intact"} · normal game materials and lighting`;
  });
}
void main().catch((error) => {
  review.error = String(error);
  status.textContent = review.error;
});
