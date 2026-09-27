import type { Light } from "@babylonjs/core/Lights/light";
import type { ShadowLight } from "@babylonjs/core/Lights/shadowLight";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

export function debugBoxLines(min: Vector3, max: Vector3): Vector3[][] {
  const corners = Array.from(
    { length: 8 },
    (_, i) =>
      new Vector3(
        i & 1 ? max.x : min.x,
        i & 2 ? max.y : min.y,
        i & 4 ? max.z : min.z,
      ),
  );
  return corners.flatMap((point, i) =>
    [1, 2, 4]
      .filter((bit) => !(i & bit))
      .map((bit) => [point, corners[i | bit]]),
  );
}

function basis(direction: Vector3) {
  const normal =
    direction.lengthSquared() > 1e-10
      ? direction.normalizeToNew()
      : Vector3.Up();
  const u = Vector3.Cross(
    Math.abs(normal.y) > 0.9 ? Vector3.Right() : Vector3.Up(),
    normal,
  ).normalize();
  return { normal, u, v: Vector3.Cross(normal, u).normalize() };
}

function ring(origin: Vector3, direction: Vector3, radius: number) {
  const { u, v } = basis(direction);
  return Array.from({ length: 25 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    return origin
      .add(u.scale(Math.cos(angle) * radius))
      .add(v.scale(Math.sin(angle) * radius));
  });
}

/** Diagnostic geometry reads each real source's range and spot angle. Unbounded
 * sources have a small origin/direction marker, never a fabricated finite range.
 */
export function lightDebugGeometry(light: Light) {
  const shadow = light as ShadowLight;
  shadow.computeTransformedInformation?.();
  const parent = light.parent?.getWorldMatrix() ?? Matrix.IdentityReadOnly;
  const localPosition = shadow.position ?? Vector3.Zero();
  const origin = Vector3.TransformCoordinates(localPosition, parent);
  const direction = Vector3.TransformNormal(
    shadow.direction ?? Vector3.Up(),
    parent,
  ).normalize();
  const lines: Vector3[][] = debugBoxLines(
    origin.subtractFromFloats(0.09, 0.09, 0.09),
    origin.add(new Vector3(0.09, 0.09, 0.09)),
  );
  const type = light.getTypeID();
  // Babylon's default Number.MAX_VALUE range is effectively infinite. Do not
  // create overflowing GPU vertices or misleading camera-sized range boxes.
  const bounded =
    (type === 0 || type === 2) &&
    Number.isFinite(light.range) &&
    light.range > 0 &&
    light.range < 1e6;
  if (type === 0 && bounded) {
    const radius = light.range;
    lines.push(
      ...debugBoxLines(
        origin.subtract(new Vector3(radius, radius, radius)),
        origin.add(new Vector3(radius, radius, radius)),
      ),
    );
    for (const axis of [Vector3.Up(), Vector3.Right(), Vector3.Forward()])
      lines.push(ring(origin, axis, radius));
  } else if (type === 2 && bounded) {
    const spot = light as Light & { angle: number; innerAngle: number };
    const range = light.range;
    const halfAngle = Math.min(Math.PI / 2 - 1e-4, Math.max(0, spot.angle / 2));
    // Source range is radial, so the cone rim stays on its range sphere.
    const end = origin.add(direction.scale(range * Math.cos(halfAngle)));
    const rim = ring(end, direction, range * Math.sin(halfAngle));
    lines.push(rim, [origin, origin.add(direction.scale(range))]);
    for (const i of [0, 6, 12, 18]) lines.push([origin, rim[i]]);
    if (spot.innerAngle > 0 && spot.innerAngle < spot.angle) {
      const inner = spot.innerAngle / 2;
      lines.push(
        ring(
          origin.add(direction.scale(range * Math.cos(inner))),
          direction,
          range * Math.sin(inner),
        ),
      );
    }
    // Include the furthest on-axis point as well as the angular rim; a source's
    // radial range extends farther along the axis than the cone rim plane.
    const points = [origin, ...rim, origin.add(direction.scale(range))];
    const min = points.reduce((a, b) => Vector3.Minimize(a, b));
    const max = points.reduce((a, b) => Vector3.Maximize(a, b));
    lines.push(...debugBoxLines(min, max));
  } else if (type !== 0) {
    const end = origin.add(direction.scale(type === 3 ? 0.8 : 1.5));
    const { u, v } = basis(direction);
    lines.push(
      [origin, end],
      [
        end.add(direction.scale(-0.25)).add(u.scale(0.12)),
        end,
        end.add(direction.scale(-0.25)).subtract(u.scale(0.12)),
      ],
    );
    if (type === 3) {
      lines.push(ring(origin, direction, 0.5));
      for (const axis of [u, v])
        lines.push(
          Array.from({ length: 13 }, (_, i) =>
            origin
              .add(axis.scale(Math.cos((i * Math.PI) / 12) * 0.5))
              .add(direction.scale(Math.sin((i * Math.PI) / 12) * 0.5)),
          ),
        );
    }
  }
  return {
    lines,
    type,
    bounded,
    range: bounded ? light.range : undefined,
    angle: type === 2 ? (light as Light & { angle: number }).angle : undefined,
  };
}
