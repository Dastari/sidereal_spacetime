import assert from 'node:assert/strict';
import type {DbConnection} from '../packages/net/src/generated';
type Client=(token?:string)=>Promise<{connection:DbConnection;token:string}>;
type Wait=(fn:()=>boolean,message:string)=>Promise<void>;
const sorted=<T extends {id:string}>(rows:Iterable<T>)=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
export function persistenceSnapshot(c:DbConnection) {
 const actor=[...c.db.ownCharacters.iter()][0],appearance=[...c.db.ownAppearance.iter()][0],state=[...c.db.ownInventoryState.iter()][0];
 return {characterId:actor.id,shipId:actor.shipId,name:actor.name,x:actor.localX,y:actor.localY,
 appearance:{...appearance,revision:String(appearance.revision)},inventory:{...state,revision:String(state.revision)},
 items:sorted(c.db.ownInventoryItems.iter()),containers:sorted(c.db.ownInventoryContainers.iter()),hotbar:[...c.db.ownInventoryHotbar.iter()].sort((a,b)=>a.slot-b.slot)};
}
export type PersistenceEvidence={token:string;snapshot:ReturnType<typeof persistenceSnapshot>};
export async function verifyPersistence(client:Client,evidence:PersistenceEvidence[],wait:Wait) {
 const sessions=await Promise.all(evidence.map(e=>client(e.token)));
 try {
  for(let i=0;i<sessions.length;i++) {
   const c=sessions[i].connection,expected=evidence[i].snapshot;
   assert.equal([...c.db.ownCharacters.iter()][0].connected,false,"last socket disconnect clears presence");
   await c.reducers.enterLab({name:expected.name});
   await wait(()=>c.db.ownAppearance.count()===1n&&c.db.ownInventoryState.count()===1n,'persistent character projections');
   await c.reducers.claimStarterKit({});
   assert.deepEqual(persistenceSnapshot(c),expected,'full cosmetic/inventory/equipment snapshot retained without regrant');
   assert.equal(c.db.ownCharacters.count(),1n);
   assert(![...c.db.ownAppearance.iter()].some(a=>evidence.some((other,j)=>j!==i&&other.snapshot.characterId===a.characterId)),'other account appearance hidden');
   assert.equal([...c.db.ownStations.iter()][0].occupantId,undefined,'disconnect clears control, not persistent items');
  }
 } finally {for(const s of sessions)s.connection.disconnect();}
}
export async function persistenceSmoke(client:Client,wait:Wait):Promise<PersistenceEvidence[]> {
 const sessions=await Promise.all([client(),client()]);const evidence:PersistenceEvidence[]=[];
 try {
  for(let i=0;i<sessions.length;i++) {
   const c=sessions[i].connection;
   await assert.rejects(c.reducers.setCharacterAppearance({appearanceJson:'{}',expectedRevision:0n,operationId:'before-character'}));
   await c.reducers.enterLab({name:`Persistence ${i}`});await c.reducers.claimStarterKit({});
   await wait(()=>c.db.ownAppearance.count()===1n&&c.db.ownInventoryState.count()===1n,'initial persistence state');
   assert.equal([...c.db.ownAppearance.iter()][0].revision,0n);
   const appearanceJson=JSON.stringify({outfit:i?'explorer':'medic',bodyStyle:'uniform',armor:'medical',helmet:'closed',hairStyle:'crest',backpackStyle:'field',suit:'#AABBCC',accent:'#223344',trim:'#334455',insignia:'#445566',visor:'#556677',light:'#667788',skin:'#778899',hair:'#8899AA'});
   const op={appearanceJson,expectedRevision:0n,operationId:'same-id-separate-accounts'};
   await c.reducers.setCharacterAppearance(op);await c.reducers.setCharacterAppearance(op);
   assert.equal([...c.db.ownAppearance.iter()][0].revision,1n,'retry exactly once');
   await assert.rejects(c.reducers.setCharacterAppearance({...op,appearanceJson:'{}'}));
   await assert.rejects(c.reducers.setCharacterAppearance({...op,operationId:'stale'}));
   for(const malformed of ['{','[]','{"weapon":"rifle"}','{"skin":"bad"}','{"outfit":"missing"}'])
    await assert.rejects(c.reducers.setCharacterAppearance({appearanceJson:malformed,expectedRevision:1n,operationId:crypto.randomUUID()}));
   for(const table of ['character_appearance','appearance_receipt','connection_presence','auth_session','retired_identity','identity_link']) {
    let denied=false;c.subscriptionBuilder().onError(()=>{denied=true}).subscribe(`SELECT * FROM ${table}`);await wait(()=>denied,'private persistence table rejection');
   }
   if(i===0) {
    for(let n=0;n<129;n++)await c.reducers.setCharacterAppearance({appearanceJson,expectedRevision:[...c.db.ownAppearance.iter()][0].revision,operationId:`bounded-receipt-${n}`});
    await assert.rejects(c.reducers.setCharacterAppearance(op),'stale operation cannot replay after receipt eviction');
   }
   const items=()=>[...c.db.ownInventoryItems.iter()],state=()=>[...c.db.ownInventoryState.iter()][0];
   const gun=items().find(item=>item.definitionId===(i?'compact-pistol':'carbine'))!;
   await c.reducers.equipInventoryItem({itemId:gun.id,expectedRevision:state().revision,operationId:crypto.randomUUID()});
   const scanner=items().find(item=>item.definitionId==='scanner')!;
   await c.reducers.moveInventoryItem({itemId:scanner.id,containerId:scanner.containerId,x:2,y:4,rotated:true,expectedRevision:state().revision,operationId:crypto.randomUUID()});
   await c.reducers.assignInventoryHotbar({slot:0,itemId:gun.id,expectedRevision:state().revision,operationId:crypto.randomUUID()});
   evidence.push({token:sessions[i].token,snapshot:persistenceSnapshot(c)});
  }
  const [a,b]=sessions.map(s=>s.connection),foreign=evidence[0].snapshot.items.find(i=>i.equipmentSlot==='hand')!;
  await assert.rejects(b.reducers.equipInventoryItem({itemId:foreign.id,expectedRevision:[...b.db.ownInventoryState.iter()][0].revision,operationId:crypto.randomUUID()}));
  assert.deepEqual(persistenceSnapshot(a),evidence[0].snapshot);assert.deepEqual(persistenceSnapshot(b),evidence[1].snapshot);
  assert.notEqual(evidence[0].snapshot.characterId,evidence[1].snapshot.characterId);
  assert.notEqual(evidence[0].snapshot.shipId,evidence[1].snapshot.shipId);
  await assert.rejects(sessions[0].connection.reducers.requestIdentityLink({targetIdentity:sessions[1].connection.identity!.toHexString(),expectedCharacterId:evidence[0].snapshot.characterId,operationId:'not-oidc-target'}),'a different development account cannot receive an OIDC migration');
  await assert.rejects(sessions[1].connection.reducers.acceptIdentityLink({requestId:'unknown',operationId:'not-oidc-accept'}),'development identity cannot accept links');

  assert(evidence[0].snapshot.items.every(item=>!evidence[1].snapshot.items.some(other=>other.id===item.id)));
  const secondTab=await client(sessions[0].token);
  try {
   a.disconnect();await new Promise(resolve=>setTimeout(resolve,200));
   assert.equal([...secondTab.connection.db.ownCharacters.iter()][0].connected,true,'closing one tab must not disconnect remaining account session');
   assert.equal([...secondTab.connection.db.ownStations.iter()][0].occupantId,evidence[0].snapshot.characterId,'remaining session retains occupied station');
   await secondTab.connection.reducers.claimStarterKit({});
   assert.deepEqual(persistenceSnapshot(secondTab.connection),evidence[0].snapshot);
  } finally {secondTab.connection.disconnect();}

 } finally {for(const s of sessions)s.connection.disconnect();}
 await new Promise(resolve=>setTimeout(resolve,150));await verifyPersistence(client,evidence,wait);
 await new Promise(resolve=>setTimeout(resolve,150));await verifyPersistence(client,evidence,wait);
 return evidence;
}
