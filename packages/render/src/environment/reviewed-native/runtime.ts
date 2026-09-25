import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { PlanetRecipe } from '../../../../content/src/environment';
import type { ReviewedNativePlanetDescriptor } from '../reviewed-native-planet-catalog';
import type { createPlanetWorkerClient } from '../planet-worker-client';
import { createPlanetLODCache } from '../planet-lod-cache';
import { planetLOD } from '../layered-planet';
import { createReviewedUploadLifetime } from './upload-lifetime';
import { createReviewedMaterialSet } from './material-set';
import { referenceVolcanicSmokeRuntime } from './volcanic-smoke-runtime';
import { createPlanetReferenceLocalLights, CRYSTAL_REFERENCE_HERO_IDS } from './planet_reference_local_lights';

type WorkerClient = Pick<ReturnType<typeof createPlanetWorkerClient>, 'registerReviewed'|'buildReviewed'|'releaseReviewed'|'nextFrame'>;
export interface ReviewedRuntimeOptions {
  bodyId: string; descriptor: ReviewedNativePlanetDescriptor; recipe: PlanetRecipe;
  worker: WorkerClient; signal?: AbortSignal;
  prepareMaterial?: (mesh: Mesh, nextFrame: () => Promise<void>, opaqueRefraction: boolean) => Promise<void>;
}

