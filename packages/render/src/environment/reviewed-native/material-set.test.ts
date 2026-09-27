import {expect,test} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {createReviewedMaterialSet} from './material-set';
test('accepts readonly authored headers and shares compatible textures without changing PBR roles',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);const header={layout:'gas-bands-and-rings',materials:[{name:'a',linearColor:[.1,.2,.3],roughness:.8,baseColorTexture:'rock.png'},{name:'b',linearColor:[.4,.5,.6],roughness:.3,baseColorTexture:'rock.png',clearcoatFactor:.4}] as const};
 const set=await createReviewedMaterialSet(scene,{header,textureBaseURL:'/assets/planets/test/'});expect(set.materials[0].albedoTexture).toBe(set.materials[1].albedoTexture);expect(set.materials[0].roughness).toBe(.8);expect(set.materials[1].clearCoat.intensity).toBe(.4);const owned=set.materials[0].albedoTexture!;set.dispose();expect(scene.textures.includes(owned)).toBe(false);expect(scene.materials).toHaveLength(0);expect(scene.textures.every(t=>t===scene.environmentBRDFTexture)).toBe(true);scene.dispose();engine.dispose();
});
test('scene disposal rejects pending texture loads instead of stranding runtime creation',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);const pending=createReviewedMaterialSet(scene,{header:{layout:'gas-bands-and-rings',materials:[{name:'a',linearColor:[1,1,1],roughness:1,baseColorTexture:'pending.png'}]},textureBaseURL:'/assets/planets/test/'});scene.dispose();await expect(pending).rejects.toThrow('cancelled');expect(scene.materials).toHaveLength(0);engine.dispose();
});
