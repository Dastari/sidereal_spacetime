/**
 * Molded miniature plastic (studless construction-brick) finish: ONE shared material and lighting
 * language for prefab ships (kit, components, interior objects), the voxel crew (body, heads,
 * armour) and held items. Presentation only; never authority, collision or damage.
 *
 * Direction: wiki Art/Visual Theme "Molded miniature plastic", Decisions/2026-09-27 First Revision
 * Art Acceptance follow-up #1, and the Astra art technical design section 9.
 *
 * Every material slot maps to a surface FAMILY; each family owns its PBR parameters here. Callers
 * never hand-tune a single mesh: they resolve a family from the slot name and apply it to the
 * shared (pooled) slot material, so batching per material is unchanged.
 */
import { protectPbrLight } from "./pbr-light-budget";
import { guardNeutralToneMapping } from "./tone-map-guard";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Surface families of the shared finish. */
export const SURFACE_FAMILIES = [
  "plastic-light",
  "plastic-dark",
  "plastic-colour",
  "metal",
  "rubber",
  "fabric",
  "skin",
  "glass",
  "emissive",
] as const;
export type SurfaceFamily = (typeof SURFACE_FAMILIES)[number];

export interface SurfaceFinish {
  metallic: number;
  roughness: number;
  /** Clear-coat weight (0 = no coat layer, no extra shader lobe). */
  coat: number;
  coatRoughness: number;
  /** Dielectric index of refraction (F0 = ((ior-1)/(ior+1))^2; 1.46 -> 3.5 %). */
  ior: number;
  /** Absolute studio reflection-environment strength for this family (before scene scaling). */
  environment: number;
  /** Direct-light specular multiplier (key/rim glints on bevels; never touches diffuse). */
  specular: number;
}

/**
 * The implemented parameter table (Codex/Astra starting spec, refined by eye in the game renderer):
 * - plastic: dielectric, IOR 1.46, light shells 0.32, dark polymer 0.38, coloured plates 0.27,
 *   clear coat 0.08 @ 0.20;
 * - metal only for explicit mechanical metal roles;
 * - rubber 0.65 and fabric 0.78, never coated; skin a satin vinyl without coat;
 * - emissive surfaces keep their slot colour; bloom carries the halo.
 */
export const SURFACE_FINISHES: Readonly<Record<SurfaceFamily, SurfaceFinish>> =
  {
    "plastic-light": {
      metallic: 0,
      roughness: 0.32,
      coat: 0.08,
      coatRoughness: 0.2,
      ior: 1.46,
      environment: 0.55,
      specular: 1.5,
    },
    "plastic-dark": {
      metallic: 0,
      roughness: 0.38,
      coat: 0.08,
      coatRoughness: 0.2,
      ior: 1.46,
      environment: 0.55,
      specular: 1.5,
    },
    "plastic-colour": {
      metallic: 0,
      roughness: 0.27,
      coat: 0.08,
      coatRoughness: 0.2,
      ior: 1.46,
      environment: 0.55,
      specular: 1.5,
    },
    metal: {
      metallic: 0.85,
      roughness: 0.34,
      coat: 0,
      coatRoughness: 0.2,
      ior: 1.5,
      environment: 0.75,
      specular: 1,
    },
    rubber: {
      metallic: 0,
      roughness: 0.65,
      coat: 0,
      coatRoughness: 0.2,
      ior: 1.46,
      environment: 0.4,
      specular: 0.6,
    },
    fabric: {
      metallic: 0,
      roughness: 0.78,
      coat: 0,
      coatRoughness: 0.2,
      ior: 1.46,
      environment: 0.4,
      specular: 0.4,
    },
    skin: {
      metallic: 0,
      roughness: 0.45,
      coat: 0,
      coatRoughness: 0.2,
      ior: 1.46,
      environment: 0.45,
      specular: 0.8,
    },
    glass: {
      metallic: 0,
      roughness: 0.05,
      coat: 0,
      coatRoughness: 0.2,
      ior: 1.5,
      environment: 0.55,
      specular: 1,
    },
    emissive: {
      metallic: 0,
      roughness: 0.4,
      coat: 0,
      coatRoughness: 0.2,
      ior: 1.46,
      environment: 0.25,
      specular: 0.5,
    },
  };

