import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createNativeTraversalRoomDocument,
  validateNativeTraversalRoomDocument,
} from "@sidereal/sim/construction-traversal-document";

/** Preparation only. Publication, provider role and named browser startup remain
 * root-controlled. Emitted functions operate the real candidate when invoked. */
const database = "sidereal-spacetime-dev-review-traversal-r000";
const workspaceId = "native-traversal-review-r000";
const destination = resolve(".runtime/native-traversal-review");
if (process.argv[2] !== "prepare")
  throw Error("Usage: npx tsx scripts/native-traversal-review.ts prepare");
const document = createNativeTraversalRoomDocument();
validateNativeTraversalRoomDocument(document);
mkdirSync(destination, { recursive: true });
mkdirSync(resolve("output/playwright/native-traversal-room"), {
  recursive: true,
});
const write = (name: string, text: string) =>
  writeFileSync(resolve(destination, name), text + "\n");
const helperModule = "/@fs/root/sidereal_spacetime/scripts/traversal-smoke.ts";
write("document.json", JSON.stringify(document, null, 2));
write(
  "setup.js",
  `async page=>{
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{};});
 // Authority websocket traffic stays real. HMR is disabled during capture.
 await page.routeWebSocket('**',socket=>{if(socket.url().includes('/v1/'))socket.connectToServer();});
 await page.route(/\\/net\\/src\\/(construction|index)\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();
  const from='.withDatabaseName(import.meta.env.VITE_DATABASE)';
  if(body.split(from).length!==2)throw Error('Review database hook mismatch');
  body=body.replace(from,'.withDatabaseName(${JSON.stringify(database)})');
  if(route.request().url().includes('/construction.ts'))body=body.replace('for (const table','window.__constructionConnection=c; window.__reviewDatabase=${JSON.stringify(database)}; for (const table');
  else body=body.replace('return connection;','window.__reviewConnection=connection; window.__reviewDatabase=${JSON.stringify(database)}; return connection;');
  await route.fulfill({response,body});
 });
 await page.route(/\\/src\\/auth\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();const from='const authOrigin = import.meta.env.VITE_AUTH_ORIGIN;';
  if(body.split(from).length!==2)throw Error('Review auth-origin hook mismatch');
  await route.fulfill({response,body:body.replace(from,'const authOrigin = "https://sidereal.tail7a58a6.ts.net:8444";')});
 });
 await page.route(/\\/render\\/src\\/index\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();const from='const scene = new Scene(engine);';
  if(body.split(from).length!==2)throw Error('Scene observer hook mismatch');
  await route.fulfill({response,body:body.replace(from,from+' window.__liveScene=scene;')});
 });
 await page.route(/\\/canvas-ui\\/src\\/toolkit\\.ts/,async route=>{
  const response=await route.fetch();let body=await response.text();const from='this.canvas = canvas;';
  if(body.split(from).length!==2)throw Error('Canvas observer hook mismatch');
  await route.fulfill({response,body:body.replace(from,from+' window.__liveUI=this;')});
 });
 await page.goto('https://sidereal.tail7a58a6.ts.net:8445/shipyard',{waitUntil:'domcontentloaded'});
 return {database:${JSON.stringify(database)},url:page.url(),buttons:await page.getByRole('button').allTextContents()};
}`,
);
write(
  "publish-spawn.js",
  `async page=>{
 await page.waitForFunction(()=>window.__constructionConnection?.isActive,undefined,{polling:100,timeout:20000});
 return await page.evaluate(async()=>{
  if(window.__reviewDatabase!==${JSON.stringify(database)})throw Error('Wrong review target');
  const tools=await import(${JSON.stringify(helperModule)});
  return tools.publishTraversalReview(window.__constructionConnection);
 });
}`,
);
write(
  "game.js",
  `async page=>{
 await page.goto('https://sidereal.tail7a58a6.ts.net:8444/?constructionReview=1',{waitUntil:'domcontentloaded'});
 return {url:page.url(),buttons:await page.getByRole('button').allTextContents()};
}`,
);
write(
  "observe.js",
  `async page=>{
 await page.waitForFunction(()=>window.__reviewConnection?.isActive&&window.__liveScene,undefined,{polling:100,timeout:25000});
 return await page.evaluate(async()=>{
  if(window.__reviewDatabase!==${JSON.stringify(database)})throw Error('Wrong review target');
  const tools=await import(${JSON.stringify(helperModule)}),c=window.__reviewConnection;
  window.__traversalReview=tools;
  if(![...c.db.ownCharacters.iter()].length)throw Error('Enter the ordinary isolated game before fixture snapshot');
  const inventoryKey='sidereal-native-traversal-review-inventory';
  if(!sessionStorage.getItem(inventoryKey))sessionStorage.setItem(inventoryKey,JSON.stringify(tools.traversalInventorySnapshot(c)));
  window.__traversalInventoryBefore=JSON.parse(sessionStorage.getItem(inventoryKey));
  tools.requireTraversalInventoryUnchanged(c,window.__traversalInventoryBefore);
  window.__completeReviewFrame=()=>{const scene=window.__liveScene,engine=scene.getEngine();engine.beginFrame();try{for(const loop of [...engine._activeRenderLoops])loop();}finally{engine.endFrame();}window.__liveUI?.paint();};
  window.__completeReviewFrame();
  return {snapshot:tools.traversalSnapshot(c),inventory:window.__traversalInventoryBefore,renderer:window.__liveScene.getEngine().getGlInfo(),nativeMeshes:window.__liveScene.meshes.filter(m=>/traversal|ladder|aperture/i.test(m.name)).map(m=>({name:m.name,enabled:m.isEnabled(),position:m.getAbsolutePosition().asArray()}))};
 });
}`,
);
write(
  "capture.js",
  `async page=>{
 await page.evaluate(()=>{if(!window.__completeReviewFrame)throw Error('Run observe.js first');window.__completeReviewFrame();});
 const state=await page.evaluate(()=>({snapshot:window.__traversalReview.traversalSnapshot(window.__reviewConnection),nativeMeshes:window.__liveScene.meshes.filter(m=>/traversal|ladder|aperture/i.test(m.name)).map(m=>({name:m.name,enabled:m.isEnabled(),position:m.getAbsolutePosition().asArray()}))}));
 const path='output/playwright/native-traversal-room/frame-'+Date.now()+'.png';await page.screenshot({path});return {path,...state};
}`,
);
write(
  "keyboard-walk.js",
  `async page=>{
 // Set __reviewKeyboardPlan={keys:['KeyW'],durationMs:500} before invoking.
 // This uses the app's normal key listeners and input sequence, never transforms.
 const plan=await page.evaluate(()=>window.__reviewKeyboardPlan);
 if(!plan||!Array.isArray(plan.keys)||!plan.keys.length||!plan.keys.every(k=>['KeyW','KeyA','KeyS','KeyD'].includes(k))||!Number.isInteger(plan.durationMs)||plan.durationMs<50||plan.durationMs>2500)throw Error('Bounded keyboard plan required');
 const before=await page.evaluate(()=>window.__traversalReview.traversalSnapshot(window.__reviewConnection));
 try{for(const key of plan.keys)await page.keyboard.down(key);await page.waitForTimeout(plan.durationMs);}finally{for(const key of plan.keys)await page.keyboard.up(key);}
 await page.waitForTimeout(100);await page.evaluate(()=>window.__completeReviewFrame());
 return {plan,before,after:await page.evaluate(()=>window.__traversalReview.traversalSnapshot(window.__reviewConnection))};
}`,
);
write(
  "begin.js",
  `async page=>{
 return await page.evaluate(async()=>{const c=window.__reviewConnection,tools=window.__traversalReview;if(window.__reviewDatabase!==${JSON.stringify(database)})throw Error('Wrong review target');const args=await tools.beginTraversalReview(c);return {intent:tools.traversalJson(args),snapshot:tools.traversalSnapshot(c)};});
}`,
);
write(
  "cancel.js",
  `async page=>{
 return await page.evaluate(async()=>{await window.__traversalReview.cancelTraversalReview(window.__reviewConnection);return window.__traversalReview.traversalSnapshot(window.__reviewConnection);});
}`,
);
write(
  "checkpoint.js",
  `async page=>{
 return await page.evaluate(()=>{const saved=window.__traversalReview.traversalRestartCheckpoint(window.__reviewConnection);sessionStorage.setItem('sidereal-native-traversal-review-checkpoint',JSON.stringify(saved));return saved;});
}`,
);
write(
  "verify-reconnect.js",
  `async page=>{
 return await page.evaluate(async()=>{const saved=JSON.parse(sessionStorage.getItem('sidereal-native-traversal-review-checkpoint')||'null');if(!saved)throw Error('Missing nonsecret restart checkpoint');return window.__traversalReview.verifyTraversalReconnect(window.__reviewConnection,saved);});
}`,
);
write(
  "inventory-check.js",
  `async page=>{
 return await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('sidereal-native-traversal-review-inventory')||'null');if(!saved)throw Error('Missing original fixture snapshot');window.__traversalReview.requireTraversalInventoryUnchanged(window.__reviewConnection,saved);return {unchanged:true,snapshot:window.__traversalReview.traversalSnapshot(window.__reviewConnection)};});
}`,
);
write(
  "privacy.js",
  `async page=>{
 return await page.evaluate(async()=>{
  const {DbConnection,tables}=await import('/@fs/root/sidereal_spacetime/packages/net/src/generated/index.ts');let token,identity;
  const check=()=>new Promise((resolve,reject)=>{
   DbConnection.builder().withUri(location.origin.replace(/^http/,'ws')).withDatabaseName(${JSON.stringify(database)}).withToken(token).onConnect((c,id,nextToken)=>{
    if(identity&&identity!==id.toHexString()){c.disconnect();reject(Error('Private reconnect identity changed'));return;}identity=id.toHexString();token=nextToken;
    c.subscriptionBuilder().onApplied(async()=>{
     try{const counts={traversals:[...c.db.ownConstructionTraversals.iter()].length,links:[...c.db.ownConstructionTraversalLinks.iter()].length,instances:[...c.db.ownConstructionInstances.iter()].length,visits:[...c.db.ownConstructionLocation.iter()].length};if(Object.values(counts).some(Boolean))throw Error('Foreign principal saw private rows');let denied=false;try{await c.reducers.beginConstructionTraversal({linkId:'missing',expectedVisitId:'missing',expectedLocationRevision:1n,expectedInstanceRevision:1n,expectedLinkRevision:1n,operationId:crypto.randomUUID()});}catch{denied=true;}if(!denied)throw Error('Ungrant begin accepted');resolve({counts,beginDenied:true});}catch(e){reject(e);}finally{c.disconnect();}
    }).onError(e=>{c.disconnect();reject(Error(String(e.event)));}).subscribe([tables.ownConstructionTraversals,tables.ownConstructionTraversalLinks,tables.ownConstructionInstances,tables.ownConstructionLocation]);
   }).onConnectError((_c,e)=>reject(Error(String(e)))).build();
  });
  return {database:${JSON.stringify(database)},initial:await check(),reconnected:await check(),samePrivatePrincipal:true};
 });
}`,
);
write(
  "expire-capabilities.js",
  `async page=>{
 // Invoke only after fixture return/preservation capture, using the authoring
 // connection while root's temporary provider role is still valid.
 return await page.evaluate(async()=>{
  if(window.__reviewDatabase!==${JSON.stringify(database)})throw Error('Wrong review target');const c=window.__constructionConnection;if(!c?.identity)throw Error('Authoring connection required');
  const grants=[...c.db.ownConstructionGrants.iter()].filter(g=>g.workspaceId===${JSON.stringify(workspaceId)}&&!g.revoked);
  for(const g of grants)await c.reducers.setConstructionGrant({principal:c.identity.toHexString(),workspaceId:g.workspaceId,capability:g.capability,expiresMicros:BigInt(Date.now()+8000)*1000n,revoked:false,expectedRevision:g.revision,operationId:crypto.randomUUID()});
  return {shortened:grants.map(g=>g.capability),expiresAfterSeconds:8};
 });
}`,
);
write(
  "remember-expiry-intent.js",
  `async page=>{
 return await page.evaluate(()=>{const args=window.__traversalReview.traversalBeginIntent(window.__reviewConnection);sessionStorage.setItem('sidereal-native-traversal-expiry-intent',JSON.stringify(args,(_,v)=>typeof v==='bigint'?String(v):v));return {remembered:true,snapshot:window.__traversalReview.traversalSnapshot(window.__reviewConnection)};});
}`,
);
write(
  "verify-expiry.js",
  `async page=>{
 return await page.evaluate(async()=>{
  const c=window.__reviewConnection,args=JSON.parse(sessionStorage.getItem('sidereal-native-traversal-expiry-intent')||'null');if(!args)throw Error('Missing real pre-expiry standing intent');
  for(const key of ['expectedLocationRevision','expectedInstanceRevision','expectedLinkRevision'])args[key]=BigInt(args[key]);args.operationId=crypto.randomUUID();let error;
  try{await c.reducers.beginConstructionTraversal(args);}catch(e){error=String(e);}if(!error||!/grant|capability/i.test(error))throw Error('Expired native begin did not report its grant denial');
  const counts={links:[...c.db.ownConstructionTraversalLinks.iter()].length,traversals:[...c.db.ownConstructionTraversals.iter()].length};if(Object.values(counts).some(Boolean))throw Error('Expired read grant still exposes traversal rows');
  return {denied:true,error,counts,snapshot:window.__traversalReview.traversalSnapshot(c)};
 });
}`,
);
write(
  "signin.py",
  `import json, subprocess, sys
from pathlib import Path
origin={'authoring':'https://sidereal.tail7a58a6.ts.net:8445/shipyard','game':'https://sidereal.tail7a58a6.ts.net:8444/'}[sys.argv[1]]
account=json.loads(Path('/tmp/sidereal-auth-review.json').read_text())
code='async page=>{await page.getByRole("textbox",{name:"Username or email"}).fill('+json.dumps(account['username'])+');await page.getByLabel("Password",{exact:true}).fill('+json.dumps(account['password'])+');await page.getByRole("button",{name:"Sign In",exact:true}).click();await page.waitForURL(url=>url.href.startsWith('+json.dumps(origin)+')&&!url.pathname.includes("callback"),{timeout:30000});return {returned:true};}'
r=subprocess.run(['bash','.agents/skills/playwright/scripts/playwright_cli.sh','--session','native-traversal-review','run-code',code],capture_output=True,text=True)
p=Path('/tmp/native-traversal-review-signin-private.log');p.touch(mode=0o600,exist_ok=True);p.chmod(0o600);p.write_text(r.stdout+r.stderr)
print('Sign-in process completed with exit status',r.returncode)
print('Callback complete:', '"returned":true' in r.stdout)
`,
);
console.log(
  JSON.stringify({
    database,
    workspaceId,
    destination,
    action:
      "Prepared only; no network, authority mutation, browser or service start",
  }),
);
