export type VolcanicVector=[number,number,number];
const unit=(v:VolcanicVector):VolcanicVector=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length) as VolcanicVector;};
export function nativeVolcanicBasins(seed:number):VolcanicVector[]{
 const angle=(seed-89)*.173;
 return [[-.25,.50,.83],[.82,-.25,-.45],[-.65,-.60,.45]].map(([x,y,z])=>unit([x*Math.cos(angle)+z*Math.sin(angle),y,z*Math.cos(angle)-x*Math.sin(angle)]));
}
/** Shared seeded fracture field for authored placement, molten texture and local spill. */
export function createVolcanicField(seed:number){
 const phase=(seed%997)*.037,basins=nativeVolcanicBasins(seed),ventDirection=basins[0];
 function signed(n:VolcanicVector){
  const [x,y,z]=n;
  const values=[x+.24*Math.sin(y*4+z*3+phase),z+.18*Math.sin(x*5-y*2+phase*.7),y-.17+.20*Math.sin(x*4+z*2-phase*.4),x-.48+.18*Math.sin(y*5-z*4+phase),z-.42+.19*Math.sin(x*4+y*5-phase*.6),y+.40+.15*Math.sin(x*9+z*5+phase),x*.7+z*.6-.25+.10*Math.sin(y*11-phase),z*.8-y*.5+.2+.10*Math.sin(x*12+phase),x*.8+y*.7-.6+.10*Math.sin(z*14-phase)];
  return values.reduce((a,b)=>Math.abs(a)<Math.abs(b)?a:b);
 }
 const distance=(n:VolcanicVector)=>Math.abs(signed(n));
 const moltenHeight=(n:VolcanicVector)=>{const alignment=Math.max(...basins.map(center=>n.reduce((v,x,i)=>v+x*center[i],0))),depression=Math.max(0,Math.min(1,(alignment-.986)/.007));return .951+.012*Math.sin(n[0]*4+n[2]*3+phase)-depression*.13;};
 const height=(n:VolcanicVector)=>Math.max(...basins.map(center=>n.reduce((v,x,i)=>v+x*center[i],0)))>.991?.956:distance(n)<.085?moltenHeight(n):.97+Math.round((.030*Math.sin(n[0]*5+n[1]*3+phase)+.018*Math.cos(n[2]*7-n[1]*4))/.035)*.035;
 function source(n:VolcanicVector){
  const step=.003,g=[0,1,2].map(i=>{const plus=[...n] as VolcanicVector,minus=[...n] as VolcanicVector;plus[i]+=step;minus[i]-=step;return (signed(unit(plus))-signed(unit(minus)))/(2*step);}) as VolcanicVector;
  const magnitude=g.reduce((a,b)=>a+b*b,0),amount=signed(n)/Math.max(.01,magnitude);
  return unit(n.map((v,i)=>v-g[i]*amount) as VolcanicVector);
 }
 const vent=ventDirection.map(v=>v*.960) as VolcanicVector;
 return {signed,distance,height,moltenHeight,source,vent,vents:basins.map(n=>n.map(v=>v*.960) as VolcanicVector)};
}
/** Finite-distance, face-facing and short-ray visibility approximation; not full GI. */
export function nativeLavaRadiance(position:VolcanicVector,normal:VolcanicVector,field:ReturnType<typeof createVolcanicField>,emission:number):VolcanicVector{
 const radius=Math.hypot(...position),n=unit(position);if(emission<=0)return [0,0,0];
 const nearestVent=field.vents.reduce((a,b)=>Math.hypot(...a.map((v,i)=>v-position[i]))<Math.hypot(...b.map((v,i)=>v-position[i]))?a:b);
 const ventDistance=Math.hypot(...nearestVent.map((v,i)=>v-position[i]));
 if(field.distance(n)>.18&&ventDistance>.25)return [0,0,0];
 const sourceDirection=field.source(n),channelSource=sourceDirection.map(v=>v*field.moltenHeight(sourceDirection)) as VolcanicVector,source=ventDistance<Math.hypot(...channelSource.map((v,i)=>v-position[i]))?nearestVent:channelSource,ray=source.map((v,i)=>v-position[i]) as VolcanicVector,distance=Math.hypot(...ray),toward=unit(ray);
 const facing=Math.max(0,normal.reduce((a,v,i)=>a+v*toward[i],0));if(facing<.025)return [0,0,0];
 let visibility=1;
 for(const t of [.35,.65]){
  const point=source.map((v,i)=>v+(position[i]-v)*t) as VolcanicVector,direction=unit(point);
  if(field.distance(direction)>.09&&Math.hypot(...point)<field.height(direction)-.04)visibility=.1;
 }
 const strength=Math.min(1.5,Math.max(0,Math.min(4,emission))*1.4*facing*visibility/(1+(distance/.065)**2));
 return [strength,strength*.23,strength*.065];
}
