import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import {
  INVENTORY_DEFINITIONS,
  type InventoryDefinition,
} from "@sidereal/content/inventory";
import { crewArmorAssetUrl, crewArmorPart } from "@sidereal/content/crew-armor";
import { crewWardrobeItem } from "@sidereal/content/crew-wardrobe";
import { CREW_ITEMS, CREW_ITEM_CATALOG } from "@sidereal/content/crew-items";
export type GroundItem = {
  id: string;
  definitionId: string;
  localX: number;
  localY: number;
  reachable: boolean;
  /** Native instance identity; presentation never resolves access from this. */
  instanceId?: string;
  /** Server-qualified deck; empty only for the legacy lab. */
  deckId?: string;
  /** Accepted support height at the item's stored location, in meters. */
  elevationM?: number;
};
export type GroundItemLabel = GroundItem & { x: number; y: number };
/** Runtime GLB drawn for a dropped item, or undefined for a label-only item. */
export function groundItemMeshUrl(d: InventoryDefinition): string | undefined {
  // Wardrobe armour shows its armour-v1 part; a folded uniform has no ground mesh (label only).
  if (d.wardrobeId) {
    const part = crewArmorPart(crewWardrobeItem(d.wardrobeId)?.part ?? "");
    return part ? crewArmorAssetUrl(part) : undefined;
  }
  // Owned r008 armour items keep their published component mesh.
  if (d.characterComponentId) return d.iconUrl!.replace(".png", ".glb");
  // r001 handhelds (and the legacy definitions upgraded to them) show the same art as in hand.
  const handheld = d.crewItemId
    ? CREW_ITEMS.find((item) => item.id === d.crewItemId)
    : undefined;
  if (handheld) return CREW_ITEM_CATALOG.assetBase + handheld.files.lod1;
  return "/assets/equipment/" + d.assetId + ".glb";
}
/** Presentation only. Ground positions and item discovery are supplied by authority. */
export function createGroundItems(scene: Scene, ship: TransformNode) {
  const entries = new Map<
    string,
    { row: GroundItem; root: TransformNode; asset?: AssetContainer }
  >();
  let disposed = false,
    visible = false;
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (entry) {
      entries.delete(id);
      entry.asset?.dispose();
      entry.root.dispose();
    }
  };
  function update(rows: readonly GroundItem[], shown: boolean) {
    visible = shown;
    for (const id of entries.keys())
      if (!rows.some((row) => row.id === id)) remove(id);
    for (const row of rows) {
      let entry = entries.get(row.id);
      if (!entry) {
        const d = INVENTORY_DEFINITIONS.find((d) => d.id === row.definitionId);
        if (!d) continue;
        const root = new TransformNode("ground-item:" + row.id, scene);
        root.parent = ship;
        entry = { row, root };
        entries.set(row.id, entry);
        const url = groundItemMeshUrl(d);
        const owned = entry;
        void (
          url
            ? SceneLoader.LoadAssetContainerAsync(
                "",
                url,
                scene,
                undefined,
                ".glb",
              )
            : Promise.reject(new Error("no ground mesh"))
        )
          .then((asset) => {
            if (disposed || entries.get(row.id) !== owned) {
              asset.dispose();
              return;
            }
            owned.asset = asset;
            asset.addAllToScene();
            const placement = new TransformNode(
              "ground-surface:" + row.id,
              scene,
            );
            for (const node of asset.rootNodes) node.parent = placement;
            // Recenter the authored standalone component without changing its size.
            if (d.pose) placement.rotation.x = Math.PI / 2;
            for (const mesh of placement.getChildMeshes())
              mesh.computeWorldMatrix(true);
            const bounds = placement.getHierarchyBoundingVectors(true);
            placement.position.set(
              -(bounds.min.x + bounds.max.x) / 2,
              -bounds.min.y,
              -(bounds.min.z + bounds.max.z) / 2,
            );
            placement.parent = owned.root;
            for (const mesh of placement.getChildMeshes())
              mesh.metadata = {
                ...mesh.metadata,
                partId: "ground:" + row.id,
                role: "equipment",
              };
          })
          .catch(() => {});
      }
      entry.row = row;
      entry.root.position.set(row.localX, row.elevationM ?? 0.16, -row.localY);
      entry.root.setEnabled(shown);
    }
  }
  return {
    update,
    labels(): GroundItemLabel[] {
      const camera = scene.activeCamera,
        canvas = scene.getEngine().getRenderingCanvas();
      if (!visible || !camera || !canvas) return [];
      const viewport = camera.viewport.toGlobal(
        canvas.clientWidth,
        canvas.clientHeight,
      );
      return [...entries.values()].flatMap(({ row, root }) => {
        root.computeWorldMatrix(true);
        const at = Vector3.TransformCoordinates(
          new Vector3(0, 0.75, 0),
          root.getWorldMatrix(),
        );
        const point = Vector3.Project(
          at,
          Matrix.IdentityReadOnly,
          scene.getTransformMatrix(),
          viewport,
        );
        return point.z >= 0 && point.z <= 1
          ? [{ ...row, x: point.x, y: point.y }]
          : [];
      });
    },
    dispose() {
      disposed = true;
      for (const id of [...entries.keys()]) remove(id);
    },
  };
}