/** Shared worker and scheduler are borrowed; this body owns its GPU resources. */
export async function createReviewedPlanetRuntime(scene: Scene, options: ReviewedRuntimeOptions) {
  const { worker, descriptor, recipe, bodyId, signal } = options;
  if (!bodyId) throw new Error('Reviewed planet requires a body identity');
  const registration = await worker.registerReviewed(descriptor);
  let released = false;
  const release = () => { if (!released) { released = true; void worker.releaseReviewed(registration.assetKey).catch(() => {}); } };
  if (signal?.aborted || scene.isDisposed) { release(); throw new Error('Planet creation cancelled'); }
  const lifetime = createReviewedUploadLifetime();
  const root = new TransformNode(`planet:${bodyId}`, scene);
  root.metadata = { role: 'planet', bodyId, revision: descriptor.revision, seed: recipe.seed };
  const smoke = referenceVolcanicSmokeRuntime(scene, bodyId, recipe);
  let materialSet: Awaited<ReturnType<typeof createReviewedMaterialSet>> | undefined;
  let lights: ReturnType<typeof createPlanetReferenceLocalLights> | undefined;
  let cache: ReturnType<typeof createPlanetLODCache<{ root: TransformNode }>> | undefined;
  let previous: 0 | 1 | 2 | undefined, buildMs = 0, disposed = false;
  let sceneDispose: ReturnType<typeof scene.onDisposeObservable.add> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    if(sceneDispose)scene.onDisposeObservable.remove(sceneDispose);
    lifetime.dispose(); lights?.dispose(); smoke.dispose(); cache?.dispose();
    root.dispose(false, false); materialSet?.dispose(); release();
  };
  signal?.addEventListener('abort', dispose, { once: true });
  sceneDispose=scene.onDisposeObservable.add(dispose);
  try {
    materialSet = await createReviewedMaterialSet(scene, {
      header: registration.header, textureBaseURL: descriptor.textureBaseURL,
      weatherHeader: registration.weatherHeader, weatherTextureBaseURL: descriptor.weather?.textureBaseURL,
      signal,
    });
    lifetime.check();
    const ownedMaterials = materialSet;
    const nextFrame = worker.nextFrame;
    const prepare = (mesh: Mesh) => options.prepareMaterial
      ? options.prepareMaterial(mesh, nextFrame, Boolean(ownedMaterials.transmission.target) && !(mesh.material as PBRMaterial).subSurface.isRefractionEnabled)
      : mesh.material!.forceCompilationAsync(mesh);
    cache = createPlanetLODCache(async lod => {
      lifetime.check();
      const result = await lifetime.wait(worker.buildReviewed(registration.assetKey, { bodyId, seed: recipe.seed, lod, recipe }));
      lifetime.check(); buildMs = result.buildMs;
      if (!lights && descriptor.localLight) {
        lights = createPlanetReferenceLocalLights({ scene, bodyId, bodyRoot: root, meshes: [], batches: result.batches,
          emitters: CRYSTAL_REFERENCE_HERO_IDS.map(partId => ({ partId, color: [1, .035, .42], range: .65, intensity: .08, heightFraction: .12, radialOffset: .055 })) });
      }
      const node = new TransformNode(`planet-level:${bodyId}:${lod}`, scene);
      node.parent = root; node.metadata = { role: 'planet', bodyId, lod, revision: descriptor.revision }; node.setEnabled(false);
      await lifetime.build(node, async () => {
        for (const [index, batch] of result.batches.entries()) {
          if (!batch.indices.length) continue;
          await lifetime.yieldFrame(nextFrame);
          const mesh = new Mesh(`planet-surface:${bodyId}:${index}`, scene), data = new VertexData();
          data.positions = batch.positions; data.normals = batch.normals; data.indices = batch.indices;
          if ('uvs' in batch) data.uvs = batch.uvs;
          data.applyToMesh(mesh); mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
          mesh.material = ownedMaterials.materials[index]; mesh.parent = node; mesh.isPickable = true; mesh.receiveShadows = true;
          mesh.metadata = { role: 'planet', bodyId, style: recipe.style, revision: descriptor.revision,
            planetShadowRadius: result.shadowRadii[index],
            trianglePlacementRanges: batch.ranges.map(range => ({ ...range, partId: `${bodyId}:${recipe.seed}:${range.partId}` })) };
          lights?.replaceMeshes(root.getChildMeshes().filter(m => m.material instanceof PBRMaterial && !m.metadata?.planetWeather));
          await lifetime.yieldFrame(nextFrame); await lifetime.wait(prepare(mesh));
        }
        if (result.weather?.indices.length) {
          if (!ownedMaterials.weather) throw new Error('Native weather material missing');
          await lifetime.yieldFrame(nextFrame);
          const mesh = new Mesh(`planet-weather:${bodyId}`, scene), data = new VertexData();
          Object.assign(data, result.weather); data.applyToMesh(mesh);
          mesh.sideOrientation = Material.CounterClockWiseSideOrientation; mesh.material = ownedMaterials.weather;
          mesh.parent = node; mesh.isPickable = false;
          mesh.metadata = { role: 'planet', bodyId, style: recipe.style, planetWeather: true, planetShadowRadius: result.weatherShadowRadius,
            trianglePlacementRanges: (result.weather.ranges ?? [{ firstTriangle: 0, triangleCount: result.weather.indices.length / 3, partId: 'weather' }]).map(range => ({ ...range, partId: `${bodyId}:${recipe.seed}:${range.partId}` })) };
          await lifetime.yieldFrame(nextFrame); await lifetime.wait(prepare(mesh));
        }
        if (result.smoke) {
          await lifetime.yieldFrame(nextFrame);
          const mesh = smoke.attach(node, lod, result.smoke);
          if (mesh) { mesh.metadata.bodyId = bodyId; await lifetime.yieldFrame(nextFrame); await lifetime.wait(prepare(mesh)); }
        }
      });
      return { root: node };
    }, value => value.root.dispose(false, false));
    return {
      root,
      update(projected: number) {
        if (disposed) return;
        previous = planetLOD(projected, previous);
        cache!.update(descriptor.fixedDetail ? 0 : previous, projected);
        lights?.syncWorldScale();
      },
      stats: () => ({ ...cache!.snapshot(), ...smoke.stats(), requestedLOD: previous, fixedDetail: descriptor.fixedDetail,
        buildMs, revision: descriptor.revision, localLights: lights?.lights.length ?? 0,
        transmissionMaterials: ownedMaterials.materials.filter(m => m.subSurface.isRefractionEnabled).length,
        transmissionTargets: ownedMaterials.transmission.target ? 1 : 0 }),
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}

export type ReviewedPlanetRuntime = Awaited<ReturnType<typeof createReviewedPlanetRuntime>>;
