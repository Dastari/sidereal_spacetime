/** One actual catalog asset per process: keeps parsed native fixtures bounded. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REVIEWED_NATIVE_PLANETS } from '../packages/render/src/environment/reviewed-native-planet-catalog';
import { createReviewedWorkerRegistry } from '../packages/render/src/environment/reviewed-native/reviewed-worker-registry';
import { planetRecipe } from '../packages/content/src/environment';
const descriptor = REVIEWED_NATIVE_PLANETS.find(d => d.id === process.argv[2]);
assert(descriptor, 'Pass one explicit catalog ID');
let fetches = 0;
const registry = createReviewedWorkerRegistry({fetch: async input => {
  fetches++;
  const url = String(input);
  assert(url.startsWith('/reviewed-planets/'));
  const bytes = await readFile(resolve('apps/dashboard/public', '.' + url));
  return new Response(bytes, {headers: {'content-length': String(bytes.length)}});
}});
const start = performance.now();
try {
  const registration = await registry.register(descriptor);
  assert(!('variants' in registration.header));
  const result = await registry.build(registration.assetKey, {bodyId: 'smoke:' + descriptor.id, seed: 38, lod: 0, recipe: planetRecipe(descriptor.style, 38)});
  assert(result.batches.length > 0);
  let triangles = 0;
  for (const b of [...result.batches, ...(result.weather ? [result.weather] : [])]) {
    assert(b.positions.length % 3 === 0);
    assert(b.indices.length % 3 === 0);
    for (const n of b.positions) assert(Number.isFinite(n));
    for (const n of b.normals) assert(Number.isFinite(n));
    for (const i of b.indices) assert(Number.isInteger(i) && i >= 0 && i < b.positions.length / 3);
    triangles += b.indices.length / 3;
  }
  assert(triangles > 0);
  for (const r of result.shadowRadii) assert(Number.isFinite(r) && r >= 0);
  assert.equal(fetches, descriptor.weather ? 2 : 1);
  registry.release(registration.assetKey);
  assert.equal(registry.stats().assets, 0);
  assert.equal(registry.stats().registrations, 0);
  console.log(JSON.stringify({id:descriptor.id,pass:true,triangles,batches:result.batches.length,weather:!!result.weather,buildMs:result.buildMs,totalMs:performance.now()-start,rssMiB:process.memoryUsage().rss/1048576}));
} finally { registry.dispose(); }
