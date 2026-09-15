import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { Material } from "@babylonjs/core/Materials/material";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PartAsset } from "@sidereal/content/assembly";
import {
  canPaintHullAsset,
  hasHullPaint,
  type HullPaint,
} from "@sidereal/content/hull-paint";

export type HullPaintRole =
  "primary" | "secondary" | "atlas" | "vertex" | "surface" | "protected";
/** Native enamel atlas region contract from the frozen r004/r005 authoring recipe. */
export function hullAtlasPaintRole(u: number, v: number): HullPaintRole {
  const x = u * 16,
    y = (1 - v) * 16;
  if (y >= 0 && y < 3 && x >= 0 && x < 14) return "primary";
  if (y >= 7 && y < 10 && x >= 0 && x < 8) return "primary";
  if (y >= 3 && y < 7 && x >= 0 && x < 8) return "secondary";
  return "protected";
}
export function hullMaterialPaintRole(material: Material): HullPaintRole {
  const n = material.name.toLowerCase();
  if (/titanium hardware|clean hull paint|clean nameplate/.test(n))
    return "surface";
  if (
    material.alpha < 1 ||
    /glass|glaz|window|lens|emitt|emissi|cyan|amber|instrument|fixture|steel|metal|titanium|rubber|seal|black|core|nameplate|sign|logo|identity/.test(
      n,
    )
  )
    return "protected";
  if (
    material instanceof PBRMaterial &&
    (material.subSurface.isRefractionEnabled ||
      material.subSurface.isTranslucencyEnabled ||
      material.emissiveColor.r > 0 ||
      material.emissiveColor.g > 0 ||
      material.emissiveColor.b > 0)
  )
    return "protected";
  if (
    material instanceof StandardMaterial &&
    (material.emissiveColor.r > 0 ||
      material.emissiveColor.g > 0 ||
      material.emissiveColor.b > 0)
  )
    return "protected";
  if (n.startsWith("armor cassette / enamel")) return "atlas";
  if (/red|navy|dark|trim|accent/.test(n)) return "secondary";
  if (/structural-polymer/.test(n)) return "vertex";
  return "primary";
}

