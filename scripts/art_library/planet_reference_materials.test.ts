import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {referenceMaterial} from './planet_reference_materials';
it('preserves authored native PBR optical values without retinting',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{const material=referenceMaterial(scene,{name:'crystal-edge',linearColor:[.1,.2,.3],roughness:.17,metallic:.04,emissiveColor:[.7,.1,.3],emissiveStrength:.7,ior:1.48});expect(material.albedoColor.asArray()).toEqual([.1,.2,.3]);expect(material.roughness).toBe(.17);expect(material.metallic).toBe(.04);expect(material.emissiveColor.asArray()).toEqual([.7,.1,.3]);expect(material.emissiveIntensity).toBe(.7);expect(material.indexOfRefraction).toBe(1.48);}finally{scene.dispose();engine.dispose();}
});
it('preserves authored ring transparency rather than turning dust into opaque plates',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{const material=referenceMaterial(scene,{name:'dust',linearColor:[.3,.1,.4],roughness:.9,alpha:.65,alphaMode:'BLEND',doubleSided:true,useTextureAlpha:true});expect(material.alpha).toBe(.65);expect(material.backFaceCulling).toBe(false);expect(material.useAlphaFromAlbedoTexture).toBe(true);expect(material.needAlphaBlending()).toBe(true);}finally{scene.dispose();engine.dispose();}
});
it('preserves ice and water authored clearcoat without changing underlying albedo',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{const ice=referenceMaterial(scene,{name:'ice',linearColor:[.1,.4,.7],roughness:.3,ior:1.31,clearcoatFactor:.42,clearcoatRoughnessFactor:.1}),water=referenceMaterial(scene,{name:'water',linearColor:[.01,.1,.3],roughness:.16,clearCoat:{intensity:.3,roughness:.1}});expect(ice.clearCoat.isEnabled).toBe(true);expect(ice.clearCoat.intensity).toBe(.42);expect(ice.clearCoat.roughness).toBe(.1);expect(ice.indexOfRefraction).toBe(1.31);expect(water.clearCoat.intensity).toBe(.3);expect(water.albedoColor.asArray()).toEqual([.01,.1,.3]);}finally{scene.dispose();engine.dispose();}
});

it('preserves glTF double-sided illumination as well as visibility',()=>{const engine=new NullEngine(),scene=new Scene(engine);const material=referenceMaterial(scene,{name:'ring',linearColor:[1,1,1],roughness:.86,doubleSided:true});expect(material.backFaceCulling).toBe(false);expect(material.twoSidedLighting).toBe(true);scene.dispose();engine.dispose();});
