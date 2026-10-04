import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import "@babylonjs/core/Rendering/edgesRenderer";
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { FurnishingOverride } from "@sidereal/content/wayfarer-furnishings";
import { FURNISHING_DEFAULT } from "@sidereal/content/wayfarer-furnishings";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import type { PrefabShipBinding } from "./prefab-ship-interaction";
import { setMeshRole } from "./mesh-roles";

/** Extract just the selected authored ranges. Restore the immutable batch on cancel/disposal. */
export function createFurnishingPreview(
  scene: Scene,
  canvas: HTMLCanvasElement,
  shipRoot: TransformNode,
  binding: PrefabShipBinding,
  invalidate: () => void,
) {
  const origin = prefabOrigin(binding.doc);
  let selected: string | undefined;
  let pivot: TransformNode | undefined;
  let ghosts: Mesh[] = [];
  let restore: (() => void)[] = [];
  let baseline = FURNISHING_DEFAULT;
  const clear = () => {
    for (const restoreBatch of restore) restoreBatch();
    restore = [];
    for (const ghost of ghosts) ghost.dispose(false, false);
    ghosts = [];
    pivot?.dispose();
    pivot = undefined;
    selected = undefined;
    invalidate();
  };
  const ray = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect(),
      engine = scene.getEngine();
    if (!scene.activeCamera || rect.width <= 0 || rect.height <= 0) return;
    return scene.createPickingRay(
      ((clientX - rect.left) / rect.width) *
        engine.getRenderWidth() *
        engine.getHardwareScalingLevel(),
      ((clientY - rect.top) / rect.height) *
        engine.getRenderHeight() *
        engine.getHardwareScalingLevel(),
      Matrix.Identity(),
      scene.activeCamera,
    );
  };
  const localRay = (x: number, y: number) => {
    const world = ray(x, y);
    if (!world) return;
    return Ray.Transform(
      world,
      Matrix.Invert(shipRoot.computeWorldMatrix(true)),
    );
  };
  const begin = (id: string) => {
    if (selected === id) return true;
    clear();
    const source = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id);
    if (!source) return false;
    baseline = binding.furnishings?.[id] ?? FURNISHING_DEFAULT;
    const center = new Vector3(
      -((source.min[1] + source.max[1]) / 2 + baseline.dy - origin[1]),
      0,
      -((source.min[0] + source.max[0]) / 2 + baseline.dx - origin[0]),
    );
    pivot = new TransformNode("furnishing-placement-preview", scene);
    pivot.parent = shipRoot;
    for (const mesh of [...scene.meshes]) {
      if (!(mesh instanceof Mesh)) continue;
      const ranges = (mesh.metadata?.authoredStudy?.placementRanges ?? []) as {
        object: string;
        indexStart: number;
        indexCount: number;
      }[];
      const owned = ranges.filter((r) => r.object === id);
      const indices = mesh.getIndices();
      if (!owned.length || !indices) continue;
      const original = Array.from(indices),
        hidden = [...original];
      const toRoot = mesh
        .computeWorldMatrix(true)
        .multiply(Matrix.Invert(shipRoot.computeWorldMatrix(true)));
      const vertices = new Map<number, number>(),
        nextIndices: number[] = [];
      for (const r of owned) {
        for (let i = r.indexStart; i < r.indexStart + r.indexCount; i++) {
          const v = original[i];
          if (!vertices.has(v)) vertices.set(v, vertices.size);
          nextIndices.push(vertices.get(v)!);
          hidden[i] = original[r.indexStart];
        }
      }
      const data = new VertexData();
      data.indices = nextIndices;
      for (const [kind, size, field] of [
        [VertexBuffer.PositionKind, 3, "positions"],
        [VertexBuffer.NormalKind, 3, "normals"],
        [VertexBuffer.UVKind, 2, "uvs"],
        [VertexBuffer.UV2Kind, 2, "uvs2"],
        [VertexBuffer.ColorKind, 4, "colors"],
        [VertexBuffer.TangentKind, 4, "tangents"],
      ] as const) {
        const values = mesh.getVerticesData(kind);
        if (!values) continue;
        const next: number[] = [];
        for (const index of vertices.keys()) {
          if (
            field === "positions" ||
            field === "normals" ||
            field === "tangents"
          ) {
            const vector = new Vector3(
              values[index * size],
              values[index * size + 1],
              values[index * size + 2],
            );
            const v =
              field === "positions"
                ? Vector3.TransformCoordinates(vector, toRoot).subtract(center)
                : Vector3.TransformNormal(vector, toRoot).normalize();
            next.push(v.x, v.y, v.z);
            if (size === 4) next.push(values[index * size + 3]);
          } else next.push(...values.slice(index * size, (index + 1) * size));
        }
        data[field] = next;
      }
      const ghost = new Mesh(
        `furnishing-preview:${id}:${ghosts.length}`,
        scene,
      );
      data.applyToMesh(ghost);
      ghost.parent = pivot;
      ghost.material = mesh.material;
      ghost.sideOrientation = mesh.sideOrientation;
      ghost.receiveShadows = true;
      ghost.enableEdgesRendering();
      ghost.edgesWidth = 1.5;
      ghost.edgesColor = new Color4(0.3, 0.9, 1, 1);
      setMeshRole(ghost, "effect");
      ghosts.push(ghost);
      for (const light of scene.lights) {
        for (const field of ["includedOnlyMeshes", "excludedMeshes"] as const) {
          if (light[field].includes(mesh)) {
            light[field].push(ghost);
            restore.push(() => {
              light[field] = light[field].filter((m) => m !== ghost);
            });
          }
        }
        const shadow = light.getShadowGenerator()?.getShadowMap();
        if (shadow?.renderList?.includes(mesh)) {
          shadow.renderList.push(ghost);
          restore.push(() => {
            if (shadow.renderList)
              shadow.renderList = shadow.renderList.filter((m) => m !== ghost);
          });
        }
      }
      // The ship layer has an explicit emitter list; retain the selected emitter's grading.
      const layer = scene.effectLayers?.find(
        (layer) => layer.name === "prefab-ship-glow",
      ) as GlowLayer | undefined;
      if (layer?.hasMesh(mesh)) {
        layer.addIncludedOnlyMesh(ghost);
        restore.push(() => layer.removeIncludedOnlyMesh(ghost));
      }
      mesh.setIndices(hidden);
      restore.push(() => {
        if (!mesh.isDisposed()) mesh.setIndices(original);
      });
    }
    if (!ghosts.length) {
      clear();
      return false;
    }
    for (const node of [...scene.transformNodes]) {
      if (
        !node.name.startsWith("asset-lighting:") ||
        !node.name.endsWith(`:${id}`)
      )
        continue;
      const parent = node.parent,
        position = node.position.clone(),
        scaling = node.scaling.clone(),
        rotation = node.rotation.clone(),
        quaternion = node.rotationQuaternion?.clone();
      const toRoot = node
        .computeWorldMatrix(true)
        .multiply(Matrix.Invert(shipRoot.computeWorldMatrix(true)));
      const localPosition = Vector3.Zero(),
        localScale = Vector3.One(),
        localRotation = Quaternion.Identity();
      toRoot.decompose(localScale, localRotation, localPosition);
      node.parent = pivot;
      node.position.copyFrom(localPosition.subtract(center));
      node.scaling.copyFrom(localScale);
      node.rotationQuaternion = localRotation;
      restore.push(() => {
        if (node.isDisposed()) return;
        node.parent = parent;
        node.position.copyFrom(position);
        node.scaling.copyFrom(scaling);
        node.rotation.copyFrom(rotation);
        node.rotationQuaternion = quaternion ?? null;
      });
    }
    selected = id;
    return true;
  };
  return {
    clear,
    dispose: clear,
    get active() {
      return !!selected;
    },
    show(id: string, pose: FurnishingOverride, valid = true) {
      if (!begin(id) || !pivot) return false;
      const source = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!;
      pivot.position.set(
        -((source.min[1] + source.max[1]) / 2 + pose.dy - origin[1]),
        0,
        -((source.min[0] + source.max[0]) / 2 + pose.dx - origin[0]),
      );
      pivot.rotation.y = pose.yaw - baseline.yaw;
      for (const ghost of ghosts)
        ghost.edgesColor = valid
          ? new Color4(0.3, 0.9, 1, 1)
          : new Color4(1, 0.3, 0.25, 1);
      invalidate();
      return true;
    },
    pick(x: number, y: number) {
      const world = ray(x, y);
      return (
        !!world &&
        !!scene.pickWithRay(world, (m) => ghosts.includes(m as Mesh))?.hit
      );
    },
    ray(x: number, y: number) {
      const r = localRay(x, y);
      if (!r) return;
      return {
        origin: [
          -r.origin.z + origin[0],
          -r.origin.x + origin[1],
          r.origin.y,
        ] as [number, number, number],
        direction: [-r.direction.z, -r.direction.x, r.direction.y] as [
          number,
          number,
          number,
        ],
      };
    },
  };
}
