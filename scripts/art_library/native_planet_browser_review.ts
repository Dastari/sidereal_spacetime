import { createPlanetSmoke } from "../../packages/render/src/environment/planet-smoke";
import {composeNativeVolcanic} from "../../packages/render/src/environment/native-volcanic-composition";
import {createPlanetAtmosphere} from "../../packages/render/src/environment/planet-atmosphere";
import {planetRecipe,planetEffects} from "../../packages/content/src/environment";
/** Isolated real Babylon draft viewer; imports no app or authoritative state. */
import "@babylonjs/loaders/glTF";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { createNativeVolcanicPlanet } from "../../packages/render/src/environment/native-volcanic-planet";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createPlanetShadows } from "../../packages/render/src/environment/planet-shadows";
import { createSpaceEnvironment } from "../../packages/render/src/environment";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { createNativeIceFinish } from "../../packages/render/src/environment/native-ice-material";
import { createIceMaterial } from "../../packages/render/src/environment/ice-material";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import {
  composeNativePlanet,
  type NativePlanetKit,
} from "../../packages/render/src/environment/native-planet-composition";
export async function nativePlanetReview(
  canvas: HTMLCanvasElement,
  seed: number,
  revision = "ice-r006",
  coverage = 0.55,
  unitOnly = false,
) {
  if (!["live-ice","live-volcanic"].includes(revision) && !/^(ice|volcanic)-r\d{3}$/.test(revision))
    throw new Error("Invalid isolated revision");
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true }),
    scene = new Scene(engine);
  if (revision >= "ice-r013") {
    scene.useRightHandedSystem = true;
    scene.environmentTexture = new HDRCubeTexture("/assets/materials/frontier-workshop.hdr", scene, 128, false, true, false, true);
    scene.environmentIntensity = .28;
  }
  const instrumentation = new SceneInstrumentation(scene);
  scene.clearColor = new Color4(0.01, 0.015, 0.035, 1);
  const camera = new ArcRotateCamera(
    "native-review-camera",
    Math.atan2(4.3, 2.45),
    Math.acos(2.1 / Math.hypot(2.45, 4.3, 2.1)),
    4.8,
    Vector3.Zero(),
    scene,
  );
  camera.fov = 0.52;
  camera.minZ = 0.05;
  const sun = new DirectionalLight(
    "preview-sun",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  sun.intensity = 2.1;
  sun.diffuse = new Color3(0.93, 0.95, 1);
  sun.specular.setAll(0.3);
  sun.radius = 0.25;
  sun.position = new Vector3(3, 5, -2.25);
  const fill = new HemisphericLight("cold-fill", Vector3.Up(), scene);
  fill.intensity = 0.2;
  fill.diffuse = new Color3(0.6, 0.72, 1);
  fill.groundColor = new Color3(0.025, 0.02, 0.06);
  const shadow = new ShadowGenerator(1024, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadow.bias = 0.0001;
  shadow.normalBias = 0.002;
  if (["live-ice","live-volcanic"].includes(revision)) {
    shadow.dispose();
    const environment = createSpaceEnvironment(scene);
    environment.setPrimaryLight(sun);
    await environment.ready;
    environment.update({id:"orion-veil",x:0,y:0,dt:0,enabled:true,reducedMotion:true,bodies:[{id:"catalog-frost-control",kind:"planet",appearance:revision === "live-volcanic"?"volcanic":"ice",seed,x:0,y:0,vx:0,vy:0,heading:0,omega:0,height:0,radius:1}]});
    const body = scene.getTransformNodeByName("world-body-catalog-frost-control")!;
    const meshes = body.getChildMeshes();
    for (const mesh of scene.meshes) if (!meshes.includes(mesh)) mesh.setEnabled(false);
    await scene.whenReadyAsync();
    scene.render();
    const stats = () => ({seed, revision, triangles:meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0), meshes:meshes.length, materials:new Set(meshes.map(m=>m.material)).size,drawCalls:instrumentation.drawCallsCounter.current,activeIndices:scene.getActiveIndices(),shadowMapSize:1024,environment:scene.environmentTexture?.name,environmentReady:scene.environmentTexture?.isReady(),environmentIntensity:scene.environmentIntensity,rightHanded:scene.useRightHandedSystem});
    return {engine,scene,camera,geometry:null,stats,render:()=>scene.render(),dispose:()=>{environment.dispose();instrumentation.dispose();scene.dispose();engine.dispose();}};
  }
  const kit = (await (
    await fetch(
      `/@fs/root/sidereal_spacetime/.runtime/art-library/planets/${revision}/kit.json`,
    )
  ).json()) as NativePlanetKit;
  if(kit.layout==="volcanic-geology"){
    shadow.dispose();
    const planet=createNativeVolcanicPlanet(scene,"native-volcanic",kit,seed,unitOnly?0:2.4,{geometry:unitOnly?composeNativeVolcanic(kit,seed,.55,20,.55,true):undefined}),hero=createPlanetShadows(scene);
    const smoke=unitOnly?undefined:createPlanetSmoke(scene,"native-review",planetRecipe("volcanic",seed),0);if(smoke)smoke.parent=planet.root;
    hero.setPrimaryLight(sun);hero.update([{node:planet.root,radius:1,lod:0}]);
    const glow=new GlowLayer("native-volcanic-glow",scene,{mainTextureRatio:.25,blurKernelSize:24,excludeByDefault:true});glow.intensity=.45;
    for(const mesh of planet.root.getChildMeshes())glow.addIncludedOnlyMesh(mesh as Mesh);
    const atmosphere=createPlanetAtmosphere(scene,"native-review",1,Color3.FromHexString("#ff7429"),planetEffects(planetRecipe("volcanic",seed)).atmosphere);atmosphere.mesh.parent=planet.root;
    await scene.whenReadyAsync();scene.render();
    return {engine,scene,camera,geometry:planet.geometry,stats:()=>({...planet.stats,revision,totalPlanetTriangles:planet.root.getChildMeshes().reduce((sum,mesh)=>sum+mesh.getTotalIndices()/3,0),smokeTriangles:smoke?smoke.getTotalIndices()/3:0,meshes:scene.meshes.length,materials:scene.materials.length,drawCalls:instrumentation.drawCallsCounter.current,activeIndices:scene.getActiveIndices(),shadowMapSize:1024,sharedHeroShadows:true,sharedSmokeLayer:!!smoke,sharedAtmosphereEnvelope:true,environment:scene.environmentTexture?.name,environmentReady:scene.environmentTexture?.isReady(),environmentIntensity:scene.environmentIntensity,rightHanded:scene.useRightHandedSystem}),setSpillEnabled:planet.setSpillEnabled,render:()=>scene.render(),dispose:()=>{hero.dispose();glow.dispose();planet.dispose();instrumentation.dispose();scene.dispose();engine.dispose();}};
  }
  const geometry = composeNativePlanet(kit, seed, coverage, 0.65);
  const nativeRoot = new TransformNode("native-review-root", scene);
  const sharedShadows = revision >= "ice-r014" ? createPlanetShadows(scene) : undefined;
  if (sharedShadows) { shadow.dispose(); sharedShadows.setPrimaryLight(sun); }
  geometry.batches.forEach((batch, i) => {
    if (!batch.indices.length) return;
    const mesh = new Mesh("native-" + kit.materials[i].name, scene),
      data = new VertexData();
    data.positions = batch.positions;
    data.normals = batch.normals;
    data.indices = batch.indices;
    data.applyToMesh(mesh);
    const role = kit.materials[i],
      material = revision >= "ice-r015" ? createNativeIceFinish(scene,role.name,i===0) : revision >= "ice-r010" && i > 0 ? createIceMaterial(scene, role.name) : new PBRMaterial(role.name, scene);
    if (revision >= "ice-r015" || (revision >= "ice-r010" && i > 0)) {
      const optics: number[] = [];
      for (let v = 0; v < batch.positions.length; v += 3) {
        const radius = Math.hypot(...batch.positions.slice(v, v + 3));
        optics.push(Math.max(0, Math.min(.65, (1 - radius) / .4)), Math.max(.15, Math.min(1, (radius - .82) / .32)));
      }
      mesh.setVerticesData("iceOptics", optics, false, 2);
      if(revision >= "ice-r015")mesh.setVerticesData("nativeOptics",optics,false,2);
    }
    material.albedoColor = Color3.FromArray(role.linearColor);
    if(revision < "ice-r015") material.roughness = role.roughness;
    material.metallic = 0;
    material.indexOfRefraction = 1.31;
    if(revision < "ice-r015")material.environmentIntensity = revision >= "ice-r013" ? (i === 0 ? .65 : .9) : .2;
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.parent = nativeRoot;
    mesh.metadata = {style:"ice"};
    if (!sharedShadows) shadow.addShadowCaster(mesh);
  });
  sharedShadows?.update([{node:nativeRoot,radius:1,lod:0}]);
  await scene.whenReadyAsync();
  scene.render();
  return {
    engine,
    scene,
    camera,
    geometry,
    stats: () => ({ seed, revision, triangles: geometry.triangles, meshes: scene.meshes.length, materials: scene.materials.length, drawCalls: instrumentation.drawCallsCounter.current, activeIndices: scene.getActiveIndices(), shadowMapSize: sharedShadows ? 1024 : shadow.getShadowMap()?.getSize().width, sharedHeroShadows:!!sharedShadows, environment: scene.environmentTexture?.name ?? null, environmentReady: scene.environmentTexture?.isReady() ?? false, environmentIntensity: scene.environmentIntensity, rightHanded:scene.useRightHandedSystem }),
    render: () => scene.render(),
    dispose: () => {
      sharedShadows?.dispose();
      instrumentation.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
