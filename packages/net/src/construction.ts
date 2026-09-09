import {DbConnection,tables} from './generated';
import type {GameAuthentication} from './connection-session';
export function connectConstruction(change:()=>void,status:(state:'connecting'|'ready'|'offline',error?:string)=>void,auth?:GameAuthentication){
 if(!auth)throw Error('Sign in to author ships');
 const url=new URL(location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
 const c=DbConnection.builder().withUri(url.origin).withDatabaseName(import.meta.env.VITE_DATABASE).withToken(auth.token)
 .onConnect(c=>c.subscriptionBuilder().onApplied(()=>{status('ready');change();}).onError(e=>status('offline',String(e.event))).subscribe([tables.ownConstructionGrants,tables.ownConstructionDrafts,tables.ownConstructionBlueprints,tables.ownConstructionInstances,tables.ownConstructionDecks]))
 .onConnectError((_c,e)=>status('offline',String(e))).onDisconnect(()=>status('offline')).build();
 for(const table of [c.db.ownConstructionGrants,c.db.ownConstructionDrafts,c.db.ownConstructionBlueprints,c.db.ownConstructionInstances,c.db.ownConstructionDecks]){table.onInsert(change);table.onUpdate(change);table.onDelete(change);}return c;
}
