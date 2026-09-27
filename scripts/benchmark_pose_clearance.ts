import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  boxPenetration,
  transformedBox,
  type OrientedBox,
} from "../packages/render/src/crew/pose-math";
// Baseline: vector implementation preserved from upstream f19a4b21.
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

let seed = 0x51de;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const pairs = Array.from({ length: 2048 }, () => {
  const make = () =>
    transformedBox(
      "probe",
      Vector3.Zero(),
      new Vector3(0.1 + random(), 0.1 + random(), 0.1 + random()),
      Matrix.Compose(
        Vector3.One(),
        Quaternion.RotationYawPitchRoll(
          random() * 6,
          random() * 6,
          random() * 6,
        ),
        new Vector3(random() * 1.5, random() * 1.5, random() * 1.5),
      ),
    );
  return [make(), make()] as const;
});
for (const [a, b] of pairs)
  if (reference(a, b, 0.01) !== boxPenetration(a, b, 0.01))
    throw Error("Clearance result changed");
const results: { name: string; nsPerCall: number; checksum: number }[] = [];
for (let round = 0; round < 8; round++) {
  const order =
    round % 2
      ? ([
          ["scalar", boxPenetration],
          ["vector", reference],
        ] as const)
      : ([
          ["vector", reference],
          ["scalar", boxPenetration],
        ] as const);
  for (const [name, fn] of order) {
    let checksum = 0;
    const start = performance.now();
    for (let repeat = 0; repeat < 40; repeat++)
      for (const [a, b] of pairs) checksum += fn(a, b, 0.01);
    const nsPerCall = ((performance.now() - start) * 1e6) / (40 * pairs.length);
    if (round >= 2) results.push({ name, nsPerCall, checksum });
  }
}
const median = (a: number[]) => {
  a.sort((x, y) => x - y);
  return (a[2] + a[3]) / 2;
};
const vector = median(
    results.filter((r) => r.name === "vector").map((r) => r.nsPerCall),
  ),
  scalar = median(
    results.filter((r) => r.name === "scalar").map((r) => r.nsPerCall),
  );
console.log(
  JSON.stringify(
    {
      node: process.version,
      pairs: pairs.length,
      callsPerSample: pairs.length * 40,
      warmupRounds: 2,
      measuredRounds: 6,
      vectorNs: vector,
      scalarNs: scalar,
      speedup: vector / scalar,
      results,
    },
    null,
    2,
  ),
);
