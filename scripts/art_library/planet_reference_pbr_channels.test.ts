import {referenceDirectPaths,referenceAssetPath} from './planet_reference_direct_paths';
import {expect,it}from'vitest';
import {readFileSync}from'node:fs';
import ts from'typescript';
import {NullEngine}from'@babylonjs/core/Engines/nullEngine';
import {Scene}from'@babylonjs/core/scene';
import {PBRMaterial}from'@babylonjs/core/Materials/PBR/pbrMaterial';
import {Texture}from'@babylonjs/core/Materials/Textures/texture';
import {PBRMaterialLoadingAdapter}from'@babylonjs/loaders/glTF/2.0/pbrMaterialLoadingAdapter';
import {referenceMaterial,type ReferenceMaterialRole}from'./planet_reference_materials';
function fixture(){const engine=new NullEngine(),scene=new Scene(engine);return{scene,dispose(){scene.dispose();engine.dispose();}};}
/** Execute the actual candidate's private binding block, without browser/network.
 * A texture surrogate completes its load callback in a microtask; all cache,
 * gamma, handedness and channel assignments remain the root source code. */
async function bindActualCandidate(scene:Scene,roles:ReferenceMaterialRole[]){
 const source=readFileSync('scripts/art_library/planet_reference_candidate.ts','utf8'),start=source.indexOf(' const texturePromises='),end=source.indexOf(' const nativeToxicFog=',start);
 if(start<0||end<0)throw new Error('Candidate texture binding boundary changed; review test adapter');
 class LoadedTexture extends Texture{constructor(_url:string,sc:Scene,noMipmap:boolean,invertY:boolean,sampling:number,onLoad:()=>void){super(null,sc,noMipmap,invertY,sampling);queueMicrotask(onLoad);}}
 const materials=roles.map(role=>referenceMaterial(scene,role));
 const js=ts.transpileModule(`async function bind(){${source.slice(start,end)}} return bind();`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 await new Function('Texture','scene','materials','kit','paths','referenceAssetPath',js)(LoadedTexture,scene,materials,{materials:roles},referenceDirectPaths(new URLSearchParams()),referenceAssetPath);return materials;
}
it('matches Babylon glTF scalar colors, roughness, IOR, emission and double-sided lighting',()=>{
 const f=fixture();try{const m=referenceMaterial(f.scene,{name:'authored',linearColor:[.2,.3,.4],roughness:.32,metallic:.04,ior:1.31,emissiveColor:[.05,.1,.02],emissiveStrength:.7,doubleSided:true});expect(m.albedoColor.asArray()).toEqual([.2,.3,.4]);expect(m.roughness).toBe(.32);expect(m.metallic).toBe(.04);expect(m.indexOfRefraction).toBe(1.31);expect(m.emissiveIntensity).toBe(.7);expect(m.twoSidedLighting).toBe(true);expect(m.backFaceCulling).toBe(false);}finally{f.dispose();}
});
it('matches glTF specular antialiasing and clearcoat interface configuration',()=>{
 const f=fixture();try{
  const actual=referenceMaterial(f.scene,{name:'coat',linearColor:[1,1,1],roughness:.3,clearcoatFactor:.42,clearcoatRoughnessFactor:.1}),expected=new PBRMaterial('glTF-adapter',f.scene),adapter=new PBRMaterialLoadingAdapter(expected);adapter.configureCoat();adapter.coatWeight=.42;adapter.coatRoughness=.1;
  expect(actual.enableSpecularAntiAliasing).toBe(expected.enableSpecularAntiAliasing);
  expect(actual.clearCoat.remapF0OnInterfaceChange).toBe(expected.clearCoat.remapF0OnInterfaceChange);expect(actual.clearCoat.useRoughnessFromMainTexture).toBe(expected.clearCoat.useRoughnessFromMainTexture);
 }finally{f.dispose();}
});
it('actual candidate binds sRGB albedo/emission and linear normal/ORM with glTF G/B channels and invertY=false',async()=>{
 const f=fixture();try{
  for(const handedness of [false,true]){f.scene.useRightHandedSystem=handedness;
   const [m]=await bindActualCandidate(f.scene,[{name:'channels',linearColor:[1,1,1],roughness:1,metallic:1,baseColorTexture:'a.png',emissiveTexture:'e.png',normalTexture:'n.png',normalScale:.4,metallicRoughnessTexture:'orm.png',invertY:false}]);
   expect(m.albedoTexture!.gammaSpace).toBe(true);expect(m.emissiveTexture!.gammaSpace).toBe(true);expect(m.bumpTexture!.gammaSpace).toBe(false);expect(m.metallicTexture!.gammaSpace).toBe(false);expect((m.bumpTexture as Texture).invertY).toBe(false);expect(m.bumpTexture!.level).toBe(.4);
   expect(m.invertNormalMapX).toBe(!handedness);expect(m.invertNormalMapY).toBe(handedness);expect(m.useRoughnessFromMetallicTextureGreen).toBe(true);expect(m.useRoughnessFromMetallicTextureAlpha).toBe(false);expect(m.useMetallnessFromMetallicTextureBlue).toBe(true);
  }
 }finally{f.dispose();}
});
it('coat-only normal maps receive glTF handedness inversion too',async()=>{
 const f=fixture();try{for(const handedness of [false,true]){f.scene.useRightHandedSystem=handedness;const [m]=await bindActualCandidate(f.scene,[{name:'coat-only',linearColor:[1,1,1],roughness:.3,clearcoatFactor:.4,clearcoatNormalTexture:'coat.png'}]);expect(m.clearCoat.bumpTexture!.gammaSpace).toBe(false);expect(m.invertNormalMapX).toBe(!handedness);expect(m.invertNormalMapY).toBe(handedness);}}finally{f.dispose();}
});
it('glTF alpha mode governs opaque factor and base-color alpha for MASK/BLEND',async()=>{
 const f=fixture();try{

  for(const alphaMode of ['MASK','BLEND']as const){const[m]=await bindActualCandidate(f.scene,[{name:alphaMode,linearColor:[1,1,1],roughness:.5,baseColorTexture:'alpha.png',alphaMode,alphaCutoff:.3}]);expect(m.albedoTexture!.hasAlpha).toBe(true);expect(m.useAlphaFromAlbedoTexture).toBe(true);expect(m.alphaCutOff).toBe(.3);}
 }finally{f.dispose();}
});
it('glTF OPAQUE forces alpha=1 regardless of base-color alpha factor',()=>{const f=fixture();try{const m=referenceMaterial(f.scene,{name:'opaque',linearColor:[1,1,1],roughness:.5,alphaMode:'OPAQUE',alpha:.2});expect(m.alpha).toBe(1);}finally{f.dispose();}});
