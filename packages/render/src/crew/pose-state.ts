import {EQUIPMENT_POSE_PROFILES,type EquipmentPoseType} from '../../../content/src/equipment-poses';
import {angle,approach,clamp,exponential} from './pose-math';
export interface PoseIntent {
 /** Desired yaw/pitch in the parent ship presentation frame, radians; yaw zero faces -Z. */
 yaw:number; pitch:number; facing:number; active:boolean; moving?:boolean; sprinting?:boolean; seated?:boolean; hidden?:boolean; reducedMotion?:boolean;
 itemId?:string; shotSequence?:bigint; profile:EquipmentPoseType;
 movementYaw?:number;
 /** Absolute travel heading in the same ship frame as facing/yaw. Live integration
  * uses this so gait can be remapped against this frame's achieved torso angle. */
 movementHeading?:number;
 action?:'ready'|'raised'|'lowered'|'equip'|'unequip'|'use'|'reload-preview';
}
export function createPoseState(){
 let heading=0,yaw=0,pitch=0,weight=0,recoil=0,initialized=false,itemId:string|undefined,sequence:bigint|undefined;
 return {step(input:PoseIntent,delta:number){
  if(![input.yaw,input.pitch,input.facing,delta].every(Number.isFinite))throw new Error('Non-finite pose intent');
  const dt=clamp(delta,0,.1),p=EQUIPMENT_POSE_PROFILES[input.profile];
  if(!initialized){heading=input.facing;yaw=input.facing;initialized=true;}
  if(input.itemId!==itemId){itemId=input.itemId;sequence=input.shotSequence;recoil=0;}
  else if(input.shotSequence!==undefined){if(sequence!==undefined&&input.shotSequence>sequence&&!input.hidden&&!input.seated)recoil=1;if(sequence===undefined||input.shotSequence>sequence)sequence=input.shotSequence;}
  const target=input.active&&!input.seated&&!input.sprinting&&input.action!=='lowered'&&input.action!=='unequip'?1:0;
  if(input.hidden){return {heading,yaw,pitch,weight:0,recoil:0,turn:0,skipped:true};}
  const t=input.reducedMotion?1:1-Math.exp(-dt/(target>weight?p.acquireSeconds:p.releaseSeconds));weight+=(target-weight)*t;
  if(input.seated){weight=0;heading=input.facing;yaw=heading;pitch=0;}
  else {
   const requested=target?input.yaw:input.facing;
   const difference=angle(requested-heading),amount=clamp((Math.abs(difference)-p.turnStart)/(p.turnFull-p.turnStart),0,1),smooth=amount*amount*(3-2*amount);
   const bodyTarget=input.moving&&!target?input.facing:heading+difference*smooth;
   heading=approach(heading,bodyTarget,p.rootRate,dt);
   yaw=approach(yaw,heading+clamp(angle(requested-heading),-p.maxUpperBodyYaw,p.maxUpperBodyYaw),p.aimRate,dt);
   pitch=approach(pitch,target?clamp(input.pitch,-p.maxUpperBodyPitch,p.maxUpperBodyPitch):-.45,p.aimRate,dt);
  }
  recoil=exponential(recoil,0,.09,dt);
  return {heading,yaw,pitch,weight,recoil,turn:angle(input.yaw-heading),skipped:false};
 },reset(){initialized=false;weight=0;recoil=0;itemId=undefined;sequence=undefined;}};
}
