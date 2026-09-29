/**
 * Hair contact sheet (owner live feedback 2026-09-29, "full hair check"): every CHAR-HEADS hair style
 * on the runtime voxel crew body, through the game's own crew code path (createVoxelCrewVisual,
 * attachVoxelCrewHead with its load-time winding repair, toneCrewEmissive's molded-plastic finish and
 * the molded light rig) under the game's key light and image environment. Presentation review only.
 *
 * Query: ?body=male|female&variant=full|cap|fringe&tile=180&styles=a,b
 * Sets window.__hairSheet (PNG data URL) once every style is rendered; __hairError on failure.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/loaders/glTF";
import {
  CREW_HEAD_CATALOG,
  DEFAULT_HEAD_LOADOUT,
  type HeadLoadout,
} from "@sidereal/content/crew-heads";
import { createVoxelCrewVisual } from "../../packages/render/src/crew/voxel-crew";
import { attachVoxelCrewHead } from "../../packages/render/src/crew/voxel-crew-kit";
import { toneCrewEmissive } from "../../packages/render/src/crew/voxel-crew-outfit";
import { moldedLightRig } from "../../packages/render/src/molded-plastic";

declare global {
  interface Window {
    __hairSheet?: string;
    __hairError?: string;
  }
}

const q = new URLSearchParams(location.search);
const body = q.get("body") === "female" ? "female" : "male";
const variant = q.get("variant") ?? "full";
const TILE = Number(q.get("tile")) || 180;
const styles =
  q.get("styles")?.split(",") ?? CREW_HEAD_CATALOG.hairStyles.map((h) => h.id);
/** Views: camera azimuth (alpha) and polar angle (beta) around the head. */
const VIEWS: [string, number, number][] = [
  ["front", -Math.PI / 2, 1.35],
  ["back", Math.PI / 2, 1.35],
  ["left", 0, 1.35],
  ["right", Math.PI, 1.35],
  ["top", Math.PI / 2, 0.35],
];

async function main() {
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  canvas.width = TILE;
  canvas.height = TILE;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.07, 0.09, 0.14, 1);
  scene.environmentTexture = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentIntensity = 0.28;
  const key = new DirectionalLight("key", new Vector3(-0.4, -1, -0.6), scene);
  key.intensity = 2.1;
  const root = new TransformNode("root", scene);
  const crew = await createVoxelCrewVisual(scene, root);
  crew.customize({ bodyType: body } as never);
  const camera = new ArcRotateCamera(
    "c",
    0,
    1.3,
    2.0,
    new Vector3(0, 1.74, 0),
    scene,
  );
  camera.fov = 0.55;
  scene.activeCamera = camera;
  const sheet = document.createElement("canvas");
  sheet.width = TILE * VIEWS.length + 150;
  sheet.height = TILE * styles.length + 30;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#101522";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#e8f4ff";
  ctx.font = "bold 14px sans-serif";
  VIEWS.forEach(([name], i) => ctx.fillText(name, 150 + i * TILE + 8, 20));
  let head: Awaited<ReturnType<typeof attachVoxelCrewHead>> | undefined;
  for (const [row, style] of styles.entries()) {
    const loadout: HeadLoadout = {
      ...DEFAULT_HEAD_LOADOUT,
      head: body,
      faceVariant: body === "female" ? "f_classic" : "m_classic",
      hair: style,
      ...(variant === "cap" ? { accessories: ["cap"] } : {}),
      ...(variant === "fringe" ? { accessories: ["hood"] } : {}),
    };
    head?.dispose();
    head = await attachVoxelCrewHead(scene, crew, loadout);
    const meshes = crew.root.getChildMeshes();
    toneCrewEmissive(meshes);
    moldedLightRig(scene).include(meshes);
    await scene.whenReadyAsync();
    ctx.fillStyle = "#e8f4ff";
    ctx.fillText(style, 8, 30 + row * TILE + TILE / 2);
    for (const [i, [, alpha, beta]] of VIEWS.entries()) {
      camera.alpha = alpha;
      camera.beta = beta;
      for (let f = 0; f < 3; f++) scene.render();
      ctx.drawImage(canvas, 150 + i * TILE, 30 + row * TILE, TILE, TILE);
    }
  }
  window.__hairSheet = sheet.toDataURL("image/png");
}

main().catch((e) => {
  console.error(e);
  window.__hairError = String(e?.stack ?? e);
});
