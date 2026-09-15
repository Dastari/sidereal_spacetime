import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
/** Animates only radiance on the native photosphere. Authored albedo, normals,
 * roughness and dark-spot materials stay intact; topology never changes. */
export class StellarConvection extends MaterialPluginBase {
  time = 0;
  constructor(material: PBRMaterial) {
    super(material, "StellarConvection", 185, {}, true, true);
  }
  override getClassName() {
    return "StellarConvection";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "stellarTime", size: 1, type: "float" }],
      fragment: "uniform float stellarTime;",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat("stellarTime", this.time);
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS: "varying vec3 vStellarPosition; varying vec3 vStellarRadial;",
        CUSTOM_VERTEX_MAIN_END: "vStellarPosition=position; vStellarRadial=mat3(world)*position;",
      };
    if (type === "fragment")
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: "varying vec3 vStellarPosition; varying vec3 vStellarRadial;",
        CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        vec3 sp=normalize(vStellarPosition);
        float st=stellarTime;
        vec3 drift=vec3(sin(sp.y*7.+st*.31),sin(sp.z*9.-st*.27),sin(sp.x*8.+st*.23));
        vec3 cell=sp*13.+drift*1.1;
        float flow=sin(cell.x+sin(cell.z*.7)+st*.18)+sin(cell.y+sin(cell.x*.6)-st*.16)+.55*sin(cell.z*1.3);
        float channel=1.-smoothstep(.08,.32,abs(flow));
        float granule=sin(sp.x*63.+st*.8)*sin(sp.y*59.-st*.67)*sin(sp.z*61.+st*.53);
        finalEmissive*=.80+.10*granule+.22*sin(flow+st*.35);
        finalEmissive+=vec3(1.,.69,.16)*channel*5.;
        // Analytic radial normal keeps the glowing limb continuous across
        // native stepped facets. The authored PBR normal still shades relief.
        float limb=pow(1.-abs(dot(normalize(vStellarRadial),viewDirectionW)),4.);
        finalEmissive+=vec3(1.,.79,.30)*limb*(13.+channel*6.);
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
