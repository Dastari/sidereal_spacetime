import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import type { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";

/** Exact, allocation-free comparisons after the first frame. No rounded hashes:
 * even small caster/light movements can change a shadow-map texel. */
class ShadowInputs {
  private values: unknown[] = [];
  private cursor = 0;
  changed = false;
  begin() {
    this.cursor = 0;
    this.changed = false;
  }
  add(value: unknown) {
    if (!Object.is(this.values[this.cursor], value)) this.changed = true;
    this.values[this.cursor++] = value;
  }
  matrix(value: Matrix) {
    for (const component of value.m) this.add(component);
  }
  end() {
    if (this.values.length !== this.cursor) this.changed = true;
    this.values.length = this.cursor;
    return this.changed;
  }
}

/** Cache the ship's ordinary directional depth pass, not animated local lights.
 * Runs after scene animation and before RTT selection. Unsupported deformation,
 * alpha textures, custom shaders/lists and multiple cameras render normally.
 * Geometry edits use Babylon's Geometry APIs (the same contract as ship batches).
 */
export function createExteriorShadowCache(
  scene: Scene,
  light: DirectionalLight,
  shadow: ShadowGenerator,
) {
  const inputs = new ShadowInputs();
  const geometries = new Map<
    Geometry,
    {
      previous: Geometry["onGeometryUpdated"];
      observer: Geometry["onGeometryUpdated"];
      visited: number;
    }
  >();
  let revision = 0,
    epoch = 0;
  let map = shadow.getShadowMap();
  let previousRefreshRate = map?.refreshRate;
  const engine = scene.getEngine();
  const restored = engine.onContextRestoredObservable.add(() => revision++);

  function update() {
    const nextMap = shadow.getShadowMap();
    if (!nextMap) return;
    if (nextMap !== map) {
      map = nextMap;
      previousRefreshRate = map.refreshRate;
      revision++;
    }
    const camera = nextMap.activeCamera ?? scene.activeCamera;
    const casters = nextMap.renderList;
    let dynamic =
      !camera ||
      !casters ||
      !!scene.activeCameras?.length ||
      !!camera?.cameraRigMode ||
      !!nextMap.renderListPredicate ||
      !!nextMap.getCustomRenderList ||
      !!scene.customLODSelector ||
      !!light.customProjectionMatrixBuilder ||
      !!shadow.customShaderOptions ||
      !!shadow.customAllowRendering ||
      shadow.onBeforeShadowMapRenderObservable.hasObservers() ||
      shadow.onBeforeShadowMapRenderMeshObservable.hasObservers() ||
      // Only unblurred depth passes (PCF and its low-capability fallbacks).
      !(
        shadow.usePercentageCloserFiltering ||
        shadow.usePoissonSampling ||
        shadow.filter === 0
      );
    inputs.begin();
    inputs.add(map);
    inputs.add(scene.shadowsEnabled);
    inputs.add(scene.renderTargetsEnabled);
    inputs.add(scene.useRightHandedSystem);
    inputs.add(light.isEnabled());
    inputs.add(light.shadowEnabled);
    inputs.add(nextMap.getRenderWidth());
    inputs.add(nextMap.getRenderHeight());
    inputs.add(nextMap.samples);
    inputs.add(nextMap.forceLayerMaskCheck);
    inputs.add(camera);
    if (camera) {
      // Keep camera changes conservative: Babylon's instance activation and
      // readiness paths share camera-dependent state with the main draw pass.
      inputs.matrix(camera.getViewMatrix());
      inputs.matrix(camera.getProjectionMatrix());
      inputs.add(camera.minZ);
      inputs.add(camera.maxZ);
      inputs.add(camera.layerMask);
    }
    inputs.add(shadow.bias);
    inputs.add(shadow.normalBias);
    inputs.add(shadow.depthScale);
    inputs.add(shadow.filter);
    inputs.add(shadow.forceBackFacesOnly);
    inputs.add(shadow.transparencyShadow);
    inputs.add(shadow.enableSoftTransparentShadow);
    // Clip-plane and custom material paths are intentionally uncached.
    if (
      scene.clipPlane ||
      scene.clipPlane2 ||
      scene.clipPlane3 ||
      scene.clipPlane4 ||
      scene.clipPlane5 ||
      scene.clipPlane6
    )
      dynamic = true;
    epoch++;
    for (const mesh of casters ?? []) {
      inputs.add(mesh);
      inputs.add(mesh.isDisposed());
      if (mesh.isDisposed()) continue;
      inputs.matrix(mesh.computeWorldMatrix());
      inputs.add(mesh.isEnabled());
      inputs.add(mesh.isVisible);
      inputs.add(mesh.visibility);
      inputs.add(mesh.layerMask);
      inputs.add(mesh.cullingStrategy);
      inputs.add(mesh.alwaysSelectAsActiveMesh);
      const bounds = mesh.getBoundingInfo().boundingBox;
      inputs.add(bounds.minimum.x);
      inputs.add(bounds.minimum.y);
      inputs.add(bounds.minimum.z);
      inputs.add(bounds.maximum.x);
      inputs.add(bounds.maximum.y);
      inputs.add(bounds.maximum.z);
      const source = mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh;
      if (!(source instanceof Mesh)) {
        dynamic = true;
        continue;
      }
      inputs.add(source);
      inputs.add(source.sideOrientation);
      const geometry = source.geometry;
      inputs.add(geometry);
      if (geometry) {
        let watched = geometries.get(geometry);
        if (!watched) {
          const previous = geometry.onGeometryUpdated;
          const observer: Geometry["onGeometryUpdated"] = (changed, kind) => {
            previous?.(changed, kind);
            revision++;
          };
          watched = { previous, observer, visited: epoch };
          geometries.set(geometry, watched);
          geometry.onGeometryUpdated = observer;
        }
        watched.visited = epoch;
        // Direct buffer writes have no Geometry notification. Dynamic buffers
        // therefore keep normal per-frame rendering, even before their first edit.
        const buffers = geometry.getVertexBuffers();
        for (const kind in buffers)
          if (buffers[kind].isUpdatable()) dynamic = true;
      }
      if (
        source.skeleton ||
        source.morphTargetManager ||
        (mesh === source && source.hasInstances) ||
        source.hasThinInstances ||
        source.bakedVertexAnimationManager?.isEnabled ||
        source.getLODLevels().length ||
        source.forcedInstanceCount
      )
        dynamic = true;
      inputs.add(mesh.subMeshes.length);
      for (const sub of mesh.subMeshes) {
        inputs.add(sub.verticesStart);
        inputs.add(sub.verticesCount);
        inputs.add(sub.indexStart);
        inputs.add(sub.indexCount);
        const material = sub.getMaterial();
        inputs.add(material);
        if (!material) continue;
        inputs.add(material.backFaceCulling);
        inputs.add(material.cullBackFaces);
        inputs.add(material.sideOrientation);
        inputs.add(material.fillMode);
        inputs.add(material.disableDepthWrite);
        inputs.add(material.needDepthPrePass);
        const blended = material.needAlphaBlendingForMesh(mesh);
        const tested = material.needAlphaTestingForMesh(mesh);
        inputs.add(blended);
        inputs.add(tested);
        if (
          tested ||
          (blended && shadow.transparencyShadow) ||
          material.shadowDepthWrapper ||
          material.clipPlane ||
          material.clipPlane2 ||
          material.clipPlane3 ||
          material.clipPlane4 ||
          material.clipPlane5 ||
          material.clipPlane6
        )
          dynamic = true;
      }
    }
    for (const [geometry, watched] of geometries) {
      if (watched.visited === epoch) continue;
      if (geometry.onGeometryUpdated === watched.observer)
        geometry.onGeometryUpdated = watched.previous;
      geometries.delete(geometry);
    }
    // All caster world bounds are now current. Compare the actual Babylon light
    // projection, including automatic depth/extents and parented light motion.
    if (camera) {
      inputs.matrix(shadow.getTransformMatrix());
      inputs.add(light.getDepthMinZ(camera));
      inputs.add(light.getDepthMaxZ(camera));
    }
    inputs.add(revision);
    const changed = inputs.end();
    const refreshRate = dynamic
      ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
      : RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    if (nextMap.refreshRate !== refreshRate) nextMap.refreshRate = refreshRate;
    if (changed || dynamic) nextMap.resetRefreshCounter();
    // Do not reset after rendering: Babylon independently retries unready shaders.
  }
  const before = scene.onBeforeRenderTargetsRenderObservable.add(update);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.onBeforeRenderTargetsRenderObservable.remove(before);
    engine.onContextRestoredObservable.remove(restored);
    for (const [geometry, watched] of geometries)
      if (geometry.onGeometryUpdated === watched.observer)
        geometry.onGeometryUpdated = watched.previous;
    geometries.clear();
    if (map && previousRefreshRate !== undefined)
      map.refreshRate = previousRefreshRate;
  }
  scene.onDisposeObservable.addOnce(dispose);
  return { update, dispose };
}
