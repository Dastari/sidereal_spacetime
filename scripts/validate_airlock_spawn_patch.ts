/** Execute the exact proposed parser/compiler/UUID mapping without editing shared files. */
import { build } from "esbuild";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const overrides: Record<string, string> = JSON.parse(
  readFileSync(".runtime/airlock-shared-preview.json", "utf8"),
);
const aliases: Record<string, string> = {};
for (const [p, s] of Object.entries(overrides))
  if (p.endsWith("/package.json")) {
    const pkg = JSON.parse(s);
    for (const [name, target] of Object.entries(pkg.exports ?? {}))
      if (typeof target === "string")
        aliases[pkg.name + name.slice(1)] = resolve(p, "..", target);
  }
await build({
  stdin: {
    contents: `
import assert from 'node:assert/strict';
import {randomUUID}from'node:crypto';
import {createNativeAirlockDocument,readNativeAirlockDocument,bindNativeAirlockPlan,nativeAirlockCollision}from'./packages/sim/src/construction-airlock-document';
import {compilePublishedNativeExternalAirlock}from'./packages/sim/src/construction-airlock-published';
import {compileConstruction,readConstructionDraft}from'./packages/sim/src/construction-transactions';
import {planConstructionInstance}from'./packages/sim/src/construction-instance';
import {sweepDeckCircle}from'./packages/sim/src/construction-collision';
const d=createNativeAirlockDocument(),snapshot=compileConstruction(JSON.stringify(d)),ids=[];
for(let i=0;i<2;i++){
 const plan=planConstructionInstance(snapshot,{blueprintRevisionId:'airlock-review',expectedBlueprintSha256:snapshot.sha256,sourceDeckId:d.airlockRoom.deckId,bodyRadiusM:.3,bodyHeightM:1.8,perimeterHalfWidthM:0,partitionHalfWidthM:0,objectCollisionBindings:[]},()=>randomUUID());
 const loaded=readNativeAirlockDocument(JSON.stringify(plan.document));assert.equal(loaded.layout.id,plan.instanceId);assert.equal(plan.mappings.nativeParts.length,70);assert.equal(plan.mappings.openings.length,2);assert.equal(plan.mappings.floors.length,16);
 assert.equal(readConstructionDraft(JSON.stringify(loaded)).sha256,readConstructionDraft(JSON.stringify(plan.document)).sha256);
 for(const list of Object.values(plan.mappings))for(const m of list)ids.push(m.instanceId);
 const native=bindNativeAirlockPlan(loaded,compilePublishedNativeExternalAirlock,plan.instanceId);assert.equal(native.installation.length,70);assert.equal(native.doors[1].id,loaded.airlockRoom.outerDoorId);
 const closed=nativeAirlockCollision(loaded,native,[]),location={shipId:plan.instanceId,deckId:loaded.airlockRoom.deckId,position:[1,1]};assert.ok(sweepDeckCircle(closed,location,[6,0],.3).position[0]<2);
 const inner=nativeAirlockCollision(loaded,native,[{openingId:loaded.airlockRoom.innerDoorId,fraction:1,sealRetraction:1}]);assert.equal(sweepDeckCircle(inner,location,[3,0],.3).position[0],4);
 const outer=nativeAirlockCollision(loaded,native,[{openingId:loaded.airlockRoom.outerDoorId,fraction:1,sealRetraction:1}]);assert.equal(sweepDeckCircle(outer,{...location,position:[4,1]},[3,0],.3).position[0],7);
}
assert.equal(new Set(ids).size,ids.length);console.log(JSON.stringify({pass:true,instances:2,independentIds:ids.length,nativeParts:140,doors:4,floors:32,sourceSha256:snapshot.sha256,proof:'exact proposed shared parser/compiler/spawn/reload/native collision'}));
`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: ".runtime/native-airlock-spawn-proof.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "staged-airlock",
      setup(b) {
        b.onResolve({ filter: /^@sidereal\// }, (args) =>
          aliases[args.path] ? { path: aliases[args.path] } : undefined,
        );
        b.onLoad({ filter: /\.[tj]s$/ }, (args) => {
          const p = realpathSync(args.path);
          return p in overrides
            ? {
                contents: overrides[p],
                loader: p.endsWith(".ts") ? "ts" : "js",
              }
            : undefined;
        });
      },
    },
  ],
});
await import(
  pathToFileURL(resolve(".runtime/native-airlock-spawn-proof.mjs")).href
);
