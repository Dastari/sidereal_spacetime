import {SenderError,t,type ReducerCtx,type ViewCtx,type InferSchema} from 'spacetimedb/server';
import type world from './index';
import {validateAppearanceJson} from '../../sim/src/appearance';
import {CHARACTER_APPEARANCE_ENUMS,CHARACTER_APPEARANCE_COLORS} from '../../content/src/appearance';
type ReadContext=Pick<ViewCtx<InferSchema<typeof world>>,'db'|'sender'>;
type Context=ReducerCtx<InferSchema<typeof world>>;
export const appearanceProjection=t.object('CharacterAppearanceStatus',{characterId:t.string(),revision:t.u64(),appearanceJson:t.string()});
export function ownAppearance(ctx:ReadContext) {
  return [...ctx.db.character.by_owner.filter(ctx.sender)].map(actor=>
    ctx.db.characterAppearance.characterId.find(actor.id) ?? {characterId:actor.id,revision:0n,appearanceJson:'{}'});
}
export function setCharacterAppearance(ctx:Context,args:{appearanceJson:string;expectedRevision:bigint;operationId:string}) {
  const actor=[...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if(!actor?.connected) throw new SenderError('Connected character required');
  if(!/^[a-zA-Z0-9:_-]{1,80}$/.test(args.operationId)) throw new SenderError('Invalid appearance operation ID');
  let appearanceJson:string;
  try {appearanceJson=validateAppearanceJson(args.appearanceJson,CHARACTER_APPEARANCE_ENUMS,CHARACTER_APPEARANCE_COLORS);}
  catch(error){throw new SenderError(error instanceof Error?error.message:'Invalid appearance');}
  const request=JSON.stringify([args.expectedRevision.toString(),appearanceJson]);
  const id=`${actor.id}:${args.operationId}`,receipt=ctx.db.appearanceReceipt.id.find(id);
  if(receipt) {if(receipt.request!==request)throw new SenderError('Operation ID reused with a different request');return;}
  const previous=ctx.db.characterAppearance.characterId.find(actor.id);
  if((previous?.revision??0n)!==args.expectedRevision)throw new SenderError('Appearance revision conflict');
  const next={characterId:actor.id,revision:args.expectedRevision+1n,appearanceJson};
  if(previous)ctx.db.characterAppearance.characterId.update(next);else ctx.db.characterAppearance.insert(next);
  const receipts=[...ctx.db.appearanceReceipt.by_character.filter(actor.id)].sort((a,b)=>a.revision<b.revision?-1:1);
  while(receipts.length>=128)ctx.db.appearanceReceipt.id.delete(receipts.shift()!.id);
  ctx.db.appearanceReceipt.insert({id,characterId:actor.id,request,revision:next.revision});
}
