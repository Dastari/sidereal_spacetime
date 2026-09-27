/** Ship-local east/north/up metres. Measurements never write the draft. */
export type MeasurementPoint = [number, number, number];
export const MAX_MEASUREMENT_POINTS = 128;

export function measurePath(points: readonly MeasurementPoint[]) {
  const segments = points.slice(1).map((point, index) => {
    const previous = points[index];
    return {
      distance: Math.hypot(
        ...point.map((value, axis) => value - previous[axis]),
      ),
      deltaZ: point[2] - previous[2],
    };
  });
  return {
    segments,
    totalDistance: segments.reduce(
      (total, segment) => total + segment.distance,
      0,
    ),
    deltaZ: points.length > 1 ? points.at(-1)![2] - points[0][2] : 0,
  };
}

/** Read the triangle's real vertex buffer, including non-indexed native meshes. */
export function measurementTriangleVertices(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  faceId: number,
): MeasurementPoint[] {
  if (!Number.isSafeInteger(faceId) || faceId < 0) return [];
  const vertices: MeasurementPoint[] = [];
  for (let corner = 0; corner < 3; corner++) {
    const vertex = indices?.length
      ? indices[faceId * 3 + corner]
      : faceId * 3 + corner;
    if (
      !Number.isSafeInteger(vertex) ||
      vertex < 0 ||
      vertex * 3 + 2 >= positions.length
    )
      return [];
    const point: MeasurementPoint = [
      positions[vertex * 3],
      positions[vertex * 3 + 1],
      positions[vertex * 3 + 2],
    ];
    if (!point.every(Number.isFinite)) return [];
    vertices.push(point);
  }
  return vertices;
}

export function nearestMeasurementVertex(
  vertices: readonly { point: MeasurementPoint; screen: MeasurementPoint }[],
  x: number,
  y: number,
  thresholdPixels = 18,
): MeasurementPoint | null {
  let best: MeasurementPoint | null = null;
  let distance = thresholdPixels;
  for (const vertex of vertices) {
    if (
      !vertex.screen.every(Number.isFinite) ||
      vertex.screen[2] < 0 ||
      vertex.screen[2] > 1
    )
      continue;
    const next = Math.hypot(vertex.screen[0] - x, vertex.screen[1] - y);
    if (next <= distance) {
      distance = next;
      best = vertex.point;
    }
  }
  return best;
}

export function measurementShipPoint(
  renderPoint: readonly number[],
  renderOrigin: readonly number[],
): MeasurementPoint {
  return [
    renderPoint[0] + renderOrigin[0],
    -renderPoint[2] - renderOrigin[2],
    renderPoint[1] + renderOrigin[1],
  ];
}
