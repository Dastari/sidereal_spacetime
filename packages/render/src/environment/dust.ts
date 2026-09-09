/** Presentation response to replicated velocity, never a warp/control grant. */
export function dustMotion(vx: number, vy: number, reducedMotion: boolean) {
  const speed =
    Number.isFinite(vx) && Number.isFinite(vy) ? Math.hypot(vx, vy) : 0;
  // Ordinary maneuvering reads as grains. Longer exposure begins beyond 40 m/s;
  // the distinctly long-streak treatment is reserved for 600–3000 m/s travel.
  const shortTrail = reducedMotion
    ? 0
    : Math.min(1, Math.max(0, (speed - 40) / 120));
  const fast = reducedMotion
    ? 0
    : Math.min(1, Math.max(0, (speed - 600) / 2400));
  const warpBlend = fast * fast * (3 - 2 * fast);
  const streakRatio = 1 + Math.floor((shortTrail * 2 + warpBlend * 45) * 4) / 4;
  return {
    speed,
    length: 0.16 * streakRatio,
    streakRatio,
    warpBlend,
    intensity: 0.8 + shortTrail * 0.12 + warpBlend * 0.45,
    heading: speed > 0 ? Math.atan2(vx, -vy) : 0,
  };
}
export const DUST_SIDE = 24;
export const DUST_COUNT = DUST_SIDE * DUST_SIDE;
/** A complete rectangular cell field adapts to portrait/ultrawide viewports.
 * Spacing is snapped to a world LOD, not continuously stretched with the camera. */
export function dustLayout(
  halfExtent: number,
  aspect: number,
  budget = DUST_COUNT,
) {
  const half = Number.isFinite(halfExtent)
    ? Math.max(8, Math.min(4000, halfExtent))
    : 55;
  const ratio = Number.isFinite(aspect)
    ? Math.max(0.25, Math.min(4, aspect))
    : 1;
  const count = Math.max(16, Math.min(DUST_COUNT, Math.floor(budget)));
  const columns = Math.round(Math.sqrt(count) * Math.sqrt(ratio));
  const rows = Math.floor(count / columns);
  const required = Math.max(
    (half * ratio * 2 + 32) / columns,
    (half * 2 + 32) / rows,
  );
  const spacing = Math.max(8, 2 ** Math.ceil(Math.log2(required)));
  return { spacing, columns, rows, count: columns * rows };
}

type DustVector = { x: number; y: number; z: number };
/** World-horizontal depth strata. Heights are fixed within quantized world
 * bands, not translated with camera XY. Perspective creates the speed ratios. */
export function dustDepthLayers(
  camera: DustVector,
  target: DustVector,
  fov: number,
  aspect: number,
) {
  const delta = {
    x: target.x - camera.x,
    y: target.y - camera.y,
    z: target.z - camera.z,
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  if (!Number.isFinite(distance) || distance < 1 || delta.y >= -0.1) return [];
  const forward = {
    x: delta.x / distance,
    y: delta.y / distance,
    z: delta.z / distance,
  };
  const lateral = Math.hypot(forward.x, forward.z);
  const right =
    lateral > 0.0001
      ? { x: -forward.z / lateral, y: 0, z: forward.x / lateral }
      : { x: 1, y: 0, z: 0 };
  const up = {
    x: -right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y,
  };
  const level = Math.max(8, 2 ** Math.floor(Math.log2(-delta.y)));
  const heightStep = level / 4;
  const nearHeight =
    Math.floor((camera.y - level * 0.18) / heightStep) * heightStep;
  const tangent = Math.tan(fov / 2);
  return [0, 0.6, 1.8].map((depth, index) => {
    const height = nearHeight - depth * level;
    const depthDistance = (height - camera.y) / forward.y;
    const center = {
      x: camera.x + forward.x * depthDistance,
      z: camera.z + forward.z * depthDistance,
    };
    let halfX = 0,
      halfZ = 0;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const ray = {
          x: forward.x + right.x * sx * tangent * aspect + up.x * sy * tangent,
          y: forward.y + up.y * sy * tangent,
          z: forward.z + right.z * sx * tangent * aspect + up.z * sy * tangent,
        };
        const travel = (height - camera.y) / Math.min(-0.05, ray.y);
        halfX = Math.max(halfX, Math.abs(camera.x + ray.x * travel - center.x));
        halfZ = Math.max(halfZ, Math.abs(camera.z + ray.z * travel - center.z));
      }
    return {
      height,
      center,
      depthDistance,
      halfX: halfX * 1.1,
      halfZ: halfZ * 1.1,
      thickness: level * 0.035,
      // Nearby flight strata magnify grains; keep them small in top-down view.
      // The separate angled/deck background field retains its existing size.
      sizeScale: [1.35, 1, 0.75][index] * 0.42,
    };
  });
}
export function dustSpacing(halfExtent: number, aspect: number) {
  return dustLayout(halfExtent, aspect).spacing;
}
function cellHash(x: number, y: number, salt: number) {
  let h =
    Math.imul((x % 2147483647) | 0, 73856093) ^
    Math.imul((y % 2147483647) | 0, 19349663) ^
    Math.imul(salt, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Stable seeded world cells at each distance LOD. Only origin subtraction is camera-related. */
export function dustCell(
  index: number,
  originX: number,
  originY: number,
  spacing: number,
  columns = DUST_SIDE,
  rows = DUST_SIDE,
) {
  const offsetX = (index % columns) - Math.floor(columns / 2);
  const offsetY = Math.floor(index / columns) - Math.floor(rows / 2);
  const centerX = Math.floor(originX / spacing),
    centerY = Math.floor(originY / spacing);
  const cellX = centerX + offsetX,
    cellY = centerY + offsetY;
  return {
    x:
      (offsetX + cellHash(cellX, cellY, 1)) * spacing -
      (originX - centerX * spacing),
    y:
      (offsetY + cellHash(cellX, cellY, 2)) * spacing -
      (originY - centerY * spacing),
    height: -12 - cellHash(cellX, cellY, 3) * 42,
    size: ((0.07 + cellHash(cellX, cellY, 4) * 0.08) * spacing * 2.4) / 8,
    lengthVariation: 0.75 + cellHash(cellX, cellY, 5) * 0.4,
  };
}
