import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { LayoutWall } from "@sidereal/sim/layout-compiler";

/** Compiler coordinates and deck measurements are integer 1/32 metre units. */
export interface LayoutStructuralGuide {
  walls: readonly LayoutWall[];
  deckId: string;
  elevationUnits: number;
  heightUnits: number;
}
type Point3 = [number, number, number];
/** Trace only surviving compiled spans. In particular, never bridge door gaps
 * from the unsplit perimeter or substitute a retained assembly wall for a span. */
export interface LayoutStructuralGuideOptions {
  /** Trace only the floor-level span. Plan projections (Top/Side/Front) draw
   * the wall-top ring offset from the base, which reads as a second outline. */
  baseOnly?: boolean;
}
export function layoutStructuralLines(
  input: LayoutStructuralGuide | undefined,
  origin: readonly number[] = [0, 0, 0],
  options: LayoutStructuralGuideOptions = {},
): { key: string; source: LayoutWall["source"]; points: Point3[] }[] {
  if (
    !input ||
    !Number.isFinite(input.elevationUnits) ||
    !Number.isFinite(input.heightUnits) ||
    input.heightUnits <= 0
  )
    return [];
  const bottom = input.elevationUnits / 32 - origin[1];
  const top = bottom + input.heightUnits / 32;
  return input.walls
    .filter((w) => w.deckId === input.deckId)
    .filter(
      (w) =>
        [...w.a, ...w.b].every(Number.isFinite) &&
        (w.a[0] !== w.b[0] || w.a[1] !== w.b[1]),
    )
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((w) => {
      const wallBottom = bottom + (w.treatment?.floorThicknessUnits ?? 0) / 32;
      const wallTop = w.treatment
        ? wallBottom + w.treatment.heightUnits / 32
        : top;
      const a: Point3 = [
        w.a[0] / 32 - origin[0],
        wallBottom,
        -w.a[1] / 32 - origin[2],
      ];
      const b: Point3 = [
        w.b[0] / 32 - origin[0],
        wallBottom,
        -w.b[1] / 32 - origin[2],
      ];
      return {
        key: w.key,
        source: w.source,
        points:
          options.baseOnly ||
          (w.treatment && ["open", "open-bay"].includes(w.treatment.intent))
            ? [a, b]
            : [a, b, [b[0], wallTop, b[2]], [a[0], wallTop, a[2]], [...a]],
      };
    });
}

/** Lightweight authoring lines, not rendered art, collision or placed fittings. */
export function createLayoutStructuralGuides(scene: Scene) {
  let mesh: LinesMesh | undefined;
  let signature = "";
  let count = 0;
  let pointCount = 0;
  let disposed = false;
  function clear() {
    mesh?.dispose();
    mesh = undefined;
    signature = "";
    count = 0;
    pointCount = 0;
  }
  return {
    get mesh() {
      return mesh;
    },
    get count() {
      return count;
    },
    update(
      input: LayoutStructuralGuide | undefined,
      visible: boolean,
      origin: readonly number[] = [0, 0, 0],
      options: LayoutStructuralGuideOptions = {},
    ) {
      if (disposed) return;
      const plan = layoutStructuralLines(input, origin, options);
      if (!plan.length) {
        clear();
        return;
      }
      // Keep a hidden guide reusable, but don't allocate invisible new geometry.
      if (!visible) {
        mesh?.setEnabled(false);
        return;
      }
      const next = JSON.stringify(plan);
      if (next !== signature) {
        const lines = plan.map((w) =>
          w.points.map((p) => Vector3.FromArray(p)),
        );
        // An updatable line system can only be refreshed in place when every
        // polyline keeps its point count; base-only guides change that.
        const points = plan.reduce((n, w) => n + w.points.length, 0);
        if (mesh && (count !== plan.length || pointCount !== points)) clear();
        pointCount = points;
        mesh = CreateLineSystem(
          "layout-structural-wall-guides",
          {
            lines,
            instance: mesh,
            updatable: true,
          },
          scene,
        );
        mesh.color = new Color3(0.55, 0.88, 1);
        mesh.alpha = 1;
        mesh.isPickable = false;
        mesh.metadata = {
          role: "effect",
          authoringGuide: true,
          wallKeys: plan.map((w) => w.key),
          deckId: input!.deckId,
        };
        signature = next;
        count = plan.length;
      }
      mesh!.setEnabled(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
  };
}
