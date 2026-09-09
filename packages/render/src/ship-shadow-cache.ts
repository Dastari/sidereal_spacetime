import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

/** Reused scalar storage avoids per-node arrays and string serialization. */
class PlacementSnapshot {
  visited = 0;
  private values: (number | boolean | undefined)[] = [];
  private cursor = 0;
  private changed = false;

  private compare(value: number | boolean | undefined) {
    if (!Object.is(this.values[this.cursor], value)) this.changed = true;
    this.values[this.cursor++] = value;
  }

  private vector(value: { x: number; y: number; z: number }) {
    this.compare(value.x);
    this.compare(value.y);
    this.compare(value.z);
  }

  capture(node: TransformNode) {
    this.cursor = 0;
    this.changed = false;
    this.compare(node.parent?.uniqueId);
    this.vector(node.position);
    this.vector(node.scaling);
    const rotation = node.rotationQuaternion;
    this.vector(rotation ?? node.rotation);
    this.compare(rotation?.w);
    this.compare(node.isEnabled());
    if (node instanceof AbstractMesh) {
      this.compare(node.isVisible);
      this.compare(node.visibility);
      this.compare(node.getTotalVertices());
      this.compare(node.getTotalIndices());
      // Replacing geometry with identical counts/bounds still changes depth.
      this.compare(node instanceof Mesh ? node.geometry?.uniqueId : undefined);
      const box = node.getBoundingInfo().boundingBox;
      this.vector(box.minimum);
      this.vector(box.maximum);
    }
    return this.changed;
  }
}

/** Detect local occluder edits without depending on composed world matrices.
 * Ship translation/yaw and camera-origin rebasing move lights and casters
 * together. Ancestors below root, visibility, geometry and topology still count.
 * Scan mutable public Babylon properties so callers need no new invalidation API.
 */
export function createShadowPlacementCache(root: TransformNode) {
  const snapshots = new Map<TransformNode, PlacementSnapshot>();
  // A mesh can leave the caster list while remaining another caster's ancestor.
  // Track caster identity separately from the transform nodes we still visit.
  const casters = new Map<AbstractMesh, number>();
  let epoch = 0;
  let previousGeometryRevision: number | undefined;
  return {
    update(meshes: readonly AbstractMesh[], geometryRevision: number) {
      let dirty = geometryRevision !== previousGeometryRevision;
      previousGeometryRevision = geometryRevision;
      epoch++;
      let visitedCount = 0;
      let casterCount = 0;
      for (const mesh of meshes) {
        if (mesh.isDisposed()) continue;
        const previousVisit = casters.get(mesh);
        if (previousVisit === epoch) continue;
        if (previousVisit !== epoch - 1) dirty = true;
        casters.set(mesh, epoch);
        casterCount++;
        let node: TransformNode | null = mesh;
        while (node && node !== root) {
          let snapshot = snapshots.get(node);
          if (snapshot?.visited === epoch) break;
          if (!snapshot) {
            snapshot = new PlacementSnapshot();
            snapshots.set(node, snapshot);
            dirty = true;
          }
          snapshot.visited = epoch;
          visitedCount++;
          if (snapshot.capture(node)) dirty = true;
          node = node.parent instanceof TransformNode ? node.parent : null;
        }
      }
      if (casterCount !== casters.size) {
        dirty = true;
        for (const [mesh, visited] of casters)
          if (visited !== epoch) casters.delete(mesh);
      }
      if (visitedCount !== snapshots.size) {
        dirty = true;
        for (const [node, snapshot] of snapshots)
          if (snapshot.visited !== epoch) snapshots.delete(node);
      }
      return dirty;
    },
    clear() {
      snapshots.clear();
      casters.clear();
      previousGeometryRevision = undefined;
    },
  };
}

/** Conservative sphere/cone intersection: false means the caster cannot shadow this light. */
export function sphereIntersectsSpot(
  center: Vector3,
  radius: number,
  origin: Vector3,
  direction: Vector3,
  range: number,
  angle: number,
) {
  const delta = center.subtract(origin),
    distance = delta.length();
  if (distance - radius > range) return false;
  const axis = direction.normalizeToNew(),
    along = Vector3.Dot(delta, axis);
  if (along + radius < 0) return false;
  const radial = Math.sqrt(Math.max(0, distance * distance - along * along));
  const half = angle / 2;
  return radial * Math.cos(half) - along * Math.sin(half) <= radius;
}
