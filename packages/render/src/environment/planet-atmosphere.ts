import type {Scene} from "@babylonjs/core/scene";
import type {Color3} from "@babylonjs/core/Maths/math.color";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {CreatePlane} from "@babylonjs/core/Meshes/Builders/planeBuilder";
import {ShaderMaterial} from "@babylonjs/core/Materials/shaderMaterial";
import {Constants} from "@babylonjs/core/Engines/constants";
import {surfaceVertex,planetHaloFragment} from "./shaders";
/** Existing world atmosphere envelope, shared unchanged with native review fixtures. */
export function createPlanetAtmosphere(scene:Scene,name:string,radius:number,color:Color3,strength:number){
 const mesh=CreatePlane(name+"-atmosphere-glow",{size:radius*2.54},scene);
 mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;
 const material=new ShaderMaterial(name+"-atmosphere-material",scene,{vertexSource:surfaceVertex,fragmentSource:planetHaloFragment},{attributes:["position","normal","uv"],uniforms:["world","worldViewProjection","primary","strength"],needAlphaBlending:true});
 material.alphaMode=Constants.ALPHA_ADD;material.backFaceCulling=false;material.disableDepthWrite=true;
 material.setColor3("primary",color);material.setFloat("strength",strength);mesh.material=material;
 return {mesh,material};
}