class HullPaintPlugin extends MaterialPluginBase {
  private readonly primary: Color3;
  private readonly secondary: Color3;
  constructor(
    material: PBRMaterial | StandardMaterial,
    private readonly paint: HullPaint,
    private readonly role: HullPaintRole,
    private readonly reference: Color3,
  ) {
    super(
      material,
      "HullPlacementPaint",
      180,
      {
        HULL_PAINT_ROLE: [
          "primary",
          "secondary",
          "atlas",
          "vertex",
          "surface",
          "protected",
        ].indexOf(role),
      },
      true,
      true,
    );
    this.primary = Color3.FromHexString(
      paint.primary ?? "#ffffff",
    ).toLinearSpace();
    this.secondary = Color3.FromHexString(
      paint.secondary ?? "#ffffff",
    ).toLinearSpace();
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL;
  }
  override getClassName() {
    return "HullPlacementPaint";
  }
  override getUniforms(language = ShaderLanguage.GLSL) {
    const names = [
      "hullPaintPrimary",
      "hullPaintSecondary",
      "hullPaintReference",
    ];
    return {
      ubo: names.map((name) => ({ name, size: 4, type: "vec4" })),
      fragment:
        language === ShaderLanguage.GLSL
          ? names.map((n) => `uniform vec4 ${n};`).join("\n")
          : "",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat4(
      "hullPaintPrimary",
      this.primary.r,
      this.primary.g,
      this.primary.b,
      this.paint.primary ? 1 : 0,
    );
    buffer.updateFloat4(
      "hullPaintSecondary",
      this.secondary.r,
      this.secondary.g,
      this.secondary.b,
      this.paint.secondary ? 1 : 0,
    );
    buffer.updateFloat4(
      "hullPaintReference",
      this.reference.r,
      this.reference.g,
      this.reference.b,
      0,
    );
  }
  override getCustomCode(
    type: string,
    language = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (type === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS:
          language === ShaderLanguage.WGSL
            ? "varying hpLocalNormal: vec3f;"
            : "varying vec3 hpLocalNormal;",
        CUSTOM_VERTEX_MAIN_END:
          language === ShaderLanguage.WGSL
            ? "vertexOutputs.hpLocalNormal = normalUpdated;"
            : "hpLocalNormal = normalUpdated;",
      };
    if (type !== "fragment") return null;
    const wgsl = language === ShaderLanguage.WGSL,
      U = wgsl ? "uniforms." : "";
    const v2 = wgsl ? "vec2f" : "vec2",
      v3 = wgsl ? "vec3f" : "vec3";
    const decl = (t: string, n: string, expression: string) =>
      wgsl ? `var ${n}: ${t} = ${expression};` : `${t} ${n} = ${expression};`;
    const f = wgsl ? "f32" : "float";
    const pbr = this._material instanceof PBRMaterial;
    const original = pbr ? "surfaceAlbedo" : "baseColor.rgb * diffuseColor";
    let code =
      decl(v3, "hpOriginal", original) +
      decl(
        v2,
        "hpMask",
        `${v2}(${this.role === "primary" ? "1.0,0.0" : this.role === "secondary" ? "0.0,1.0" : "0.0,0.0"})`,
      ) +
      decl(v3, "hpReference", `${U}hullPaintReference.rgb`);
    if (this.role === "atlas")
      code += `
#ifdef ALBEDO
${decl(v2, "hpUV", `${wgsl ? "fragmentInputs." : ""}vAlbedoUV * 16.0`)}
hpUV.y = 16.0 - hpUV.y;
if ((hpUV.y >= 0.0 && hpUV.y < 3.0 && hpUV.x >= 0.0 && hpUV.x < 14.0) || (hpUV.y >= 7.0 && hpUV.y < 10.0 && hpUV.x >= 0.0 && hpUV.x < 8.0)) {
 hpMask.x = 1.0; hpReference = ${v3}(0.420,0.462,0.570);
 if ((hpUV.x >= 2.0 && hpUV.x < 4.0 && hpUV.y < 3.0) || (hpUV.x >= 4.0 && hpUV.y >= 7.0)) { hpReference = ${v3}(0.187,0.0044,0.0066); }
 if (hpUV.x >= 8.0 && hpUV.y < 3.0) { hpReference = ${v3}(0.0044,0.0063,0.0125); }
} else if (hpUV.y >= 3.0 && hpUV.y < 7.0 && hpUV.x >= 0.0 && hpUV.x < 8.0) {
 hpMask.y = 1.0; hpReference = ${v3}(0.434,0.477,0.587);
 if (hpUV.x >= 4.0) { hpReference = ${v3}(0.00394,0.00542,0.0108); }
}
#endif
`;
    if (this.role === "surface")
      code += `hpMask = ${v2}(1.0,0.0); if (abs(${wgsl ? "fragmentInputs." : ""}hpLocalNormal.y) > 0.65) { hpMask = ${v2}(0.0,1.0); }`;
    if (this.role === "vertex")
      code += `
hpMask.x = 1.0;
if (hpOriginal.r > hpOriginal.g * 1.5 && hpOriginal.r > hpOriginal.b * 1.3) { hpMask = ${v2}(0.0,1.0); }
if (max(max(hpOriginal.r,hpOriginal.g),hpOriginal.b) < 0.025) { hpMask = ${v2}(0.0); }
`;
    code += decl(
      f,
      "hpDetail",
      `dot(hpOriginal,${v3}(0.2126,0.7152,0.0722)) / max(0.002,dot(hpReference,${v3}(0.2126,0.7152,0.0722)))`,
    );
    // Preserve dark printed tooling and bright identity markings within the atlas.
    if (this.role === "atlas" || this.role === "surface")
      code += `if (hpDetail < 0.3 || hpDetail > 2.2) { hpMask = ${v2}(0.0); }`;
    code += `hpMask *= ${v2}(${U}hullPaintPrimary.a,${U}hullPaintSecondary.a);`;
    code += decl(
      v3,
      "hpPainted",
      `(hpMask.x * ${U}hullPaintPrimary.rgb + hpMask.y * ${U}hullPaintSecondary.rgb) * clamp(hpDetail,0.15,1.5)`,
    );
    code += pbr
      ? "surfaceAlbedo = hpOriginal * (1.0-hpMask.x-hpMask.y) + hpPainted;"
      : `baseColor = ${wgsl ? "vec4f" : "vec4"}(hpOriginal * (1.0-hpMask.x-hpMask.y) + hpPainted,baseColor.a); diffuseColor = ${v3}(1.0);`;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: wgsl
        ? "varying hpLocalNormal: vec3f;"
        : "varying vec3 hpLocalNormal;",
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: code,
    };
  }
}

