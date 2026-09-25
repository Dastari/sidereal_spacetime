import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";

/** Hull size boundary in integer 1/32 metre floorplan units. */
export interface LayoutHullEnvelope {
  origin: readonly [number, number];
  width: number;
  length: number;
}
type Point3 = [number, number, number];

/** Dashed rectangle segments on the deck plane, in renderer metres. The plan SVG
 * draws this outline in orthographic views; the 3D projection draws it here so
 * no raster is ever warped through a perspective transform. */
export function layoutHullEnvelopeLines(
  envelope: LayoutHullEnvelope | undefined,
  elevationUnits: number,
  origin: readonly number[] = [0, 0, 0],
  dashUnits = 16,
): Point3[][] {
  if (
    !envelope ||
    ![
      envelope.origin[0],
      envelope.origin[1],
      envelope.width,
      envelope.length,
      elevationUnits,
    ].every(Number.isFinite) ||
    envelope.width <= 0 ||
    envelope.length <= 0
  )
    return [];
  const y = elevationUnits / 32 - origin[1] + 0.02;
  const to = (u: number, v: number): Point3 => [
    u / 32 - origin[0],
    y,
    -v / 32 - origin[2],
  ];
  const [x0, y0] = envelope.origin,
    x1 = x0 + envelope.width,
    y1 = y0 + envelope.length;
  const edges: [number, number, number, number][] = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
  const lines: Point3[][] = [];
  for (const [ax, ay, bx, by] of edges) {
    const length = Math.hypot(bx - ax, by - ay);
    const dashes = Math.max(1, Math.round(length / dashUnits));
    // Dash and gap alternate over an odd count so both corners stay marked.
    const count = dashes % 2 ? dashes : dashes + 1;
    for (let i = 0; i < count; i += 2) {
      const t0 = i / count,
        t1 = Math.min(1, (i + 1) / count);
      lines.push([
        to(ax + (bx - ax) * t0, ay + (by - ay) * t0),
        to(ax + (bx - ax) * t1, ay + (by - ay) * t1),
      ]);
    }
  }
  return lines;
}

export function createLayoutHullEnvelope(scene: Scene) {
  let mesh: LinesMesh | undefined;
  let signature = "";
  let disposed = false;
  return {
    get mesh() {
      return mesh;
    },
    update(
      envelope: LayoutHullEnvelope | undefined,
      elevationUnits: number,
      visible: boolean,
      origin: readonly number[] = [0, 0, 0],
    ) {
      if (disposed) return;
      const lines = layoutHullEnvelopeLines(envelope, elevationUnits, origin);
      if (!lines.length || !visible) {
        mesh?.setEnabled(false);
        return;
      }
      const next = JSON.stringify(lines);
      if (next !== signature) {
        mesh?.dispose();
        mesh = CreateLineSystem(
          "layout-hull-envelope",
          { lines: lines.map((l) => l.map((p) => Vector3.FromArray(p))) },
          scene,
        );
        mesh.color = new Color3(0.21, 0.78, 0.96);
        mesh.isPickable = false;
        mesh.metadata = { role: "effect", authoringGuide: true };
        signature = next;
      }
      mesh!.setEnabled(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh?.dispose();
      mesh = undefined;
    },
  };
}
