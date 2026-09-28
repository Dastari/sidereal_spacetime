/**
 * Crew-on-ship review (no database): the real game renderer (`createWorld`) with a prefab ship and
 * the voxel crew, dressed from inventory definition ids exactly as the client derives them from
 * equipped items. Evidence and iteration only; nothing here is authority.
 *
 * Query: ?prefab=<id>&crew=voxel|legacy&body=male|female&equip=<definition ids, comma separated>
 *        &hand=<definition id>&x=&y=&heading=&cam=alpha,beta,radius[,tx,ty]&moving=1
 * window.__crew.dress(ids[], hand?) re-dresses live; window.__crewReady / __crewError as game.html.
 */
import { createWorld, type SceneState } from "@sidereal/render";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { prefabById, PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import {
  INVENTORY_DEFINITIONS,
  characterEquipmentFromInventory,
} from "@sidereal/content/inventory";
import type { EquipmentAsset } from "../../packages/render/src/equipment";

declare global {
  interface Window {
    __crewReady?: boolean;
    __crewError?: string;
    __crew?: {
      dress(ids: string[], hand?: string): void;
      metrics(): unknown;
      state: SceneState;
    };
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

function appearanceFor(ids: string[], hand?: string) {
  const items = ids.flatMap((id) => {
    const d = INVENTORY_DEFINITIONS.find((x) => x.id === id);
    return d?.equipSlot
      ? [{ definitionId: id, equipmentSlot: d.equipSlot }]
      : [];
  });
  const held = hand
    ? INVENTORY_DEFINITIONS.find((d) => d.id === hand)
    : undefined;
  return {
    crewAppearance: {
      bodyType: (q.get("body") === "female" ? "female" : "male") as
        "male" | "female",
      hairStyle: (q.get("hair") ?? undefined) as never,
      equippedComponents: characterEquipmentFromInventory(items),
      weapon: held?.pose ?? "none",
      backpack: items.some((i) => i.equipmentSlot === "back"),
    },
    equippedAsset: (held?.assetId as EquipmentAsset | undefined) ?? null,
  };
}

async function main() {
  const construction = prefabConstructionDocument(
    doc,
    defaultPrefabComponentCatalog(),
  );
  let scene: Scene | undefined;
  const world = await createWorld(
    canvas,
    (text) => (document.getElementById("hud")!.textContent = text),
    {
      construction: {
        instanceId: construction.layout.id,
        documentJson: JSON.stringify(construction),
        deckId: "deck-0",
      },
      crewBundle: q.get("crew") === "legacy" ? "legacy" : "voxel",
      onScene: (s) => {
        scene = s;
        (window as unknown as { __crewScene?: Scene }).__crewScene = s;
      },
      onLoadError: (m) => (window.__crewError = m),
    },
  );
  const equip = (q.get("equip") ?? "").split(",").filter(Boolean);
  const state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: Number(q.get("x") ?? 0),
    localY: Number(q.get("y") ?? 0),
    interior: q.get("interior") !== "0",
    inspect: false,
    grid: false,
    sprinting: false,
    ...appearanceFor(equip, q.get("hand") ?? undefined),
  };
  world.update(state);
  // Review camera override (alpha,beta,radius[,tx,ty] in ship metres); window.__crewCam changes it live.
  const holder = window as unknown as { __crewCam?: number[] };
  holder.__crewCam = q.get("cam")?.split(",").map(Number);
  scene!.onBeforeRenderObservable.add(() => {
    const cam = holder.__crewCam;
    if (!cam || cam.length < 3 || !cam.every(Number.isFinite)) return;
    const c = scene!.activeCamera as unknown as {
      alpha: number;
      beta: number;
      radius: number;
      target: Vector3;
    } | null;
    if (!c || !("alpha" in c)) return;
    if (cam.length >= 5) c.target = new Vector3(cam[3], cam[5] ?? 1.0, -cam[4]);
    [c.alpha, c.beta, c.radius] = cam as [number, number, number];
  });
  window.__crew = {
    state,
    dress(ids, hand) {
      Object.assign(state, appearanceFor(ids, hand));
      world.update({ ...state });
    },
    metrics() {
      const crewRoot = scene!.getTransformNodeByName("crew-placement");
      const meshes =
        crewRoot
          ?.getChildMeshes()
          .filter((m) => m.isEnabled() && m.isVisible) ?? [];
      return {
        crewMeshes: meshes.length,
        crewMaterials: new Set(meshes.map((m) => m.material?.uniqueId)).size,
        crewTriangles: meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
        names: meshes.map((m) => m.name),
        drawCalls: (
          scene!.getEngine() as unknown as { _drawCalls?: { current: number } }
        )._drawCalls?.current,
      };
    },
  };
  for (let i = 0; i < 40; i++)
    await new Promise((r) =>
      scene!.getEngine().onEndFrameObservable.addOnce(r),
    );
  window.__crewReady = true;
}

main().catch((e) => {
  console.error(e);
  window.__crewError = String(e?.stack ?? e);
  window.__crewReady = true;
});
