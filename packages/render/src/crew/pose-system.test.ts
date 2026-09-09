import {describe,it,expect} from 'vitest';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
import {twoBone,transformedBox,boxPenetration,rayBoxDistance} from './pose-math';
import {createPoseState} from './pose-state';
import {EQUIPMENT_POSE_ITEMS,EQUIPMENT_POSE_PROFILES,validatePoseItem} from '../../../content/src/equipment-poses';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {bindPoseEquipment} from '../equipment/pose-anchors';
const base={yaw:0,pitch:0,facing:0,active:true,profile:'RIFLE' as const,itemId:'a',shotSequence:5n};
describe('Equipment pose math and contracts',()=>{
 it('validates every supplied item and refuses missing shoulder/pistol support',()=>{
  for(const item of Object.values(EQUIPMENT_POSE_ITEMS))validatePoseItem(item);
  expect(()=>validatePoseItem({...EQUIPMENT_POSE_ITEMS.carbine,sockets:{'Grip.Primary':[0,0,0],'Aim.Muzzle':[0,0,-1]}})).toThrow('Contact.Shoulder');
  const item=EQUIPMENT_POSE_ITEMS['heavy-handgun'];expect(()=>validatePoseItem({...item,sockets:{'Grip.Primary':[0,0,0],'Aim.Muzzle':[0,0,-1]}})).toThrow('SupportHandContact');
  expect(Object.keys(EQUIPMENT_POSE_PROFILES)).toHaveLength(7);
 });
 it('never stretches or flips at singular poles, zero targets and opposite aim changes',()=>{
  let bend:Vector3|undefined;for(const target of [Vector3.Zero(),new Vector3(0,0,-5),new Vector3(0,0,5),new Vector3(.2,.3,-.1)]){
   const solve=twoBone(Vector3.Zero(),target,target,.24,.21,bend);bend=solve.bend;
   expect(solve.elbow.length()).toBeCloseTo(.24,6);expect(Vector3.Distance(solve.elbow,solve.end)).toBeCloseTo(.21,6);
   expect(solve.end.asArray().every(Number.isFinite)).toBe(true);
  }
  expect(()=>twoBone(Vector3.Zero(),Vector3.Zero(),Vector3.Zero(),0,.2)).toThrow();
 });
 it('rejects rotated receiver intersection even when centres lie outside each other',()=>{
  const chest=transformedBox('chest',Vector3.Zero(),new Vector3(.25,.3,.16),Matrix.Identity());
  const weapon=transformedBox('receiver',Vector3.Zero(),new Vector3(.08,.06,.4),Matrix.Compose(Vector3.One(),Quaternion.RotationYawPitchRoll(Math.PI/3,0,0),new Vector3(.3,0,0)));
  expect(boxPenetration(chest,weapon)).toBeGreaterThan(0);
  const clear=transformedBox('outside',new Vector3(1,0,0),new Vector3(.1,.1,.1),Matrix.Identity());expect(boxPenetration(chest,clear)).toBe(0);
  expect(rayBoxDistance(new Vector3(0,0,-2),new Vector3(0,0,1),chest,5)).toBeCloseTo(1.84);
 });
 it('smoothly catches up, bounds yaw and preserves paused state',()=>{
  const state=createPoseState();state.step(base,0);const first=state.step({...base,yaw:Math.PI*.75},1/60);expect(first.heading).toBeGreaterThan(0);expect(first.heading).toBeLessThan(.05);
  let last=first;for(let i=0;i<180;i++)last=state.step({...base,yaw:Math.PI*.75},1/60);expect(Math.abs(last.turn)).toBeLessThan(.8);
  for(let i=0;i<20;i++)expect(state.step({...base,yaw:Math.PI*.75},0)).toEqual(last);
 });
 it('has frame-rate independent acquisition and seeds shot history for each item UUID',()=>{
  const a=createPoseState(),b=createPoseState();let x,y;for(let i=0;i<60;i++)x=a.step(base,1/60);for(let i=0;i<30;i++)y=b.step(base,1/30);expect(x!.weight).toBeCloseTo(y!.weight,10);
  expect(x!.recoil).toBe(0);expect(a.step({...base,shotSequence:6n},0).recoil).toBe(1);
  expect(a.step({...base,itemId:'b',shotSequence:200n},0).recoil).toBe(0);
  expect(a.step({...base,itemId:'a',shotSequence:6n},0).recoil).toBe(0);
  expect(a.step({...base,hidden:true,shotSequence:7n},.1).skipped).toBe(true);
  expect(a.step({...base,shotSequence:7n},0).recoil).toBe(0);
 });
 it('keeps bounded aim catch-up while strafing and follows travel after lowering',()=>{
  const state=createPoseState();state.step(base,0);
  let pose=state.step({...base,moving:true,yaw:Math.PI*.75,movementHeading:-Math.PI/2},1/60);
  expect(pose.heading).toBeGreaterThan(0);expect(pose.heading).toBeLessThan(.05);
  for(let i=0;i<180;i++)pose=state.step({...base,moving:true,yaw:Math.PI*.75,movementHeading:-Math.PI/2},1/60);
  expect(Math.abs(pose.turn)).toBeLessThan(.8);
  for(let i=0;i<180;i++)pose=state.step({...base,moving:true,active:false,facing:-Math.PI/2},1/60);
  expect(Math.cos(pose.heading+Math.PI/2)).toBeCloseTo(1,5);
  for(let i=0;i<180;i++)pose=state.step({...base,moving:true,sprinting:true,yaw:Math.PI,facing:0},1/60);
  expect(Math.cos(pose.heading)).toBeCloseTo(1,5);
  expect(pose.weight).toBeLessThan(.001);
 });
 for(const reflected of [false,true])it(`maps actual physical sockets under rotated/reflected parents (${reflected})`,()=>{
  const e=new NullEngine(),s=new Scene(e),parent=new TransformNode('parent',s);parent.rotation.y=.83;parent.scaling.x=reflected?-1:1;
  const hand=new TransformNode('hand',s),placement=new TransformNode('placement',s),imported=new TransformNode('gltf',s);placement.parent=hand;imported.parent=placement;imported.scaling.z=-1;
  const binding=bindPoseEquipment(placement,imported,EQUIPMENT_POSE_ITEMS.carbine,parent);
  const desired=Matrix.Compose(Vector3.One(),Quaternion.RotationYawPitchRoll(.6,.3,0),new Vector3(2,1,3));binding.setMatrix(desired);
  const socket=binding.socket('Aim.Muzzle')!,expected=Vector3.TransformCoordinates(Vector3.FromArray(EQUIPMENT_POSE_ITEMS.carbine.sockets['Aim.Muzzle']!),desired);
  expect(Vector3.Distance(socket.position,expected)).toBeLessThan(1e-5);expect(Vector3.Dot(socket.direction,Vector3.TransformNormal(new Vector3(0,0,-1),desired))).toBeGreaterThan(.99999);
  binding.release();expect(placement.parent).toBe(hand);binding.release();s.dispose();e.dispose();
 });
});