/** Ship kit slots (content ship-kit SHIP_KIT_SLOTS) -> family. */
const SHIP_SLOT_FAMILY: Record<string, SurfaceFamily> = {
  primary: "plastic-light",
  secondary: "plastic-dark",
  accent: "plastic-colour",
  trim: "plastic-dark",
  metal: "metal",
  dark: "plastic-dark",
  emit_a: "emissive",
  emit_b: "emissive",
  glass: "glass",
};

/** Crew item slots (`slot:<slot>@<theme>`) -> family. */
const ITEM_SLOT_FAMILY: Record<string, SurfaceFamily> = {
  ...SHIP_SLOT_FAMILY,
  grip: "rubber",
};

/** Which crew part a `crew.<slot>` material belongs to: the body wears cloth, parts are moulded. */
export type CrewPart = "body" | "armour" | "head";

export function crewSlotFamily(
  slot: string,
  part: CrewPart,
): SurfaceFamily | undefined {
  switch (slot) {
    case "skin":
      return "skin";
    case "hair":
    case "eye":
      return "plastic-dark";
    case "face":
      return "skin";
    case "suit_primary":
    case "suit_secondary":
      // The body's suit layer is a uniform (cloth); on armour and helmets it is a moulded plate.
      return part === "body" ? "fabric" : "plastic-light";
    case "accent":
      return "plastic-colour";
    case "metal":
      return "metal";
    case "dark":
      // Body dark = boots, gloves and belt webbing; armour dark = dark polymer plates.
      return part === "body" ? "rubber" : "plastic-dark";
    case "emit":
      return "emissive";
    case "glass":
      return "glass";
    default:
      return undefined;
  }
}

export function shipSlotFamily(slot: string): SurfaceFamily | undefined {
  return SHIP_SLOT_FAMILY[slot];
}

/**
 * Resolve the family of any material by its naming convention:
 * - `crew.<slot>[.NNN]` (body, heads, armour; `part` decides cloth vs moulded plate);
 * - `slot:<slot>@<theme>` (held items);
 * - `fx:*` (item effects) are always emissive.
 */
export function surfaceFamilyForMaterialName(
  name: string,
  part: CrewPart = "body",
): SurfaceFamily | undefined {
  if (name.startsWith("fx:")) return "emissive";
  const item = /^slot:([a-z_]+)@/.exec(name);
  if (item) return ITEM_SLOT_FAMILY[item[1]];
  const crew = /^crew\.([a-z_]+)/.exec(name);
  if (crew) return crewSlotFamily(crew[1], part);
  return undefined;
}

/**
 * Peak opacity of the baked wall-to-deck contact strips (prefab ship-view). With screen-space
 * contact shading on top they add up to roughly the 10-20 % join darkening of the spec plus a
 * soft falloff, instead of the earlier 55 % soot line.
 */
export const CONTACT_STRIP_OPACITY = 0.3;

/** Metadata key marking a material as already finished (idempotence and diagnostics). */
export const MOLDED_FINISH_KEY = "moldedFinish";

/** Per-scene shared resources: studio reflection environment and plastic grading. */
interface MoldedSceneResources {
  /** undefined = not created yet; null = unsupported engine (NullEngine in tests). */
  studio?: HDRCubeTexture | null;
  processing: ImageProcessingConfiguration;
}
const resources = new WeakMap<Scene, MoldedSceneResources>();

/**
 * The grading applied to every molded material (in-shader image processing: no extra pass):
 * hue-preserving KHR PBR Neutral tone mapping softly rolls highlights, a small saturation lift
 * keeps pigment vivid, and a light navy density in the shadows keeps dark areas readable blue
 * instead of black or purple.
 */
export const MOLDED_GRADING = {
  exposure: 0.97,
  contrast: 1.06,
  saturation: 14,
  shadowsHue: 225,
  shadowsDensity: 18,
  shadowsSaturation: 40,
  highlightsDensity: 0,
} as const;

