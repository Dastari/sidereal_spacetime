import { setMeshRole } from '../mesh-roles';
import {loadNativeVolcanicKit,createNativeVolcanicCache,createNativeVolcanicWorldPlanet,canUseNativeVolcanic,NATIVE_VOLCANIC_REVISION} from "./native-volcanic-runtime";
import {createPlanetAtmosphere} from "./planet-atmosphere";
import {loadNativeIceKit} from "./native-planet-assets";
import {createNativeIcePlanet,createNativePlanetCache,canUseNativeIce,type NativePlanetCache} from "./native-planet";
import type {NativePlanetKit} from "./native-planet-composition";
import { createGlowOccluders } from "../glow-occluders";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { createPlanetRotationClock, planetAxialAngle } from "./planet-rotation";
import { createPlanetShadows } from "./planet-shadows";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import {
  createLayeredPlanet,
  planetLOD,
  type PlanetLOD,
} from "./layered-planet";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createPlanetMesh, createPlanetLight } from "./planet-mesh";
import {
  dustMotion,
  dustLayout,
  dustCell,
  dustDepthLayers,
  DUST_COUNT,
} from "./dust";
import {
  planetRecipeForAppearance,
  planetEffects,
  type PlanetRecipe,
} from "../../../content/src/environment";

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { spaceVista, SPACE_VISTAS } from "../../../content/src/environment";
import {
  surfaceVertex,
  skyFragment,
  planetFragment,
  ringFragment,
  coronaFragment,
} from "./shaders";
export interface SpaceBodyState {
  id: string;
  kind: string;
  appearance: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
  height: number;
  radius: number;
  seed: number;
  recipe?: PlanetRecipe;
}
function material(
  scene: Scene,
  name: string,
  fragmentSource: string,
  alpha = false,
) {
  const mat = new ShaderMaterial(
    name,
    scene,
    { vertexSource: surfaceVertex, fragmentSource },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "time",
        "seed",
        "kind",
        "primary",
        "secondary",
        "lightDirection",
        "sunIntensity",
        "cameraPosition",
        "tint",
        "strength",
        "viewportHeight",
      ],
      samplers: ["nebula"],
      needAlphaBlending: alpha,
    },
  );
  if (alpha) {
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
  }
  return mat;
}
/** Infinite directional sky + actual world bodies + local volumetric flecks.
 * Only the sky follows the camera. World bodies subtract the f64 render origin.
 */
