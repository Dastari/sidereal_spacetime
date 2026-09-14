import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  measurementShipPoint,
  MAX_MEASUREMENT_POINTS,
  measurementTriangleVertices,
  nearestMeasurementVertex,
  type MeasurementPoint,
} from "./layout-measurement";
import { setMeshRole } from "./mesh-roles";

/** Editing/picking permission is deliberately separate: structural context may
 * be measured even when it cannot be selected, moved, or published. */
export function isMeasurableMesh(mesh: AbstractMesh, camera: ArcRotateCamera) {
  return (
    mesh.isEnabled() &&
    mesh.isVisible &&
    mesh.visibility > 0 &&
    (mesh.layerMask & camera.layerMask) !== 0 &&
    mesh.getTotalVertices() > 0 &&
    mesh.metadata?.role !== "effect" &&
    mesh.metadata?.role !== "proxy"
  );
}

export function measurementVertexFromPick(
  pick: PickingInfo,
  camera: ArcRotateCamera,
  width: number,
  height: number,
  origin: readonly number[],
  cursorX: number,
  cursorY: number,
): MeasurementPoint | null {
  const mesh = pick.pickedMesh;
  if (!pick.hit || !mesh || pick.faceId < 0) return null;
  const positions = mesh.getPositionData(true, true);
  if (!positions) return null;
  let world = mesh.computeWorldMatrix(true);
  if (pick.thinInstanceIndex >= 0) {
    const instance = (mesh as Mesh).thinInstanceGetWorldMatrices?.()[
      pick.thinInstanceIndex
    ];
    if (!instance) return null;
    world = instance.multiply(world);
  }
  const transform = camera
    .getViewMatrix()
    .multiply(camera.getProjectionMatrix());
  const viewport = camera.viewport.toGlobal(width, height);
  return nearestMeasurementVertex(
    measurementTriangleVertices(positions, mesh.getIndices(), pick.faceId).map(
      (position) => {
        const rendered = Vector3.TransformCoordinates(
          Vector3.FromArray(position),
          world,
        );
        const screen = Vector3.Project(
          rendered,
          Matrix.Identity(),
          transform,
          viewport,
        );
        return {
          point: measurementShipPoint(rendered.asArray(), origin),
          screen: screen.asArray() as MeasurementPoint,
        };
      },
    ),
    cursorX,
    cursorY,
  );
}

const samePoint = (a: MeasurementPoint | null, b: MeasurementPoint | null) =>
  a === b ||
  !!(a && b && a.every((value, axis) => Math.abs(value - b[axis]) < 1e-9));

/** One ephemeral polyline over native vertices, refreshed only by input/view
 * changes. Markers and guides never participate in picks or the draft. */
export function createVertexMeasurement(
  scene: Scene,
  camera: ArcRotateCamera,
  canvas: HTMLCanvasElement,
  pickingCoordinates: (
    x: number,
    y: number,
  ) => [number, number] | null | undefined,
  getOrigin: () => Vector3,
  changed: (points: MeasurementPoint[]) => void,
  requestRender: () => void,
  report: (message: string) => void = () => {},
) {
  let active = false;
  let points: MeasurementPoint[] = [];
  let hover: MeasurementPoint | null = null;
  let pathMesh: LinesMesh | undefined;
  let hoverMesh: LinesMesh | undefined;
  const renderPoint = (point: MeasurementPoint) => {
    const origin = getOrigin();
    return new Vector3(
      point[0] - origin.x,
      point[2] - origin.y,
      -point[1] - origin.z,
    );
  };
  function marker(point: MeasurementPoint) {
    const p = renderPoint(point);
    const radius =
      (camera.radius * Math.tan(camera.fov / 2) * 7) /
      Math.max(1, canvas.clientHeight);
    return [Vector3.Right(), Vector3.Up(), Vector3.Forward()].map((axis) => [
      p.subtract(axis.scale(radius)),
      p.add(axis.scale(radius)),
    ]);
  }
  function draw(name: string, lines: Vector3[][], color: Color3) {
    if (!lines.length) return undefined;
    const mesh = CreateLineSystem(name, { lines }, scene);
    setMeshRole(mesh, "effect");
    mesh.color = color;
    mesh.isPickable = false;
    mesh.renderingGroupId = 3;
    mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }
  function refresh() {
    pathMesh?.dispose();
    hoverMesh?.dispose();
    pathMesh = undefined;
    hoverMesh = undefined;
    if (!active) {
      requestRender();
      return;
    }
    const lines = points.flatMap(marker);
    for (let i = 1; i < points.length; i++)
      lines.push([renderPoint(points[i - 1]), renderPoint(points[i])]);
    pathMesh = draw("vertex-measurement-path", lines, new Color3(0.2, 0.95, 1));
    const preview = hover ? marker(hover) : [];
    if (hover && points.length)
      preview.push([renderPoint(points.at(-1)!), renderPoint(hover)]);
    hoverMesh = draw(
      "vertex-measurement-hover",
      preview,
      new Color3(1, 0.78, 0.2),
    );
    requestRender();
  }
  function emit() {
    canvas.dataset.measurementPoints = JSON.stringify(points);
    changed(points.map((point) => [...point]));
    refresh();
  }
  function setActive(value: boolean) {
    if (active === value) return;
    active = value;
    hover = null;
    delete canvas.dataset.measurementHover;
    refresh();
  }
  function clear() {
    hover = null;
    points = [];
    delete canvas.dataset.measurementHover;
    emit();
  }
  function removeLast() {
    if (!points.length) return;
    points = points.slice(0, -1);
    emit();
  }
  function measureAt(x: number, y: number, append: boolean): boolean {
    if (!active) return false;
    const coordinates = pickingCoordinates(x, y);
    const rect = canvas.getBoundingClientRect();
    const pick = coordinates
      ? scene.pick(
          coordinates[0],
          coordinates[1],
          (mesh) => isMeasurableMesh(mesh, camera),
          false,
          camera,
        )
      : null;
    const next = pick
      ? measurementVertexFromPick(
          pick,
          camera,
          rect.width,
          rect.height,
          getOrigin().asArray(),
          x - rect.left,
          y - rect.top,
        )
      : null;
    if (!samePoint(hover, next)) {
      hover = next;
      if (hover) canvas.dataset.measurementHover = JSON.stringify(hover);
      else delete canvas.dataset.measurementHover;
      refresh();
    }
    if (!append || !next) return !!next;
    if (samePoint(points.at(-1) ?? null, next)) return false;
    if (points.length >= MAX_MEASUREMENT_POINTS) {
      report(
        `Measurement has ${MAX_MEASUREMENT_POINTS} points. Remove the last point or clear to continue.`,
      );
      return false;
    }
    points = [...points, [...next]];
    emit();
    return true;
  }
  return {
    setActive,
    clear,
    removeLast,
    measureAt,
    refresh,
    get active() {
      return active;
    },
    hideHover() {
      if (!hover) return;
      hover = null;
      delete canvas.dataset.measurementHover;
      refresh();
    },
    dispose() {
      pathMesh?.dispose();
      hoverMesh?.dispose();
    },
  };
}
