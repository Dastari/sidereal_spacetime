/** Bounded exact-output audit; frozen source and runtime compositors are read-only. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { composeIceMoonReference as frozen } from "./ice_moon_reference_composition_r002";
import { composeIceMoonReference as optimized } from "./ice_moon_reference_composition_r003";
const root = "output/playwright/planet-reference-20260914/",
  seeds = [1, 38, 91],
  lods = [0, 1, 2];
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
for (const revision of ["ice-moon-1-r002", "ice-moon-2-r002"]) {
  const sourcePath = root + revision + "/kit.json",
    projectionPath = root + "runtime-projections/" + revision + "/kit.json";
  const sourceSHA256 = hash(readFileSync(sourcePath)),
    projectionSHA256 = hash(readFileSync(projectionPath));
  const source = JSON.parse(readFileSync(sourcePath, "utf8")),
    projection = JSON.parse(readFileSync(projectionPath, "utf8"));
  assert.deepEqual(source.materials, projection.materials);
  const cases: unknown[] = [];
  for (const [version, compose] of [
    ["r002", frozen],
    ["r003", optimized],
  ] as const) {
    const composerPath = `scripts/art_library/ice_moon_reference_composition_${version}.ts`,
      composerSHA256 = hash(readFileSync(composerPath));
    for (const seed of seeds)
      for (const lod of lods) {
        const start = performance.now(),
          a = compose(source, seed, lod),
          b = compose(projection, seed, lod);
        assert.equal(a.length, b.length);
        const roles = a.map((batch, i) => {
          const fields = Object.fromEntries(
            (["positions", "normals", "uvs", "indices"] as const).map(
              (field) => {
                const x = Buffer.from(
                    batch[field].buffer,
                    batch[field].byteOffset,
                    batch[field].byteLength,
                  ),
                  y = Buffer.from(
                    b[i][field].buffer,
                    b[i][field].byteOffset,
                    b[i][field].byteLength,
                  );
                assert.ok(
                  x.equals(y),
                  `${revision}/${version}/${seed}/${lod}/${i}/${field}`,
                );
                return [
                  field,
                  { equal: true, bytes: x.length, sha256: hash(x) },
                ];
              },
            ),
          );
          assert.deepEqual(batch.ranges, b[i].ranges);
          return {
            role: i,
            fields,
            rangesEqual: true,
            rangesSHA256: hash(JSON.stringify(batch.ranges)),
          };
        });
        cases.push({
          composerPath,
          composerSHA256,
          seed,
          lod,
          roles,
          materialDefinitionsEqual: true,
          allBuffersEqual: true,
          rangesEqual: true,
          elapsedMs: performance.now() - start,
        });
        console.log(revision, version, seed, lod, "equal");
      }
  }
  const report = {
    schema: "sidereal.runtime-projection-equality.v1",
    sourceSHA256,
    projectionSHA256,
    seeds,
    lods,
    composers: ["r002", "r003"].map((version) => {
      const path = `scripts/art_library/ice_moon_reference_composition_${version}.ts`;
      return { path, sha256: hash(readFileSync(path)) };
    }),
    cases,
    allEqual: true,
  };
  writeFileSync(
    root + "runtime-projections/" + revision + "/equality.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