function sceneResources(scene: Scene): MoldedSceneResources {
  let r = resources.get(scene);
  if (r) return r;
  if (!guardNeutralToneMapping())
    console.warn("Neutral tone mapping guard does not match this Babylon.js");
  const processing = new ImageProcessingConfiguration();
  processing.toneMappingEnabled = true;
  processing.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  processing.exposure = MOLDED_GRADING.exposure;
  processing.contrast = MOLDED_GRADING.contrast;
  const curves = new ColorCurves();
  curves.globalSaturation = MOLDED_GRADING.saturation;
  curves.shadowsHue = MOLDED_GRADING.shadowsHue;
  curves.shadowsDensity = MOLDED_GRADING.shadowsDensity;
  curves.shadowsSaturation = MOLDED_GRADING.shadowsSaturation;
  processing.colorCurves = curves;
  processing.colorCurvesEnabled = true;
  r = { processing };
  resources.set(scene, r);
  scene.onDisposeObservable.addOnce(() => {
    r?.studio?.dispose();
    resources.delete(scene);
  });
  return r;
}

/** Shared grading configuration of the scene's molded materials. */
export function moldedImageProcessing(scene: Scene) {
  return sceneResources(scene).processing;
}

// ---------------------------------------------------------------------------------------------
// Studio reflection environment (generated, no binary asset): a neutral grey gradient with three
// soft boxes. It gives plastic bevels a clean highlight and a neutral diffuse fill; the visible
// sky (stars, nebula, planets) stays separate and keeps the scene environment.

interface SoftBox {
  /** Direction toward the box (renderer Y up). */
  dir: [number, number, number];
  /** Angular radius (radians) and soft edge fraction. */
  radius: number;
  colour: [number, number, number];
}

export const STUDIO_ENVIRONMENT = {
  width: 128,
  height: 64,
  zenith: [0.62, 0.63, 0.65] as [number, number, number],
  horizon: [0.4, 0.405, 0.42] as [number, number, number],
  ground: [0.1, 0.105, 0.12] as [number, number, number],
  boxes: [
    // Broad key box above and in front of the default key light direction.
    { dir: [0.55, 0.75, -0.4], radius: 0.42, colour: [4.6, 4.52, 4.4] },
    // Cool fill strip, opposite side, low.
    { dir: [-0.75, 0.3, 0.55], radius: 0.3, colour: [1.1, 1.2, 1.35] },
    // Overhead panel: top-edge bevel highlights from any azimuth.
    { dir: [0, 1, 0], radius: 0.36, colour: [1.7, 1.7, 1.7] },
  ] as SoftBox[],
};

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Linear RGB radiance of the studio for a unit direction (renderer axes, Y up). */
export function studioRadiance(d: [number, number, number]) {
  const y = d[1];
  const env = STUDIO_ENVIRONMENT;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++)
    out[c] =
      y >= 0
        ? env.horizon[c] + (env.zenith[c] - env.horizon[c]) * Math.sqrt(y)
        : env.ground[c] +
          (env.horizon[c] - env.ground[c]) * smooth(-0.25, 0, y);
  for (const box of env.boxes) {
    const l = Math.hypot(...box.dir);
    const cos = (d[0] * box.dir[0] + d[1] * box.dir[1] + d[2] * box.dir[2]) / l;
    const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
    const w = 1 - smooth(box.radius * 0.6, box.radius, angle);
    for (let c = 0; c < 3; c++) out[c] += box.colour[c] * w;
  }
  return out;
}

/** Radiance .hdr (flat RGBE, equirectangular) bytes of the studio environment. */
export function studioEnvironmentHdr(
  width = STUDIO_ENVIRONMENT.width,
  height = STUDIO_ENVIRONMENT.height,
) {
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  const bytes = new Uint8Array(header.length + width * height * 4);
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i);
  let p = header.length;
  for (let y = 0; y < height; y++) {
    const theta = ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width) * 2 * Math.PI - Math.PI;
      const rgb = studioRadiance([
        Math.sin(theta) * Math.sin(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.cos(phi),
      ]);
      const v = Math.max(...rgb);
      if (v < 1e-32) {
        p += 4;
        continue;
      }
      const e = Math.floor(Math.log2(v)) + 1;
      const f = 256 / 2 ** e;
      bytes[p++] = Math.min(255, Math.floor(rgb[0] * f));
      bytes[p++] = Math.min(255, Math.floor(rgb[1] * f));
      bytes[p++] = Math.min(255, Math.floor(rgb[2] * f));
      bytes[p++] = e + 128;
    }
  }
  return bytes;
}

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The scene's shared studio reflection texture (created once, prefiltered on load); undefined
 * where the engine cannot create cube textures (headless NullEngine tests). */
