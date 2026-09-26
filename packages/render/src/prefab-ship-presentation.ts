import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";

/** Game-side handle over the SHIPS-PREFABS dressed ship view. */
export interface PrefabShipViewHandle {
  setInterior(interior: boolean): void;
  dispose(): void;
}

/** The game's space scene has no image-based environment, so metallic PBR slots
 * tuned against Blender world lighting render near-black. The game presentation
 * therefore caps metalness and adds a ship-scoped sky/ground fill light. Theme
 * colours, geometry and the shared material pool semantics are unchanged. */
const GAME_MAX_METALLIC = 0.2;

/** A trusted prefab construction document carries its canonical grammar source
 * under `prefab` (admitted by readConstructionDraft). Returns undefined for any
 * other construction, so native Wayfarer/Studio instances are untouched. The
 * view is presentation only: collision, walking and flight stay authoritative. */
export async function loadPrefabShipPresentation(
  scene: Scene,
  shipRoot: TransformNode,
  documentJson: string,
): Promise<PrefabShipViewHandle | undefined> {
  let binding: { document?: unknown; catalog?: unknown } | undefined;
  try {
    binding = (JSON.parse(documentJson) as { prefab?: typeof binding }).prefab;
  } catch {
    return undefined;
  }
  if (!binding || typeof binding.catalog !== "string") return undefined;
  const doc = readShipPrefab(binding.document);
  const catalog = prefabComponentCatalogFor(binding.catalog);
  const { createPrefabShipView } = await import("./prefab-ship/ship-view");
  let interior = true;
  const view = await createPrefabShipView(scene, doc, {
    catalog,
    view: "deck",
    parent: shipRoot,
    // Component GLBs are not published to the game yet (SHIPS-COMPONENTS).
    standinComponents: true,
    roomLights: 2,
  });
  const fill = new HemisphericLight("prefab-ship-fill", new Vector3(0.2, 1, -0.3), scene);
  fill.intensity = 0.9;
  fill.diffuse = new Color3(0.92, 0.94, 1);
  fill.groundColor = new Color3(0.32, 0.34, 0.42);
  fill.specular = new Color3(0.15, 0.15, 0.15);
  const adapt = () => {
    const meshes = view.root.getChildMeshes();
    fill.includedOnlyMeshes = meshes;
    for (const mesh of meshes) {
      const m = mesh.material;
      if (m instanceof PBRMaterial && (m.metallic ?? 0) > GAME_MAX_METALLIC)
        m.metallic = GAME_MAX_METALLIC;
    }
  };
  adapt();
  return {
    setInterior(next) {
      if (next === interior) return;
      interior = next;
      view.setView(next ? "deck" : "flight");
      adapt();
    },
    dispose() {
      fill.dispose();
      view.dispose();
    },
  };
}
