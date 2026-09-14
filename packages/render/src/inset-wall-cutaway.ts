import { applyInsetBatchedVisibility } from "./inset-native-batches";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { INSET_VISUAL_PARTS } from "./inset-visual-registry";
import { prepareCutawayMeshes, applyCutawayVisibility } from "./cutaway";
type P = [number, number];
const registry = new Map(INSET_VISUAL_PARTS.map((p) => [p.key, p]));
function inside(p: P, poly: number[][]) {
  let result = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function distance(p: P, a: P, b: P) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    d = dx * dx + dy * dy,
    t = d
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d))
      : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function crosses(a: P, b: P, c: P, d: P) {
  const cross = (p: P, q: P, r: P) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return (
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  );
}
/** Per-placement visibility only. No camera, asset geometry or authority edits. */
export function createInsetWallCutaway(
  scene: Scene,
  parent: TransformNode,
  view: { roots: TransformNode[]; meshes: Mesh[] },
) {
  if (view.roots.length > 4096 || view.meshes.length > 32768)
    throw Error("Inset cutaway budget exceeded");
  const entries = view.roots.flatMap((root) => {
    const part = registry.get(root.metadata?.nativeKey);
    if (!part || part.kind !== "wall" || part.heightM !== 3) return [];
    let owner: TransformNode | null = root;
    while (owner && owner !== parent)
      owner = owner.parent as TransformNode | null;
    if (owner !== parent)
      throw Error("Inset cutaway root belongs to another parent");
    const meshes = view.meshes.filter((m) => m.parent === root);
    for (const mesh of meshes)
      mesh.metadata = { ...mesh.metadata, cutawayFade: true };
    prepareCutawayMeshes(meshes);
    return [{ root, part, meshes }];
  });
  return {
    update(cameraPosition: Vector3, interior: boolean) {
      const camera = scene.activeCamera as unknown as {
        getTarget?: () => Vector3;
      } | null;
      const target = camera?.getTarget?.();
      for (const { root, part, meshes } of entries) {
        let occludes = false;
        if (
          interior &&
          target &&
          !root.isDisposed() &&
          [...cameraPosition.asArray(), ...target.asArray()].every(
            Number.isFinite,
          )
        ) {
          const world = root.computeWorldMatrix(true);
          const determinant = world.determinant();
          if (Number.isFinite(determinant) && Math.abs(determinant) > 1e-12) {
            const inverse = new Matrix();
            world.invertToRef(inverse);
            const a = Vector3.TransformCoordinates(cameraPosition, inverse),
              b = Vector3.TransformCoordinates(target, inverse);
            const start: P = [a.x, -a.z],
              end: P = [b.x, -b.z],
              dx = end[0] - start[0],
              dy = end[1] - start[1],
              length2 = dx * dx + dy * dy;
            const padding =
              0.35 *
              Math.max(
                Vector3.TransformNormal(Vector3.Right(), inverse).length(),
                Vector3.TransformNormal(Vector3.Forward(), inverse).length(),
              );
            // A wall wholly beyond the target in the deck plane cannot hide the actor.
            const forward = part.footprintM.map(
              (p) => (p[0] - start[0]) * dx + (p[1] - start[1]) * dy,
            );
            if (
              length2 > 1e-12 &&
              Math.min(...forward) < length2 - 1e-8 &&
              Math.max(...forward) > 1e-8
            ) {
              let low = 0,
                high = 1 - 1e-6;
              const dz = b.y - a.y;
              if (Math.abs(dz) < 1e-12) {
                if (a.y < 0 || a.y > part.heightM) high = -1;
              } else {
                const t0 = (0 - a.y) / dz,
                  t1 = (part.heightM - a.y) / dz;
                low = Math.max(low, Math.min(t0, t1));
                high = Math.min(high, Math.max(t0, t1));
              }
              if (low <= high) {
                const p: P = [start[0] + dx * low, start[1] + dy * low],
                  q: P = [start[0] + dx * high, start[1] + dy * high];
                occludes =
                  inside(p, part.footprintM) ||
                  inside(q, part.footprintM) ||
                  part.footprintM.some((v, i) => {
                    const c = v as P,
                      d = part.footprintM[
                        (i + 1) % part.footprintM.length
                      ] as P;
                    return (
                      crosses(p, q, c, d) ||
                      Math.min(
                        distance(p, c, d),
                        distance(q, c, d),
                        distance(c, p, q),
                        distance(d, p, q),
                      ) <= padding
                    );
                  });
              }
            }
          }
        }
        for (const mesh of meshes)
          if (
            !mesh.isDisposed() &&
            !applyInsetBatchedVisibility(mesh, occludes ? 0.12 : 1)
          )
            applyCutawayVisibility(mesh, occludes ? 0.12 : 1);
      }
    },
  };
}