export function moldedStudioEnvironment(scene: Scene) {
  const r = sceneResources(scene);
  if (r.studio === undefined) {
    try {
      r.studio = new HDRCubeTexture(
        `data:application/octet-stream;base64,${base64(studioEnvironmentHdr())}`,
        scene,
        64,
        false,
        true,
        false,
        true,
      );
      r.studio.name = "molded-studio-environment";
    } catch {
      r.studio = null;
    }
  }
  return r.studio ?? undefined;
}

// ---------------------------------------------------------------------------------------------

export interface MoldedFinishOptions {
  /** Skip the studio environment (tests / NullEngine); grading still applies. */
  studio?: boolean;
  /** Override the clear-coat quality switch for this call. */
  clearCoat?: boolean;
}

/**
 * Clear-coat lobe quality switch. The families keep the specified coat (0.08 @ 0.20), but the
 * coat lobe is OFF by default: measured in the game renderer it cost about 30 % frame time on the
 * Wren (an extra specular lobe and environment lookup on every plastic pixel) for well under 1 %
 * extra reflectance at weight 0.08. The plastic families' key-light specular (x1.5) carries the
 * glint instead. `?coat=1` (see index.ts) turns the real coat on for side-by-side review.
 */
let clearCoatEnabled = false;
export function setMoldedClearCoat(enabled: boolean) {
  clearCoatEnabled = enabled;
}
export function moldedClearCoatEnabled() {
  return clearCoatEnabled;
}

/**
 * Whole-finish switch (F3 debug window, render-quality.ts). Off restores every finished material's
 * pre-finish response (what the caller set before the first applySurfaceFinish: pre-#59 metallic,
 * roughness, IBL share and the scene's own grading) and turns the rim light off, for frame-rate
 * comparisons. Colours, emission and batching never change.
 */
let finishEnabled = true;
export function setMoldedFinishEnabled(enabled: boolean) {
  finishEnabled = enabled;
}
export function moldedFinishEnabled() {
  return finishEnabled;
}

/** Metadata key of the response a material had before its first finish. */
export const MOLDED_BASE_KEY = "moldedBase";
interface MoldedBase {
  metallic: number | null;
  roughness: number | null;
  ior: number;
  specular: number;
  specularAA: boolean;
  environment: number;
  reflection: PBRMaterial["reflectionTexture"];
}

function captureBase(material: PBRMaterial): MoldedBase {
  return {
    metallic: material.metallic,
    roughness: material.roughness,
    ior: material.indexOfRefraction,
    specular: material.specularIntensity,
    specularAA: material.enableSpecularAntiAliasing,
    environment: material.environmentIntensity,
    reflection: material.reflectionTexture,
  };
}

/**
 * Apply a family's finish to one (shared) PBR material. Colours, alpha and emissive colour stay
 * with the caller's slot table; this sets the response only. Idempotent. While the finish is
 * switched off (setMoldedFinishEnabled) the material keeps/regains its pre-finish response.
 */
