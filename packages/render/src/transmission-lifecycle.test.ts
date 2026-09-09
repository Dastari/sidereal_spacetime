import {expect,test} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Matrix} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {TransmissionHelper} from '@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper';
import {PBRMaterialLoadingAdapter} from '@babylonjs/loaders/glTF/2.0/pbrMaterialLoadingAdapter';
import {maintainSceneTransmission} from './transmission-lifecycle';

test('repairs a disposed shared refraction target and preserves transmission materials',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.setTransformMatrix(Matrix.Identity(),Matrix.Identity());
 const material=new PBRMaterial('visor',scene);material.subSurface.isRefractionEnabled=true;material.subSurface.refractionIntensity=.45;
 const mesh=CreateBox('visor',{},scene);mesh.material=material;
 const helper=new TransmissionHelper({},scene);helper.addMaterialImpl({materialClass:PBRMaterial,adapterClass:PBRMaterialLoadingAdapter});
 await new Promise(resolve=>setTimeout(resolve,0));
 const guard=maintainSceneTransmission(scene),first=helper.getOpaqueTarget()!;
 expect(material.subSurface.refractionTexture).toBe(first);
 first.dispose();expect(first.getRefractionTextureMatrix()).toBeNull();
 guard.repair();const second=helper.getOpaqueTarget()!;
 expect(second).not.toBe(first);expect(second.getInternalTexture()).not.toBeNull();
 expect(material.subSurface.refractionTexture).toBe(second);
 expect(material.subSurface.isRefractionEnabled).toBe(true);expect(material.subSurface.refractionIntensity).toBe(.45);
 expect(second.getRefractionTextureMatrix()).not.toBeNull();
 guard.repair();expect(guard.repairs).toBe(1);
 guard.dispose();second.dispose();guard.repair();expect(guard.repairs).toBe(1);
 scene.dispose();engine.dispose();
});
