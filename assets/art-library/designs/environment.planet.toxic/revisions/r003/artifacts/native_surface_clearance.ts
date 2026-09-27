import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
type Vec=[number,number,number];
/** Read-only spatial index of native upward faces. It supplies a conservative
 * lower supporting surface beneath authored cavities without new visual solids. */
export function nativeSurfaceFloor(mesh:NativePlanetKit['variants'][number]){
 const cells=new Map<string,{a:Vec;b:Vec;c:Vec;den:number}[]>(),size=.15;
 for(let i=0;i<mesh.indices.length;i+=3){
  const [a,b,c]=[0,1,2].map(k=>mesh.positions.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec);
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(den<=1e-9)continue;
  for(let x=Math.floor(Math.min(a[0],b[0],c[0])/size);x<=Math.floor(Math.max(a[0],b[0],c[0])/size);x++)for(let y=Math.floor(Math.min(a[1],b[1],c[1])/size);y<=Math.floor(Math.max(a[1],b[1],c[1])/size);y++){
   const key=`${x},${y}`,list=cells.get(key)||[];list.push({a,b,c,den});cells.set(key,list);
  }
 }
 return(x:number,y:number)=>{
  let floor=Infinity;
  for(const {a,b,c,den}of cells.get(`${Math.floor(x/size)},${Math.floor(y/size)}`)||[]){
   const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;
   if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8)floor=Math.min(floor,a[2]*u+b[2]*v+c[2]*w);
  }
  return floor;
 };
}