export function applySurfaceFinish(
  material: PBRMaterial,
  family: SurfaceFamily,
  options: MoldedFinishOptions & { recaptureBase?: boolean } = {},
) {
  const f = SURFACE_FINISHES[family];
  const scene = material.getScene();
  const stored = material.metadata?.[MOLDED_BASE_KEY] as MoldedBase | undefined;
  const base =
    !stored || options.recaptureBase ? captureBase(material) : stored;
  const { recaptureBase: _recapture, ...kept } = options;
  material.metadata = {
    ...material.metadata,
    [MOLDED_FINISH_KEY]: family,
    [MOLDED_BASE_KEY]: base,
    moldedOptions: kept,
    moldedApplied: finishEnabled,
  };
  if (!finishEnabled) {
    material.metallic = base.metallic;
    material.roughness = base.roughness;
    material.indexOfRefraction = base.ior;
    material.specularIntensity = base.specular;
    material.clearCoat.isEnabled = false;
    material.enableSpecularAntiAliasing = base.specularAA;
    // Null re-attaches the scene's own image processing.
    material.imageProcessingConfiguration =
      null as unknown as ImageProcessingConfiguration;
    material.reflectionTexture = base.reflection;
    material.environmentIntensity = base.environment;
    return material;
  }
  material.metallic = f.metallic;
  material.roughness = f.roughness;
  material.indexOfRefraction = f.ior;
  material.specularIntensity = f.specular;
  if (f.coat > 0 && (options.clearCoat ?? clearCoatEnabled)) {
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = f.coat;
    material.clearCoat.roughness = f.coatRoughness;
    material.clearCoat.indexOfRefraction = 1.5;
  } else material.clearCoat.isEnabled = false;
  // Specular anti-aliasing keeps the narrow bevel highlights from sparkling at distance.
  material.enableSpecularAntiAliasing = true;
  material.imageProcessingConfiguration = moldedImageProcessing(scene);
  const studio =
    options.studio === false ? undefined : moldedStudioEnvironment(scene);
  if (studio) {
    material.reflectionTexture = studio;
    // Material x scene environment intensity: keep the family's absolute studio strength.
    const sceneIntensity = scene.environmentIntensity || 1;
    material.environmentIntensity = f.environment / sceneIntensity;
  }
  return material;
}

/**
 * Re-apply every finished material of the scene after a finish/clear-coat switch change (live,
 * no reload), and switch the rim light with the finish. Returns the number of materials updated.
 */
export function refreshMoldedFinishes(scene: Scene) {
  let updated = 0;
  for (const m of scene.materials) {
    if (!(m instanceof PBRMaterial)) continue;
    const family = m.metadata?.[MOLDED_FINISH_KEY] as SurfaceFamily | undefined;
    if (!family) continue;
    applySurfaceFinish(
      m,
      family,
      (m.metadata?.moldedOptions as MoldedFinishOptions | undefined) ?? {},
    );
    updated++;
  }
  rigs.get(scene)?.setRimEnabled(finishEnabled);
  return updated;
}

/** Finish every PBR material of the meshes by material name (crew, heads, armour, items, fx). */
export function applyMoldedFinishToMeshes(
  meshes: readonly AbstractMesh[],
  options: MoldedFinishOptions = {},
) {
  const seen = new Set<Material>();
  let finished = 0;
  for (const mesh of meshes) {
    const material = mesh.material;
    const list =
      material instanceof MultiMaterial ? material.subMaterials : [material];
    for (const m of list) {
      if (!(m instanceof PBRMaterial) || seen.has(m)) continue;
      seen.add(m);
      const part = (m.metadata?.crewPart as CrewPart | undefined) ?? "body";
      const family =
        (m.metadata?.studySurfaceFamily as SurfaceFamily | undefined) ??
        surfaceFamilyForMaterialName(m.name, part);
      if (!family) continue;
      // Skip materials already in this finish; a later theme/colourway pass that rewrote the
      // response (e.g. item themes carry their own roughness) is finished again.
      const f = SURFACE_FINISHES[family];
      const same = m.metadata?.[MOLDED_FINISH_KEY] === family;
      if (
        same &&
        m.metadata?.moldedApplied === finishEnabled &&
        (!finishEnabled ||
          (m.roughness === f.roughness && m.metallic === f.metallic))
      )
        continue;
      // A finished material whose response no longer matches (a theme/colourway pass rewrote it)
      // takes that rewritten response as its new pre-finish base.
      applySurfaceFinish(m, family, {
        ...options,
        recaptureBase: same && m.metadata?.moldedApplied === true,
      });
      finished++;
    }
  }
  return finished;
}

/** Tag a loaded container's materials with the crew part they belong to. */
export function tagCrewPart(materials: readonly Material[], part: CrewPart) {
  for (const m of materials) m.metadata = { ...m.metadata, crewPart: part };
}

// ---------------------------------------------------------------------------------------------
// Lighting rig shared by ships and crew: a gentle cool fill and a restrained camera-relative rim.
// The scene's key (the star/directional light) stays the broad neutral key.

export const MOLDED_LIGHTING = {
  fill: {
    intensity: 0.22,
    sky: [0.84, 0.9, 1] as [number, number, number],
    ground: [0.16, 0.18, 0.26] as [number, number, number],
  },
  rim: {
    intensity: 0.8,
    colour: [0.86, 0.92, 1] as [number, number, number],
    /** Rim elevation: the light comes from behind the subject and this far above it. */
    lift: 0.55,
  },
} as const;

