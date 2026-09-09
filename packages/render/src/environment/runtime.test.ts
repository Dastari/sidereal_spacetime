import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createSpaceEnvironment, type SpaceBodyState } from "./index";
import { planetRecipe } from "../../../content/src/environment";
afterEach(() => {vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("world planet admission and local origin", () => {
  it("keeps authoritative world placement, rebuilds changed same-id recipes and releases removed meshes", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    vi.spyOn(SceneLoader, "ImportMeshAsync").mockResolvedValue({
      meshes: [CreateBox("source", { size: 1 }, scene)],
      particleSystems: [],
      skeletons: [],
      animationGroups: [],
      transformNodes: [],
      geometries: [],
      lights: [],
      spriteManagers: [],
    });
    const environment = createSpaceEnvironment(scene);
    await environment.ready;
    const body: SpaceBodyState = {
      id: "authorized",
      kind: "planet",
      appearance: "temperate",
      x: 1e12 + 10,
      y: 2e12 + 30,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      height: -45,
      radius: 18,
      seed: 17,
      recipe: {
        ...planetRecipe("temperate", 17),
        resolution: 12,
        cloudCoverage: 0,
      },
    };
    const options = {
      id: "orion-veil",
      x: 1e12,
      y: 2e12,
      dt: 0.05,
      enabled: true,
      reducedMotion: true,
      bodies: [body],
    };
    environment.update(options);
    const node = scene.getTransformNodeByName("world-body-authorized")!;
    expect(node.position.asArray()).toEqual([10, -45, -30]);
    const first = scene.getMeshByName("authorized-terraces")!;
    environment.update({ ...options, x: 1e12 + 5 });
    expect(node.position.asArray()).toEqual([5, -45, -30]);
    expect(scene.getMeshByName(first.name)).toBe(first);
    const resourceCounts = [scene.meshes.length, scene.materials.length, scene.geometries.length];
    environment.update({ ...options, planetsEnabled: false });
    expect(node.isEnabled()).toBe(false);
    expect(first.isEnabled()).toBe(false);
    expect(first.isDisposed()).toBe(false);
    expect([scene.meshes.length, scene.materials.length, scene.geometries.length]).toEqual(resourceCounts);
    environment.update({ ...options, planetsEnabled: true });
    expect(node.isEnabled()).toBe(true);
    expect(scene.getMeshByName(first.name)).toBe(first);
    expect([scene.meshes.length, scene.materials.length, scene.geometries.length]).toEqual(resourceCounts);
    environment.update({
      ...options,
      bodies: [{ ...body, recipe: { ...body.recipe!, seaLevel: 0.8 } }],
    });
    expect(first.isDisposed()).toBe(true);
    const replacement = scene.getMeshByName(first.name)!;
    expect(replacement).not.toBe(first);
    environment.update({ ...options, bodies: [] });
    expect(replacement.isDisposed()).toBe(true);
    environment.dispose();
    scene.dispose();
    engine.dispose();
  });
});

it("replaces same-ID fallback ice when native assets finish loading without moving the admitted body",async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 vi.spyOn(SceneLoader,"ImportMeshAsync").mockResolvedValue({meshes:[CreateBox("source",{size:1},scene)],particleSystems:[],skeletons:[],animationGroups:[],transformNodes:[],geometries:[],lights:[],spriteManagers:[]});
 let resolveKit!:(value:Response)=>void;
 vi.stubGlobal("fetch",vi.fn((url:string)=>url.includes("ice-r015")?new Promise<Response>(resolve=>{resolveKit=resolve;}):Promise.resolve(new Response("unavailable",{status:404}))));
 const environment=createSpaceEnvironment(scene),recipe={...planetRecipe("ice",47),resolution:12};
 const body:SpaceBodyState={id:"frost",kind:"planet",appearance:"ice",seed:47,x:100,y:200,height:-180,radius:70,vx:0,vy:0,heading:0,omega:0,recipe};
 const options={id:"orion-veil",x:90,y:190,dt:0,enabled:true,reducedMotion:true,bodies:[body]};
 environment.update(options);const old=scene.getTransformNodeByName("world-body-frost")!;
 const form={positions:[-.5,-.5,-.4,.5,-.5,-.4,.5,.5,.4,-.5,.5,.4],indices:[0,1,2,0,2,3],triangleMaterials:[0,0]};
 resolveKit(new Response(JSON.stringify({schema:"sidereal.native-planet-kit.v1",layout:"glacial-interior",materials:[{name:"snow",linearColor:[1,1,1],roughness:.83}],variants:["snow-a","snow-b","snow-c","ice-a","ice-b","floor","sealing-core"].map(name=>({...form,name}))})));
 await environment.ready;environment.update(options);
 const current=scene.getTransformNodeByName("world-body-frost")!;
 expect(old.isDisposed()).toBe(true);expect(current.position.asArray()).toEqual([10,-180,-10]);
 expect(scene.getTransformNodeByName("frost-native-ice")?.metadata.nativeRevision).toBe("ice-r015");
 const meshes=current.getChildMeshes();environment.update({...options,planetsEnabled:false});environment.update(options);
 expect(current.getChildMeshes()).toEqual(meshes);expect(body.x).toBe(100);expect(body.y).toBe(200);
 environment.dispose();scene.dispose();engine.dispose();
});


