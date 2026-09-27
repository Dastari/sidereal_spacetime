// Keep world and view/projection uploads separate: Babylon camera-relative binding
// can rebase these directly without inverting a combined astronomical WVP matrix.
export const surfaceVertex = /* glsl */ `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
uniform mat4 viewProjection; uniform mat4 world;
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUV;
void main(){vLocal=position;vWorld=(world*vec4(position,1.)).xyz;vNormal=normalize(mat3(world)*normal);vUV=uv;gl_Position=viewProjection*vec4(vWorld,1.);}
`;
const noise = /* glsl */ `
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*noise3(p);p=p*2.03+vec3(7.2,3.7,1.4);a*=.5;}return f;}
`;
export const skyFragment = /* glsl */ `
precision highp float;varying vec3 vLocal;
uniform sampler2D nebula;uniform sampler2D nebula2;uniform vec3 tint2;uniform float gasStrength;uniform float time;uniform vec3 tint;uniform float strength;uniform float seed;uniform float viewportHeight;
${noise}
vec4 skyPlate(vec3 p,vec3 core,sampler2D plate){
 vec3 right=normalize(cross(core,vec3(0.,1.,0.)));vec3 up=cross(right,core);
 float forward=dot(p,core);
 vec2 uv=vec2(dot(p,right),dot(p,up))/max(.1,forward)*1.3+.5;
 uv=(floor(uv*vec2(1536.,1024.))+.5)/vec2(1536.,1024.);
 vec3 image=texture2D(plate,clamp(uv,vec2(.001),vec2(.999))).rgb;
 float seam=smoothstep(0.,.15,uv.x)*smoothstep(0.,.15,1.-uv.x)*smoothstep(.1,.5,forward);
 float poles=smoothstep(0.,.15,uv.y)*smoothstep(0.,.15,1.-uv.y);
 return vec4(image,seam*poles);
}
void main(){
 // Both art projections are fixed world directions, never camera-relative plates.
 vec3 direction=normalize(vLocal);
 float starGrid=clamp(viewportHeight*2.6,1024.,4096.);
 vec3 cell=floor(direction*starGrid);vec3 p=normalize((cell+.5)/starGrid);
 vec4 rpg=skyPlate(p,normalize(vec3(.74,-.58,.355)),nebula);
 vec4 downward=skyPlate(p,normalize(vec3(-.20,-.96,-.18)),nebula);
 vec3 image=mix(rpg.rgb*rpg.a,downward.rgb*downward.a,smoothstep(.78,.97,-p.y));
 vec4 rpg2=skyPlate(p,normalize(vec3(.74,-.58,.355)),nebula2);
 vec4 downward2=skyPlate(p,normalize(vec3(-.20,-.96,-.18)),nebula2);
 vec3 image2=mix(rpg2.rgb*rpg2.a,downward2.rgb*downward2.a,smoothstep(.78,.97,-p.y));
 float cloud=fbm(p*4.5+seed);
 float overhead=smoothstep(.25,.85,-p.y);
 float ribbon=max(exp(-pow((p.y+.15+p.x*.45)/.36,2.))*.38, exp(-pow((p.x*.55+p.z-.05)/.38,2.))*overhead);
 vec3 gas=mix(vec3(.03,.06,.18),vec3(.24,.035,.31),smoothstep(.35,.7,cloud));
 gas*=smoothstep(.2,.72,cloud)*(.4+.6*ribbon);
 vec3 color=vec3(.005,.008,.028)+gas*.55*gasStrength+(image*tint+image2*tint2)*.65;
 // Small, deliberate palette steps retain the voxel/pixel character.
 color=floor(color*192.+.5)/192.;
 float star=hash31(cell+seed);float large=hash31(floor(direction*190.)+seed+3.);
 color+=step(mix(.99945,.9991,overhead),star)*mix(vec3(.27,.45,.7),vec3(.8,.68,.91),star)*(.94+.06*sin(time*.5+star*400.));
 color+=step(.99995,large)*vec3(.65,.5,.72);
 gl_FragColor=vec4(color,1.);
}
`;
export const planetFragment = /* glsl */ `
precision highp float; varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;
uniform float time;uniform float seed;uniform float kind;uniform float sunIntensity;uniform vec3 primary;uniform vec3 secondary;uniform vec3 lightDirection;uniform vec3 cameraPosition;
${noise}
void main(){
 vec3 n=normalize(vNormal),p=normalize(floor(normalize(vLocal)*128.)+.5);float theta=time*.003;
 p=mat3(cos(theta),0.,sin(theta),0.,1.,0.,-sin(theta),0.,cos(theta))*p;
 vec3 q=p*3.2+seed;float terrain=fbm(q+fbm(q*1.3)*1.1);
 float fine=fbm(p*32.+seed*2.3);vec3 albedo;float rough=1.;
 if(kind<.5){
  float land=smoothstep(.48,.55,terrain);float coast=smoothstep(.465,.495,terrain);
  vec3 ocean=mix(primary*.55,primary*1.35,coast);vec3 earth=mix(secondary*.65,secondary*1.3,fine);
  albedo=mix(ocean,earth,land);rough=mix(.18,1.,land);
  float ice=smoothstep(.81,.96,abs(p.y)+terrain*.08);albedo=mix(albedo,vec3(.73,.82,.82),ice);
  float cloud=fbm(p*5.+vec3(time*.002,seed,0.));cloud=smoothstep(.57,.71,cloud)*.78;
  albedo=mix(albedo,vec3(.74,.8,.81),cloud);
 }else if(kind<1.5){
  float turbulence=fbm(vec3(p.x*7.,p.y*19.,p.z*7.)+seed);
  vec2 weather=vec2(atan(p.z,p.x),p.y);
  vec2 delta=weather-vec2(-1.55+sin(seed)*.25,-.22);
  float stormRadius=length(delta*vec2(.48,1.));
  float spiral=sin(atan(delta.y,delta.x*.48)*3.+stormRadius*70.-time*.016);
  float storm=1.-smoothstep(.08,.28,stormRadius);
  float bands=sin(p.y*54.+turbulence*8.+storm*spiral*2.);float narrow=sin(p.y*133.+turbulence*9.);
  albedo=mix(primary,secondary,smoothstep(-.55,.65,bands)*.66+max(narrow,0.)*.09);
  albedo=mix(albedo,mix(primary*1.4,vec3(.95,.28,.69),.5),smoothstep(.72,.94,sin(p.y*27.+turbulence*3.))*.7);
  albedo=mix(albedo,mix(secondary,vec3(.95,.54,.85),spiral*.5+.5),storm*.85);
  albedo*=.95+fine*.27;
 }else if(kind<2.5){
  float ridges=abs(fbm(p*10.+seed)-.48);albedo=mix(secondary,primary,smoothstep(.27,.7,terrain));
  albedo*=.72+fine*.46;albedo-=vec3(.1)*exp(-ridges*100.);
 }else{
  float plasma=noise3(p*5.5+vec3(time*.025,seed,time*.013)+noise3(p*3.+seed)*.45);
  float filament=smoothstep(.48,.58,plasma)+noise3(p*24.+seed)*.08;
  vec3 star=mix(secondary,primary,.42+plasma*.58);star*=.84+filament*.2;
  float limb=pow(max(dot(n,normalize(cameraPosition-vWorld)),0.),.24);
  gl_FragColor=vec4(star*(.7+.3*limb),1.);return;
 }
 float ndl=dot(n,normalize(lightDirection));float day=smoothstep(-.04,.48,ndl);
 albedo=floor(albedo*24.+.5)/24.;
 vec3 lit=albedo*(.09+floor(max(ndl,0.)*12.)/12.*max(0.,sunIntensity)*.68);
 vec3 viewDir=normalize(cameraPosition-vWorld);float shine=pow(max(dot(reflect(-normalize(lightDirection),n),viewDir),0.),44.);
 lit+=vec3(.48,.66,.7)*shine*(1.-rough)*day;
 gl_FragColor=vec4(lit,1.);
}
`;
export const atmosphereFragment = /* glsl */ `
precision highp float;varying vec3 vWorld;varying vec3 vNormal;
uniform vec3 cameraPosition;uniform vec3 lightDirection;uniform vec3 primary;uniform float strength;
void main(){vec3 n=normalize(vNormal);float facing=max(dot(n,normalize(cameraPosition-vWorld)),0.);float rim=pow(1.-facing,12.)*smoothstep(0.,.18,facing);float day=smoothstep(-.4,.6,dot(n,normalize(lightDirection)));gl_FragColor=vec4(primary*(.2+.8*day),rim*strength*2.0);}
`;
export const ringFragment = /* glsl */ `
precision highp float;varying vec2 vUV;uniform vec3 primary;uniform vec3 secondary;
void main(){vec2 p=(vUV-.5)*2.;float r=length(p);if(r<.62||r>1.)discard;
 float bands=.7+.18*sin(r*430.)+.09*sin(r*113.);float gap=1.-smoothstep(.015,.022,abs(r-.805));
 float alpha=smoothstep(.62,.65,r)*(1.-smoothstep(.97,1.,r))*(1.-gap*.8)*.66;
 gl_FragColor=vec4(mix(primary,secondary,.45)*bands,alpha);}
`;
export const coronaFragment = /* glsl */ `
precision highp float;varying vec2 vUV;uniform float time;uniform vec3 primary;
${noise}
void main(){vec2 p=(vUV-.5)*2.;float r=length(p);float a=atan(p.y,p.x);
 float ray=fbm(vec3(p*9.,time*.04));float angular=.7+.3*sin(a*17.+ray*4.);
 float halo=exp(-r*5.)*.28+exp(-pow((r-.45)*10.,2.))*.3;
 gl_FragColor=vec4(primary,halo*angular*(1.-smoothstep(.74,1.,r)));}
`;
export const dustFragment = /* glsl */ `
precision highp float;varying vec3 vLocal;uniform vec2 offset;uniform float density;
${noise}
void main(){vec2 p=vLocal.xz+offset;vec2 c=floor(p/2.);vec2 f=fract(p/2.);float h=hash31(vec3(c,11.));
 if(h>density*.19)discard;
 vec2 center=vec2(hash31(vec3(c,28.)),hash31(vec3(c,97.)))*.65+.175;
 float r=length((f-center)/vec2(.012,.024));float alpha=(1.-smoothstep(.2,1.,r))*.3;
 gl_FragColor=vec4(.67,.74,.72,alpha);}
`;

/** Depth-tested halo behind the solid globe, not a visible enclosing shell. */
export const planetHaloFragment = /* glsl */ `
precision highp float;varying vec2 vUV;uniform vec3 primary;uniform float strength;
void main(){float r=length((vUV-.5)*2.)*1.27;float falloff=exp(-pow(max(0.,r-.955)*8.,1.4));float edge=1.-smoothstep(1.08,1.27,r);gl_FragColor=vec4(mix(primary,vec3(.8,.94,1.),.2),falloff*edge*strength*1.6);}
`;
