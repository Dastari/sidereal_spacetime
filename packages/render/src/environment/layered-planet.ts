import type { Material } from "@babylonjs/core/Materials/material";
import type { PlanetBuildData, PackedPlanetGeometry, PlanetWeatherData } from "./planet-build";
import { terrainResolution } from "./planet-terrain";
import { setMeshRole } from '../mesh-roles';
import { createPlanetSmoke } from "./planet-smoke";
import { createOceanGlints } from "./planet-sparkles";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { createIceMaterial } from "./ice-material";
import { createLavaSpill } from "./planet-lava-spill";
import { buildLayeredTerrain, type SurfaceGeometry } from "./planet-terrain";
import { buildPlanetTrees } from "./planet-decorations";
import { buildPlanetCrystals } from "./planet-crystals";
import { buildPlanetClouds } from "./planet-clouds";
import { hash } from "./voxel-planets";
import {
  planetEffects,
  type PlanetRecipe,
} from "../../../content/src/environment";
export type PlanetLOD = 0 | 1 | 2;
function makePbr(scene: Scene, name: string, roughness: number, color = "#ffffff") {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(color).toLinearSpace();
  m.metallic = 0;
  m.directIntensity = 1.45;
  m.roughness = roughness;
  m.maxSimultaneousLights = 4;
  m.environmentIntensity = 0.7;
  m.forceIrradianceInFragment = true;
  return m;
}
function geometryMesh(
  scene: Scene,
  name: string,
  geometry: Pick<
    SurfaceGeometry,
    "positions" | "normals" | "colors" | "indices"
  > | PackedPlanetGeometry,
  material: PBRMaterial,
) {
  const mesh = new Mesh(name, scene),
    data = new VertexData();
  setMeshRole(mesh, "planet");
  data.positions = geometry.positions;
  data.normals = geometry.normals;
  // Authored palettes and helper tints are sRGB; PBR vertex albedo is linear.
  data.colors = "prepared" in geometry ? geometry.colors : geometry.colors.map((v, i) =>
    i % 4 === 3
      ? v
      : v <= 0.04045
        ? v / 12.92
        : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  // Pure helpers use mathematical outward CCW; Babylon's builders use reverse.
  data.indices = "prepared" in geometry ? geometry.indices : geometry.indices.map(
    (_, i) => geometry.indices[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i],
  );
  data.applyToMesh(mesh);
  if ("iceOptics" in geometry && geometry.iceOptics)
    mesh.setVerticesData("iceOptics", geometry.iceOptics, false, 2);
  mesh.material = material;
  mesh.hasVertexAlpha = false;
  mesh.isPickable = false;
  return mesh;
}
export function* stageLayeredPlanet(
  scene: Scene,
  name: string,
  recipe: PlanetRecipe,
  lod: PlanetLOD,
  prepared?: PlanetBuildData,
  shared?: <T extends Material>(key:string,create:()=>T)=>T,
  weatherBuilder?: (phase:number)=>Promise<PlanetWeatherData>,
) {
  const pbr = (s:Scene,key:string,roughness:number,color?:string) => shared ? shared(key,()=>makePbr(s,key,roughness,color)) : makePbr(s,key,roughness,color);
  const root = new TransformNode(name + "-layers", scene),
    effects = planetEffects(recipe),
    emitters: Mesh[] = [],
    animatedMaterials: ShaderMaterial[] = [],
    textures: Texture[] = [];
  root.metadata={role:"planet",layeredPlanet:true,lod};
  if (prepared) root.setEnabled(false);
  const water = ["temperate", "ocean"].includes(recipe.style);
  const core = CreateSphere(
    name + "-closed-core",
    { diameter: water ? 1.898 : 1.8, segments: lod === 2 ? 24 : 64 },
    scene,
  );
  setMeshRole(core, "planet");
  core.metadata = { ...core.metadata, planetShadow: { cast: false, receive: true } };
  core.parent = root;
  core.isPickable = false;
  const coreMaterial = pbr(
    scene,
    name + "-core-material",
    water ? 0.4 : 0.73,
    water ? "#ffffff" : "#" + recipe.palette[0],
  );
  if (water && !coreMaterial.albedoTexture) {
    const pixels = new Uint8Array(128 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 128; x++) {
        const h = hash(x, y, 12, recipe.seed),
          i = (x + y * 128) * 4;
        pixels[i] = 8 + h * 8;
        pixels[i + 1] = 69 + h * 22;
        pixels[i + 2] = 145 + h * 39;
        pixels[i + 3] = 255;
      }
    const texture = RawTexture.CreateRGBATexture(
      pixels,
      128,
      64,
      scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    coreMaterial.albedoTexture = texture;
    coreMaterial.clearCoat.isEnabled = false;
    coreMaterial.clearCoat.intensity = 0.65;
    coreMaterial.clearCoat.roughness = 0.12;
    textures.push(texture);
  }
  core.material = coreMaterial;
  let clouds: TransformNode | undefined, smoke: TransformNode | undefined;
  let weatherMaterial: PBRMaterial | undefined;
  let weatherStep = 0;
  let weatherPending = false;
  let weatherReady: PlanetWeatherData | undefined;
  const requestedResolution = prepared?.requested ?? (lod === 0 ? Math.min(96, Math.max(12, recipe.resolution)) : Math.min(lod === 1 ? 32 : 16, recipe.resolution));
  const n = prepared?.resolution ?? terrainResolution(recipe, requestedResolution);
  const generated = prepared?.generated ?? buildLayeredTerrain(recipe, n);
  yield root;
  if (generated.water.faces) {
    const seaMaterial = pbr(scene, name + "-ocean-shell-material", 0.4);
    seaMaterial.environmentIntensity = 0.3;
    seaMaterial.directIntensity = 1.9;
    const sea = geometryMesh(
      scene,
      name + "-ocean-microcells",
      prepared?.geometry.water ?? generated.water,
      seaMaterial,
    );
    sea.parent = root;
    if (lod === 0) {
      const glints = createOceanGlints(
        scene,
        name,
        generated.water,
        recipe.seed,
        prepared?.glints,
      );
      glints.mesh.parent = root;
      animatedMaterials.push(glints.material);
    }
    sea.metadata = { role: "planet",
      planetOcean: true,
      faces: generated.water.faces,
      resolution: n,
    };
  }
  yield root;
  const terrainMaterial = pbr(
    scene,
    name + "-terrain-material",
    recipe.style === "ice" ? 0.82 : 0.69,
  );
  const terrain = geometryMesh(
    scene,
    name + "-terraces",
    prepared?.geometry.terrain ?? generated.terrain,
    terrainMaterial,
  );
  terrain.parent = root;
  terrain.metadata = { role: "planet",
    voxelPlanet: true,
    layered: true,
    style: recipe.style,
    resolution: n,
    faces: generated.terrain.faces + generated.ice.faces,
    lod,
  };
  yield root;
  if (generated.ice.faces) {
    const iceMaterial = shared ? shared(name+"-exposed-ice-material",()=>createIceMaterial(scene,name+"-exposed-ice-material")) : createIceMaterial(scene,name+"-exposed-ice-material");
    const ice = geometryMesh(
      scene,
      name + "-exposed-ice",
      prepared?.geometry.ice ?? generated.ice,
      iceMaterial,
    );
    ice.parent = root;
    ice.metadata = { role: "planet", planetIce: true, faces: generated.ice.faces };
  }
  yield root;
  if (generated.spill.faces) {
    const spill = createLavaSpill(scene, name, generated.spill, prepared?.geometry.spill);
    spill.mesh.parent = root;
    animatedMaterials.push(spill.material);
  }
  yield root;
  if (generated.lava.faces) {
    const lavaMat = pbr(scene, name + "-lava-material", 0.45, "#ff6819");
    lavaMat.emissiveColor = new Color3(1.8, 0.16, 0.012).scale(
      Math.max(0.6, recipe.emission),
    );
    const lava = geometryMesh(scene, name + "-lava", prepared?.geometry.lava ?? generated.lava, lavaMat);
    lava.parent = root;
    lava.metadata = { role: "planet", planetEmitter: true };
    emitters.push(lava);
  }
  yield root;
  if (lod < 2 && generated.trees.length) {
    const trees = prepared ? { ...prepared.geometry.forest, treeCount: prepared.forestCount } : buildPlanetTrees(
      generated.trees.filter((_, i) => i % (lod === 0 ? 6 : 2) === 0),
      { scale: lod === 0 ? 4 : 1, puffy: lod === 0 },
    );
    const forest = geometryMesh(
      scene,
      name + "-forest",
      trees,
      pbr(scene, name + "-forest-material", 0.72),
    );
    forest.parent = root;
    forest.metadata = { role: "planet", planetForest: true, trees: trees.treeCount };
  }
  yield root;
  if (lod < 2 && generated.crystals.length) {
    const crystalData = prepared ? { ...prepared.geometry.crystals, crystalCount: prepared.crystalCount } : buildPlanetCrystals(generated.crystals);
    const crystalMat = pbr(scene, name + "-crystal-material", 0.23);
    crystalMat.metallic = 0.05;
    crystalMat.emissiveColor = new Color3(0.43, 0.025, 0.7).scale(
      Math.max(0.5, recipe.emission),
    );
    const crystals = geometryMesh(
      scene,
      name + "-crystals",
      crystalData,
      crystalMat,
    );
    crystals.parent = root;
    crystals.metadata = { role: "planet",
      planetEmitter: true,
      crystals: crystalData.crystalCount,
    };
    emitters.push(crystals);
  }
  yield root;
  if (lod < 2 && recipe.cloudCoverage > 0) {
    const geometry = prepared ? { ...prepared.geometry.clouds, faces: prepared.cloudFaces } : buildPlanetClouds({
      seed: recipe.seed,
      coverage: recipe.cloudCoverage,
      tint: recipe.style === "toxic" ? [0.62, 0.85, 0.18] : undefined,
      radius: 1.08,
      detail: lod === 0 ? 96 : 48,
    });
    weatherMaterial = pbr(scene, name + "-cloud-material", 0.95);
    weatherMaterial.directIntensity = 2.4;
    weatherMaterial.subSurface.isTranslucencyEnabled = true;
    weatherMaterial.subSurface.translucencyIntensity = 0.35;
    weatherMaterial.subSurface.maximumThickness = 0.08;
    const cloud = geometryMesh(
      scene,
      name + "-weather",
      geometry,
      weatherMaterial,
    );
    cloud.parent = root;
    cloud.metadata = { role: "planet", planetWeather: true, faces: geometry.faces };
    clouds = cloud;
  }
  yield root;
  smoke = createPlanetSmoke(scene, name, recipe, lod, prepared?.geometry.smoke);
  if (smoke) smoke.parent = root;
  root.metadata = { role: "planet",
    layeredPlanet: true,
    lod,
    resolution: n,
    requestedResolution,
    budgetReduced: n < requestedResolution,
    trees: generated.trees.length,
    terrainFaces: generated.terrain.faces,
  };
  return {
    root,
    clouds,
    smoke,
    emitters,
    animatedMaterials,
    generated,
    updateWeather(age: number, reducedMotion: boolean) {
      const step = Math.floor(age / 8);
      if (weatherBuilder && weatherMaterial && !root.isDisposed()) {
        if (weatherReady && !reducedMotion) {
          const data=weatherReady;weatherReady=undefined;
          const next=geometryMesh(scene,name+"-weather",data.geometry,weatherMaterial);
          next.parent=root;next.metadata={role:"planet",planetWeather:true,faces:data.faces};
          clouds?.dispose(false,false);clouds=next;
        }
        if (!reducedMotion && step!==weatherStep && !weatherPending) {
          weatherPending=true;weatherStep=step;
          void weatherBuilder(step*8).then(data=>{if(!root.isDisposed())weatherReady=data;}).catch(()=>{weatherStep=-1;}).finally(()=>{weatherPending=false;});
        }
        return clouds;
      }
      if (!reducedMotion && weatherMaterial && step !== weatherStep) {
        weatherStep = step;
        const data = buildPlanetClouds({
          seed: recipe.seed,
          coverage: recipe.cloudCoverage,
          tint: recipe.style === "toxic" ? [0.62, 0.85, 0.18] : undefined,
          radius: 1.08,
          detail: lod === 0 ? 96 : 48,
          phase: step * 8,
        });
        const next = geometryMesh(
          scene,
          name + "-weather",
          data,
          weatherMaterial,
        );
        next.parent = root;
        next.metadata = { role: "planet", planetWeather: true, faces: data.faces };
        clouds?.dispose(false, false);
        clouds = next;
      }
      return clouds;
    },
    dispose() {
      root.dispose(false, true);
      for (const texture of textures) texture.dispose();
    },
  };
}
/** Projected-size LOD with overlap bands to avoid repeated threshold rebuilds. */
export function planetLOD(
  pixelRadius: number,
  previous: PlanetLOD = 2,
): PlanetLOD {
  if (previous === 0 && pixelRadius > 150) return 0;
  if (pixelRadius > 190) return 0;
  if (previous <= 1 && pixelRadius > 36) return 1;
  return pixelRadius > 50 ? 1 : 2;
}

/** Synchronous authoring/NullEngine entry; browser LOD changes use the staged worker path. */
export function createLayeredPlanet(scene:Scene,name:string,recipe:PlanetRecipe,lod:PlanetLOD) {
  const build=stageLayeredPlanet(scene,name,recipe,lod);
  let step=build.next(); while(!step.done)step=build.next(); return step.value;
}
