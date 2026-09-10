import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";

/** Draw membership only: shader time/uniform animation continues during an
 * active-set freeze. Changed transforms conservatively discard the cached list. */
export function createActiveSetRevision(onGeometryChange?:()=>void) {
  const values:unknown[]=[];
  const geometries=new Map<Geometry,{seen:number;previous:Geometry["onGeometryUpdated"];callback:Geometry["onGeometryUpdated"]}>();
  let cursor=0,changed=false,revision=0,epoch=0,geometryRevision=0;
  const take=(value:unknown)=>{if(!Object.is(values[cursor],value))changed=true;values[cursor++]=value;};
  const matrix=(data:ArrayLike<number>)=>{for(let i=0;i<data.length;i++)take(data[i]);};
  return {
    capture(scene:Scene){
      cursor=0;changed=false;epoch++;
      const camera=scene.activeCamera;take(camera?.uniqueId);take(camera?.layerMask);
      if(camera){matrix(camera.getViewMatrix().m);matrix(camera.getProjectionMatrix().m);}
      take(scene.getEngine().getRenderWidth());take(scene.getEngine().getRenderHeight());
      take(scene.meshes.length);take(scene.activeCameras?.length ?? 0);
      take(scene.lightsEnabled);take(scene.shadowsEnabled);take(scene.texturesEnabled);
      for(const mesh of scene.meshes){
        take(mesh.uniqueId);take(mesh.parent?.uniqueId);take(mesh.isEnabled());take(mesh.isVisible);take(mesh.visibility);
        take(mesh.metadata?.role);take(mesh.metadata?.partId);take(mesh.metadata?.deckId);take(mesh.metadata?.snapshotRevision);
        take(mesh.layerMask);take(mesh.renderingGroupId);take(mesh.alphaIndex);take(mesh.alwaysSelectAsActiveMesh);
        take(mesh.cullingStrategy);take(mesh.receiveShadows);take(mesh.isBlocked);take(mesh.computeBonesUsingShaders);take(mesh.skeleton?.uniqueId);
        take(mesh.morphTargetManager?.uniqueId);take((mesh as Mesh).thinInstanceCount);
        if(mesh.isEnabled()){
          matrix(mesh.computeWorldMatrix().m);
          if(mesh.getTotalVertices()>0){const bounds=mesh.getBoundingInfo();
            for(const point of [bounds.minimum,bounds.maximum,bounds.boundingSphere.centerWorld]){take(point.x);take(point.y);take(point.z);}
            take(bounds.boundingSphere.radiusWorld);
          }
        }
        const geometry=mesh instanceof Mesh?mesh.geometry:mesh instanceof InstancedMesh?mesh.sourceMesh.geometry:null;
        take(geometry?.uniqueId);
        if(geometry){
          let entry=geometries.get(geometry);
          if(!entry){const previous=geometry.onGeometryUpdated;
            const callback:Geometry["onGeometryUpdated"]=(...args)=>{previous?.(...args);geometryRevision++;onGeometryChange?.();};
            entry={seen:epoch,previous,callback};geometries.set(geometry,entry);geometry.onGeometryUpdated=callback;}
          entry.seen=epoch;
        }
        take(mesh.subMeshes?.length);
        for(const sub of mesh.subMeshes ?? []){
          take(sub.indexStart);take(sub.indexCount);take(sub.verticesStart);take(sub.verticesCount);take(sub.materialIndex);
          const material=sub.getMaterial();take(material?.uniqueId);take(material?.alpha);take(material?.transparencyMode);
          take(material?.needAlphaBlendingForMesh(mesh));take(material?.needAlphaTestingForMesh(mesh));
          take(material?.needDepthPrePass);
          const targets=material?.getRenderTargetTextures?.();take(targets?.length ?? 0);
          for(let i=0;i<(targets?.length ?? 0);i++)take(targets!.data[i].uniqueId);
        }
      }
      for(const [geometry,entry] of geometries)if(entry.seen!==epoch){
        if(geometry.onGeometryUpdated===entry.callback)geometry.onGeometryUpdated=entry.previous;geometries.delete(geometry);
      }
      take(geometryRevision);take(scene.customRenderTargets.length);
      for(const target of scene.customRenderTargets){take(target.uniqueId);take(target.samples);}
      take(camera?._postProcesses.length ?? 0);
      for(const pass of camera?._postProcesses ?? []){take(pass?.uniqueId);take(pass?.samples);}
      take(scene.effectLayers?.length ?? 0);
      for(const layer of scene.effectLayers ?? []){take(layer.uniqueId);take(layer.isEnabled);}
      take(scene.particlesEnabled);take(scene.particleSystems.length);
      for(const system of scene.particleSystems){
        take(system.uniqueId);take(system.isStarted());
        const emitter=system.emitter;
        if(emitter && "isEnabled" in emitter){take(emitter.uniqueId);take(emitter.isEnabled());}
        else take(emitter);
      }
      take(scene.spritesEnabled);take(scene.spriteManagers?.length ?? 0);
      for(const manager of scene.spriteManagers ?? [])take(manager.uniqueId);
      take(scene.lights.length);
      for(const light of scene.lights){take(light.uniqueId);take(light.isEnabled());take(light.shadowEnabled);}
      if(values.length!==cursor)changed=true;values.length=cursor;
      if(changed)revision++;return revision;
    },
    dispose(){for(const [geometry,entry] of geometries)if(geometry.onGeometryUpdated===entry.callback)geometry.onGeometryUpdated=entry.previous;
      geometries.clear();values.length=0;},
  };
}
