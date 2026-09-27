import type{Vec}from'./native_reference_assembly';
type Batch={positions:ArrayLike<number>;indices:ArrayLike<number>};
/** Read-only ray index over native triangles. No geometry generation. */
export function nativeRadialSurface(batches:readonly Batch[],roles:readonly number[]){
 const triangles:{a:Vec;u:Vec;v:Vec;normal:Vec;plane:number;uu:number;uv:number;vv:number;inverse:number;center:Vec;cone:number}[]=[];
 const dot=(a:Vec,b:Vec)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],unit=(p:Vec):Vec=>{const r=Math.hypot(...p);return p.map(v=>v/r)as Vec;};
 for(const role of roles){const batch=batches[role];if(!batch)throw new Error('Missing native terrain material role');for(let i=0;i<batch.indices.length;i+=3){
  const [a,b,c]=[0,1,2].map(k=>{const j=batch.indices[i+k]*3;return[batch.positions[j],batch.positions[j+1],batch.positions[j+2]]as Vec;}),u=b.map((v,k)=>v-a[k])as Vec,v=c.map((v,k)=>v-a[k])as Vec,normal:Vec=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),den=uu*vv-uv*uv;if(den<1e-20)continue;
  const directions=[a,b,c].map(unit),center=unit(directions.reduce((s,p)=>s.map((v,k)=>v+p[k])as Vec,[0,0,0]as Vec)),cone=Math.min(...directions.map(p=>dot(p,center)))-1e-7;
  triangles.push({a,u,v,normal,plane:dot(normal,a),uu,uv,vv,inverse:1/den,center,cone});
 }}
 return(n:Vec)=>{let highest=-Infinity;for(const t of triangles){if(dot(n,t.center)<t.cone)continue;const denominator=dot(n,t.normal);if(Math.abs(denominator)<1e-14)continue;const radius=t.plane/denominator;if(radius<=0||radius<=highest)continue;const p=n.map((v,k)=>v*radius-t.a[k])as Vec,pu=dot(p,t.u),pv=dot(p,t.v),u=(pu*t.vv-pv*t.uv)*t.inverse,v=(pv*t.uu-pu*t.uv)*t.inverse;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)highest=radius;}return highest;};
}
