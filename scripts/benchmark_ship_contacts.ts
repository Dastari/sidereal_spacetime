/** Offline deterministic proxy/operation benchmark. No service or database writes. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { stepContacts, type RigidBody } from "../packages/sim/src/collision";
const baselineRevision = "26d9586c";
const source = execFileSync(
  "git",
  ["show", `${baselineRevision}:packages/sim/src/collision.ts`],
  { encoding: "utf8" },
);
const directory = resolve(".runtime/ship-contact-benchmark");
mkdirSync(directory, { recursive: true });
const file = resolve(directory, "baseline.ts");
writeFileSync(file, source);
const baseline = (await import(pathToFileURL(file).href))
  .stepContacts as typeof stepContacts;
const body = (
  id: string,
  x: number,
  y = 0,
  extra: Partial<RigidBody> = {},
): RigidBody => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  heading: 0,
  omega: 0,
  massKg: 20000,
  inertia: 1200000,
  radius: 5.4,
  halfLength: 7.125,
  longitudinalOffset: 1.125,
  ...extra,
});
const dt = 1 / 60;
const scenarios = [
  {
    name: "16 separated ships",
    bodies: Array.from({ length: 16 }, (_, i) =>
      body(String(i).padStart(2, "0"), i * 100, 0, { vx: 5, heading: i * 0.3 }),
    ),
  },
  {
    name: "64 separated ships",
    bodies: Array.from({ length: 64 }, (_, i) =>
      body(String(i).padStart(2, "0"), i * 100, 0, { vx: 5, heading: i * 0.3 }),
    ),
  },
  {
    name: "64 ships in eight spaced rows",
    bodies: Array.from({ length: 64 }, (_, i) =>
      body(String(i).padStart(2, "0"), (i % 8) * 100, Math.floor(i / 8) * 100, {
        vx: 5,
        heading: i * 0.3,
      }),
    ),
  },
  {
    name: "one fast contact among 64 ships",
    bodies: [
      body("00", -20, 0, { vx: 2000 }),
      body("01", 0),
      ...Array.from({ length: 62 }, (_, i) =>
        body(String(i + 2).padStart(2, "0"), 100 + i * 100),
      ),
    ],
  },
];
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const results = scenarios.map(({ name, bodies }) => {
  const previous = baseline(bodies, dt),
    next = stepContacts(bodies, dt);
  assert.deepEqual(next.bodies, previous.bodies);
  assert.equal(next.impacts, previous.impacts);
  assert.equal(next.exhausted, previous.exhausted);
  const measure = (run: typeof stepContacts) => {
    for (let i = 0; i < 30; i++) run(bodies, dt);
    const samples = [];
    for (let round = 0; round < 5; round++) {
      const start = performance.now();
      for (let i = 0; i < 100; i++) run(bodies, dt);
      samples.push((performance.now() - start) / 100);
    }
    return median(samples);
  };
  return {
    name,
    bodies: bodies.length,
    baselineMedianMs: measure(baseline),
    optimizedMedianMs: measure(stepContacts),
    work: next.work,
    exactBaselineMotionMatch: true,
  };
});
let compared = 0,
  conservativeExhaustions = 0;
// Deterministic variations in rotated capsule contacts with distant third bodies.
for (let i = 0; i < 256; i++) {
  const input = [
    body("a", -12 + (i % 5) * 0.1, 0, {
      vx: 100 + (i % 11) * 60,
      heading: i * 0.127,
      omega: ((i % 7) - 3) * 0.4,
    }),
    body("b", 0, ((i % 9) - 4) * 0.7, { heading: i * 0.193 }),
    body("c", 500, 200),
  ];
  const a = baseline(input, dt),
    b = stepContacts(input, dt);
  if (a.exhausted) {
    conservativeExhaustions++;
    continue;
  }
  assert.deepEqual(b.bodies, a.bodies);
  assert.equal(b.impacts, a.impacts);
  assert.equal(b.exhausted, a.exhausted);
  compared++;
}
const evidence = {
  baselineRevision,
  baselineSourceSha256: createHash("sha256").update(source).digest("hex"),
  runtime: process.version,
  dt,
  scope: "Node CPU microbenchmark; not browser FPS or full server load",
  shipProxy:
    "one forward-offset capsule; native interior meshes never participate",
  results,
  differentialCases: compared,
  baselineExhaustedCases: conservativeExhaustions,
};
writeFileSync(
  resolve(directory, "evidence.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