export interface MoldedLightRig {
  readonly globalLights: readonly [HemisphericLight, DirectionalLight];
  /** Light these meshes with the rig (idempotent; disposed meshes are pruned). */
  include(meshes: readonly AbstractMesh[]): void;
  /** The rim belongs to the molded finish; the fill stays (it replaced the pre-finish fill). */
  setRimEnabled(enabled: boolean): void;
  dispose(): void;
}
const rigs = new WeakMap<Scene, MoldedLightRig>();

/** The scene's molded light rig (fill + rim), created on first use. */
export function moldedLightRig(scene: Scene): MoldedLightRig {
  const existing = rigs.get(scene);
  if (existing) return existing;
  const fill = new HemisphericLight(
    "molded-cool-fill",
    new Vector3(0.2, 1, -0.3),
    scene,
  );
  fill.intensity = MOLDED_LIGHTING.fill.intensity;
  fill.diffuse = new Color3(...MOLDED_LIGHTING.fill.sky);
  fill.groundColor = new Color3(...MOLDED_LIGHTING.fill.ground);
  fill.specular = Color3.Black();
  const rim = new DirectionalLight(
    "molded-rim",
    new Vector3(0, -MOLDED_LIGHTING.rim.lift, 1),
    scene,
  );
  rim.intensity = MOLDED_LIGHTING.rim.intensity;
  rim.diffuse = new Color3(...MOLDED_LIGHTING.rim.colour);
  rim.specular = new Color3(...MOLDED_LIGHTING.rim.colour);
  rim.shadowEnabled = false;
  protectPbrLight(fill, 2);
  protectPbrLight(rim, 3);
  rim.setEnabled(finishEnabled);
  const lit = new Set<AbstractMesh>();
  fill.includedOnlyMeshes = [];
  rim.includedOnlyMeshes = [];
  const forward = new Vector3();
  // Camera-relative rim: travels from behind the subject toward the camera (azimuth follows the
  // orbit), so silhouettes get a thin cool edge from every view without a second key.
  const follow = scene.onBeforeRenderObservable.add(() => {
    const camera = scene.activeCamera;
    if (!camera) return;
    camera.getDirectionToRef(
      Vector3.Forward(scene.useRightHandedSystem),
      forward,
    );
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    rim.direction.set(-forward.x, -MOLDED_LIGHTING.rim.lift, -forward.z);
  });
  const rig: MoldedLightRig = {
    globalLights: [fill, rim],
    include(meshes) {
      let changed = false;
      const added: AbstractMesh[] = [];
      for (const mesh of lit)
        if (mesh.isDisposed()) {
          lit.delete(mesh);
          changed = true;
        }
      for (const placed of meshes) {
        if (placed.isDisposed()) continue;
        // Hardware instances use their source's shader and light array. These
        // global lights admit that owner; placement-local lamps stay separate.
        const mesh =
          placed instanceof InstancedMesh ? placed.sourceMesh : placed;
        if (!mesh.isDisposed() && !lit.has(mesh)) {
          lit.add(mesh);
          added.push(mesh);
          changed = true;
        }
      }
      if (changed) {
        // Reassign so Babylon re-evaluates light/mesh bindings.
        // Babylon hooks push/splice on these arrays. Never hand it our owner
        // list or reassign an already hooked list: wrappers accumulate and each
        // addition then resynchronizes the entire scene repeatedly.
        fill.includedOnlyMeshes = [...lit];
        rim.includedOnlyMeshes = [...lit];
        // AssetContainer shader owners may be outside scene.meshes, which is
        // the only list Babylon's receiver setter resynchronizes.
        for (const mesh of added) {
          mesh._resyncLightSource(fill);
          mesh._resyncLightSource(rim);
        }
      }
    },
    setRimEnabled(enabled) {
      rim.setEnabled(enabled);
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(follow);
      fill.dispose();
      rim.dispose();
      rigs.delete(scene);
    },
  };
  rigs.set(scene, rig);
  scene.onDisposeObservable.addOnce(() => rigs.delete(scene));
  return rig;
}
