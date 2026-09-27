import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
// Shared in the vertex and fragment stages: independently drifting complexes
// deform the relief and cool the same tiles. No texture uploads or CPU remeshing.
const evolvingSurface = `
float stellarSpots(vec3 p,float t) {
 float result=0.;
 for(int i=0;i<7;i++) {
  float f=float(i);
  float a=f*2.399963+.11*sin(t*.11+f*1.7);
  float z=-.72+1.44*(f+.5)/7.+.07*sin(t*.14+f*2.1);
  vec3 center=vec3(sqrt(1.-z*z)*cos(a),sqrt(1.-z*z)*sin(a),z);
  float radius=.14+.045*sin(t*.16+f*1.3);
  float edge=length(p-center)+.012*sin(p.x*63.+t*.5)*sin(p.z*51.-t*.4);
  result=max(result,1.-smoothstep(radius*.55,radius,edge));
 }
 return result;
}
vec3 stellarTile(vec2 coord) {
 float a=(coord.x-.5)*6.28318530718;
 float b=(1.-coord.y)*3.14159265359;
 return vec3(sin(b)*cos(a),sin(b)*sin(a),cos(b));
}
`;
/** Native PBR retains its authored materials. r011 also provides shared tile
 * directions for rigid relief motion and evolving cool regions. */
export class StellarConvection extends MaterialPluginBase {
  time = 0;
  constructor(material: PBRMaterial, readonly tiled = false) {
    super(material, "StellarConvection", 185, {}, true, true);
  }
  override getClassName() {
    return "StellarConvection";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "stellarTime", size: 1, type: "float" }],
      fragment: "uniform float stellarTime;",
      vertex: "uniform float stellarTime;",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat("stellarTime", this.time);
  }
  override getAttributes(attributes: string[]) {
    if (this.tiled && !attributes.includes("uv")) attributes.push("uv");
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS:
          `varying vec3 vStellarPosition; varying vec3 vStellarRadial;
          ${this.tiled ? "#ifndef UV1\nattribute vec2 uv;\n#endif\n" + evolvingSurface : ""}`,
        CUSTOM_VERTEX_UPDATE_POSITION: this.tiled ? `
          vec3 tile=stellarTile(uv);
          float wave=sin(tile.x*24.+stellarTime*.85)*sin(tile.y*21.-stellarTime*.72)*sin(tile.z*19.+stellarTime*.67);
          float lift=.022*wave-.025*stellarSpots(tile,stellarTime);
          // glTF maps Blender (x,y,z) to (x,z,-y). All vertices in the
          // authored closed prism translate together, preserving flat faces.
          positionUpdated+=vec3(tile.x,tile.z,-tile.y)*lift;
        ` : "",
        CUSTOM_VERTEX_MAIN_END: this.tiled
          ? "vStellarPosition=stellarTile(uv); vStellarRadial=mat3(world)*positionUpdated;"
          : "vStellarPosition=position; vStellarRadial=mat3(world)*position;",
      };
    if (type === "fragment")
      return {
        CUSTOM_FRAGMENT_DEFINITIONS:
          "varying vec3 vStellarPosition; varying vec3 vStellarRadial;" + (this.tiled ? evolvingSurface : ""),
        CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        vec3 sp=normalize(vStellarPosition);
        float st=stellarTime;
        vec3 drift=vec3(sin(sp.y*7.+st*.85),sin(sp.z*9.-st*.72),sin(sp.x*8.+st*.67));
        vec3 cell=sp*16.+drift*2.2;
        vec3 river=sp*8.+drift;
        float flow=sin(river.x+sin(river.z*.7)+st*.18)+sin(river.y+sin(river.x*.6)-st*.16)+.55*sin(river.z*1.3);
        float channel=1.-smoothstep(.12,.5,abs(flow));
        float granule=sin(sp.x*63.+st*.8)*sin(sp.y*59.-st*.67)*sin(sp.z*61.+st*.53);
        float thermal=sin(cell.x+sin(cell.y*1.7-st*.8))
          *sin(cell.y+sin(cell.z*1.9+st*.7))
          *sin(cell.z+sin(cell.x*1.3-st*.6));
        float boil=smoothstep(.25,.72,thermal);
        finalEmissive*=vec3(1.,.62,.22)*(.50+.12*granule+boil*.85);
        finalEmissive+=vec3(1.,.28,.006)*pow(boil,3.)*.30;
        ${this.tiled ? `finalEmissive*=.5+.5*channel;
        finalEmissive+=vec3(7.,2.4,.10)*channel*channel*smoothstep(-.35,.5,sin(sp.z*7.+st*.3)+thermal*.4);
        float cool=stellarSpots(sp,st);
        finalEmissive=mix(finalEmissive,vec3(.035,.004,.0002),cool);
        finalDiffuse*=1.-.98*cool;` : ""}
        // Moving convection modulates authored hot paths; it does not paint
        // a second smooth network over the native stepped material seams.
        // Analytic radial normal keeps the glowing limb continuous across
        // native stepped facets. The authored PBR normal still shades relief.
        float limb=pow(1.-abs(dot(normalize(vStellarRadial),viewDirectionW)),10.);
        finalEmissive+=vec3(1.,.66,.11)*limb*(4.+3.*sin(sp.y*9.+sp.x*7.)+channel*2.);
      `,
      };
    return null;
  }
}
/** Smooth zero-size birth/death avoids alpha state on shared ejecta materials. */
export function stellarEjectaState(time: number, phase: number, period = 4.8) {
  const progress = (((time / period + phase) % 1) + 1) % 1;
  const size = Math.sin(Math.PI * progress) ** 2;
  return {
    progress,
    distance: 1.005 + 0.52 * progress,
    size,
    bend: 0.12 * Math.sin(Math.PI * progress),
  };
}

/** Shared material, per-draw parcel temperature; anchored flares retain native emission. */
export class StellarEjectaRadiance extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, "StellarEjectaRadiance", 186, {}, true, true);
  }
  override getClassName() {
    return "StellarEjectaRadiance";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "stellarEjection", size: 1, type: "float" }],
      fragment: "uniform float stellarEjection;",
    };
  }
  override bindForSubMesh(
    buffer: UniformBuffer,
    _scene?: unknown,
    _engine?: unknown,
    subMesh?: { getMesh(): { metadata?: { stellarEjectaProgress?: number } } },
  ) {
    buffer.updateFloat(
      "stellarEjection",
      subMesh?.getMesh().metadata?.stellarEjectaProgress ?? -1,
    );
  }
  override getCustomCode(type: string): Record<string, string> | null {
    return type === "fragment"
      ? {
          CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
      if(stellarEjection>=0.) finalEmissive=mix(vec3(18.,8.,.9),vec3(5.,.25,.005),stellarEjection)*pow(1.-stellarEjection,1.2);
    `,
        }
      : null;
  }
}
