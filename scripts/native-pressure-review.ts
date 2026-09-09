import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createNativePressureRoomDocument,
  validateNativePressureRoomDocument,
} from "@sidereal/sim/construction-pressure-document";

/** Generate browser-review inputs only. This never connects, grants or publishes.
 * Run the emitted functions through the named Playwright CLI session after the
 * integration owner publishes the isolated module and grants the review role. */
const database = "sidereal-spacetime-dev-review-pressure-r006";
const workspaceId = "native-pressure-review-r006";
const destination = resolve(".runtime/native-pressure-review");
if (process.argv[2] !== "prepare")
  throw Error("Usage: npx tsx scripts/native-pressure-review.ts prepare");
const document = createNativePressureRoomDocument();
validateNativePressureRoomDocument(document);
mkdirSync(destination, { recursive: true });
const write = (name: string, text: string) =>
  writeFileSync(resolve(destination, name), text + "\n");
write("document.json", JSON.stringify(document, null, 2));
write(
  "setup.js",
  `async page => {
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{};});
 // Keep authority websockets. Block HMR so concurrent edits cannot replace the
 // reviewed scene midway through a complete-frame capture.
 await page.routeWebSocket('**',socket=>{if(socket.url().includes('/v1/'))socket.connectToServer();});
 await page.route(/\\/net\\/src\\/(construction|index)\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();
  const from='.withDatabaseName(import.meta.env.VITE_DATABASE)';
  if(body.split(from).length!==2)throw Error('Review database hook mismatch');
  body=body.replace(from,'.withDatabaseName(${JSON.stringify(database)})');
  if(route.request().url().includes('/construction.ts'))body=body.replace('for (const table','window.__constructionConnection=c;for (const table');
  else body=body.replace('return connection;','window.__reviewConnection=connection;return connection;');
  await route.fulfill({response,body});
 });
 await page.route(/\\/src\\/auth\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();
  const from='const authOrigin = import.meta.env.VITE_AUTH_ORIGIN;';
  if(body.split(from).length!==2)throw Error('Approved review auth-origin hook mismatch');
  body=body.replace(from,'const authOrigin = "https://sidereal.tail7a58a6.ts.net:8444";');
  await route.fulfill({response,body});
 });
 await page.route(/\\/render\\/src\\/index\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();
  const from='const scene = new Scene(engine);';
  if(body.split(from).length!==2)throw Error('Scene observer hook mismatch');
  body=body.replace(from,from+' window.__liveScene=scene;');
  await route.fulfill({response,body});
 });
 await page.route(/\\/canvas-ui\\/src\\/toolkit\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();
  const from='this.canvas = canvas;';
  if(body.split(from).length!==2)throw Error('Canvas observer hook mismatch');
  await route.fulfill({response,body:body.replace(from,from+' window.__liveUI=this;')});
 });
 await page.goto('https://sidereal.tail7a58a6.ts.net:8445/shipyard',{waitUntil:'domcontentloaded'});
 return {database:${JSON.stringify(database)},url:page.url(),buttons:await page.getByRole('button').allTextContents()};
}`,
);
write(
  "publish-spawn.js",
  `async page => {
 const document=${JSON.stringify(document)};
 await page.waitForFunction(()=>window.__constructionConnection?.isActive,undefined,{polling:100,timeout:20000});
 return await page.evaluate(async document=>{
  const c=window.__constructionConnection,workspaceId=${JSON.stringify(workspaceId)},draftId=workspaceId+'-draft';
  if(!c.identity)throw Error('Authenticated connection required');
  // The configured route is immutable for this browser. Refuse to duplicate
  // evidence if this review namespace already has a published installation.
  if([...c.db.ownConstructionInstances.iter()].some(i=>i.workspaceId===workspaceId))throw Error('Review instances already exist; inspect before rerunning');
  for(const capability of ['draft.read','draft.write','blueprint.publish','instance.spawn']){
   const old=[...c.db.ownConstructionGrants.iter()].find(g=>g.workspaceId===workspaceId&&g.capability===capability);
   await c.reducers.setConstructionGrant({principal:c.identity.toHexString(),workspaceId,capability,expiresMicros:BigInt(Date.now()+3600000)*1000n,revoked:false,expectedRevision:old?.revision??0n,operationId:crypto.randomUUID()});
  }
  const wait=async predicate=>{const until=Date.now()+15000;while(!predicate()){if(Date.now()>until)throw Error('Review view timed out');await new Promise(r=>setTimeout(r,50));}};
  const old=[...c.db.ownConstructionDrafts.iter()].find(d=>d.id===draftId);
  await c.reducers.saveConstructionDraft({workspaceId,draftId,documentJson:JSON.stringify(document),expectedRevision:old?.revision??0n,operationId:crypto.randomUUID()});
  await wait(()=>[...c.db.ownConstructionDrafts.iter()].some(d=>d.id===draftId&&d.revision===(old?.revision??0n)+1n));
  const draft=[...c.db.ownConstructionDrafts.iter()].find(d=>d.id===draftId);
  await c.reducers.publishConstructionBlueprint({workspaceId,draftId,expectedRevision:draft.revision,operationId:crypto.randomUUID()});
  await wait(()=>[...c.db.ownConstructionBlueprints.iter()].some(b=>b.draftId===draftId&&b.sourceRevision===draft.revision));
  const blueprint=[...c.db.ownConstructionBlueprints.iter()].find(b=>b.draftId===draftId&&b.sourceRevision===draft.revision);
  for(let n=1;n<=2;n++){
   await c.reducers.spawnConstructionBlueprint({blueprintId:blueprint.id,expectedSha256:blueprint.sha256,sourceDeckId:document.layout.decks[0].id,operationId:crypto.randomUUID()});
   await wait(()=>[...c.db.ownConstructionInstances.iter()].filter(i=>i.workspaceId===workspaceId).length===n);
  }
  const instances=[...c.db.ownConstructionInstances.iter()].filter(i=>i.workspaceId===workspaceId);
  const ids=instances.map(i=>{const d=JSON.parse(i.documentJson);return {instanceId:i.id,deckId:d.layout.decks[0].id,doorId:d.layout.openings[0].id};});
  if(new Set(ids.map(i=>i.deckId)).size!==2||new Set(ids.map(i=>i.doorId)).size!==2)throw Error('Spawn failed to isolate placed identities');
  return {database:${JSON.stringify(database)},workspaceId,blueprint:{id:blueprint.id,sha256:blueprint.sha256},instances:ids};
 },document);
}`,
);
write(
  "pressure-snapshot.js",
  `async page => {
 return await page.evaluate(()=>{
  const c=window.__reviewConnection;if(!c?.isActive)throw Error('Game connection not active');
  if(!c.db.ownConstructionNativePressure)throw Error('Generated native pressure view unavailable');
  const rows=[...c.db.ownConstructionNativePressure.iter()];
  const encode=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));
  for(const row of rows)if(row.compartments.some(c=>c.pressurePa!==0)||row.ventedMoles!==0)throw Error('Unexpected gas in vacuum fixture');
  return encode({pressures:rows,doors:[...c.db.ownConstructionDoors.iter()],locations:[...c.db.ownConstructionLocation.iter()],characters:[...c.db.ownCharacters.iter()].map(c=>({id:c.id,shipId:c.shipId,localX:c.localX,localY:c.localY})),viewPolicy:'Owned installations AND draft.read; zero gas introduced'});
 });
}`,
);
write(
  "game.js",
  `async page => {
 await page.goto('https://sidereal.tail7a58a6.ts.net:8444/?constructionReview=1',{waitUntil:'domcontentloaded'});
 return {url:page.url(),buttons:await page.getByRole('button').allTextContents()};
}`,
);
write(
  "privacy.js",
  `async page => {
 return await page.evaluate(async()=>{
  const {DbConnection,tables}=await import('/@fs/root/sidereal_spacetime/packages/net/src/generated/index.ts');
  const uri=location.origin.replace(/^http/,'ws');
  // Separate ungranted principal, no character/item creation. Its reusable token
  // remains in this closure and is never included in evidence or browser storage.
  let token,identity;
  const check=()=>new Promise((resolve,reject)=>{
   const c=DbConnection.builder().withUri(uri).withDatabaseName(${JSON.stringify(database)}).withToken(token)
    .onConnect((connection,id,nextToken)=>{
     if(identity&&identity!==id.toHexString()){connection.disconnect();reject(Error('Privacy reconnect identity changed'));return;}
     identity=id.toHexString();token=nextToken;
     connection.subscriptionBuilder().onApplied(()=>{
      const counts={pressure:[...connection.db.ownConstructionNativePressure.iter()].length,instances:[...connection.db.ownConstructionInstances.iter()].length,doors:[...connection.db.ownConstructionDoors.iter()].length};
      connection.disconnect();if(Object.values(counts).some(Boolean))reject(Error('Other principal saw private construction rows'));else resolve(counts);
     }).onError(e=>{connection.disconnect();reject(Error(String(e.event)));}).subscribe([tables.ownConstructionNativePressure,tables.ownConstructionInstances,tables.ownConstructionDoors]);
    }).onConnectError((_c,e)=>reject(Error(String(e)))).build();
  });
  return {database:${JSON.stringify(database)},initial:await check(),reconnected:await check(),samePrivatePrincipal:true};
 });
}`,
);
console.log(
  JSON.stringify({
    database,
    workspaceId,
    destination,
    files: [
      "document.json",
      "setup.js",
      "publish-spawn.js",
      "game.js",
      "pressure-snapshot.js",
      "privacy.js",
    ],
    action: "Prepared only; no network or authority mutation",
  }),
);
