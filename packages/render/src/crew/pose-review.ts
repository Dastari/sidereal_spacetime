/** Standalone real-asset review. Run from the managed client origin; no app/router import. */
import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import {CreateGround} from '@babylonjs/core/Meshes/Builders/groundBuilder';
import {CreateLineSystem} from '@babylonjs/core/Meshes/Builders/linesBuilder';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color';
import {SceneInstrumentation} from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import {Ray} from '@babylonjs/core/Culling/ray';
import {createCrewVisual,type CrewAppearance} from './index';
import {bindPoseEquipment} from '../equipment/pose-anchors';
import {equipmentAimSource} from '../equipment/anchors';
import {EQUIPMENT_POSE_ITEMS,type EquipmentPoseItem,type EquipmentPoseType} from '../../../content/src/equipment-poses';
import {POSE_REVIEW_ITEMS} from './pose-review-items';
import type {PoseIntent} from './pose-state';
export const POSE_REVIEW_YAWS=[0,-20,20,-45,45,-70,70,-90,90,-135,135];
export const POSE_REVIEW_PITCHES=[0,-20,20,-40,40,-60,60];
export async function startPoseReview(canvas:HTMLCanvasElement,options:{crewUrl?:string;equipmentUrl?:string;baseline?:boolean;staged?:boolean}={}){
 const engine=new Engine(canvas,true,{preserveDrawingBuffer:true}),scene=new Scene(engine),instrumentation=new SceneInstrumentation(scene);scene.clearColor=new Color4(.025,.035,.05,1);
 const camera=new ArcRotateCamera('pose-review-camera',-Math.PI*.7,1.28,3.6,new Vector3(0,1.05,0),scene);camera.attachControl(canvas,true);camera.minZ=.01;
 const ambient=new HemisphericLight('pose-review-fill',Vector3.Up(),scene);ambient.intensity=.75;
 const key=new DirectionalLight('pose-review-key',new Vector3(.4,-1,.5),scene);key.intensity=2;
 const ground=CreateGround('pose-review-ground',{width:8,height:8},scene),mat=new StandardMaterial('pose-review-ground-material',scene);mat.diffuseColor=new Color3(.13,.16,.19);ground.material=mat;
 const ship=new TransformNode('pose-review-ship',scene),crew=await createCrewVisual(scene,ship,options.crewUrl);
 crew.customize({outfit:'marine',weapon:'rifle',weaponFixture:false,backpack:false});
 const solver=options.baseline?undefined:crew.createPoseController();
 if(options.staged)solver?.setAimSpace(await fetch('/@fs/root/sidereal_spacetime/assets/art-library/designs/crew.animation.aim/revisions/r002/runtime-aim-space.json').then(r=>r.json()));
 let gear:Awaited<ReturnType<typeof SceneLoader.LoadAssetContainerAsync>>|undefined,placement:TransformNode|undefined,legacy:ReturnType<typeof equipmentAimSource>|undefined,revision=0,disposed=false;
 let intent:PoseIntent={yaw:0,pitch:0,facing:0,active:true,reducedMotion:true,profile:'RIFLE',itemId:'review-carbine',shotSequence:0n},debug=false,paused=false;
 let item:EQUIPMENT_ITEM=EQUIPMENT_POSE_ITEMS.carbine;
 type EQUIPMENT_ITEM=EquipmentPoseItem;
 let lines=CreateLineSystem('pose-review-debug',{lines:Array.from({length:256},()=>[Vector3.Zero(),Vector3.Zero()]),updatable:true},scene);lines.color=new Color3(.2,.9,.7);lines.isPickable=false;
 const beam=CreateLineSystem('physical-device-ray',{lines:[[Vector3.Zero(),Vector3.Zero()]],updatable:true},scene);beam.color=new Color3(.25,1,.3);beam.isPickable=false;
 async function equip(assetId:string,profile?:EquipmentPoseType,override?:EquipmentPoseItem){
  const ticket=++revision;solver?.bind(undefined);crew.bindHeldEquipment(undefined);gear?.dispose();placement?.dispose();legacy=undefined;
  item=override??(options.staged?POSE_REVIEW_ITEMS:EQUIPMENT_POSE_ITEMS)[assetId];if(!item)throw new Error(`Missing pose metadata: ${assetId}`);
  const loaded=await SceneLoader.LoadAssetContainerAsync(options.equipmentUrl??'/assets/equipment/',`${assetId}.glb`,scene,undefined,'.glb');if(disposed||ticket!==revision){loaded.dispose();return;}gear=loaded;gear.addAllToScene();placement=new TransformNode('pose-review-held',scene);placement.parent=crew.sockets.handR;for(const root of gear.rootNodes)root.parent=placement;
  intent={...intent,profile:profile??item.profile,itemId:`review-${assetId}`};
  if(options.baseline){const manifest=await fetch('/assets/equipment/manifest.json').then(r=>r.json());legacy=equipmentAimSource(gear.rootNodes[0] as TransformNode,crew.sockets.handR.parent as TransformNode,manifest.entries.find((e:{file:string})=>e.file===`${assetId}.glb`));crew.bindHeldEquipment(legacy);}
  else solver!.bind(bindPoseEquipment(placement,gear.rootNodes[0] as TransformNode,{...item,profile:intent.profile},crew.root));
 }
 await equip('carbine');
 const samples:number[]=[];
 function draw(){
  const d=solver?.diagnostics,muzzle=d?.muzzle??legacy?.getMuzzleWorld();
  beam.setEnabled(!!muzzle&&!intent.hidden&&!intent.seated);
  if(muzzle){const hit=scene.pickWithRay(new Ray(muzzle.position,muzzle.direction,6),m=>m===ground);const end=hit?.pickedPoint??muzzle.position.add(muzzle.direction.scale(6));CreateLineSystem('',{lines:[[muzzle.position,end]],instance:beam});}
  lines.setEnabled(debug);
  if(debug&&d){const segments:Vector3[][]=[];const cross=(v:Vector3)=>{for(const axis of [Vector3.Right(),Vector3.Up(),Vector3.Forward()])segments.push([v.subtract(axis.scale(.04)),v.add(axis.scale(.04))]);};
   for(const v of [d.primary,d.support,d.pivot,d.shoulder,d.sight,d.eye,d.eyeReference,d.muzzle?.position,...d.targets,...d.poles])if(v)cross(v);
   if(d.desired&&d.pivot)segments.push([d.pivot,d.pivot.add(d.desired.scale(2))]);
   for(const box of [...d.body,...d.weapon]){
    const corners=Array.from({length:8},(_,i)=>box.center.add(box.axes[0].scale((i&1?1:-1)*box.half.x)).add(box.axes[1].scale((i&2?1:-1)*box.half.y)).add(box.axes[2].scale((i&4?1:-1)*box.half.z)));
    for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))segments.push([corners[i],corners[i|bit]]);
   }
   while(segments.length<256)segments.push([Vector3.Zero(),Vector3.Zero()]);CreateLineSystem('',{lines:segments.slice(0,256),instance:lines});
  }
 }
 engine.runRenderLoop(()=>{if(disposed)return;const dt=paused?0:Math.min(engine.getDeltaTime()/1000,.1);crew.root.setEnabled(!intent.hidden);crew.update({moving:!!intent.moving,seated:!!intent.seated,sprinting:intent.sprinting,weaponPose:intent.profile.includes('RIFLE')?'rifle':'one-handed',combat:!!options.baseline,reducedMotion:!!intent.reducedMotion||paused});solver?.update(intent,dt);scene.render();draw();if(solver&&samples.length<600)samples.push(solver.diagnostics.cpuMs);});
 return {scene,crew,solver,camera,equip,set(next:Partial<PoseIntent>){intent={...intent,...next};},target(yawDegrees:number,pitchDegrees:number){intent={...intent,yaw:yawDegrees*Math.PI/180,pitch:pitchDegrees*Math.PI/180};},look(outfit:CrewAppearance['outfit']){crew.customize({outfit,weaponFixture:false,backpack:false});},debug(value:boolean){debug=value;},pause(value:boolean){paused=value;},shot(){intent={...intent,shotSequence:(intent.shotSequence??0n)+1n};},metrics(){return {diagnostics:solver?.diagnostics,meshes:scene.meshes.length,activeMeshes:scene.getActiveMeshes().length,materials:scene.materials.length,textures:scene.textures.length,drawCalls:instrumentation.drawCallsCounter.current,solverSamplesMs:samples.slice()};},dispose(){disposed=true;revision++;engine.stopRenderLoop();solver?.dispose();gear?.dispose();crew.dispose();instrumentation.dispose();scene.dispose();engine.dispose();}};
}

