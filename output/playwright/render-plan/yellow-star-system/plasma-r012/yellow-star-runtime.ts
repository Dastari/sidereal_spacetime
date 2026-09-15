import {
  StellarConvection,
  StellarEjectaRadiance,
  stellarEjectaState,
} from "./stellar-convection";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createReviewedUploadLifetime } from "./reviewed-native/upload-lifetime";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { REVIEWED_YELLOW_STAR } from "./reviewed-star-catalog";
import { createStellarCorona } from "./stellar-corona";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/loaders/glTF";

export const YELLOW_STAR_ASSET = REVIEWED_YELLOW_STAR.url;
export function flareScale(time: number, phase: number, period: number) {
  const pulse = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / period + phase);
  return new Vector3(
    0.95 + 0.5 * pulse,
    0.25 + 1.05 * pulse ** 4,
    0.95 + 0.5 * pulse,
  );
}
/** The existing primary light remains the sole system sun and obeys scene/F3 lighting.
 * Coordinates supplied here are already camera-relative renderer coordinates. */
export function orientStellarLight(
  light: DirectionalLight,
  star: Vector3,
  target: Vector3,
) {
  const direction = target.subtract(star);
  if (direction.lengthSquared() > 1e-8)
    light.direction.copyFrom(direction.normalize());
  light.diffuse.copyFromFloats(1, 0.87, 0.61);
}
export async function createYellowStarRuntime(
  scene: Scene,
  options: {
    bodyId: string;
    radius: number;
    signal: AbortSignal;
    url?: string;
  },
) {
  const root = new TransformNode(`yellow-star:${options.bodyId}`, scene);
  root.metadata = {
    role: "environment",
    bodyId: options.bodyId,
    celestialKind: "star",
  };
  root.setEnabled(false);
  let container:
    Awaited<ReturnType<typeof SceneLoader.LoadAssetContainerAsync>> | undefined;
  let disposed = false;
  const lifetime = createReviewedUploadLifetime();
  let corona: ReturnType<typeof createStellarCorona> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal.removeEventListener("abort", dispose);
    scene.onDisposeObservable.remove(onDispose);
    lifetime.dispose();
    corona?.dispose();
    container?.dispose();
    root.dispose();
  };
  const onDispose = scene.onDisposeObservable.add(dispose);
  options.signal.addEventListener("abort", dispose, { once: true });
  try {
    if (options.signal.aborted) throw new Error("Star load cancelled");
    const loading = (async () => {
      const response = await fetch(options.url ?? YELLOW_STAR_ASSET, {
        signal: options.signal,
      });
      if (!response.ok) throw new Error(`Star asset HTTP ${response.status}`);
      if (Number(response.headers.get("content-length") ?? 0) > 8 * 1024 * 1024)
        throw new Error("Star asset exceeds byte budget");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.byteLength > 8 * 1024 * 1024 ||
        bytesToHex(sha256(bytes)) !== REVIEWED_YELLOW_STAR.sha256
      )
        throw new Error("Star asset hash mismatch");
      lifetime.check();
      const asset = await SceneLoader.LoadAssetContainerAsync(
        "",
        bytes,
        scene,
        undefined,
        ".glb",
      );
      if (disposed) asset.dispose();
      return asset;
    })();
    container = await lifetime.wait(loading);
    if (disposed || options.signal.aborted || scene.isDisposed) {
      container.dispose();
      throw new Error("Star load cancelled");
    }
    container.addAllToScene();
    for (const node of container.rootNodes) node.parent = root;
    root.scaling.setAll(options.radius);
    // The star's calibrated highlight response is shared by its native materials,
    // independent of the planet preview's scene settings. PBR channels stay intact.
    const processing = new ImageProcessingConfiguration();
    processing.toneMappingEnabled = true;
    processing.toneMappingType = 1;
    processing.exposure = 0.75;
    for (const material of container.materials)
      if (material instanceof PBRMaterial)
        material.imageProcessingConfiguration = processing;
    for (const material of container.materials)
      if (
        material instanceof PBRMaterial &&
        material.name === "Flare golden core"
      )
        new StellarEjectaRadiance(material);
    const convection: StellarConvection[] = [];
    for (const material of container.materials) {
      if (
        material instanceof PBRMaterial &&
        [
          "Golden photosphere",
          "Yellow raised granules",
          "Amber relief sides",
          "White yellow hot fissures",
        ].includes(material.name)
      )
        convection.push(new StellarConvection(material));
    }
    const ejecta: {
      node: TransformNode;
      direction: Vector3;
      base: Vector3;
      phase: number;
      period: number;
      meshes: Mesh[];
    }[] = [];
    const flares: {
      node: TransformNode;
      phase: number;
      period: number;
      base: Vector3;
      rotation: Quaternion;
    }[] = [];
    for (const node of [...container.transformNodes, ...container.meshes]) {
      const own = node.metadata?.gltf?.extras ?? {};
      let extra = own;
      for (
        let parent = node.parent;
        !extra.partId && parent;
        parent = parent.parent
      )
        extra = parent.metadata?.gltf?.extras ?? extra;
      if (
        Number.isFinite(own.flarePhase) &&
        Number.isFinite(own.flarePeriod) &&
        own.flarePeriod > 0
      )
        flares.push({
          node,
          phase: extra.flarePhase,
          period: extra.flarePeriod,
          rotation: node.rotationQuaternion?.clone() ?? Quaternion.Identity(),
          base: new Vector3(
            extra.flareBaseScale?.[0] ?? 1,
            extra.flareBaseScale?.[2] ?? 1,
            extra.flareBaseScale?.[1] ?? 1,
          ),
        });
      if (typeof own.partId === "string" && own.partId.startsWith("ejecta-"))
        ejecta.push({
          node,
          direction: node.position.normalizeToNew(),
          base: node.scaling.clone(),
          phase: ejecta.length * 0.61803398875,
          period: 4.8,
          meshes: [],
        });
      node.metadata = {
        ...node.metadata,
        role: "environment",
        bodyId: options.bodyId,
        celestialKind: "star",
        stellarFlare: Number.isFinite(extra.flarePhase),
        partId: `${options.bodyId}:${extra.partId ?? "photosphere"}`,
      };
      if (node instanceof Mesh && node.getTotalIndices()) {
        node.metadata.trianglePlacementRanges = [
          {
            firstTriangle: 0,
            triangleCount: node.getTotalIndices() / 3,
            partId: node.metadata.partId,
          },
        ];
        node.isPickable = false;
        if (node.material)
          await lifetime.wait(node.material.forceCompilationAsync(node));
        if (disposed || options.signal.aborted)
          throw new Error("Star load cancelled");
      }
    }
    for (const parcel of ejecta) {
      const flare = flares.reduce<(typeof flares)[number] | undefined>(
        (best, next) =>
          !best ||
          Vector3.Dot(next.node.position.normalizeToNew(), parcel.direction) >
            Vector3.Dot(best.node.position.normalizeToNew(), parcel.direction)
            ? next
            : best,
        undefined,
      );
      if (flare) {
        parcel.direction.copyFrom(flare.node.position.normalizeToNew());
        parcel.phase = flare.phase / (Math.PI * 2) - 0.25;
        parcel.period = flare.period;
      }
      parcel.meshes = [parcel.node, ...parcel.node.getChildMeshes()].filter(
        (node): node is Mesh => node instanceof Mesh,
      );
      for (const mesh of parcel.meshes)
        mesh.metadata = {
          ...mesh.metadata,
          stellarEjecta: true,
          stellarEjectaProgress: 0,
        };
    }
    corona = createStellarCorona(scene, options.bodyId);
    corona.mesh.parent = root;
    await lifetime.wait(corona.material.forceCompilationAsync(corona.mesh));
    if (disposed || options.signal.aborted)
      throw new Error("Star load cancelled");
    return {
      root,
      meshes: container.meshes,
      flareCount: flares.length,
      ejectaCount: ejecta.length,
      convectionMaterials: convection.length,
      update(time: number) {
        if (!disposed) {
          corona?.update(time);
          for (const effect of convection) effect.time = time;
          for (const flare of flares) {
            flare.node.scaling.copyFrom(
              flareScale(time, flare.phase, flare.period).multiply(flare.base),
            );
            flare.node.rotationQuaternion = flare.rotation.multiply(
              Quaternion.RotationAxis(
                Vector3.Forward(),
                0.18 * Math.sin(time * 1.3 + flare.phase),
              ),
            );
          }
          for (const parcel of ejecta) {
            const state = stellarEjectaState(time, parcel.phase, parcel.period);
            for (const mesh of parcel.meshes)
              mesh.metadata.stellarEjectaProgress = state.progress;
            parcel.node.position.copyFrom(
              parcel.direction.scale(state.distance),
            );
            parcel.node.position.x += state.bend * parcel.direction.y;
            parcel.node.scaling.copyFrom(parcel.base.scale(state.size * 1.6));
          }
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
