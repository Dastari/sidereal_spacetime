import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
import type { EquipmentPoseConfiguration } from "./crew/pose-review-config";
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
/** Presentation only. Ground positions and item discovery are supplied by authority. */
export function createGroundItems(
  scene: Scene,
  ship: TransformNode,
  paired?: EquipmentPoseConfiguration,
) {
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
        const url = d.characterComponentId
          ? d.iconUrl!.replace(".png", ".glb")
          : (paired?.items[d.assetId]
              ? paired.equipmentUrl
              : "/assets/equipment/") +
            d.assetId +
            ".glb";
        const owned = entry;
        void SceneLoader.LoadAssetContainerAsync(
          "",
          url,
          scene,
          undefined,
          ".glb",
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