/** A placement owns material variants, but shares original immutable vertex/texture buffers. */
export function createHullPaintBinding(
  parent: TransformNode,
  asset: PartAsset,
  paint?: HullPaint,
) {
  if (!canPaintHullAsset(asset) || !hasHullPaint(paint)) return undefined;
  const variants = new Map<Material, Material>();
  const owned: Material[] = [];
  const bindMaterial = (source: Material | null): Material | null => {
    if (!source) return null;
    if (variants.has(source)) return variants.get(source)!;
    if (source instanceof MultiMaterial) {
      const variant = new MultiMaterial(
        `${source.name}/paint/${parent.uniqueId}`,
        parent.getScene(),
      );
      variants.set(source, variant);
      owned.push(variant);
      variant.subMaterials = source.subMaterials.map(bindMaterial);
      return variant;
    }
    if (!(source instanceof PBRMaterial || source instanceof StandardMaterial))
      return source;
    const role = hullMaterialPaintRole(source);
    if (
      role === "protected" ||
      (role === "primary" && !paint?.primary) ||
      (role === "secondary" && !paint?.secondary)
    )
      return source;
    const variant = source.clone(`${source.name}/paint/${parent.uniqueId}`);
    // Serialization clones textures; reuse original references and release those wrappers.
    const clonedTextures = variant
      .getActiveTextures()
      .filter((t) => !source.getActiveTextures().includes(t));
    for (const key of [
      "albedoTexture",
      "diffuseTexture",
      "bumpTexture",
      "metallicTexture",
      "reflectivityTexture",
      "microSurfaceTexture",
      "ambientTexture",
      "opacityTexture",
      "emissiveTexture",
      "reflectionTexture",
      "lightmapTexture",
    ] as const) {
      if (key in source)
        (variant as unknown as Record<string, unknown>)[key] = (
          source as unknown as Record<string, unknown>
        )[key];
    }
    if (source instanceof PBRMaterial && variant instanceof PBRMaterial) {
      for (const key of [
        "clearCoat",
        "subSurface",
        "sheen",
        "anisotropy",
        "iridescence",
      ] as const) {
        const original = source[key] as unknown as Record<string, unknown>;
        const copy = variant[key] as unknown as Record<string, unknown>;
        for (const property of Object.keys(original))
          if (
            original[property] &&
            source.getActiveTextures().includes(original[property] as never)
          )
            copy[property] = original[property];
      }
    }
    for (const texture of clonedTextures)
      if (!variant.getActiveTextures().includes(texture)) texture.dispose();
    variant.unfreeze();
    variants.set(source, variant);
    owned.push(variant);
    let reference =
      source instanceof PBRMaterial
        ? source.albedoColor.clone()
        : source.diffuseColor.clone();
    const textured =
      source instanceof PBRMaterial
        ? !!source.albedoTexture
        : !!source.diffuseTexture;
    if (textured || role === "vertex") reference = new Color3(0.35, 0.35, 0.35);
    if (/framed-engine-red/.test(source.name))
      reference = new Color3(0.19, 0.012, 0.02);
    if (/framed-engine-navy/.test(source.name))
      reference = new Color3(0.015, 0.02, 0.035);
    new HullPaintPlugin(variant, paint!, role, reference);
    return variant;
  };
  parent.onDisposeObservable.addOnce(() => {
    for (const material of owned) material.dispose(false, false);
    variants.clear();
  });
  return {
    clone(source: Mesh, name: string) {
      const mesh = source.clone(name, parent, true)!;
      mesh.material = bindMaterial(source.material);
      return mesh;
    },
  };
}
