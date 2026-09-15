import { createStellarCorona } from './stellar-corona';
import { Scene } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import '@babylonjs/loaders/glTF';

export const YELLOW_STAR_ASSET = '/reviewed-stars/yellow-main-sequence/star.glb';
export function flareScale(time: number, phase: number, period: number) {
  const pulse = .5 + .5 * Math.sin(time * Math.PI * 2 / period + phase);
  return new Vector3(.65 + .35 * pulse, .4 + .8 * pulse, .65 + .35 * pulse);
}
/** The existing primary light remains the sole system sun and obeys scene/F3 lighting.
 * Coordinates supplied here are already camera-relative renderer coordinates. */
export function orientStellarLight(light: DirectionalLight, star: Vector3, target: Vector3) {
  const direction = target.subtract(star);
  if (direction.lengthSquared() > 1e-8) light.direction.copyFrom(direction.normalize());
  light.diffuse.copyFromFloats(1, .87, .61);
}
export async function createYellowStarRuntime(scene: Scene, options: {
  bodyId: string; radius: number; signal: AbortSignal; url?: string;
}) {
  const root = new TransformNode(`yellow-star:${options.bodyId}`, scene);
  root.metadata = { role: 'environment', bodyId: options.bodyId, celestialKind: 'star' };
  root.setEnabled(false);
  let container: Awaited<ReturnType<typeof SceneLoader.LoadAssetContainerAsync>> | undefined;
  let disposed = false;
  let corona: ReturnType<typeof createStellarCorona> | undefined;
  const dispose = () => {
    if (disposed) return; disposed = true;
    options.signal.removeEventListener('abort', dispose);
    scene.onDisposeObservable.remove(onDispose);
    corona?.dispose(); container?.dispose(); root.dispose();
  };
  const onDispose = scene.onDisposeObservable.add(dispose);
  options.signal.addEventListener('abort', dispose, { once: true });
  try {
    if (options.signal.aborted) throw new Error('Star load cancelled');
    container = await SceneLoader.LoadAssetContainerAsync('', options.url ?? YELLOW_STAR_ASSET, scene);
    if (disposed || options.signal.aborted || scene.isDisposed) { container.dispose(); throw new Error('Star load cancelled'); }
    container.addAllToScene();
    for (const node of container.rootNodes) node.parent = root;
    root.scaling.setAll(options.radius);
    const flares: { node: TransformNode; phase: number; period: number; base: Vector3 }[] = [];
    for (const node of [...container.transformNodes, ...container.meshes]) {
      const own = node.metadata?.gltf?.extras ?? {};
      let extra = own;
      for (let parent = node.parent; !extra.partId && parent; parent = parent.parent)
        extra = parent.metadata?.gltf?.extras ?? extra;
      if (Number.isFinite(own.flarePhase) && Number.isFinite(own.flarePeriod) && own.flarePeriod > 0)
        flares.push({ node, phase: extra.flarePhase, period: extra.flarePeriod, base: new Vector3(extra.flareBaseScale?.[0] ?? 1, extra.flareBaseScale?.[2] ?? 1, extra.flareBaseScale?.[1] ?? 1) });
      node.metadata = { ...node.metadata, role: 'environment', bodyId: options.bodyId, celestialKind: 'star', stellarFlare: Number.isFinite(extra.flarePhase),
        partId: `${options.bodyId}:${extra.partId ?? 'photosphere'}` };
      if (node instanceof Mesh && node.getTotalIndices()) {
        node.metadata.trianglePlacementRanges = [{ firstTriangle: 0, triangleCount: node.getTotalIndices() / 3, partId: node.metadata.partId }];
        node.isPickable = false;
        if (node.material) await node.material.forceCompilationAsync(node);
        if (disposed || options.signal.aborted) throw new Error('Star load cancelled');
      }
    }
    corona = createStellarCorona(scene, options.bodyId); corona.mesh.parent = root;
    await corona.material.forceCompilationAsync(corona.mesh);
    if (disposed || options.signal.aborted) throw new Error('Star load cancelled');
    return { root, meshes: container.meshes, flareCount: flares.length,
      update(time: number) { if (!disposed) { corona?.update(time); for (const flare of flares) flare.node.scaling.copyFrom(flareScale(time, flare.phase, flare.period).multiply(flare.base)); } },
      dispose };
  } catch (error) { dispose(); throw error; }
}
