/**
 * Prefab ship render harness: evidence renders of `createPrefabShipView` with no database.
 *
 * Query: ?prefab=<id>&view=flight|deck&theme=<id>&cam=iso|top|side|rear&w=..&h=..
 *        &lineup=1 (all PREFAB_SHIPS in a row) &standins=1 (force component stand-ins)
 *        &glow=0 &lights=<0-4 deck point lights>
 * Sets window.__prefabReady = true once everything is loaded and a few frames have rendered;
 * window.__prefabMetrics holds per-ship metrics, window.__prefabError any failure.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Layer } from "@babylonjs/core/Layers/layer";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import { SHIP_THEME_IDS, type ShipPrefabDocumentV1, type ShipThemeId } from "@sidereal/content/ship-prefab";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createGraphicsSettings } from "@sidereal/render/graphics-settings";
import { createPrefabShipView, type PrefabShipView } from "@sidereal/render/prefab-ship";

declare global {
  interface Window {
    __prefabReady?: boolean;
    __prefabMetrics?: unknown;
    __prefabError?: string;
  }
}

const q = new URLSearchParams(location.search);
const view = q.get("view") === "deck" ? "deck" : "flight";
const cam = (q.get("cam") ?? "iso") as "iso" | "top" | "side" | "rear";
const themeParam = q.get("theme") as ShipThemeId | null;
const theme = themeParam && (SHIP_THEME_IDS as readonly string[]).includes(themeParam) ? themeParam : undefined;
const lineup = q.get("lineup") === "1";
const width = Number(q.get("w")) || window.innerWidth;
const height = Number(q.get("h")) || window.innerHeight;

const canvas = document.getElementById("view") as HTMLCanvasElement;
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;

/** Purple nebula backdrop with stars, drawn once on a canvas (deterministic). */
function nebulaBackdrop(scene: Scene) {
  const w = 1024;
  const h = 576;
  const tex = new DynamicTexture("nebula", { width: w, height: h }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#1a0b3a");
  bg.addColorStop(0.5, "#0d0a26");
  bg.addColorStop(1, "#1b0a33");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blobs: [number, number, number, string][] = [
    [0.22, 0.18, 0.42, "rgba(150,60,230,0.35)"],
    [0.8, 0.75, 0.5, "rgba(90,40,200,0.3)"],
    [0.55, 0.35, 0.3, "rgba(230,80,200,0.16)"],
    [0.1, 0.85, 0.35, "rgba(40,80,220,0.22)"],
  ];
  for (const [x, y, r, c] of blobs) {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 420; i++) {
    const s = rnd() < 0.93 ? 0.7 : 1.6;
    ctx.fillStyle = `rgba(${200 + rnd() * 55},${200 + rnd() * 55},255,${0.35 + rnd() * 0.6})`;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
  tex.update();
  const layer = new Layer("backdrop", null, scene, true);
  layer.texture = tex;
}

/** Plan bounds of a ship in root space: returns centre and extents (Babylon X beam, Z length). */
function shipExtent(v: PrefabShipView) {
  const [x0, y0, x1, y1] = v.dressed.bounds;
  return { length: x1 - x0, beam: y1 - y0 };
}

function placeCamera(camera: FreeCamera, kind: typeof cam, target: Vector3, radius: number, aspect: number) {
  const fit = radius / Math.sin(camera.fov / 2) / Math.min(1, aspect) * 0.92;
  const dirs: Record<typeof cam, Vector3> = {
    // Port-forward quarter, above: bow toward the lower left like reference/art/3d-rpg-after.png.
    iso: new Vector3(-0.78, 0.95, -0.52),
    top: new Vector3(0, 1, 0),
    side: new Vector3(-1, 0.12, 0),
    rear: new Vector3(0, 0.35, 1),
  };
  const d = dirs[kind].normalize();
  camera.upVector = kind === "top" ? new Vector3(-1, 0, 0) : new Vector3(0, 1, 0);
  camera.position = target.add(d.scale(fit));
  camera.setTarget(target);
}

async function main() {
  if (q.get("list") === "1") {
    window.__prefabMetrics = PREFAB_SHIPS.map((p) => ({ id: p.id }));
    window.__prefabReady = true;
    return;
  }
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
  engine.setSize(width, height);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.07, 0.04, 0.14, 1);
  nebulaBackdrop(scene);
  scene.environmentTexture = new HDRCubeTexture("/assets/materials/frontier-workshop.hdr", scene, 128, false, true, false, true);
  scene.environmentIntensity = 0.55;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.35;
  const hemi = new HemisphericLight("fill", new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.75;
  hemi.groundColor = new Color3(0.22, 0.12, 0.35);
  const key = new DirectionalLight("key", new Vector3(0.45, -1, 0.3), scene);
  key.intensity = 2.4;
  const camera = new FreeCamera("harness-camera", new Vector3(0, 30, 30), scene);
  camera.fov = 0.5;
  camera.minZ = 0.1;
  camera.maxZ = 2000;
  new FxaaPostProcess("fxaa", 1, camera);
  createGraphicsSettings(scene, { getItem: () => null, setItem: () => undefined }).set({ saturation: 1.3, contrast: 0.94, gamma: 1.06 });

  const catalog = defaultPrefabComponentCatalog();
  const docs: ShipPrefabDocumentV1[] = lineup ? [...PREFAB_SHIPS] : [prefabById(q.get("prefab") ?? PREFAB_SHIPS[0].id) ?? PREFAB_SHIPS[0]];
  const views: PrefabShipView[] = [];
  const anchors: TransformNode[] = [];
  let offset = 0;
  for (const doc of docs) {
    const anchor = new TransformNode(`anchor:${doc.id}`, scene);
    const v = await createPrefabShipView(scene, doc, {
      catalog,
      view,
      theme,
      parent: anchor,
      standinComponents: q.get("standins") === "1",
      roomLights: Number(q.get("lights") ?? 0),
    });
    const { beam } = shipExtent(v);
    if (lineup) {
      anchor.position.x = offset + beam / 2;
      offset += beam + 6;
    }
    views.push(v);
    anchors.push(anchor);
  }
  if (lineup) for (const a of anchors) a.position.x -= offset / 2 - 3;

  const lengths = views.map((v) => shipExtent(v).length);
  const radius = lineup ? Math.hypot(offset / 2, Math.max(...lengths) / 2) : Math.hypot(lengths[0] / 2, shipExtent(views[0]).beam / 2, 2);
  placeCamera(camera, cam, new Vector3(0, 1.2, 0), radius, width / height);

  if (q.get("glow") !== "0") {
    const glow = new GlowLayer("glow", scene, { mainTextureFixedSize: 1024, blurKernelSize: 32 });
    glow.intensity = 0.7;
    for (const v of views) for (const m of v.emissiveMeshes()) glow.addIncludedOnlyMesh(m);
  }

  await scene.whenReadyAsync();
  engine.runRenderLoop(() => scene.render());
  for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));

  const labels = document.getElementById("labels")!;
  if (lineup) {
    const vp = new Viewport(0, 0, 1, 1).toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    views.forEach((v, i) => {
      const { length } = shipExtent(v);
      const p = Vector3.Project(new Vector3(anchors[i].position.x, 0, length / 2 + 3), Matrix.Identity(), scene.getTransformMatrix(), vp);
      const div = document.createElement("div");
      div.className = "label";
      div.style.left = `${p.x}px`;
      div.style.top = `${p.y}px`;
      div.innerHTML = `${docs[i].name}<small>${docs[i].id} · ${docs[i].sizeClass} · ${docs[i].theme}</small>`;
      labels.appendChild(div);
    });
  }
  const metrics = views.map((v, i) => ({ id: docs[i].id, view, ...v.metrics() }));
  window.__prefabMetrics = metrics;
  document.getElementById("hud")!.textContent = metrics
    .map((m) => `${m.id} ${m.view}: ${m.drawCalls} draws (scene), ${m.meshes} meshes, ${m.instances} inst, ${(m.triangles / 1000).toFixed(1)}k tris, ${m.pieces} pieces`)
    .join("\n");
  window.__prefabReady = true;
}

main().catch((e) => {
  console.error(e);
  window.__prefabError = String(e?.stack ?? e);
  window.__prefabReady = true;
});
