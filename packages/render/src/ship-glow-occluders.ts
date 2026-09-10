import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
const mergeRoles = new Set([
  "hull",
  "roof",
  "floor",
  "wall",
  "equipment",
  "cargo",
]);

const transformProperties = ["position", "scaling", "rotation"] as const;
const axes = ["x", "y", "z"] as const;
function changedValue(
  values: (number | undefined)[],
  index: number,
  value: number | undefined,
) {
  const previous = values[index];
  values[index] = value;
  return previous !== value;
}

export interface GlowPlacementRange {
  start: number;
  count: number;
  placementId: string;
  sourceMeshId: number;
}
/** Offscreen-only copies. Original surfaces, materials and picking stay untouched. */
export function createShipGlowOccluders(
  scene: Scene,
  root: TransformNode,
  layer: GlowLayer,
) {
  let sources: AbstractMesh[] = [],
    proxies: Mesh[] = [],
    retained: AbstractMesh[] = [];
  let dirty = true,
    disposed = false;
  const retainedSet = new Set<AbstractMesh>();
  const geometryCallbacks = new Map<
    import("@babylonjs/core/Meshes/geometry").Geometry,
    {
      previous: import("@babylonjs/core/Meshes/geometry").Geometry["onGeometryUpdated"];
      callback: import("@babylonjs/core/Meshes/geometry").Geometry["onGeometryUpdated"];
    }
  >();
  const states = new Map<
    AbstractMesh,
    {
      enabled: boolean;
      eligible: boolean;
      material: unknown;
      geometry: unknown;
      indices: number;
      role: unknown;
      deckId: unknown;
      partId: unknown;
      group: number;
      orientation: number;
      cull: boolean | undefined;
      cullBack: boolean | undefined;
      receives: boolean;
    }
  >();
  const transforms = new Map<
    TransformNode,
    { parent: unknown; values: (number | undefined)[] }
  >();
  const oldList = layer.mainTexture.renderList,
    oldCustom = layer.mainTexture.getCustomRenderList;
  const materials = new Map<string, StandardMaterial>();
  const renderList: AbstractMesh[] = [];
  // Explicit RTT lists bypass the main camera's layer mask. Proxy layer 0 never
  // enters the main pass or its picking/lighting/shadow lists.
  layer.mainTexture.renderList = [];
  layer.mainTexture.getCustomRenderList = () => {
    renderList.length = 0;
    const active = scene.getActiveMeshes();
    for (let i = 0; i < active.length; i++)
      if (retainedSet.has(active.data[i])) renderList.push(active.data[i]);
    renderList.push(...proxies);
    return renderList;
  };
  function eligible(mesh: AbstractMesh): mesh is Mesh {
    if (
      !(mesh instanceof Mesh) ||
      !mesh.metadata?.partId ||
      !mergeRoles.has(mesh.metadata?.role) ||
      mesh.skeleton ||
      mesh.morphTargetManager ||
      mesh.hasVertexAlpha ||
      mesh.visibility !== 1 ||
      mesh.billboardMode !== 0
    )
      return false;
    const mat = mesh.material;
    if (
      !mat ||
      !["PBRMaterial", "StandardMaterial"].includes(mat.getClassName()) ||
      mat.disableDepthWrite ||
      mat.stencil.enabled ||
      mat.needAlphaBlendingForMesh(mesh) ||
      mat.needAlphaTestingForMesh(mesh) ||
      mat.alpha !== 1 ||
      mat.zOffset !== 0 ||
      mat.zOffsetUnits !== 0
    )
      return false;
    const emission = mat as typeof mat & {
      emissiveColor?: Color3;
      emissiveIntensity?: number;
    };
    if (
      (emission.emissiveIntensity ?? 1) !== 0 &&
      emission.emissiveColor &&
      (emission.emissiveColor.r !== 0 ||
        emission.emissiveColor.g !== 0 ||
        emission.emissiveColor.b !== 0)
    )
      return false;
    let parent = mesh.parent;
    while (parent && parent !== root) parent = parent.parent;
    return parent === root && mesh.getTotalIndices() > 0;
  }
  function releaseGeometryCallbacks() {
    for (const [geometry, { previous, callback }] of geometryCallbacks)
      if (geometry.onGeometryUpdated === callback)
        geometry.onGeometryUpdated = previous;
    geometryCallbacks.clear();
  }
  function clear() {
    for (const proxy of proxies) {
      layer.removeIncludedOnlyMesh(proxy);
      proxy.dispose(false, false);
    }
    proxies = [];
  }
  function rememberTransforms() {
    transforms.clear();
    for (const source of sources)
      if (!source.isDisposed() && eligible(source))
        for (
          let node: TransformNode | null = source;
          node && node !== root;
          node = node.parent as TransformNode | null
        ) {
          if (transforms.has(node)) break;
          transforms.set(node, { parent: node.parent, values: [] });
        }
  }
  function moved() {
    let changed = false,
      reparented = false;
    for (const [node, state] of transforms) {
      if (node.isDisposed()) continue;
      const q = node.rotationQuaternion;
      // Scalar comparisons avoid world-root motion and per-frame matrix allocation.
      if (state.parent !== node.parent) {
        changed = true;
        reparented = true;
        state.parent = node.parent;
      }
      let index = 0;
      for (const property of transformProperties)
        for (const axis of axes)
          changed =
            changedValue(state.values, index++, node[property][axis]) ||
            changed;
      for (const axis of axes)
        changed = changedValue(state.values, index++, q?.[axis]) || changed;
      changed = changedValue(state.values, index, q?.w) || changed;
    }
    if (reparented) rememberTransforms();
    return changed;
  }
  function rebuild() {
    clear();
    retained = [];
    retainedSet.clear();
    const groups = new Map<string, Mesh[]>();
    for (const source of sources) {
      if (source.isDisposed()) continue;
      if (!eligible(source)) {
        retained.push(source);
        retainedSet.add(source);
        continue;
      }
      if (!source.isEnabled() || !source.isVisible) continue;
      const mat = source.material!;
      const key = JSON.stringify([
        source.metadata.role,
        source.metadata.deckId ?? null,
        source.renderingGroupId,
        source.sideOrientation,
        mat.backFaceCulling,
        mat.cullBackFaces,
        source.receiveShadows,
      ]);
      const group = groups.get(key) ?? [];
      group.push(source);
      groups.set(key, group);
    }
    for (const source of sources)
      if (
        eligible(source) &&
        source.geometry &&
        !geometryCallbacks.has(source.geometry)
      ) {
        const geometry = source.geometry,
          previous = geometry.onGeometryUpdated;
        const callback: typeof previous = (geometry, kind) => {
          previous?.(geometry, kind);
          dirty = true;
        };
        geometry.onGeometryUpdated = callback;
        geometryCallbacks.set(geometry, { previous, callback });
      }
    root.computeWorldMatrix(true);
    const inverse = Matrix.Invert(root.getWorldMatrix());
    for (const [key, group] of groups) {
      const data = new VertexData();
      data.positions = [];
      data.indices = [];
      const ranges: GlowPlacementRange[] = [];
      for (const source of group) {
        const part = new VertexData();
        part.positions = Array.from(source.getVerticesData("position")!);
        part.indices = Array.from(source.getIndices()!);
        part.transform(source.computeWorldMatrix(true).multiply(inverse));
        const offset = data.positions.length / 3;
        ranges.push({
          start: data.indices.length / 3,
          count: part.indices!.length / 3,
          placementId: source.metadata.partId,
          sourceMeshId: source.uniqueId,
        });
        for (const value of part.positions!) data.positions.push(value);
        for (const index of part.indices!) data.indices.push(index + offset);
      }
      const source = group[0],
        mat = source.material!;
      let black = materials.get(key);
      if (!black) {
        black = new StandardMaterial("glow-occlusion", scene);
        black.disableLighting = true;
        black.diffuseColor = Color3.Black();
        black.emissiveColor = Color3.Black();
        black.backFaceCulling = mat.backFaceCulling;
        black.cullBackFaces = mat.cullBackFaces;
        materials.set(key, black);
      }
      const proxy = new Mesh("ship-glow-occluder", scene);
      proxy.metadata = {
        role: "proxy",
        staticMaterial: true,
        structuralRole: source.metadata.role,
        deckId: source.metadata.deckId,
        trianglePlacements: ranges,
      };
      data.applyToMesh(proxy);
      proxy.parent = root;
      proxy.material = black;
      proxy.layerMask = 0;
      proxy.isPickable = false;
      proxy.sideOrientation = source.sideOrientation;
      proxy.renderingGroupId = source.renderingGroupId;
      proxies.push(proxy);
      layer.addIncludedOnlyMesh(proxy);
    }
    rememberTransforms();
    moved();
    dirty = false;
  }
  function update() {
    if (disposed) return;
    for (const source of sources) {
      const enabled =
        !source.isDisposed() && source.isEnabled() && source.isVisible;
      const canMerge = enabled && eligible(source);
      const geometry = source instanceof Mesh ? source.geometry : null;
      const previous = states.get(source),
        indices = source.isDisposed() ? 0 : source.getTotalIndices();
      if (
        !previous ||
        previous.eligible !== canMerge ||
        ((canMerge || previous.eligible) &&
          (previous.material !== source.material ||
            previous.geometry !== geometry ||
            previous.indices !== indices ||
            previous.role !== source.metadata?.role ||
            previous.deckId !== source.metadata?.deckId ||
            previous.partId !== source.metadata?.partId ||
            previous.group !== source.renderingGroupId ||
            previous.orientation !==
              (source instanceof Mesh ? source.sideOrientation : 0) ||
            previous.cull !== source.material?.backFaceCulling ||
            previous.cullBack !== source.material?.cullBackFaces ||
            previous.receives !== source.receiveShadows))
      ) {
        dirty = true;
        states.set(source, {
          enabled,
          eligible: canMerge,
          material: source.material,
          geometry,
          indices,
          role: source.metadata?.role,
          deckId: source.metadata?.deckId,
          partId: source.metadata?.partId,
          group: source.renderingGroupId,
          orientation: source instanceof Mesh ? source.sideOrientation : 0,
          cull: source.material?.backFaceCulling,
          cullBack: source.material?.cullBackFaces,
          receives: source.receiveShadows,
        });
      }
    }
    if (moved()) dirty = true;
    if (dirty) rebuild();
  }
  const observer = scene.onBeforeRenderObservable.add(update);
  return {
    set(meshes: readonly AbstractMesh[]) {
      releaseGeometryCallbacks();
      for (const source of sources)
        layer.removeIncludedOnlyMesh(source as Mesh);
      sources = [...new Set(meshes)];
      for (const source of sources) layer.addIncludedOnlyMesh(source as Mesh);
      states.clear();
      rememberTransforms();
      dirty = true;
      update();
    },
    update,
    get proxies() {
      return proxies as readonly Mesh[];
    },
    get retained() {
      return retained as readonly AbstractMesh[];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(observer);
      clear();
      for (const source of sources)
        layer.removeIncludedOnlyMesh(source as Mesh);
      for (const material of materials.values()) material.dispose();
      releaseGeometryCallbacks();
      layer.mainTexture.renderList = oldList;
      layer.mainTexture.getCustomRenderList = oldCustom;
    },
  };
}

/** Triangle indices use the same faceId convention as Babylon picking. */
export function glowPlacementAtTriangle(
  mesh: Mesh,
  faceId: number,
): string | undefined {
  if (
    !Number.isInteger(faceId) ||
    faceId < 0 ||
    mesh.metadata?.role !== "proxy"
  )
    return;
  const ranges = mesh.metadata.trianglePlacements as
    GlowPlacementRange[] | undefined;
  return ranges?.find(
    (range) => faceId >= range.start && faceId < range.start + range.count,
  )?.placementId;
}
