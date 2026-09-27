import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {Material} from '@babylonjs/core/Materials/material';
import type {PlanetRecipe} from '../../../../content/src/environment';
import type {PackedPlanetGeometry} from '../planet-build';
import {createPlanetSmoke} from '../planet-smoke';
/** Isolated compatibility adapter. Retained LOD parents control visibility;
 * one original PBR material is shared and disposed with the candidate cache. */
export function referenceVolcanicSmokeRuntime(scene:Scene,bodyId:string,recipe:PlanetRecipe){
 let shared:Material|undefined;const meshes:Mesh[]=[];
 return {
  attach(parent:TransformNode,lod:0|1|2,prepared:PackedPlanetGeometry|undefined){
   if(recipe.style!=='volcanic'||!prepared)return undefined;
   const mesh=createPlanetSmoke(scene,`${bodyId}-lod-${lod}`,recipe,lod,prepared);if(!mesh)return undefined;
   const candidate=mesh.material!;if(shared){mesh.material=shared;candidate.dispose();}else shared=candidate;
   mesh.parent=parent;mesh.metadata={...mesh.metadata,role:'planet',style:'volcanic',planetWeather:true,lod,smokeImplemented:true,smokeSource:'existing-planet-smoke',trianglePlacementRanges:[{firstTriangle:0,triangleCount:prepared.indices.length/3,partId:`${bodyId}:${recipe.seed}:smoke`}]};meshes.push(mesh);return mesh;
  },
  stats(){const active=meshes.filter(mesh=>!mesh.isDisposed()&&mesh.isEnabled());return{smokeImplemented:true,smokeMeshes:active.length,smokeTriangles:active.reduce((n,mesh)=>n+mesh.getTotalIndices()/3,0),retainedSmokeMeshes:meshes.filter(mesh=>!mesh.isDisposed()).length};},
  dispose(){for(const mesh of meshes)if(!mesh.isDisposed())mesh.dispose(false,false);shared?.dispose();shared=undefined;}
 };
}
