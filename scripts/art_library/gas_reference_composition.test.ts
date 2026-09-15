import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
import { composeGasReference } from "./gas_reference_composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/gas-r001/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
it("preserves native gas UVs and normals with fixed bounded geometry and complete identities", () => {
  const batches = composeGasReference(kit);
  expect(batches.reduce((n, b) => n + b.indices.length / 3, 0)).toBe(19904);
  for (const b of batches) {
    expect(b.uvs.length).toBe((b.positions.length / 3) * 2);
    expect(b.normals.length).toBe(b.positions.length);
    expect(
      [...b.positions, ...b.normals, ...b.uvs].every(Number.isFinite),
    ).toBe(true);
    expect(b.ranges.reduce((n, r) => n + r.triangleCount, 0)).toBe(
      b.indices.length / 3,
    );
  }
  const first = kit.variants[0] as (typeof kit.variants)[0] & {
      uvs: number[];
      normals: number[];
    },
    index = first.indices[0];
  expect([...batches[0].uvs.slice(0, 2)]).toEqual([
    ...Float32Array.from(first.uvs.slice(index * 2, index * 2 + 2)),
  ]);
  expect([...batches[0].normals.slice(0, 3)]).toEqual([
    ...Float32Array.from([
      first.normals[index * 3],
      first.normals[index * 3 + 2],
      -first.normals[index * 3 + 1],
    ]),
  ]);
});