it("replaces same-ID volcanic fallback after its own kit arrives and preserves presentation resources",async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 vi.spyOn(SceneLoader,"ImportMeshAsync").mockResolvedValue({meshes:[CreateBox("source",{size:1},scene)],particleSystems:[],skeletons:[],animationGroups:[],transformNodes:[],geometries:[],lights:[],spriteManagers:[]});
 let resolveKit!:(value:Response)=>void;
 vi.stubGlobal("fetch",vi.fn((url:string)=>url.includes("volcanic-r018")?new Promise<Response>(resolve=>{resolveKit=resolve;}):Promise.resolve(new Response("unavailable",{status:404}))));
 const environment=createSpaceEnvironment(scene),recipe={...planetRecipe("volcanic",89),resolution:12};
 const body:SpaceBodyState={id:"cinder",kind:"planet",appearance:"volcanic",seed:89,x:1700,y:-3800,height:-155,radius:62,vx:0,vy:0,heading:0,omega:0,recipe};
 const options={id:"orion-veil",x:1690,y:-3820,dt:0,enabled:true,reducedMotion:true,bodies:[body]};
 environment.update(options);const old=scene.getTransformNodeByName("world-body-cinder")!;
 const names=["a","b","c","pillar","crater","molten-core","sealing-core","fall","macro-a","macro-b","basin"];
 const kit={schema:"sidereal.native-planet-kit.v1",layout:"volcanic-geology",materials:Array.from({length:6},(_,i)=>({name:`role${i}`,linearColor:[.1,.04,.02],roughness:.4})),variants:names.map((name,i)=>({name,positions:[0,0,.5,.4,0,-.5,0,.4,-.5],indices:[0,1,2],triangleMaterials:[i===5?3:i===10?5:0]}))};
 resolveKit(new Response(JSON.stringify(kit)));await environment.ready;environment.update(options);
 const current=scene.getTransformNodeByName("world-body-cinder")!;
 expect(old.isDisposed()).toBe(true);expect(current.position.asArray()).toEqual([10,-155,-20]);
 expect(scene.getTransformNodeByName("cinder-native-volcanic")?.metadata.nativeRevision).toBe("volcanic-r018");
 const meshes=current.getChildMeshes(),counts=[scene.meshes.length,scene.materials.length,scene.geometries.length];
 environment.update({...options,planetsEnabled:false});environment.update(options);
 expect(current.getChildMeshes()).toEqual(meshes);expect([scene.meshes.length,scene.materials.length,scene.geometries.length]).toEqual(counts);
 expect([body.x,body.y,body.height,body.radius]).toEqual([1700,-3800,-155,62]);
 environment.update({...options,bodies:[]});expect(current.isDisposed()).toBe(true);
 environment.dispose();scene.dispose();engine.dispose();
});
