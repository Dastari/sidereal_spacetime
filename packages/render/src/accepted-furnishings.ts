import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  FURNISHING_DEFAULT,
  readFurnishingOverrides,
  WAYFARER_MOVABLE_FURNISHINGS,
  type FurnishingOverride,
} from "@sidereal/content/wayfarer-furnishings";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import type { PrefabShipBinding } from "./prefab-ship-interaction";

export interface AcceptedFurnishings {
  instanceId: string;
  revision: bigint;
  json: string;
}
type Range = { object: string; indexStart: number; indexCount: number };
const kinds = [
  VertexBuffer.PositionKind,
  VertexBuffer.NormalKind,
  VertexBuffer.TangentKind,
];
const sameGeometry = (a: FurnishingOverride, b: FurnishingOverride) =>
  a.dx === b.dx && a.dy === b.dy && a.yaw === b.yaw && a.deleted === b.deleted;

/** Accepted overlays change the existing source batches, never the world or asset loader.
 * Keep an immutable loaded baseline so repeated rotations cannot accumulate mesh drift. */
export function createAcceptedFurnishings(
  scene: Scene,
  shipRoot: TransformNode,
  binding: PrefabShipBinding,
  initial: AcceptedFurnishings,
  beforeChange: () => void,
  invalidate: (meshes: readonly Mesh[]) => void,
) {
  let revision = initial.revision;
  const baseline = binding.furnishings ?? {};
  const origin = prefabOrigin(binding.doc);
  let batches:
    | {
        mesh: Mesh;
        ranges: Range[];
        indices: number[];
        values: Map<string, number[]>;
        toRoot: Matrix;
      }[]
    | undefined;
  let lamps: {
    node: TransformNode;
    id: string;
    toRoot: Matrix;
    enabled: boolean;
  }[] = [];
  const capture = () => {
    if (batches) return;
    batches = scene.meshes.flatMap((mesh) => {
      if (!(mesh instanceof Mesh) || !mesh.isDescendantOf(shipRoot)) return [];
      const ranges = (
        (mesh.metadata?.authoredStudy?.placementRanges ?? []) as Range[]
      ).filter((r) => WAYFARER_MOVABLE_FURNISHINGS.has(r.object));
      const indices = mesh.getIndices();
      if (!ranges.length || !indices) return [];
      return [
        {
          mesh,
          ranges,
          indices: Array.from(indices),
          values: new Map(
            kinds.flatMap((kind) => {
              const data = mesh.getVerticesData(kind);
              return data ? [[kind, Array.from(data)] as const] : [];
            }),
          ),
          toRoot: mesh
            .computeWorldMatrix(true)
            .multiply(Matrix.Invert(shipRoot.computeWorldMatrix(true))),
        },
      ];
    });
    lamps = scene.transformNodes.flatMap((node) => {
      if (
        !node.name.startsWith("asset-lighting:") ||
        !node.isDescendantOf(shipRoot)
      )
        return [];
      const id = node.name.slice(node.name.lastIndexOf(":") + 1);
      if (!WAYFARER_MOVABLE_FURNISHINGS.has(id)) return [];
      return [
        {
          node,
          id,
          toRoot: node
            .computeWorldMatrix(true)
            .multiply(Matrix.Invert(shipRoot.computeWorldMatrix(true))),
          enabled: node.isEnabled(false),
        },
      ];
    });
  };
  const transform = (id: string, pose: FurnishingOverride) => {
    const source = WAYFARER_GAMEPLAY_OBJECTS.find((s) => s.object === id)!;
    const loaded = baseline[id] ?? FURNISHING_DEFAULT;
    const x = (source.min[0] + source.max[0]) / 2 - origin[0];
    const y = (source.min[1] + source.max[1]) / 2 - origin[1];
    return Matrix.Translation(y + loaded.dy, 0, x + loaded.dx)
      .multiply(Matrix.RotationY(pose.yaw - loaded.yaw))
      .multiply(Matrix.Translation(-y - pose.dy, 0, -x - pose.dx));
  };
  return {
    apply(next: AcceptedFurnishings): boolean {
      if (next.instanceId !== initial.instanceId || next.revision <= revision)
        return false;
      const furnishings = readFurnishingOverrides(next.json);
      const changed = new Set(
        [
          ...new Set([
            ...Object.keys(binding.furnishings ?? {}),
            ...Object.keys(furnishings),
          ]),
        ].filter(
          (id) =>
            !sameGeometry(
              binding.furnishings?.[id] ?? FURNISHING_DEFAULT,
              furnishings[id] ?? FURNISHING_DEFAULT,
            ),
        ),
      );
      // A drag owns temporary hidden indices and reparented lights. Restore it first,
      // before taking the baseline or applying accepted geometry; later clear is harmless.
      beforeChange();
      if (changed.size) {
        capture();
        const touched: Mesh[] = [];
        for (const batch of batches!) {
          const owned = batch.ranges.filter((r) => changed.has(r.object));
          if (!owned.length || batch.mesh.isDisposed()) continue;
          const indices = Array.from(batch.mesh.getIndices()!);
          const values = new Map(
            kinds.flatMap((kind) => {
              const data = batch.mesh.getVerticesData(kind);
              return data ? [[kind, Array.from(data)] as const] : [];
            }),
          );
          for (const range of owned) {
            const pose = furnishings[range.object] ?? FURNISHING_DEFAULT;
            const vertices = new Set<number>();
            for (
              let i = range.indexStart;
              i < range.indexStart + range.indexCount;
              i++
            ) {
              vertices.add(batch.indices[i]);
              indices[i] = pose.deleted
                ? batch.indices[range.indexStart]
                : batch.indices[i];
            }
            const matrix = batch.toRoot
              .multiply(transform(range.object, pose))
              .multiply(Matrix.Invert(batch.toRoot));
            for (const [kind, data] of values) {
              const original = batch.values.get(kind)!;
              const size = kind === VertexBuffer.TangentKind ? 4 : 3;
              for (const v of vertices) {
                const p = Vector3.FromArray(original, v * size);
                const moved =
                  kind === VertexBuffer.PositionKind
                    ? Vector3.TransformCoordinates(p, matrix)
                    : Vector3.TransformNormal(p, matrix).normalize();
                data[v * size] = moved.x;
                data[v * size + 1] = moved.y;
                data[v * size + 2] = moved.z;
              }
            }
          }
          for (const [kind, data] of values)
            batch.mesh.setVerticesData(
              kind,
              data,
              true,
              kind === VertexBuffer.TangentKind ? 4 : 3,
            );
          batch.mesh.setIndices(indices);
          batch.mesh.refreshBoundingInfo();
          touched.push(batch.mesh);
        }
        for (const { node, id, toRoot, enabled } of lamps) {
          if (!changed.has(id) || node.isDisposed()) continue;
          const pose = furnishings[id] ?? FURNISHING_DEFAULT;
          const parentToRoot = node.parent
            ? node.parent
                .getWorldMatrix()
                .multiply(Matrix.Invert(shipRoot.computeWorldMatrix(true)))
            : Matrix.Invert(shipRoot.computeWorldMatrix(true));
          const matrix = toRoot
            .multiply(transform(id, pose))
            .multiply(Matrix.Invert(parentToRoot));
          const rotation = Quaternion.Identity();
          matrix.decompose(node.scaling, rotation, node.position);
          node.rotationQuaternion = rotation;
          node.setEnabled(enabled && !pose.deleted);
          node.computeWorldMatrix(true);
        }
        invalidate(touched);
      }
      binding.furnishings = furnishings;
      revision = next.revision;
      return true;
    },
  };
}
