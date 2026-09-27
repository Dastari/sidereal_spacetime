import { expect, test } from "vitest";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { boxPenetration, transformedBox, type OrientedBox } from "./pose-math";

// Preserved vector formulation is an independent oracle for the scalar hot path.
function reference(a: OrientedBox, b: OrientedBox, margin = 0) {
  const delta = b.center.subtract(a.center);
  let depth = Infinity;
  const testAxis = (axis: Vector3) => {
    const length = axis.length();
    if (length < 1e-7) return true;
    const n = axis.scale(1 / length);
    const radius = (box: OrientedBox) =>
      box.axes.reduce(
        (sum, v, i) =>
          sum + Math.abs(Vector3.Dot(n, v)) * box.half.asArray()[i],
        0,
      );
    const overlap =
      radius(a) + radius(b) + margin - Math.abs(Vector3.Dot(delta, n));
    depth = Math.min(depth, overlap);
    return overlap > 0;
  };
  for (const axis of [...a.axes, ...b.axes]) if (!testAxis(axis)) return 0;
  for (const x of a.axes)
    for (const y of b.axes) if (!testAxis(Vector3.Cross(x, y))) return 0;
  return depth;
}

const box = (x = 0) =>
  transformedBox(
    "box",
    Vector3.Zero(),
    Vector3.One(),
    Matrix.Translation(x, 0, 0),
  );

test("clearance retains exact contact, separation, containment and margin semantics", () => {
  expect(boxPenetration(box(), box())).toBe(2);
  expect(boxPenetration(box(), box(2))).toBe(0);
  expect(boxPenetration(box(), box(2.01))).toBe(0);
  // Babylon's default matrix storage rounds the translation to float32.
  expect(boxPenetration(box(), box(2.01), 0.02)).toBeCloseTo(0.01, 7);
  const small = box();
  small.half.setAll(0.1);
  expect(boxPenetration(box(), small)).toBeCloseTo(1.1, 12);
});

test("all 15 axes match the previous solver for rotated, mirrored and near-parallel boxes", () => {
  let seed = 0x51de;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 2500; i++) {
    const make = (nearParallel: boolean) =>
      transformedBox(
        "test",
        Vector3.Zero(),
        new Vector3(0.01 + random(), 0.01 + random(), 0.01 + random()),
        Matrix.Compose(
          new Vector3(i % 3 ? 1 : -1, 0.25 + random() * 2, 1),
          Quaternion.RotationYawPitchRoll(
            nearParallel ? random() * 2e-7 : random() * 6,
            nearParallel ? 0 : random() * 6,
            0,
          ),
          new Vector3(random() * 3, random() * 3, random() * 3),
        ),
      );
    const a = make(i % 5 === 0),
      b = make(i % 5 === 0),
      margin = i % 4 ? 0 : 0.02;
    const before = JSON.stringify([a, b]);
    expect(boxPenetration(a, b, margin)).toBe(reference(a, b, margin));
    expect(boxPenetration(b, a, margin)).toBe(reference(b, a, margin));
    expect(JSON.stringify([a, b])).toBe(before);
  }
});
