import {Quaternion} from '@babylonjs/core/Maths/math.vector';
import type {EquipmentPoseType} from '../../../content/src/equipment-poses';
export interface AuthoredAimSpace {version:1;space:string;profiles:Record<string,Array<{yaw:number;pitch:number;bones:Record<string,number[]>}>>}
/** Bilinear 3x3 authored local-rotation samples. Exact exported glTF XYZW data. */
export function sampleAimSpace(space:AuthoredAimSpace,profile:EquipmentPoseType,yaw:number,pitch:number):Map<string,Quaternion>{
 if(space.version!==1)throw new Error('Unsupported aim-space version');
 const samples=space.profiles[profile];if(!samples||samples.length!==9)throw new Error(`Missing authored aim space: ${profile}`);
 const y=Math.max(-45,Math.min(45,yaw)),p=Math.max(-60,Math.min(60,pitch));
 const y0=y<0?-45:0,y1=y<0?0:45,p0=p<0?-60:0,p1=p<0?0:60;
 const get=(a:number,b:number)=>{const sample=samples.find(s=>s.yaw===a&&s.pitch===b);if(!sample)throw new Error('Incomplete authored aim-space grid');return sample.bones;};
 const corners=[get(y0,p0),get(y1,p0),get(y0,p1),get(y1,p1)],result=new Map<string,Quaternion>();
 for(const name of Object.keys(corners[0])){
  const q=corners.map(c=>{const value=c[name];if(!value||value.length!==4||!value.every(Number.isFinite))throw new Error('Invalid authored aim quaternion');return Quaternion.FromArray(value).normalize();});
  result.set(name,Quaternion.Slerp(Quaternion.Slerp(q[0],q[1],(y-y0)/45),Quaternion.Slerp(q[2],q[3],(y-y0)/45),(p-p0)/60));
 }
 return result;
}
