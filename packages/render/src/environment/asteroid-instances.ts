import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

/** Static imported hierarchies only. Regular instances retain per-contact culling and picking. */
export function createStaticAsteroidInstances(source: TransformNode) {
  const descendants = [source, ...source.getDescendants(false)];
  if (descendants.some((node) => !(node instanceof TransformNode)))
    return undefined;
  const nodes = descendants as TransformNode[];
  const unsupported = nodes.some((node) => {
    if (
      !["TransformNode", "Mesh"].includes(node.getClassName()) ||
      node.animations.length > 0 ||
      node.billboardMode !== 0 ||
      node.infiniteDistance ||
      node.onAfterWorldMatrixUpdateObservable.hasObservers() ||
      node.computeWorldMatrix !== TransformNode.prototype.computeWorldMatrix
    )
      return true;
    return (
      node instanceof Mesh &&
      Boolean(
        node.checkCollisions ||
        node.material instanceof MultiMaterial ||
        node.skeleton ||
        node.morphTargetManager ||
        node.hasThinInstances ||
        node.hasLODLevels ||
        (node.material && node.material.needAlphaBlendingForMesh(node)),
      )
    );
  });
  if (
    unsupported ||
    !nodes.some((node) => node instanceof Mesh && node.getTotalVertices() > 0)
  )
    return undefined;
  const state = new Map(
    nodes.map((node) => [
      node,
      {
        enabled: node.isEnabled(false),
        visible: node instanceof Mesh ? node.isVisible : true,
        pickable: node instanceof Mesh ? node.isPickable : false,
        visibility: node instanceof Mesh ? node.visibility : 1,
        shadows: node instanceof Mesh ? node.receiveShadows : false,
        layerMask: node instanceof Mesh ? node.layerMask : 0,
        cullingStrategy: node instanceof Mesh ? node.cullingStrategy : 0,
        alwaysSelectAsActiveMesh:
          node instanceof Mesh ? node.alwaysSelectAsActiveMesh : false,
        alphaIndex: node instanceof Mesh ? node.alphaIndex : 0,
        metadata: node.metadata,
      },
    ]),
  );
  // Babylon's instance batch owner must be enabled even while its own geometry is hidden.
  source.setEnabled(true);
  for (const node of nodes)
    if (node instanceof Mesh) {
      node.isVisible = false;
      node.isPickable = false;
    }
  return (name: string, parent: TransformNode) => {
    const instance = source.instantiateHierarchy(
      parent,
      undefined,
      (original, alias) => {
        const saved = state.get(original)!;
        alias.setEnabled(original === source || saved.enabled);
        alias.metadata =
          saved.metadata == null ? saved.metadata : { ...saved.metadata };
        if (alias instanceof AbstractMesh) {
          alias.isVisible = saved.visible;
          alias.isPickable = saved.pickable;
          alias.visibility = saved.visibility;
          alias.receiveShadows = saved.shadows;
          alias.layerMask = saved.layerMask;
          alias.cullingStrategy = saved.cullingStrategy;
          alias.alwaysSelectAsActiveMesh = saved.alwaysSelectAsActiveMesh;
          alias.alphaIndex = saved.alphaIndex;
        }
      },
    );
    if (!instance) throw new Error("Asteroid instance hierarchy failed");
    instance.name = name;
    return instance;
  };
}
