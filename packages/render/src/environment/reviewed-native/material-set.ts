import type { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { referenceMaterial, type ReferenceMaterialRole } from './planet_reference_materials';
import { acquireReferenceTransmission } from './planet_reference_transmission';

export interface ReviewedMaterialHeader { readonly layout: string; readonly materials: readonly ReferenceMaterialRole[] }

/** Body-owned PBR/textures; compatible retained levels use the same objects. */
export async function createReviewedMaterialSet(scene: Scene, options: {
  header: ReviewedMaterialHeader; textureBaseURL: string;
  weatherHeader?: ReviewedMaterialHeader; weatherTextureBaseURL?: string;
  signal?: AbortSignal;
}) {
  const materials: PBRMaterial[] = [], textures = new Set<Texture>();
  const pending = new Map<string, Promise<Texture>>();
  let weather: PBRMaterial | undefined;
  let transmission: ReturnType<typeof acquireReferenceTransmission> | undefined;
  let disposed = false;
  const loadingRejects = new Set<(error:Error)=>void>();
  let sceneDispose: ReturnType<typeof scene.onDisposeObservable.add> | undefined;
  const check = () => { if (disposed || options.signal?.aborted || scene.isDisposed) throw new Error('Planet material loading cancelled'); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal?.removeEventListener('abort', dispose);
    if(sceneDispose)scene.onDisposeObservable.remove(sceneDispose);
    for(const reject of loadingRejects)reject(new Error('Planet material loading cancelled'));
    loadingRejects.clear();
    transmission?.dispose();
    materials.forEach(material => material.dispose(false, false));
    weather?.dispose(false, false);
    textures.forEach(texture => texture.dispose());
    textures.clear();
  };
  options.signal?.addEventListener('abort', dispose, { once: true });
  sceneDispose=scene.onDisposeObservable.add(dispose);
  function load(file: string, role: ReferenceMaterialRole, linear: boolean, alpha: boolean, base: string) {
    check();
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|ktx2|basis)$/i.test(file)) throw new Error('Invalid native texture filename');
    const url = base + file, key = `${url}:${role.invertY ?? false}:${linear}:${alpha}`;
    let value = pending.get(key);
    if (!value) {
      value = new Promise<Texture>((resolve, reject) => {
        loadingRejects.add(reject);
        const texture = new Texture(url, scene, false, role.invertY ?? false, Texture.TRILINEAR_SAMPLINGMODE,
          () => { loadingRejects.delete(reject); try { check(); resolve(texture); } catch (error) { texture.dispose(); reject(error); } },
          message => { loadingRejects.delete(reject); reject(new Error(message ?? 'Native texture failed')); });
        texture.gammaSpace = !linear; texture.hasAlpha = alpha; textures.add(texture);
      });
      pending.set(key, value);
    }
    return value;
  }
  async function finish(material: PBRMaterial, role: ReferenceMaterialRole, base: string) {
    if (role.baseColorTexture) material.albedoTexture = await load(role.baseColorTexture, role, role.textureColorSpace === 'linear', role.useTextureAlpha ?? (role.alphaMode === 'BLEND' || role.alphaMode === 'MASK'), base);
    if (role.normalTexture) { material.bumpTexture = await load(role.normalTexture, role, true, false, base); material.bumpTexture.level = role.normalScale ?? 1; material.invertNormalMapX = !scene.useRightHandedSystem; material.invertNormalMapY = scene.useRightHandedSystem; }
    if (role.emissiveTexture) material.emissiveTexture = await load(role.emissiveTexture, role, false, false, base);
    if (role.clearcoatNormalTexture) { material.clearCoat.bumpTexture = await load(role.clearcoatNormalTexture, role, true, false, base); material.invertNormalMapX = !scene.useRightHandedSystem; material.invertNormalMapY = scene.useRightHandedSystem; }
    if (role.metallicRoughnessTexture) { material.metallicTexture = await load(role.metallicRoughnessTexture, role, true, false, base); material.useRoughnessFromMetallicTextureGreen = true; material.useRoughnessFromMetallicTextureAlpha = false; material.useMetallnessFromMetallicTextureBlue = true; }
    check();
  }
  try {
    check();
    for (const role of options.header.materials) materials.push(referenceMaterial(scene, role));
    await Promise.all(materials.map((material, index) => finish(material, options.header.materials[index], options.textureBaseURL)));
    check();
    if (options.weatherHeader?.layout === 'toxic-fog-banks') {
      const role = options.weatherHeader.materials[0];
      if (!role.baseColorTexture || role.alphaMode !== 'BLEND') throw new Error('Native Toxic fog requires its authored density texture');
      weather = referenceMaterial(scene, role);
      await finish(weather, role, options.weatherTextureBaseURL!);
    } else if (options.weatherHeader) {
      const role = options.weatherHeader.materials[0];
      weather = new PBRMaterial('native-planet-weather', scene);
      weather.roughness = role.roughness ?? .95;
      weather.albedoColor = Color3.FromArray(role.linearColor);
      weather.metallic = 0; weather.directIntensity = 2.4;
      weather.subSurface.isTranslucencyEnabled = true;
      weather.subSurface.translucencyIntensity = .35;
      weather.subSurface.maximumThickness = .08;
    }
    check();
    transmission = acquireReferenceTransmission(scene, materials);
    return { materials, weather, transmission, dispose };
  } catch (error) { dispose(); throw error; }
}
