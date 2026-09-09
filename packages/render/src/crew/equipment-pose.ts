import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {EQUIPMENT_POSE_PROFILES,type EquipmentPoseProfile} from '../../../content/src/equipment-poses';
import type {PoseEquipmentBinding} from '../equipment/pose-anchors';
import {relativePoseMovementYaw} from './pose-integration-motion';
import {aimRotation,angle,boxPenetration,clamp,transformedBox,twoBone,type OrientedBox} from './pose-math';
import {sampleAimSpace,type AuthoredAimSpace} from './aim-space';
import {createPoseState,type PoseIntent} from './pose-state';
export type {PoseIntent} from './pose-state';
const point=(n:TransformNode)=>{n.computeWorldMatrix(true);return n.getAbsolutePosition().clone();};
// Search near the shoulder before pushing the item beyond arm reach. Later
// candidates lower the stock independently of the lateral/forward displacement.
const clearanceOffsets = [
 [0,0,0],[.035,-.025,-.025],[.07,-.05,-.05],[.105,-.075,-.075],
 [.14,-.1,-.1],[0,-.06,-.025],[.035,-.08,-.025],[.07,-.08,0],
 [0,-.1,0],[0,-.1,-.1],[.035,-.1,-.1],[.07,-.1,-.08],
] as const;
function rotateToward(node:TransformNode,child:TransformNode,target:Vector3){
 const inv=Matrix.Invert(node.parent!.computeWorldMatrix(true));
 const from=Vector3.TransformCoordinates(point(child),inv).subtract(node.position).normalize();
 const to=Vector3.TransformCoordinates(target,inv).subtract(node.position).normalize();
 const delta=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(from,to,delta);
 node.rotationQuaternion=delta.multiply(node.rotationQuaternion??Quaternion.FromEulerVector(node.rotation));node.computeWorldMatrix(true);
}
function orientAxes(node:TransformNode,forward:Vector3,up:Vector3,localForward=Vector3.Up(),localUp=Vector3.Forward()){
 const inv=Matrix.Invert(node.parent!.computeWorldMatrix(true));
 const basis=(f:Vector3,u:Vector3)=>{f.normalize();const r=Vector3.Cross(u,f).normalize();u=Vector3.Cross(f,r).normalize();return Quaternion.RotationQuaternionFromAxis(r,u,f);};
 node.rotationQuaternion=basis(Vector3.TransformNormal(forward,inv),Vector3.TransformNormal(up,inv)).multiply(Quaternion.Inverse(basis(localForward,localUp)));node.computeWorldMatrix(true);
}
export interface EquipmentPoseDiagnostics {
 status:'inactive'|'solved'|'fallback'|'unreachable'|'hidden'|'disposed'|'clearance-failed';
 aimErrorDegrees:number; primaryErrorM:number; supportErrorM:number; shoulderErrorM:number; eyeErrorM:number; penetrationM:number;
 shoulderCompressionM:number; upperArmPenetrationM:number; iterations:number; cpuMs:number; heading:number; torsoYaw:number; pitch:number;
 muzzle?:{position:Vector3;direction:Vector3}; desired?:Vector3; pivot?:Vector3;
 shoulder?:Vector3; sight?:Vector3; eye?:Vector3; eyeReference?:Vector3;
 primary?:Vector3; support?:Vector3; poles:Vector3[]; targets:Vector3[]; body:OrientedBox[]; weapon:OrientedBox[];
}
/** Presentation-only solver. Caller invokes update before scene animation. All added
 * transforms restore before the next animation, including paused/hidden frames.
 * Canonical placement is never changed; bodyFrame is an internal visual child. */
