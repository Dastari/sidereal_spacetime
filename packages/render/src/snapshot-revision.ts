import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";

const materialFields = ["alpha","transparencyMode","backFaceCulling","sideOrientation","disableDepthWrite",
  "fillMode","zOffset","zOffsetUnits","maxSimultaneousLights","emissiveIntensity","roughness","metallic",
  "microSurface","environmentIntensity","albedoColor","diffuseColor","specularColor","emissiveColor","ambientColor",
  "albedoTexture","diffuseTexture","bumpTexture","opacityTexture","reflectionTexture","refractionTexture",
  "emissiveTexture","metallicTexture","ambientTexture","lightmapTexture"];
const shaderFields = ["_texture","_float","_int","_uint","_color","_vector","_quaternion","_matri"];

/** Reused scalar snapshots: GPU bundle resources and draw membership must remain
 * identical. Pose matrices for crew are updated by Babylon's snapshot helper. */
export function createSnapshotRevision(onGeometryChange?:()=>void) {
  const values: unknown[] = [];
  let cursor = 0, changed = false, revision = 0, geometryRevision = 0, epoch = 0;
  const geometries = new Map<Geometry, {seen:number;previous:Geometry["onGeometryUpdated"];callback:Geometry["onGeometryUpdated"]}>();
  const take = (value: unknown) => { if (!Object.is(values[cursor],value)) changed = true; values[cursor++] = value; };
  const target = (texture:RenderTargetTexture) => {
    take(texture.uniqueId);take(texture.samples);take(texture.refreshRate);
    // A refreshed render-once map changes the pass sequence. Its unbounded
    // idle counter does not; periodic maps require a fresh sequence per frame.
    take(texture.refreshRate === 0 ? texture.currentRefreshId < 0 : texture.refreshRate > 1 ? texture.currentRefreshId : undefined);
    take(texture.renderList?.length);for(const mesh of texture.renderList ?? [])take(mesh.uniqueId);
  };
  const value = (input: unknown) => {
    if (!input || typeof input !== "object") { take(input); return; }
    const v = input as Record<string, any>;
    if (typeof v.getInternalTexture === "function") { take(v.uniqueId); take(v.getInternalTexture()?.uniqueId); return; }
    if (v.m && (Array.isArray(v.m) || ArrayBuffer.isView(v.m))) { for (const n of v.m as Float32Array) take(n); return; }
    if (typeof v.x === "number" && typeof v.y === "number") { take(v.x);take(v.y);take(v.z);take(v.w);return; }
    if (typeof v.r === "number") {take(v.r);take(v.g);take(v.b);take(v.a);return;}
    if (Array.isArray(input) || ArrayBuffer.isView(input)) {
      const array = input as ArrayLike<unknown>; take(array.length);
      for (let i=0;i<array.length;i++) value(array[i]);
      return;
    }
    for (const key in v) if (Object.hasOwn(v,key)) {take(key);value(v[key]);}
  };
  return {
    capture(scene: Scene, displayRevision: number) {
      cursor = 0; changed = false; epoch++;
      const camera = scene.activeCamera;
      take(camera?.uniqueId); value(camera?.getViewMatrix()); value(camera?.getProjectionMatrix());
      take(camera?.layerMask);take(scene.getEngine().getRenderWidth());take(scene.getEngine().getRenderHeight());
      take(scene.lightsEnabled);take(scene.shadowsEnabled);take(scene.texturesEnabled);take(scene.renderTargetsEnabled);
      take(scene.environmentIntensity);value(scene.environmentTexture);
      take(scene.meshes.length);take(displayRevision);
      for (const mesh of scene.meshes) {
        take(mesh.uniqueId);take(mesh.parent?.uniqueId);take(mesh.isEnabled());take(mesh.isVisible);take(mesh.visibility);
        take(mesh.layerMask);take(mesh.renderingGroupId);take(mesh.receiveShadows);take(mesh.cullingStrategy);
        take(mesh.alphaIndex);take(mesh.alwaysSelectAsActiveMesh);take(mesh.infiniteDistance);take(mesh.billboardMode);
        take(mesh.skeleton?.uniqueId);take(mesh.computeBonesUsingShaders);take(mesh.morphTargetManager?.uniqueId);
        take(mesh.metadata?.role);take(mesh.metadata?.partId);take(mesh.metadata?.deckId);take(mesh.metadata?.snapshotRevision);
        take(mesh.getTotalVertices());take(mesh.getTotalIndices());take((mesh as Mesh).thinInstanceCount);
        const geometry = mesh instanceof Mesh ? mesh.geometry : mesh instanceof InstancedMesh ? mesh.sourceMesh.geometry : null;
        take(geometry?.uniqueId);
        if (geometry) {
          let observed = geometries.get(geometry);
          if (!observed) {
            const previous = geometry.onGeometryUpdated;
            const callback: Geometry["onGeometryUpdated"] = (...args) => {previous?.(...args);geometryRevision++;onGeometryChange?.();};
            observed = {seen:epoch,previous,callback};geometries.set(geometry,observed);geometry.onGeometryUpdated=callback;
          }
          observed.seen = epoch;
        }
        if (mesh.isEnabled() && mesh.isVisible && mesh.metadata?.role !== "crew") value(mesh.computeWorldMatrix());
        if (mesh.metadata?.role === "crew") take(camera?.isInFrustum(mesh));
        take(mesh.subMeshes?.length);
        for(const sub of mesh.subMeshes ?? []){
          take(sub.indexStart);take(sub.indexCount);take(sub.verticesStart);take(sub.verticesCount);take(sub.materialIndex);
          const material = sub.getMaterial() as unknown as Record<string,any> | null;
          take(material?.uniqueId);
          if (material && mesh.isEnabled() && mesh.isVisible) {
            for (const field of materialFields) value(material[field]);
            if (material.getClassName() === "ShaderMaterial")
              for (const field in material) if (shaderFields.some(prefix=>field.startsWith(prefix))) {take(field);value(material[field]);}
            const targets=material.getRenderTargetTextures?.();take(targets?.length ?? 0);
            for(let i=0;i<(targets?.length ?? 0);i++)target(targets.data[i]);
          }
        }
      }
      for (const [geometry, observed] of geometries) if (observed.seen !== epoch) {
        if (geometry.onGeometryUpdated === observed.callback) geometry.onGeometryUpdated = observed.previous;
        geometries.delete(geometry);
      }
      take(geometryRevision);take(scene.lights.length);
      for (const light of scene.lights) {
        const source = light as unknown as Record<string,any>;
        take(light.uniqueId);take(light.isEnabled());take(light.shadowEnabled);take(light.intensity);
        const shadowMap=light.getShadowGenerator()?.getShadowMap();take(shadowMap?.uniqueId);if(shadowMap)target(shadowMap);
        value(source.position);value(source.direction);value(light.diffuse);value(light.specular);
        for (const meshes of [light.includedOnlyMeshes, light.excludedMeshes, light.getShadowGenerator()?.getShadowMap()?.renderList ?? []]) {
          take(meshes.length);for (const mesh of meshes) take(mesh.uniqueId);
        }
      }
      take(scene.customRenderTargets.length);
      for (const texture of scene.customRenderTargets) target(texture);
      take(camera?.customRenderTargets.length);for(const texture of camera?.customRenderTargets ?? [])target(texture);
      take(camera?._postProcesses.length);take(scene.effectLayers?.length);
      for (const pass of camera?._postProcesses ?? []) {take(pass?.uniqueId);take(pass?.samples);}
      for (const layer of scene.effectLayers ?? []) {take(layer.uniqueId);take(layer.isEnabled);
        for(const mesh of scene.meshes)take(layer.hasMesh(mesh));}
      if (cursor !== values.length) changed = true;
      values.length = cursor;
      if (changed) revision++;
      return revision;
    },
    dispose() {
      for (const [geometry, observed] of geometries)
        if (geometry.onGeometryUpdated === observed.callback) geometry.onGeometryUpdated = observed.previous;
      geometries.clear();values.length=0;
    },
  };
}