/** Optional native review controls; isolated from both application entrypoints. */
export function mountPoseReviewControls(review:Awaited<ReturnType<typeof startPoseReview>>,container=document.body){
 const panel=document.createElement('form');panel.setAttribute('aria-label','Equipment pose review');panel.style.cssText='position:fixed;right:8px;top:8px;width:180px;padding:12px;background:#17212dee;color:#e9edf2;font:12px system-ui;display:grid;gap:7px;border:1px solid #506073';
 const label=(text:string,input:HTMLElement)=>{const row=document.createElement('label');row.textContent=text+' ';row.append(input);panel.append(row);};
 const slider=(name:string,min:number,max:number,onInput:(n:number)=>void)=>{const input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.value='0';input.setAttribute('aria-label',name);input.style.width='100%';input.oninput=()=>onInput(Number(input.value));label(name,input);};
 slider('Desired yaw',-180,180,yaw=>review.set({yaw:yaw*Math.PI/180}));slider('Desired pitch',-80,80,pitch=>review.set({pitch:pitch*Math.PI/180}));
 const select=(name:string,values:string[],change:(value:string)=>void)=>{const input=document.createElement('select');for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}input.style.maxWidth='100%';input.onchange=()=>change(input.value);label(name,input);};
 select('Item',['carbine','long-rifle','heavy-handgun','compact-pistol','flashlight','sample-scanner','plasma-cutter'],value=>{void review.equip(value);});
 select('Look',['marine','captain','engineer','medic','pilot','security','salvage','recon','scientist','mechanic'],value=>review.look(value as CrewAppearance['outfit']));
 select('Action',['raised','ready','lowered','equip','unequip','use','reload-preview'],value=>review.set({action:value as PoseIntent['action']}));
 select('Movement',['idle','forward','backward','strafe left','strafe right'],value=>review.set({moving:value!=='idle',movementYaw:({'forward':0,'backward':Math.PI,'strafe left':-Math.PI/2,'strafe right':Math.PI/2} as Record<string,number>)[value]??0}));
 for(const [name,change] of [['Debug',(v:boolean)=>review.debug(v)],['Pause',(v:boolean)=>review.pause(v)],['Seated',(v:boolean)=>review.set({seated:v})],['Sprint',(v:boolean)=>review.set({sprinting:v})],['Hidden',(v:boolean)=>review.set({hidden:v})],['Reduced motion',(v:boolean)=>review.set({reducedMotion:v})]] as const){const input=document.createElement('input');input.type='checkbox';input.checked=name==='Reduced motion';input.onchange=()=>change(input.checked);label(name,input);}
 const output=document.createElement('output');panel.append(output);const timer=setInterval(()=>{const d=review.solver?.diagnostics;if(d)output.textContent=`${d.status} · aim error ${d.aimErrorDegrees.toFixed(1)}° · grip ${(d.primaryErrorM*100).toFixed(1)} cm · support ${(d.supportErrorM*100).toFixed(1)} cm · body ${(d.heading*180/Math.PI).toFixed(0)}° · torso ${(d.torsoYaw*180/Math.PI).toFixed(0)}° · turn 35–65° · ${d.cpuMs.toFixed(2)} ms`;},250);
 panel.onsubmit=e=>e.preventDefault();container.append(panel);return ()=>{clearInterval(timer);panel.remove();};
}