export function createEquipmentPoseController(scene:Scene,placement:TransformNode,bodyFrame:TransformNode,nodes:TransformNode[],hands:Record<'R'|'L',TransformNode>){
 const byName=new Map(nodes.map(n=>[n.name,n]));
 const bone=(name:string)=>{const n=byName.get(name);if(!n)throw new Error(`Equipment pose rig missing ${name}`);return n;};
 for(const side of ['R','L'])for(const part of ['upper_arm','forearm','hand','thigh','shin','foot'])bone(`${part}.${side}`);
 const changed=['pelvis','spine','head',...['R','L'].flatMap(side=>['upper_arm','forearm','hand','thigh','shin','foot'].map(p=>`${p}.${side}`))].map(bone);
 const saved=changed.map(node=>({node,position:node.position.clone(),rotation:Quaternion.Identity()}));
 const originalBodyRotation=bodyFrame.rotation.clone();
 const initialInverse=Matrix.Invert(placement.computeWorldMatrix(true));
 const rigSigns={R:Math.sign(Vector3.TransformCoordinates(point(bone('upper_arm.R')),initialInverse).x)||-1,L:Math.sign(Vector3.TransformCoordinates(point(bone('upper_arm.L')),initialInverse).x)||1};
 let hasBaseline=false,disposed=false,binding:PoseEquipmentBinding|undefined,intent:PoseIntent|undefined;
 let turnPhase=0,lastHeading=0,usePhase=0;
 let delta=0,bulk=.02,aimSpace:AuthoredAimSpace|undefined;
 const state=createPoseState(),previousBends=new Map<string,Vector3>();
 const diagnostics:EquipmentPoseDiagnostics={status:'inactive',shoulderCompressionM:0,upperArmPenetrationM:0,aimErrorDegrees:0,primaryErrorM:0,supportErrorM:0,shoulderErrorM:0,eyeErrorM:0,penetrationM:0,iterations:0,cpuMs:0,heading:0,torsoYaw:0,pitch:0,poles:[],targets:[],body:[],weapon:[]};
 const restore=()=>{if(!hasBaseline)return;for(const s of saved){s.node.position.copyFrom(s.position);s.node.rotationQuaternion??=Quaternion.Identity();s.node.rotationQuaternion.copyFrom(s.rotation);s.node.computeWorldMatrix(true);}hasBaseline=false;};
 const save=()=>{for(const s of saved){s.position.copyFrom(s.node.position);s.rotation.copyFrom(s.node.rotationQuaternion??Quaternion.FromEulerVector(s.node.rotation));}hasBaseline=true;};
 function arm(side:'R'|'L',target:Vector3,pole:Vector3,handMatrix:Matrix,profile:EquipmentPoseProfile){
  const a=bone(`upper_arm.${side}`),b=bone(`forearm.${side}`),c=bone(`hand.${side}`);
  orientAxes(c,Vector3.TransformNormal(new Vector3(0,0,-1),handMatrix),Vector3.TransformNormal(Vector3.Up(),handMatrix));
  const wrist=target.subtract(point(hands[side]).subtract(point(c)));
  // The pinned rig has no clavicle bone. A bounded shoulder-root translation
  // represents girdle motion; bone lengths and actor placement remain unchanged.
  const reach=Vector3.Distance(point(a),point(b))+Vector3.Distance(point(b),point(c))-.001;
  const reachVector=wrist.subtract(point(a)),girdle=Math.min(profile.maxShoulderGirdleM,Math.max(0,reachVector.length()-reach));
  if(girdle>0){a.position.addInPlace(Vector3.TransformNormal(reachVector.normalize().scale(girdle),Matrix.Invert(a.parent!.computeWorldMatrix(true))));a.computeWorldMatrix(true);}
  const solved=twoBone(point(a),wrist,pole,Vector3.Distance(point(a),point(b)),Vector3.Distance(point(b),point(c)),previousBends.get(side),...profile.elbowBendLimits);previousBends.set(side,solved.bend);
  rotateToward(a,b,solved.elbow);rotateToward(b,c,solved.end);orientAxes(c,Vector3.TransformNormal(new Vector3(0,0,-1),handMatrix),Vector3.TransformNormal(Vector3.Up(),handMatrix));
  diagnostics.poles.push(pole);diagnostics.targets.push(target);
  return Vector3.Distance(point(hands[side]),target);
 }
 const before=scene.onBeforeAnimationsObservable.add(restore);
 let cachedState:ReturnType<ReturnType<typeof createPoseState>['step']>|undefined;
 const solveFrame=(retry=false)=>{
  restore();if(disposed||!intent||!binding)return;
  const start=performance.now(),input=intent,p=EQUIPMENT_POSE_PROFILES[input.profile],s=retry?{...cachedState!,yaw:cachedState!.heading,pitch:0,weight:1,recoil:0}:state.step(input,delta);if(!retry){cachedState=s;usePhase=input.action==='use'?usePhase+delta*5:0;turnPhase+=Math.abs(angle(s.heading-lastHeading))*7;lastHeading=s.heading;}
  diagnostics.status=s.skipped?'hidden':'inactive';diagnostics.iterations=0;diagnostics.poles.length=0;diagnostics.targets.length=0;diagnostics.body=[];diagnostics.weapon=[];
  // Early exits describe this frame, never a prior penetrating/raised solve.
  diagnostics.primaryErrorM=0;diagnostics.supportErrorM=0;diagnostics.shoulderErrorM=0;diagnostics.eyeErrorM=0;diagnostics.penetrationM=0;diagnostics.upperArmPenetrationM=0;diagnostics.shoulderCompressionM=0;diagnostics.aimErrorDegrees=0;
  diagnostics.desired=undefined;diagnostics.pivot=undefined;diagnostics.shoulder=undefined;diagnostics.sight=undefined;diagnostics.eye=undefined;diagnostics.eyeReference=undefined;diagnostics.primary=undefined;diagnostics.support=undefined;
  if(s.skipped){diagnostics.muzzle=undefined;diagnostics.cpuMs=performance.now()-start;return;}
  // Fixed authored model facing (pi) plus bounded heading relative to canonical placement.
  bodyFrame.rotation.y=originalBodyRotation.y-angle(s.heading-input.facing);bodyFrame.computeWorldMatrix(true);
  if(input.seated||s.weight<.001){binding.followAttachment();diagnostics.muzzle=undefined;diagnostics.cpuMs=performance.now()-start;return;}
  save();
  if(aimSpace){
   const neutralSpine=p.requiresShoulderContact?sampleAimSpace(aimSpace,input.profile,0,0).get('spine'):undefined;
   for(const [name,rotation] of sampleAimSpace(aimSpace,input.profile,angle(s.yaw-s.heading)*180/Math.PI,s.pitch*180/Math.PI)){
    if(name==='spine'&&!p.requiresShoulderContact)continue;
    const n=bone(name);
    // A shouldered item needs a stable chest under the existing aim/stance yaw.
    // Cancel gait roll here; pelvis translation and the complete leg/foot gait
    // remain animated. The final pose-weight blend fades this layer in and out.
    n.rotationQuaternion=name==='spine'&&neutralSpine?Quaternion.Inverse(bone('pelvis').rotationQuaternion??Quaternion.Identity()).multiply(neutralSpine):rotation;
    n.computeWorldMatrix(true);
   }
  }
  const world=placement.computeWorldMatrix(true),inv=Matrix.Invert(world),toLocal=(v:Vector3)=>Vector3.TransformCoordinates(v,inv),toWorld=(v:Vector3)=>Vector3.TransformCoordinates(v,world);
  const torsoYaw=clamp(angle(s.yaw-s.heading)*p.torsoAimContribution,-.55,.55);
  // A bladed shoulder stance advances the supporting shoulder. Handedness follows actual rig.
  const dominant=p.primaryHand,other=dominant==='R'?'L':'R';
  const sideSign=rigSigns[dominant];
 const achievedYaw=s.heading+torsoYaw;
 const bodyRotation=Matrix.Compose(Vector3.One(),aimRotation(achievedYaw-input.facing,0),Vector3.Zero());
 const bodyOffset=(v:Vector3)=>Vector3.TransformNormal(v,bodyRotation);
  const spine=bone('spine'),pelvis=bone('pelvis'),head=bone('head');
  const authoredTwist=(dominant==='R'?-1:1)*p.stanceYaw;
  const stanceHip=authoredTwist*p.hipAimContribution;
  pelvis.rotationQuaternion=pelvis.rotationQuaternion!.multiply(Quaternion.RotationAxis(Vector3.Up(),stanceHip*s.weight));pelvis.computeWorldMatrix(true);
  spine.rotationQuaternion=spine.rotationQuaternion!.multiply(Quaternion.RotationYawPitchRoll((authoredTwist-stanceHip+(scene.useRightHandedSystem?-1:1)*torsoYaw)*s.weight,-s.pitch*.20*s.weight,0));spine.computeWorldMatrix(true);
  const feet=['R','L'].map(side=>({side,point:point(bone(`foot.${side}`)),forward:bone(`foot.${side}`).getDirection(Vector3.Forward()).normalize(),up:bone(`foot.${side}`).getDirection(Vector3.Up()).normalize()}));
  pelvis.position.y-=.025*s.weight;pelvis.computeWorldMatrix(true);
  head.rotationQuaternion=head.rotationQuaternion!.multiply(Quaternion.RotationYawPitchRoll(-authoredTwist*.5*s.weight,-s.pitch*.15*s.weight,0));head.computeWorldMatrix(true);
  const eyeLocal=toLocal(Vector3.TransformCoordinates(new Vector3(dominant==='R'?-.10:.10,.32,.24),head.computeWorldMatrix(true)));
  const primaryShoulder=toLocal(point(bone(`upper_arm.${dominant}`))),supportShoulder=toLocal(point(bone(`upper_arm.${other}`)));
  // Conservative boxes encompass the actual bulky torso/helmet; upper arms checked after IK.
  const body=[transformedBox('ChestClearance',new Vector3(0,.16,0),new Vector3(.23+bulk,.22,.16+bulk),spine.computeWorldMatrix(true)),transformedBox('AbdomenClearance',new Vector3(0,.08,0),new Vector3(.235+bulk,.14,.17+bulk),pelvis.computeWorldMatrix(true)),transformedBox('HeadClearance',new Vector3(0,.43,0),new Vector3(.34+bulk,.39,.29+bulk),head.computeWorldMatrix(true))];
  const pocket=primaryShoulder.add(Vector3.TransformNormal(Vector3.TransformNormal(Vector3.FromArray(p.shoulderPocketOffset),spine.computeWorldMatrix(true)),inv));
  const item=binding.item,primary=Vector3.FromArray(item.sockets['Grip.Primary']!),contact=Vector3.FromArray(item.sockets['Contact.Shoulder']??item.sockets['Grip.Primary']!);
  const relativeYaw=angle(s.yaw-input.facing),desiredPitch=s.pitch+s.recoil*p.recoilRadians;
  let selected:Matrix|undefined,boxes:OrientedBox[]=[],penetration=Infinity,bestScore=Infinity,selectedPitch=desiredPitch;
  const requestedPivot=p.requiresShoulderContact?pocket:bodyOffset(item.deviceMode==='VIEW_SCREEN_DEVICE'?new Vector3(sideSign*p.screenGripOffset[0],p.screenGripOffset[1],p.screenGripOffset[2]):new Vector3(sideSign*Math.abs(p.gripOffset[0]),p.gripOffset[1],p.gripOffset[2]));
  for(let iteration=0;iteration<p.maxCorrections;iteration++){
   diagnostics.iterations++;
   const fraction=iteration<4?1:Math.max(0,1-(iteration-3)/5),pitch=desiredPitch*fraction;
   const rotation=aimRotation(angle(achievedYaw-input.facing),pitch),r=Matrix.FromQuaternionToRef(rotation,Matrix.Identity());
   const correction=clearanceOffsets[Math.min(iteration,clearanceOffsets.length-1)];
   let pivot=requestedPivot.add(bodyOffset(new Vector3(sideSign*correction[0],correction[1],correction[2])));
   if(item.deviceMode==='VIEW_SCREEN_DEVICE'){
    // Display faces the eyes; emitter direction is intentionally unrelated to requested target.
    const eye=eyeLocal;
    const view=eye.subtract(pivot).normalize();rotation.copyFrom(aimRotation(Math.atan2(view.x,-view.z),Math.asin(view.y)).multiply(Quaternion.RotationAxis(Vector3.Forward(),sideSign*p.screenRoll)));rotation.toRotationMatrix(r);
   }
   if(input.action==='use')pivot.y+=Math.sin(usePhase)*.012;
   pivot.addInPlace(bodyOffset(new Vector3(0,0,s.recoil*p.recoilMeters)));
   const translation=pivot.subtract(Vector3.TransformNormal(p.requiresShoulderContact?contact:primary,r));
   const m=Matrix.Compose(new Vector3(sideSign,1,1),rotation,translation).multiply(world);
   const candidate=item.clearance.map(b=>transformedBox(b.name,Vector3.FromArray(b.center),Vector3.FromArray(b.half),m));
   let overlap=0;for(const w of candidate)for(const b of body)overlap=Math.max(overlap,boxPenetration(w,b,p.clearanceMargin));
   
   const reachError=(side:'R'|'L',target:Vector3)=>{const a=bone(`upper_arm.${side}`),b=bone(`forearm.${side}`),c=bone(`hand.${side}`);const wrist=target.subtract(Vector3.TransformNormal(new Vector3(0,0,-.055),m));return Math.max(0,Vector3.Distance(point(a),wrist)-Vector3.Distance(point(a),point(b))-Vector3.Distance(point(b),point(c))+.001-p.maxShoulderGirdleM);};
   const primaryReach=reachError(dominant,Vector3.TransformCoordinates(primary,m));
   const supportSocket=item.sockets[p.secondaryHandMode==='primary-hand'?'SupportHandContact':'Grip.Secondary'];
   const supportReach=p.secondaryHandMode!=='free'&&supportSocket?reachError(other,Vector3.TransformCoordinates(Vector3.FromArray(supportSocket),m)):0;
   const score=overlap*10000+primaryReach*100+supportReach*30+Vector3.Distance(pivot,requestedPivot)*.3+(1-fraction)*.1;
   if(score<bestScore){bestScore=score;selected=m;boxes=candidate;penetration=overlap;selectedPitch=pitch;}
   if(overlap===0&&primaryReach<.004&&supportReach<.02)break;
  }
  if(!selected)return;
  // Explicit safe lowered fallback outside the body, never retain a penetrating solution.
  if(penetration>0){
   const rotation=aimRotation(s.heading-input.facing,-.9);selected=Matrix.Compose(new Vector3(sideSign,1,1),rotation,bodyOffset(new Vector3(sideSign*(.36+bulk),.95,-.25))).multiply(world);
   boxes=item.clearance.map(b=>transformedBox(b.name,Vector3.FromArray(b.center),Vector3.FromArray(b.half),selected!));
   penetration=0;for(const w of boxes)for(const b of body)penetration=Math.max(penetration,boxPenetration(w,b,p.clearanceMargin));
   diagnostics.status='fallback';
  }else diagnostics.status='solved';
  // Smooth item acquisition from its authored hand attachment; actual socket remains physical.
  if(s.weight<.999){const rest=binding.restMatrix(),rq=Quaternion.Identity(),rp=Vector3.Zero(),sq=Quaternion.Identity(),sp=Vector3.Zero();rest.decompose(undefined,rq,rp);selected.decompose(undefined,sq,sp);selected=Matrix.Compose(new Vector3(sideSign,1,1),Quaternion.Slerp(rq,sq,s.weight),Vector3.Lerp(rp,sp,s.weight));}
  boxes=item.clearance.map(b=>transformedBox(b.name,Vector3.FromArray(b.center),Vector3.FromArray(b.half),selected!));
  penetration=0;for(const w of boxes)for(const b of body)penetration=Math.max(penetration,boxPenetration(w,b,p.clearanceMargin));
  binding.setMatrix(selected);
  const grip=binding.socket('Grip.Primary')!.position,support=binding.socket(p.secondaryHandMode==='primary-hand'?'SupportHandContact':'Grip.Secondary')?.position;
  diagnostics.primaryErrorM=arm(dominant,grip,toWorld(primaryShoulder.add(bodyOffset(new Vector3(sideSign*.45,-.4,.04)))),selected,p);
  diagnostics.supportErrorM=0;
  if(p.secondaryHandMode!=='free'&&support)diagnostics.supportErrorM=arm(other,support,toWorld(supportShoulder.add(bodyOffset(new Vector3(-sideSign*.40,-.45,-.12)))),selected,p);
  else arm(other,toWorld(bodyOffset(new Vector3(-sideSign*Math.abs(p.freeArmOffset[0]),p.freeArmOffset[1],p.freeArmOffset[2]))),toWorld(supportShoulder.add(new Vector3(-sideSign*.4,-.3,0))),selected,p);
  for(const foot of feet){
   const local=toLocal(foot.point),direction=input.movementHeading!==undefined?relativePoseMovementYaw(input.movementHeading,achievedYaw):input.movementYaw??0;
   if(input.moving&&direction!==0){const offset=bodyOffset(new Vector3(Math.sin(direction)*(-local.z),0,(1-Math.cos(direction))*(-local.z)));foot.point.addInPlace(Vector3.TransformNormal(offset,world));}
   if(!input.moving&&Math.abs(s.turn)>.4&&!input.reducedMotion)foot.point.y+=Math.max(0,Math.sin(turnPhase+(foot.side==='R'?0:Math.PI)))*.035;
   const a=bone(`thigh.${foot.side}`),b=bone(`shin.${foot.side}`),c=bone(`foot.${foot.side}`);const solution=twoBone(point(a),foot.point,foot.point.add(placement.getDirection(new Vector3(0,0,-1))),Vector3.Distance(point(a),point(b)),Vector3.Distance(point(b),point(c)));rotateToward(a,b,solution.elbow);rotateToward(b,c,solution.end);orientAxes(c,foot.forward,foot.up,Vector3.Forward(),Vector3.Up());}
  // Keep animation baseline blending deterministic. Final equipment transform remains physical.
  for(const entry of saved){entry.node.position.copyFrom(Vector3.Lerp(entry.position,entry.node.position,s.weight));entry.node.rotationQuaternion=Quaternion.Slerp(entry.rotation,entry.node.rotationQuaternion!,s.weight);entry.node.computeWorldMatrix(true);}
  diagnostics.primaryErrorM=Vector3.Distance(point(hands[dominant]),grip);
  if(support&&p.secondaryHandMode!=='free')diagnostics.supportErrorM=Vector3.Distance(point(hands[other]),support);
  diagnostics.muzzle=binding.socket(item.sockets['Aim.Muzzle']?'Aim.Muzzle':'Aim.Direction');
  const desired=Vector3.TransformNormal(new Vector3(Math.sin(input.yaw-input.facing)*Math.cos(input.pitch),Math.sin(input.pitch),-Math.cos(input.yaw-input.facing)*Math.cos(input.pitch)),world).normalize();
  diagnostics.desired=desired;diagnostics.aimErrorDegrees=diagnostics.muzzle?Math.acos(clamp(Vector3.Dot(diagnostics.muzzle.direction,desired),-1,1))*180/Math.PI:0;
  diagnostics.shoulderErrorM=p.requiresShoulderContact?Vector3.Distance(binding.socket('Contact.Shoulder')!.position,toWorld(pocket.add(toLocal(point(bone(`upper_arm.${dominant}`))).subtract(primaryShoulder)))):0;
  if(p.requiresEyeAlignment){const originalHead=head.position.clone();const eyeTarget=binding.socket('Sight.EyeReference')!.position,deltaEye=eyeTarget.subtract(toWorld(eyeLocal));const correction=deltaEye.scale(Math.min(.06,deltaEye.length())/Math.max(1e-6,deltaEye.length()));head.position.addInPlace(Vector3.TransformNormal(correction,Matrix.Invert(head.parent!.computeWorldMatrix(true))));head.computeWorldMatrix(true);let headProxy=transformedBox('HeadClearance',new Vector3(0,.43,0),new Vector3(.34+bulk,.39,.29+bulk),head.getWorldMatrix());if(boxes.some(box=>boxPenetration(box,headProxy,p.clearanceMargin)>0)){head.position.copyFrom(originalHead);head.computeWorldMatrix(true);headProxy=transformedBox('HeadClearance',new Vector3(0,.43,0),new Vector3(.34+bulk,.39,.29+bulk),head.getWorldMatrix());}body[2]=headProxy;eyeLocal.copyFrom(toLocal(Vector3.TransformCoordinates(new Vector3(dominant==='R'?-.10:.10,.32,.24),head.getWorldMatrix())));}
  diagnostics.shoulder=binding.socket('Contact.Shoulder')?.position;diagnostics.sight=binding.socket('Sight.Primary')?.position;diagnostics.eye=toWorld(eyeLocal);diagnostics.eyeReference=binding.socket('Sight.EyeReference')?.position;
  diagnostics.eyeErrorM=p.requiresEyeAlignment?Vector3.Distance(binding.socket('Sight.EyeReference')!.position,toWorld(eyeLocal)):0;
  diagnostics.upperArmPenetrationM=0;diagnostics.shoulderCompressionM=0;
  for(const side of ['R','L']){const upper=bone(`upper_arm.${side}`),lower=bone(`forearm.${side}`),length=Vector3.Distance(point(upper),point(lower));const proxy=transformedBox(`${side==='R'?'Right':'Left'}UpperArmClearance`,new Vector3(0,length*.5,0),new Vector3(.085+bulk*.3,length*.5,.10),upper.computeWorldMatrix(true));body.push(proxy);for(const box of boxes){const overlap=boxPenetration(box,proxy);if(box.name==='stock'&&side===dominant&&p.requiresShoulderContact&&diagnostics.shoulderErrorM<=p.maxShoulderSeparation&&overlap<=p.maxStockContactCompressionM){diagnostics.shoulderCompressionM=Math.max(diagnostics.shoulderCompressionM,overlap);}else diagnostics.upperArmPenetrationM=Math.max(diagnostics.upperArmPenetrationM,overlap);}}
  diagnostics.penetrationM=penetration;diagnostics.body=body;diagnostics.weapon=boxes;diagnostics.pivot=toWorld(requestedPivot);diagnostics.primary=grip;diagnostics.support=support;diagnostics.heading=s.heading;diagnostics.torsoYaw=torsoYaw;diagnostics.pitch=selectedPitch;
  if((s.weight>.999&&(diagnostics.primaryErrorM>.004||diagnostics.supportErrorM>.025))||diagnostics.shoulderErrorM>p.maxShoulderSeparation)diagnostics.status='unreachable';
  if(diagnostics.penetrationM>1e-5||diagnostics.upperArmPenetrationM>.005)diagnostics.status='clearance-failed';
  diagnostics.cpuMs=performance.now()-start;
 };
 const after=scene.onAfterAnimationsObservable.add(()=>{solveFrame();if(intent?.active&&!intent.hidden&&!intent.seated&&!intent.sprinting&&intent.action!=='lowered'&&intent.action!=='unequip'&&(cachedState?.weight??0)>=.001&&(diagnostics.status==='unreachable'||diagnostics.status==='clearance-failed'||diagnostics.penetrationM>0)){const firstCost=diagnostics.cpuMs,firstIterations=diagnostics.iterations;solveFrame(true);diagnostics.cpuMs+=firstCost;diagnostics.iterations+=firstIterations;if(diagnostics.status==='solved')diagnostics.status='fallback';}});
 return {get isBound(){return !!binding && !disposed;},diagnostics,setAimSpace(value:AuthoredAimSpace){aimSpace=value;},bind(next:PoseEquipmentBinding|undefined){restore();binding?.release();binding=next;state.reset();previousBends.clear();bodyFrame.rotation.copyFrom(originalBodyRotation);diagnostics.muzzle=undefined;diagnostics.status='inactive';},update(next:PoseIntent,dt:number){intent=next;delta=dt;},setArmorBulk(meters:number){bulk=clamp(meters,0,.08);},dispose(){if(disposed)return;restore();binding?.release();binding=undefined;bodyFrame.rotation.copyFrom(originalBodyRotation);scene.onBeforeAnimationsObservable.remove(before);scene.onAfterAnimationsObservable.remove(after);disposed=true;diagnostics.muzzle=undefined;diagnostics.status='disposed';}};
}