export function createSpaceEnvironment(scene: Scene) {
  const heroShadows = createPlanetShadows(scene);
  let primaryLight: DirectionalLight | undefined;
  const root = new TransformNode("space-environment", scene);
  const sky = CreateSphere(
    "surrounding-galaxy",
    { diameter: 1200, segments: 32, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  setMeshRole(sky, "environment");
  sky.parent = root;
  sky.isPickable = false;
  sky.alwaysSelectAsActiveMesh = true;
  const skyMat = material(scene, "directional-galaxy-material", skyFragment);
  skyMat.disableDepthWrite = true;
  sky.material = skyMat;
  const planetGlow = new GlowLayer("celestial-deposit-glow", scene, {
    blurKernelSize: 24,
    mainTextureRatio: 0.25,
    excludeByDefault: true,
  });
  const planetOccluders = createGlowOccluders(planetGlow);
  planetGlow.intensity = 0.45;
  planetGlow.isEnabled = false;
  const nebula = new Texture(
    "/assets/environment/veil-nebula-v1.png",
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  const violet = new Texture(
    "/assets/environment/orion-veil-v1.png",
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  for (const t of [nebula, violet]) {
    t.wrapU = Texture.CLAMP_ADDRESSMODE;
    t.wrapV = Texture.CLAMP_ADDRESSMODE;
  }
  const dust = CreateBox("volumetric-dust", { size: 1 }, scene);
  setMeshRole(dust, "environment");
  dust.parent = root;
  dust.isPickable = false;
  const dustMat = new StandardMaterial("dust-grains", scene);
  dustMat.disableLighting = true;
  dustMat.emissiveColor = new Color3(0.36, 0.57, 0.82);
  dust.material = dustMat;
  const dustMatrices = new Float32Array(DUST_COUNT * 16);
  dust.thinInstanceSetBuffer("matrix", dustMatrices, 16, false);
  let prefab: TransformNode | undefined,
    rockRadius = 1,
    disposed = false,
    active = "",
    age = 0;
  const rocksReady = SceneLoader.ImportMeshAsync(
    "",
    "/assets/voxels/",
    "asteroid.glb",
    scene,
  ).then((imported) => {
    if (disposed) {
      for (const mesh of imported.meshes) mesh.dispose();
      return;
    }
    for (const mesh of imported.meshes) setMeshRole(mesh, 'environment');
    prefab = new TransformNode("asteroid-source", scene);
    for (const mesh of imported.meshes) if (!mesh.parent) mesh.parent = prefab;
    const bounds = prefab.getHierarchyBoundingVectors();
    rockRadius = Math.max(bounds.max.length(), bounds.min.length());
    prefab.parent = root;
    prefab.setEnabled(false);
  });
  let nativeIceKit:NativePlanetKit|undefined;
  let nativeIceCache:NativePlanetCache|undefined;
  const nativeReady=loadNativeIceKit().then(kit=>{
    if(disposed)return;
    nativeIceKit=kit;nativeIceCache=createNativePlanetCache(kit);
  }).catch(error=>{console.warn("Native ice candidate unavailable; retaining existing ice renderer",error);});
  let nativeVolcanicKit:NativePlanetKit|undefined;
  let nativeVolcanicCache:ReturnType<typeof createNativeVolcanicCache>|undefined;
  const volcanicReady=loadNativeVolcanicKit().then(kit=>{
    if(disposed)return;
    nativeVolcanicKit=kit;nativeVolcanicCache=createNativeVolcanicCache(kit);
  }).catch(error=>{console.warn("Native volcanic candidate unavailable; retaining existing volcanic renderer",error);});
  const ready=Promise.all([rocksReady,nativeReady,volcanicReady]).then(()=>undefined);
  const rotationClock = createPlanetRotationClock();
  let rotationPaused = false;
  const visibilityRotation = () => rotationClock.step(performance.now(), rotationPaused || document.hidden);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibilityRotation);
  const entries = new Map<
    string,
    {
      node: TransformNode;
      spin?: TransformNode;
      seed: number;
      materials: ShaderMaterial[];
      x: number;
      y: number;
      heading: number;
      cloud?: TransformNode;
      smoke?: TransformNode;
      lod: PlanetLOD;
      signature: string;
      ownsMaterials: boolean;
      cloudSpeed: number;
      radius: number;
      updateWeather?: (
        age: number,
        reducedMotion: boolean,
      ) => TransformNode | undefined;
      gas?: TransformNode;
    }
  >();
  function add(body: SpaceBodyState, lod: PlanetLOD) {
    let node: TransformNode;
    let spin: TransformNode | undefined;
    const materials: ShaderMaterial[] = [];
    let cloud: TransformNode | undefined;
    let updateWeather:
      | ((age: number, reducedMotion: boolean) => TransformNode | undefined)
      | undefined;
    let gas: TransformNode | undefined;
    let smoke: TransformNode | undefined;
    let cloudSpeed = 0.025;
    if (body.kind === "asteroid") {
      if (!prefab) return;
      const clone = prefab.clone("physical-asteroid-" + body.id, root);
      if (!clone) throw new Error("Asteroid clone failed");
      node = clone;
      node.setEnabled(true);
      node.scaling.setAll(body.radius / rockRadius);
      // Shape and contact proxy share the same planar orientation and radius.
    } else {
      node = new TransformNode("world-body-" + body.id, scene);
      node.parent = root;
      const appearance =
        SPACE_VISTAS.flatMap((v) => v.bodies).find(
          (b) => b.id === body.appearance,
        ) ?? SPACE_VISTAS[0].bodies[0];
      const authoredRecipe =
        body.kind === "star"
          ? undefined
          : planetRecipeForAppearance(body.appearance, body.seed, body.recipe);
      const primary = Color3.FromHexString(
          authoredRecipe ? "#" + authoredRecipe.palette[5] : appearance.primary,
        ),
        secondary = Color3.FromHexString(
          authoredRecipe
            ? "#" + authoredRecipe.palette[1]
            : appearance.secondary,
        ),
        air = Color3.FromHexString(
          authoredRecipe
            ? {
                temperate: "#86cfff",
                ocean: "#86cfff",
                desert: "#f5aa62",
                rock: "#a5a2c6",
                ice: "#64d6ff",
                volcanic: "#ff7429",
                toxic: "#b8e943",
                gas: "#a677ff",
                crystal: "#da65ff",
                moon: "#a5a2c6",
              }[authoredRecipe.style]
            : appearance.atmosphere,
        );
      const light = new Vector3(0.6, 1, -0.45).normalize();
      if (body.kind === "star") {
        const surface = CreateSphere(
          body.id + "-surface",
          { diameter: body.radius * 2, segments: 32 },
          scene,
        );
        setMeshRole(surface, "environment");
        surface.parent = node;
        surface.isPickable = false;
        const mat = material(
          scene,
          body.id + "-surface-material",
          planetFragment,
        );
        surface.material = mat;
        mat.setColor3("primary", primary);
        mat.setColor3("secondary", secondary);
        mat.setFloat("seed", body.seed);
        mat.setFloat("kind", 3);
        mat.setVector3("lightDirection", light);
        materials.push(mat);
      } else {
        const recipe = authoredRecipe!;
        cloudSpeed = recipe.cloudSpeed;
        if (recipe.style === "gas") {
          const globe = CreateSphere(
            body.id + "-gas-surface",
            { diameter: body.radius * 2, segments: 48 },
            scene,
          );
          setMeshRole(globe, "environment");
          spin = new TransformNode(body.id + "-axial-spin", scene);
          spin.parent = node;
          globe.parent = spin;
          globe.isPickable = false;
          const gasMaterial = material(
            scene,
            body.id + "-gas-material",
            planetFragment,
          );
          gasMaterial.setColor3(
            "primary",
            Color3.FromHexString("#" + recipe.palette[3]),
          );
          gasMaterial.setColor3(
            "secondary",
            Color3.FromHexString("#" + recipe.palette[0]),
          );
          gasMaterial.setFloat("kind", 1);
          gasMaterial.setFloat("seed", recipe.seed);
          gasMaterial.setVector3("lightDirection", light);
          globe.material = gasMaterial;
          materials.push(gasMaterial);
          gas = globe;
        } else {
          const nativeIce=!!nativeIceKit && !!nativeIceCache && canUseNativeIce(recipe);
          const nativeVolcanic=!!nativeVolcanicKit && !!nativeVolcanicCache && canUseNativeVolcanic(recipe);
          const native=nativeIce||nativeVolcanic;
          const layered = nativeIce
            ? createNativeIcePlanet(scene,body.id,recipe,lod,nativeIceKit!,nativeIceCache!)
            : nativeVolcanic
              ? createNativeVolcanicWorldPlanet(scene,body.id,recipe,lod,nativeVolcanicKit!,nativeVolcanicCache!,NATIVE_VOLCANIC_REVISION)
              : createLayeredPlanet(scene, body.id, recipe, lod);
          layered.root.parent = node;
          layered.root.scaling.setAll(body.radius);
          if(!native){layered.root.rotation.x = 1.05;layered.root.rotation.z = 0.16;}
          spin = new TransformNode(body.id + "-axial-spin", scene);
          for (const child of layered.root.getChildren()) child.parent = spin;
          spin.parent = layered.root;
          cloud = layered.clouds;
          const surfaceSpin = spin;
          updateWeather = (age, reducedMotion) => {
            const next = layered.updateWeather(age, reducedMotion);
            if (next) next.parent = surfaceSpin;
            return next;
          };
          materials.push(...layered.animatedMaterials);
          smoke = layered.smoke;
          if (layered.emitters.length) {
            // Opaque non-emissive geometry also writes depth in the glow mask,
            // preventing deposits on the rear hemisphere shining through rock.
            for (const mesh of layered.root.getChildMeshes()) {
              if (
                !(mesh instanceof Mesh) ||
                mesh.material instanceof ShaderMaterial ||
                mesh.material?.alpha !== 1
              )
                continue;
              planetGlow.addIncludedOnlyMesh(mesh);
            }
            planetGlow.isEnabled = true;
          }
        }
        // Bounded by admitted luminous bodies (maximum two lights in this environment).
        if (
          [...entries.values()].filter((e) =>
            e.node
              .getChildren()
              .some((c) => c.name.endsWith("-local-radiance")),
          ).length < 2
        ) {
          const effects = planetEffects(recipe);
          const light = createPlanetLight(
            scene,
            body.id,
            {
              ...recipe,
              emission: Math.max(
                recipe.emission,
                effects.volcanicCoverage * 2,
                effects.crystalCoverage * 2,
              ),
            },
            body.radius,
          );
          if (light) {
            light.parent = node;
            light.includedOnlyMeshes = root.getChildMeshes();
          }
        }
      }
      if (body.kind === "star") {
        const halo = CreateGround(
          body.id + "-corona",
          { width: body.radius * 4.4, height: body.radius * 4.4 },
          scene,
        );
        setMeshRole(halo, "environment");
        halo.position.y = -body.radius * 0.15;
        halo.parent = node;
        halo.isPickable = false;
        const glow = material(
          scene,
          body.id + "-corona-material",
          coronaFragment,
          true,
        );
        glow.alphaMode = Constants.ALPHA_ADD;
        glow.setColor3("primary", secondary);
        halo.material = glow;
        materials.push(glow);
      } else if (
        authoredRecipe
          ? planetEffects(authoredRecipe).atmosphere > 0
          : !["rock", "moon"].includes(appearance.kind)
      ) {
        const {mesh:shell,material:atmosphere}=createPlanetAtmosphere(scene,body.id,body.radius,air,authoredRecipe?planetEffects(authoredRecipe).atmosphere:.65);
        shell.parent=node;
        materials.push(atmosphere);
      }
      if (authoredRecipe?.rings ?? appearance.rings) {
        const ring = CreateGround(
          body.id + "-rings",
          { width: body.radius * 3.6, height: body.radius * 3.6 },
          scene,
        );
        setMeshRole(ring, "environment");
        ring.parent = node;
        ring.rotation.x = 0.42;
        ring.rotation.z = 0.25;
        ring.isPickable = false;
        const ringMat = material(
          scene,
          body.id + "-ring-material",
          ringFragment,
          true,
        );
        ringMat.setColor3("primary", primary);
        ringMat.setColor3("secondary", secondary);
        ring.material = ringMat;
        materials.push(ringMat);
      }
    }
    node.metadata = { bodyId: body.id, worldBody: true, role: body.kind === 'asteroid' ? 'environment' : 'planet' };
    for (const mesh of node.getChildMeshes()) setMeshRole(mesh, node.metadata.role);
    if (node instanceof Mesh) setMeshRole(node, node.metadata.role);
    const entry = {
      node,
      spin,
      seed: body.seed,
      materials,
      x: body.x,
      y: body.y,
      heading: body.heading,
      cloud,
      smoke,
      lod,
      gas,
      cloudSpeed,
      updateWeather,
      radius: body.radius,
      ownsMaterials: body.kind !== "asteroid",
      signature: JSON.stringify([
        body.kind,
        body.appearance,
        body.seed,
        body.radius,
        body.recipe,
        lod,
        !!nativeIceKit && (body.appearance === "ice" || body.recipe?.style === "ice"),
        !!nativeVolcanicKit && (body.appearance === "volcanic" || body.recipe?.style === "volcanic"),
      ]),
    };
    entries.set(body.id, entry);
    return entry;
  }
  return {
    ready,
    setOccluders(meshes: readonly AbstractMesh[]) {
      planetOccluders.set(meshes);
    },
    setPrimaryLight(light: DirectionalLight) {
      primaryLight = light;
      heroShadows.setPrimaryLight(light);
    },
    update(options: {
      id: string;
      x: number;
      y: number;
      dt: number;
      enabled: boolean;
      planetsEnabled?: boolean;
      reducedMotion: boolean;
      vx?: number;
      vy?: number;
      viewHalfExtent?: number;
      dustParallax?: boolean;
      aspect?: number;
      bodies: readonly SpaceBodyState[];
    }) {
      rotationPaused = options.reducedMotion || !options.enabled || options.planetsEnabled === false;
      const rotationAge = rotationClock.step(performance.now(), rotationPaused || (typeof document !== "undefined" && document.hidden));
      root.setEnabled(options.enabled);
      if (!options.enabled) {
        heroShadows.update([]);
        return;
      }
      if (active !== options.id) {
        active = options.id;
        const vista = spaceVista(active);
        skyMat.setTexture("nebula", vista.nebulaAsset ? violet : nebula);
        skyMat.setVector3("tint", Vector3.FromArray(vista.nebulaTint));
        skyMat.setFloat("strength", vista.nebulaStrength);
        skyMat.setFloat("seed", vista.seed);
      }
      if (!options.reducedMotion) age += Math.min(options.dt, 0.1);
      const camera = scene.activeCamera?.globalPosition ?? Vector3.Zero();
      sky.position.copyFrom(camera);
      skyMat.setFloat("time", age);
      skyMat.setFloat("viewportHeight", scene.getEngine().getRenderHeight());
      const visible = new Set(options.bodies.map((b) => b.id));
      for (const [id, entry] of entries)
        if (!visible.has(id)) {
          entry.node.dispose(false, entry.ownsMaterials);
          entries.delete(id);
        }
      const blend = 1 - Math.exp(-Math.min(options.dt, 0.1) * 18);
      for (const body of options.bodies) {
        let entry = entries.get(body.id);
        if (body.kind === "planet" && options.planetsEnabled === false) {
          entry?.node.setEnabled(false);
          continue;
        }
        entry?.node.setEnabled(true);
        const center = new Vector3(
          body.x - options.x,
          body.height,
          -(body.y - options.y),
        );
        const distance = Math.max(
          body.radius,
          Vector3.Distance(camera, center),
        );
        const projected =
          (body.radius * scene.getEngine().getRenderHeight()) /
          (distance * 2 * Math.tan((scene.activeCamera?.fov ?? 0.5) / 2));
        const lod: PlanetLOD =
          body.kind === "planet" ? planetLOD(projected, entry?.lod) : 2;
        if (
          entry &&
          entry.signature !==
            JSON.stringify([
              body.kind,
              body.appearance,
              body.seed,
              body.radius,
              body.recipe,
              lod,
              !!nativeIceKit && (body.appearance === "ice" || body.recipe?.style === "ice"),
        !!nativeVolcanicKit && (body.appearance === "volcanic" || body.recipe?.style === "volcanic"),
            ])
        ) {
          entry.node.dispose(false, entry.ownsMaterials);
          entries.delete(body.id);
          entry = undefined;
        }
        entry ??= add(body, lod);
        if (!entry) continue;
        entry.x += (body.x - entry.x) * blend;
        entry.y += (body.y - entry.y) * blend;
        entry.heading +=
          Math.atan2(
            Math.sin(body.heading - entry.heading),
            Math.cos(body.heading - entry.heading),
          ) * blend;
        entry.node.position.set(
          entry.x - options.x,
          body.height,
          -(entry.y - options.y),
        );
        entry.node.rotation.y = entry.heading;
        if (entry.spin) entry.spin.rotation.y = planetAxialAngle(entry.seed, rotationAge);
        if (entry.updateWeather)
          entry.cloud = entry.updateWeather(age, options.reducedMotion);
        // Local weather rotation plus independently evolving bounded cloud geometry.
        if (entry.cloud)
          entry.cloud.rotation.y =
            (Math.floor(age * 10) / 10) * entry.cloudSpeed;
        if (entry.smoke)
          entry.smoke.rotation.y =
            -(Math.floor(age * 10) / 10) * entry.cloudSpeed * 0.7;
        if (entry.gas)
          entry.gas.rotation.y =
            (Math.floor(age * 10) / 10) * entry.cloudSpeed * 0.3;
        for (const mat of entry.materials) {
          mat.setFloat("time", age);
          mat.setVector3("cameraPosition", camera);
          if (primaryLight) {
            mat.setVector3(
              "lightDirection",
              primaryLight.direction.negate().normalize(),
            );
            mat.setFloat("sunIntensity", scene.lightsEnabled ? primaryLight.intensity : 0);
          }
        }
      }
      heroShadows.update([...entries.values()].filter((entry) => entry.node.isEnabled()));
      // Bounded seeded world-cell field with snapped spacing LOD. As the viewport
      // expands, cells cover it without pinning individual particles to the camera.
      const target =
        scene.activeCamera instanceof TargetCamera
          ? scene.activeCamera.getTarget()
          : Vector3.Zero();
      const aspect =
        options.aspect ??
        (scene.activeCamera
          ? scene.getEngine().getAspectRatio(scene.activeCamera)
          : 1);
      const depthLayers = options.dustParallax
        ? dustDepthLayers(
            camera,
            target,
            scene.activeCamera?.fov ?? 0.5,
            aspect,
          )
        : [];
      const layers = depthLayers.length
        ? depthLayers
        : [
            {
              height: null,
              center: { x: target.x, z: target.z },
              halfX: (options.viewHalfExtent ?? 55) * aspect,
              halfZ: options.viewHalfExtent ?? 55,
              thickness: 0,
              sizeScale: 1,
              depthDistance: 0,
            },
          ];
      if (depthLayers.length && scene.activeCamera)
        scene.activeCamera.maxZ = Math.max(
          scene.activeCamera.maxZ,
          depthLayers[2].depthDistance * 1.5,
        );
      const motion = dustMotion(
        options.vx ?? 0,
        options.vy ?? 0,
        options.reducedMotion,
      );
      dustMat.emissiveColor.set(
        0.36 * motion.intensity,
        0.57 * motion.intensity,
        0.82 * motion.intensity,
      );
      const rotation = Quaternion.RotationAxis(Vector3.Up(), motion.heading);
      const position = Vector3.Zero(),
        scale = Vector3.One();
      const dustForward = target.subtract(camera).normalize();
      const maxGrainPerDepth =
        (6 * Math.tan((scene.activeCamera?.fov ?? 0.5) / 2)) /
        Math.max(1, scene.getEngine().getRenderHeight());
      let instance = 0;
      const layerStats = [];
      for (const layer of layers) {
        const layout = dustLayout(
          layer.halfZ,
          layer.halfX / Math.max(1, layer.halfZ),
          Math.floor(DUST_COUNT / layers.length),
        );
        layerStats.push({
          height: layer.height,
          distance: layer.depthDistance,
          instances: layout.count,
          spacing: layout.spacing,
        });
        for (let i = 0; i < layout.count; i++) {
          const cell = dustCell(
            i,
            options.x + layer.center.x,
            options.y - layer.center.z,
            layout.spacing,
            layout.columns,
            layout.rows,
          );
          position.set(
            cell.x + layer.center.x,
            layer.height === null
              ? cell.height
              : layer.height + ((cell.height + 33) / 42) * layer.thickness,
            -cell.y + layer.center.z,
          );
          let size = cell.size * layer.sizeScale;
          if (depthLayers.length) {
            // Cap the near layer at three pixels; perspective magnification
            // must not turn a few grains into giant tiles while zooming.
            const depth =
              (position.x - camera.x) * dustForward.x +
              (position.y - camera.y) * dustForward.y +
              (position.z - camera.z) * dustForward.z;
            size = Math.min(size, Math.max(0, depth) * maxGrainPerDepth);
          }
          scale.set(
            size,
            size,
            size * (1 + (motion.streakRatio - 1) * cell.lengthVariation),
          );
          Matrix.Compose(scale, rotation, position).copyToArray(
            dustMatrices,
            instance++ * 16,
          );
        }
      }
      dust.metadata = {
        worldAnchoredDust: true,
        role: 'environment',
        instances: instance,
        depthLayers: layerStats,
        streakRatio: motion.streakRatio,
        warpBlend: motion.warpBlend,
        speed: motion.speed,
        streakLength: motion.length,
      };
      dust.thinInstanceCount = instance;
      dust.thinInstanceBufferUpdated("matrix");
      dust.thinInstanceRefreshBoundingInfo();
    },
    dispose() {
      disposed = true;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibilityRotation);
      nativeIceCache?.clear();
      nativeVolcanicCache?.clear();
      heroShadows.dispose();
      planetOccluders.dispose();
      planetGlow.dispose();
      root.dispose(false, true);
      nebula.dispose();
      violet.dispose();
    },
  };
}
