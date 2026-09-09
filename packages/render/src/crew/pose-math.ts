import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const angle=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
export const approach=(a:number,b:number,rate:number,dt:number)=>a+clamp(angle(b-a),-rate*dt,rate*dt);
export const exponential=(a:number,b:number,seconds:number,dt:number)=>b+(a-b)*Math.exp(-dt/Math.max(.001,seconds));
/** Analytical two-bone IK; no scale/stretch, including zero target and collinear poles. */
export function twoBone(origin:Vector3,target:Vector3,pole:Vector3,a:number,b:number,previousBend?:Vector3,minBend=.08,maxBend=2.85){
 if(![...origin.asArray(),...target.asArray(),...pole.asArray(),a,b].every(Number.isFinite)||a<=0||b<=0)throw new Error('Invalid IK input');
 let direction=target.subtract(origin);const requested=direction.length();
 direction=requested>1e-8?direction.scale(1/requested):new Vector3(0,-1,0);
 const distance=clamp(requested,Math.max(Math.abs(a-b)+1e-5,Math.sqrt(a*a+b*b+2*a*b*Math.cos(maxBend))),Math.min(a+b-1e-5,Math.sqrt(a*a+b*b+2*a*b*Math.cos(minBend))));
 let bend=pole.subtract(origin);bend.subtractInPlace(direction.scale(Vector3.Dot(bend,direction)));
 if(bend.lengthSquared()<1e-8){bend=previousBend?.clone()??(Math.abs(direction.y)<.9?Vector3.Down():Vector3.Right());bend.subtractInPlace(direction.scale(Vector3.Dot(bend,direction)));}
 if(bend.lengthSquared()<1e-8)bend=Vector3.Cross(direction,Vector3.Forward());
 bend.normalize();
 if(previousBend&&Vector3.Dot(bend,previousBend)<0)bend.negateInPlace();
 const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 return {elbow:origin.add(direction.scale(along)).add(bend.scale(height)),end:origin.add(direction.scale(distance)),bend,error:Math.abs(requested-distance)};
}
export function aimRotation(yaw:number,pitch:number){return Quaternion.RotationYawPitchRoll(-yaw,pitch,0);}
export interface OrientedBox {name:string;center:Vector3;half:Vector3;axes:readonly Vector3[]}
export function transformedBox(name:string,center:Vector3,half:Vector3,m:Matrix):OrientedBox{
 const axes=[Vector3.Right(),Vector3.Up(),Vector3.Forward()].map(v=>Vector3.TransformNormal(v,m));
 return {name,center:Vector3.TransformCoordinates(center,m),half:new Vector3(half.x*axes[0].length(),half.y*axes[1].length(),half.z*axes[2].length()),axes:axes.map(a=>a.normalize())};
}
/** 15-axis separating-axis test; positive return is overlap depth, zero means clear. */
export function boxPenetration(a:OrientedBox,b:OrientedBox,margin=0):number{
 const delta=b.center.subtract(a.center);let depth=Infinity;
 const test=(axis:Vector3)=>{const length=axis.length();if(length<1e-7)return true;const n=axis.scale(1/length);
 const radius=(box:OrientedBox)=>box.axes.reduce((s,v,i)=>s+Math.abs(Vector3.Dot(n,v))*box.half.asArray()[i],0);
 const overlap=radius(a)+radius(b)+margin-Math.abs(Vector3.Dot(delta,n));depth=Math.min(depth,overlap);return overlap>0;};
 for(const axis of [...a.axes,...b.axes])if(!test(axis))return 0;
 for(const x of a.axes)for(const y of b.axes)if(!test(Vector3.Cross(x,y)))return 0;
 return depth;
}
export function rayBoxDistance(origin:Vector3,direction:Vector3,box:OrientedBox,maxDistance:number):number|undefined{
 const delta=origin.subtract(box.center);let near=0,far=maxDistance;
 for(let i=0;i<3;i++){const o=Vector3.Dot(delta,box.axes[i]),d=Vector3.Dot(direction,box.axes[i]),h=box.half.asArray()[i];
 if(Math.abs(d)<1e-8){if(Math.abs(o)>h)return;continue;}
 const x=(-h-o)/d,y=(h-o)/d;near=Math.max(near,Math.min(x,y));far=Math.min(far,Math.max(x,y));if(near>far)return;}
 return near;
}
