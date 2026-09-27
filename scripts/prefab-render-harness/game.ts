/**
 * In-game review of a prefab ship: the real game renderer (`createWorld` from packages/render,
 * same scene, lights, post-processing, camera and crew) with the prefab's trusted construction
 * document as the ship, exactly as the client renders an assigned prefab. No database, no auth:
 * a static SceneState stands the crew at the ship centre.
 *
 * Query: ?prefab=<id>&interior=1|0&inspect=1 (3/4 flight camera)&x=&y= (crew, ship metres)
 * Sets window.__prefabReady once the world has rendered a few frames; __prefabError on failure;
 * __prefabMetrics = [{ id, meshes, drawCalls }].
 */
import { createWorld, type SceneState } from "@sidereal/render";
import type { Scene } from "@babylonjs/core/scene";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { prefabById, PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";

declare global {
  interface Window {
    __prefabReady?: boolean;
    __prefabMetrics?: unknown;
    __prefabError?: string;
    __prefabWorld?: unknown;
  }
}

const q = new URLSearchParams(location.search);
const doc = prefabById(q.get("prefab") ?? "fed.s.wren") ?? PREFAB_SHIPS[0];
const canvas = document.getElementById("view") as HTMLCanvasElement;
const width = Number(q.get("w")) || window.innerWidth;
const height = Number(q.get("h")) || window.innerHeight;
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;

async function main() {
  const construction = prefabConstructionDocument(doc, defaultPrefabComponentCatalog());
  let scene: Scene | undefined;
  const world = await createWorld(canvas, (text) => (document.getElementById("hud")!.textContent = text), {
    construction: { instanceId: construction.layout.id, documentJson: JSON.stringify(construction), deckId: "deck-0" },
    onScene: (s) => (scene = s),
    onLoadError: (m) => (window.__prefabError = m),
  });
  const interior = q.get("interior") !== "0";
  const state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: Number(q.get("x") ?? 0),
    localY: Number(q.get("y") ?? 0),
    interior,
    inspect: q.get("inspect") === "1",
    grid: false,
  };
  world.update(state);
  window.__prefabWorld = world;
  // Review-only camera override (&cam=alpha,beta,radius): the game eases its RPG camera toward the
  // crew every frame; this re-applies fixed matching angles after it, never touching game state.
  const cam = q.get("cam")?.split(",").map(Number);
  // Optional 4th/5th values: camera target in ship metres (x starboard, y fore) at deck height.
  if (cam && cam.length >= 3 && cam.every(Number.isFinite))
    scene!.onBeforeRenderObservable.add(() => {
      const c = scene!.activeCamera as unknown as { alpha: number; beta: number; radius: number; target: Vector3 } | null;
      if (!c || !("alpha" in c)) return;
      // Target first: the ArcRotateCamera target setter re-derives angles from the position.
      if (cam.length >= 5) c.target = new Vector3(cam[3], 1.2, -cam[4]);
      [c.alpha, c.beta, c.radius] = cam as [number, number, number];
    });
  const instrumentation = new SceneInstrumentation(scene!);
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  const ship = scene!.getTransformNodeByName(`prefab-ship:${doc.id}`);
  const frameDraws = instrumentation.drawCallsCounter.current;
  // Ship share of the frame: draws with the prefab view hidden for a few frames.
  ship?.setEnabled(false);
  for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
  const withoutShip = instrumentation.drawCallsCounter.current;
  ship?.setEnabled(true);
  for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
  window.__prefabMetrics = [
    {
      id: doc.id,
      view: interior ? "deck" : "flight",
      drawCalls: frameDraws,
      shipDraws: frameDraws - withoutShip,
      meshes: ship?.getChildMeshes().filter((m) => m.isEnabled() && m.isVisible).length ?? 0,
      lights: scene!.lights.filter((l) => l.isEnabled()).map((l) => `${l.getClassName()}:${l.name}:${l.intensity.toFixed(2)}:${"direction" in l ? ((l as unknown as { direction?: Vector3 }).direction?.asArray().map((v) => v.toFixed(2)).join(",") ?? "") : ""}`),
      // Mesh origin of the visible ship: Blender GLB vs TypeScript-generated vs effects.
      origin: (scene!.getTransformNodeByName("ship-frame")?.metadata as { prefabView?: { metrics(): unknown } } | null)?.prefabView?.metrics(),
      // Non-ship active meshes by name prefix (what the rest of the frame is spent on).
      others: Object.entries(
        scene!
          .getActiveMeshes()
          .data.slice(0, scene!.getActiveMeshes().length)
          .filter((m) => !ship || !m.isDescendantOf(ship))
          .reduce<Record<string, number>>((acc, m) => ((acc[m.name.split(/[:_.\-\d]/)[0] || m.name] = (acc[m.name.split(/[:_.\-\d]/)[0] || m.name] ?? 0) + 1), acc), {}),
      ).sort((a, b) => b[1] - a[1]).slice(0, 12),
      activeMeshes: scene!.getActiveMeshes().length,
      environmentIntensity: scene!.environmentIntensity,
      exposure: scene!.imageProcessingConfiguration.exposure,
    },
  ];
  document.getElementById("hud")!.textContent = `${doc.id} ${interior ? "deck" : "flight"} (game renderer): ${frameDraws} draws/frame, ship ${frameDraws - withoutShip}`;
  window.__prefabReady = true;
}

main().catch((e) => {
  console.error(e);
  window.__prefabError = String(e?.stack ?? e);
  window.__prefabReady = true;
});
