import { recoverConstructionSeatsForGrant } from "./construction-interactions";
import {SenderError,Range,t,type ReducerCtx,type ViewCtx,type InferSchema} from 'spacetimedb/server';
import {Identity} from 'spacetimedb';
import type world from './index';
import * as auth from './auth';
import {compileConstruction,readConstructionDraft,constructionOperation,requireConstructionGrant} from '../../sim/src/construction-transactions';
import type {ConstructionCapability,ConstructionGrant} from '../../content/src/construction';
type Context=ReducerCtx<InferSchema<typeof world>>;
type ReadContext=Pick<ViewCtx<InferSchema<typeof world>>,'db'|'sender'>;
const capabilities:ConstructionCapability[]=['draft.read','draft.write','blueprint.publish','instance.spawn','instance.refit','instance.capture','grant.manage'];
const forever=18446744073709551615n;
const validId=(v:string)=>/^[a-zA-Z0-9:_./-]{1,160}$/.test(v);
function grants(ctx:ReadContext):ConstructionGrant[]{return [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)].map(g=>({...g,principal:g.principal.toHexString(),capability:g.capability as ConstructionCapability,expiresMicros:g.expiresMicros===forever?null:g.expiresMicros}));}
export function requireGrant(ctx:Context,workspaceId:string,capability:ConstructionCapability){try{requireConstructionGrant(grants(ctx),ctx.sender.toHexString(),workspaceId,capability,ctx.timestamp.microsSinceUnixEpoch);}catch(e){throw new SenderError(String(e));}}
export function operation(ctx:Context,operationId:string,request:unknown,expectedRevision:bigint,currentRevision:bigint){
 const key=`${ctx.sender.toHexString()}:${operationId}`,receipt=ctx.db.constructionReceipt.id.find(key);
 try{return {key,...constructionOperation(operationId,request,receipt??undefined,expectedRevision,currentRevision)};}catch(e){throw new SenderError(String(e));}
}
export function receipt(ctx:Context,key:string,request:string,resultId:string,revision:bigint){
 // Permanent bounded ledgers preserve idempotency; pruning never silently permits duplicate publication.
 if([...ctx.db.constructionReceipt.by_principal.filter(ctx.sender)].length>=4096)throw new SenderError('Construction operation ledger full; operator archival required');
 ctx.db.constructionReceipt.insert({id:key,principal:ctx.sender,request,resultId,revision});
}
/** Bootstrap requires a verified, explicitly assigned provider role, not character/ship ownership. */
export function setGrant(ctx:Context,args:{principal:string;workspaceId:string;capability:string;expiresMicros:bigint;revoked:boolean;expectedRevision:bigint;operationId:string}){
 const session=auth.requireGame(ctx),payload=ctx.senderAuth.jwt?.fullPayload;
 const realm=payload?.realm_access as {roles?:unknown}|undefined;
 const administrator=session.kind==='oidc'&&Array.isArray(realm?.roles)&&realm.roles.includes('sidereal-construction-admin');
 if(!administrator)requireGrant(ctx,args.workspaceId,'grant.manage');
 if(!validId(args.workspaceId)||!capabilities.includes(args.capability as ConstructionCapability)||args.expiresMicros<0n||(args.expiresMicros!==forever&&args.expiresMicros<=ctx.timestamp.microsSinceUnixEpoch))throw new SenderError('Invalid construction grant');
 let principal:Identity;try{principal=Identity.fromString(args.principal);}catch{throw new SenderError('Invalid principal');}
 const id=JSON.stringify([principal.toHexString(),args.workspaceId,args.capability]);
 const prior=ctx.db.constructionGrant.id.find(id);
 const op=operation(ctx,args.operationId,{kind:'grant',...args,expiresMicros:args.expiresMicros.toString(),expectedRevision:args.expectedRevision.toString()},args.expectedRevision,prior?.revision??0n);if(op.replay)return;
 if(!prior&&[...ctx.db.constructionGrant.by_principal.filter(principal)].length>=64)throw new SenderError('Principal grant limit reached');
 const next={id,principal,workspaceId:args.workspaceId,capability:args.capability,expiresMicros:args.expiresMicros,nextCheckMicros:args.revoked?forever:args.expiresMicros,revoked:args.revoked,revision:args.expectedRevision+1n,issuedBy:ctx.sender};
 if(prior)ctx.db.constructionGrant.id.update(next);else ctx.db.constructionGrant.insert(next);
 if(args.revoked && ["draft.read","instance.spawn"].includes(args.capability)) recoverConstructionSeatsForGrant(ctx,principal,args.workspaceId);
 receipt(ctx,op.key,op.request,id,next.revision);
}
export function saveDraft(ctx:Context,args:{workspaceId:string;draftId:string;documentJson:string;expectedRevision:bigint;operationId:string}){
 requireGrant(ctx,args.workspaceId,'draft.write');if(!validId(args.draftId))throw new SenderError('Invalid draft ID');
 let snapshot;try{snapshot=readConstructionDraft(args.documentJson);}catch(e){throw new SenderError(String(e));}
 const prior=ctx.db.constructionDraft.id.find(args.draftId);if(prior&&prior.workspaceId!==args.workspaceId)throw new SenderError('Draft workspace mismatch');
 const op=operation(ctx,args.operationId,{kind:'save',workspaceId:args.workspaceId,draftId:args.draftId,document:snapshot.canonical,expected:args.expectedRevision.toString()},args.expectedRevision,prior?.revision??0n);if(op.replay)return;
 if(!prior&&[...ctx.db.constructionDraft.by_workspace.filter(args.workspaceId)].length>=128)throw new SenderError('Workspace draft limit reached');
 const next={id:args.draftId,workspaceId:args.workspaceId,revision:args.expectedRevision+1n,documentJson:snapshot.canonical,sha256:snapshot.sha256,updatedBy:ctx.sender};
 if(prior)ctx.db.constructionDraft.id.update(next);else ctx.db.constructionDraft.insert(next);receipt(ctx,op.key,op.request,args.draftId,next.revision);
}
export function publishBlueprint(ctx:Context,args:{workspaceId:string;draftId:string;expectedRevision:bigint;operationId:string}){
 requireGrant(ctx,args.workspaceId,'blueprint.publish');requireGrant(ctx,args.workspaceId,'draft.read');
 const prior=ctx.db.constructionDraft.id.find(args.draftId);if(!prior||prior.workspaceId!==args.workspaceId)throw new SenderError('Accessible draft required');
 const op=operation(ctx,args.operationId,{kind:'publish',workspaceId:args.workspaceId,draftId:args.draftId,expected:args.expectedRevision.toString()},args.expectedRevision,prior.revision);if(op.replay)return;
 if([...ctx.db.constructionBlueprint.by_workspace.filter(args.workspaceId)].length>=256)throw new SenderError('Workspace publication limit reached');
 let snapshot;try{snapshot=compileConstruction(prior.documentJson);}catch(e){throw new SenderError(String(e));}
 const id=ctx.newUuidV4().toString();ctx.db.constructionBlueprint.insert({id,workspaceId:args.workspaceId,draftId:args.draftId,sourceRevision:prior.revision,canonical:snapshot.canonical,sha256:snapshot.sha256,readinessJson:JSON.stringify(snapshot.readiness),publishedBy:ctx.sender});receipt(ctx,op.key,op.request,id,prior.revision);
}
/** ViewCtx has no clock: expire actual grants on the authority tick; reducers always check exact time. */
export function expireGrants(ctx:Context){for(const g of ctx.db.constructionGrant.by_expiry.filter(new Range(null,{tag:'included',value:ctx.timestamp.microsSinceUnixEpoch})))if(!g.revoked){ctx.db.constructionGrant.id.update({...g,revoked:true,nextCheckMicros:forever,revision:g.revision+1n});if(['draft.read','instance.spawn'].includes(g.capability))recoverConstructionSeatsForGrant(ctx,g.principal,g.workspaceId);}}
export const grantProjection=t.row('ConstructionGrantStatus',{id:t.string().primaryKey(),workspaceId:t.string(),capability:t.string(),expiresMicros:t.u64(),revoked:t.bool(),revision:t.u64()});
export function ownGrants(ctx:ReadContext){return [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)].map(({id,workspaceId,capability,expiresMicros,revoked,revision})=>({id,workspaceId,capability,expiresMicros,revoked,revision}));}
export const draftProjection=t.row('ConstructionDraftStatus',{id:t.string().primaryKey(),workspaceId:t.string(),revision:t.u64(),documentJson:t.string(),sha256:t.string()});
function readWorkspaces(ctx:ReadContext){return new Set(grants(ctx).filter(g=>!g.revoked&&g.capability==='draft.read').map(g=>g.workspaceId));}
export function ownDrafts(ctx:ReadContext){return [...readWorkspaces(ctx)].flatMap(w=>[...ctx.db.constructionDraft.by_workspace.filter(w)].map(({id,workspaceId,revision,documentJson,sha256})=>({id,workspaceId,revision,documentJson,sha256})));}
export const blueprintProjection=t.row('ConstructionBlueprintStatus',{id:t.string().primaryKey(),workspaceId:t.string(),draftId:t.string(),sourceRevision:t.u64(),canonical:t.string(),sha256:t.string(),readinessJson:t.string()});
export function ownBlueprints(ctx:ReadContext){return [...readWorkspaces(ctx)].flatMap(w=>[...ctx.db.constructionBlueprint.by_workspace.filter(w)].map(({id,workspaceId,draftId,sourceRevision,canonical,sha256,readinessJson})=>({id,workspaceId,draftId,sourceRevision,canonical,sha256,readinessJson})));}
