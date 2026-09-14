/** Run with npx tsx scripts/benchmark_ifcs_allocator.ts. Seeded layouts, warmed
 * solves. Reports actual bounded-simplex / residual sweeps after phase 1. */
import { performance } from "node:perf_hooks";
import { allocateThrust, type Actuator } from "../packages/sim/src/ifcs";
let seed = 0x1fc5;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const mass = { massKg: 12000, centerX: 0, centerY: 0, inertiaKgM2: 636480 };
for (const count of [4, 9, 16, 64, 256]) {
  const layouts = Array.from({ length: 8 }, () =>
    Array.from({ length: count }, (_, i): Actuator => ({
      id: `a${i.toString().padStart(3, "0")}`,
      x: (random() - 0.5) * 20,
      y: (random() - 0.5) * 30,
      rotation: random() * Math.PI * 2,
      maxThrustN: 8000 + random() * 12000,
      availability: random(),
    })),
  );
  const request = { fx: 12000, fy: 18000, torque: 24000 };
  for (let i = 0; i < 100; i++)
    allocateThrust(layouts[i % layouts.length], mass, request);
  const samples: number[] = [];
  for (let batch = 0; batch < 5; batch++) {
    const start = performance.now();
    for (let i = 0; i < 200; i++)
      allocateThrust(layouts[i % layouts.length], mass, request);
    samples.push(((performance.now() - start) * 1000) / 200);
  }
  samples.sort((a, b) => a - b);
  const results = layouts.map((layout) =>
    allocateThrust(layout, mass, request),
  );
  console.log(
    JSON.stringify({
      actuators: count,
      layouts: layouts.length,
      passes: results.map((r) => r.passes),
      convergence: results.map((r) => r.converged),
      residualN: results.map((r) => Math.hypot(r.residual.fx, r.residual.fy)),
      medianMicroseconds: samples[2],
      minMicroseconds: samples[0],
      maxMicroseconds: samples[4],
    }),
  );
}
