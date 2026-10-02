/** Complete immutable authored kit, privately reviewed with the normal game renderer. */
import { createWorld, type SceneState } from "@sidereal/render";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import { readWayfarerAuthoredStudy } from "@sidereal/content/wayfarer-authored-study";
import { loadAuthoredStudy } from "../../packages/render/src/prefab-ship/wayfarer-authored-study";
import { moldedLightRig } from "../../packages/render/src/molded-plastic";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { prefabToShipLocal } from "../../packages/render/src/prefab-ship/frames";
import {
  registerLocalPbrLight,
  pbrLightCapabilities,
  pbrLightLimit,
} from "../../packages/render/src/pbr-light-budget";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";

interface Review {
  scene?: Scene;
  world?: Awaited<ReturnType<typeof createWorld>>;
  candidate?: Awaited<ReturnType<typeof loadAuthoredStudy>>;
  ready: boolean;
  error?: string;
  camera: string;
  setCamera?: (name: string) => void;
  setPracticals?: (enabled: boolean) => void;
  practicals?: boolean;
  setContactShadows?: (enabled: boolean) => void;
  contactShadows?: boolean;
  setGuardedNormalBias?: (enabled: boolean) => void;
  guardedNormalBias?: boolean;
  setFittedShadowDepth?: (enabled: boolean) => void;
  fittedShadowDepth?: boolean;
  metrics?: unknown;
}
declare global {
  interface Window {
    __wayfarerAuthored?: Review;
  }
}
const cameraName = new URLSearchParams(location.search).get("cam") ?? "hero";
const review: Review = { ready: false, camera: cameraName };
window.__wayfarerAuthored = review;
const base = "/assets/ship-study/wayfarer-authored-r001/";
const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

async function bytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Authored study asset unavailable: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function json(url: string, pin?: string) {
  const data = await bytes(url);
  if (pin !== undefined && bytesToHex(sha256(data)) !== pin)
    throw Error(`Changed authored study asset: ${url}`);
  return JSON.parse(new TextDecoder().decode(data)) as unknown;
}

async function main() {
  if (!["hero", "reverse", "bow", "rooms"].includes(cameraName))
    throw Error("Unknown authored review camera");
  const descriptor = await json(`${base}descriptor.json`);
  if (!descriptor || typeof descriptor !== "object")
    throw Error("Missing authored study descriptor");
  const pins = descriptor as { manifestSha256: string; layoutSha256: string };
  if (
    !/^[a-f0-9]{64}$/.test(pins.manifestSha256) ||
    !/^[a-f0-9]{64}$/.test(pins.layoutSha256)
  )
    throw Error("Missing immutable authored metadata pins");
  const manifest = await json(`${base}manifest.json`, pins.manifestSha256);
  const layout = await json(`${base}layout.json`, pins.layoutSha256);
  const study = readWayfarerAuthoredStudy(manifest, layout, descriptor);
  const construction = prefabConstructionDocument(
    prefabById("fed.s.wren")!,
    defaultPrefabComponentCatalog(),
  );
  const world = await createWorld(
    canvas,
    (text) => (status.textContent = text),
    {
      construction: {
        instanceId: construction.layout.id,
        documentJson: JSON.stringify(construction),
        deckId: "deck-0",
      },
      onScene: (scene) => (review.scene = scene),
      onLoadError: (message) => (review.error = message),
      onPreviewError: (message) => (review.error = message),
    },
  );
  review.world = world;
  import.meta.hot?.dispose(() => world.dispose());
  const scene = review.scene!;
  const state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: 0,
    interior: false,
    inspect: true,
    grid: false,
  };
  world.update(state);
  const legacyRoots = scene.transformNodes.filter((node) => !node.parent);
  const origin: [number, number] = [-2, 0];
  const candidate = await loadAuthoredStudy(
    scene,
    study.pieces,
    study.instances,
    study.palette,
    origin,
    (piece) => bytes(`${base}${piece.file}`),
  );
  review.candidate = candidate;
  moldedLightRig(scene).include(candidate.meshes);
  // A matched OFF/ON pair retains three studio contributions in both modes.
  scene.getLightByName("construction-fill")?.setEnabled(false);
  const selectedNames = [
    "LT_cockpit",
    "LT_lounge",
    "LT_quarters_a",
    "LT_cargo",
    "LT_workshop",
  ];
  const sourceLights = (layout as { lights?: unknown }).lights;
  if (!Array.isArray(sourceLights))
    throw Error("Missing study practical lights");
  const practicalRows = selectedNames.map((name) => {
    const matches = sourceLights.filter((row) => row?.name === name);
    if (matches.length !== 1)
      throw Error(`Missing/duplicate practical ${name}`);
    const row = matches[0] as {
      name: string;
      type: string;
      location: number[];
      colour: number[];
      watts: number;
      radius: number;
    };
    if (
      row.type !== "POINT" ||
      row.radius !== 0.45 ||
      !Number.isFinite(row.watts) ||
      row.watts <= 0 ||
      !Array.isArray(row.location) ||
      row.location.length !== 3 ||
      row.location.some((v) => !Number.isFinite(v)) ||
      !Array.isArray(row.colour) ||
      row.colour.length !== 3 ||
      row.colour.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
    )
      throw Error(`Invalid practical ${name}`);
    return row;
  });
  const practicals = practicalRows.map((row) => {
    const position = prefabToShipLocal(
      row.location as [number, number, number],
      origin,
    );
    const light = new PointLight(
      `authored-study:${row.name}`,
      Vector3.FromArray(position),
      scene,
    );
    light.diffuse = Color3.FromArray(row.colour);
    light.specular = Color3.Black();
    // Declared artistic mapping, not physical equivalence to Blender watts.
    light.intensity = 2 * Math.max(0.8, Math.min(3, (row.watts * 2.2) / 140));
    light.intensityMode = Light.INTENSITYMODE_LUMINOUSINTENSITY;
    light.falloffType = Light.FALLOFF_STANDARD;
    light.radius = row.radius;
    light.range = 4;
    light.shadowEnabled = false;
    light.includedOnlyMeshes = candidate.meshes;
    registerLocalPbrLight(light, `authored-study:${row.name}`);
    light.setEnabled(false);
    return light;
  });
  const star = scene.getLightByName("construction-star");
  const shadows = star?.getShadowGenerator();
  if (
    !(star instanceof DirectionalLight) ||
    !(shadows instanceof ShadowGenerator) ||
    !star.autoUpdateExtends ||
    star.shadowFrustumSize !== 0 ||
    shadows.bias !== 0.0035 ||
    shadows.normalBias !== 0.015
  )
    throw Error("Changed normal construction shadow baseline");
  for (const light of scene.lights) {
    const map = light.getShadowGenerator()?.getShadowMap();
    if (map) map.renderList = candidate.meshes;
  }
  const camera = scene.activeCamera;
  if (!(camera instanceof ArcRotateCamera))
    throw Error("Normal game camera unavailable");
  const views = {
    hero: { alpha: -2.4, beta: 0.95, radius: 44, target: [0, 0.9, 0] },
    reverse: { alpha: 0.75, beta: 1.03, radius: 44, target: [0, 0.9, 0] },
    bow: { alpha: -1.65, beta: 0.85, radius: 15, target: [0, 0.9, -9.5] },
    rooms: { alpha: -2.4, beta: 0.78, radius: 15, target: [-3.8, 0.8, 0.5] },
  };
  let view = views[cameraName as keyof typeof views];
  const fixtureSet = new Set(candidate.meshes);
  const isolate = () => {
    for (const node of legacyRoots) node.setEnabled(false);
    for (const mesh of scene.meshes)
      if (!fixtureSet.has(mesh as (typeof candidate.meshes)[number]))
        mesh.setEnabled(false);
    // The normal world controller updates its camera before rendering each frame.
    camera.target = Vector3.FromArray(view.target);
    camera.alpha = view.alpha;
    camera.beta = view.beta;
    camera.radius = view.radius;
  };
  isolate();
  scene.onBeforeRenderObservable.add(isolate);
  camera.target = Vector3.FromArray(view.target);
  camera.alpha = view.alpha;
  camera.beta = view.beta;
  camera.radius = view.radius;
  let settled = 0;
  review.guardedNormalBias =
    new URLSearchParams(location.search).get("normal") === "guarded";
  review.setGuardedNormalBias = (enabled) => {
    review.guardedNormalBias = enabled;
    shadows.normalBias = review.contactShadows
      ? enabled
        ? 0.01
        : 0.003
      : 0.015;
    review.ready = false;
    settled = 0;
  };
  review.fittedShadowDepth = false;
  review.setFittedShadowDepth = (enabled) => {
    star.autoCalcShadowZBounds = enabled;
    if (!enabled) {
      // The normal baseline intentionally leaves these unset (Babylon's types
      // declare number although the actual runtime defaults are undefined).
      star.shadowMinZ = undefined as unknown as number;
      star.shadowMaxZ = undefined as unknown as number;
    }
    star.forceProjectionMatrixCompute();
    review.fittedShadowDepth = enabled;
    review.ready = false;
    settled = 0;
  };
  review.setFittedShadowDepth(
    new URLSearchParams(location.search).get("depth") === "fitted",
  );
  review.contactShadows = false;
  review.setContactShadows = (enabled) => {
    shadows.bias = enabled ? 0.0005 : 0.0035;
    shadows.normalBias = enabled
      ? review.guardedNormalBias
        ? 0.01
        : 0.003
      : 0.015;
    review.contactShadows = enabled;
    review.ready = false;
    settled = 0;
  };
  review.setContactShadows(
    new URLSearchParams(location.search).get("shadow") === "contact",
  );
  review.practicals = false;
  review.setPracticals = (enabled) => {
    for (const light of practicals) light.setEnabled(enabled);
    review.practicals = enabled;
    review.ready = false;
    settled = 0;
  };
  review.setPracticals(
    new URLSearchParams(location.search).get("lights") !== "off",
  );
  review.setCamera = (name) => {
    if (!Object.hasOwn(views, name))
      throw Error("Unknown authored review camera");
    view = views[name as keyof typeof views];
    review.camera = name;
    review.ready = false;
    settled = 0;
  };
  scene.onAfterRenderObservable.add(() => {
    if (
      review.ready ||
      review.error ||
      !scene.isReady() ||
      candidate.meshes.some((mesh) => !mesh.isReady(true))
    )
      return;
    if (++settled < 3) return;
    const casterList = shadows.getShadowMap()?.renderList;
    if (
      !casterList ||
      casterList.length !== candidate.meshes.length ||
      candidate.meshes.some((mesh) => !casterList.includes(mesh))
    ) {
      review.error = "Changed authored shadow caster set";
      return;
    }
    const lightView = star.getViewMatrix();
    if (!lightView) throw Error("Missing actual shadow light-view matrix");
    const casterDepths = candidate.meshes.map((mesh) => {
      const values = mesh
        .getBoundingInfo()
        .boundingBox.vectorsWorld.map(
          (corner) => Vector3.TransformCoordinates(corner, lightView).z,
        );
      if (values.some((value) => !Number.isFinite(value)))
        throw Error("Nonfinite authored shadow caster bounds");
      return {
        mesh: mesh.name,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    });
    if (
      review.fittedShadowDepth &&
      (!Number.isFinite(star.shadowMinZ) ||
        !Number.isFinite(star.shadowMaxZ) ||
        star.shadowMinZ >= star.shadowMaxZ ||
        casterDepths.some(
          (bounds) =>
            bounds.min < star.shadowMinZ - 1e-5 ||
            bounds.max > star.shadowMaxZ + 1e-5,
        ))
    ) {
      review.error = "Fitted shadow depth clips actual caster bounds";
      return;
    }
    const expectedLights = [
      "construction-star",
      "molded-cool-fill",
      "molded-rim",
      ...(review.practicals ? practicals.map((light) => light.name) : []),
    ].sort();
    if (
      candidate.meshes.some((mesh) => {
        const actual = mesh.lightSources.map((light) => light.name).sort();
        return (
          actual.length !== expectedLights.length ||
          actual.some((name, index) => name !== expectedLights[index]) ||
          !(mesh.material instanceof PBRMaterial) ||
          mesh.material.maxSimultaneousLights !== 8
        );
      })
    ) {
      review.error = "Unexpected authored study light contribution/budget";
      status.textContent = review.error;
      return;
    }
    const leaks = scene.meshes.filter(
      (mesh) =>
        !fixtureSet.has(mesh as (typeof candidate.meshes)[number]) &&
        mesh.isEnabled() &&
        mesh.isVisible &&
        mesh.getTotalVertices() > 0,
    );
    if (leaks.length) {
      review.error = "Legacy meshes leaked into authored study";
      return;
    }
    review.metrics = {
      ...candidate.report,
      sceneUid: scene.uid,
      sourcePins: study.sourcePins,
      camera: {
        name: review.camera,
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        target: camera.target.asArray(),
      },
      omittedFX: study.omittedFX,
      legacyVisibleMeshes: 0,
      settledFrames: settled,
      pendingData: scene.getWaitingItemsCount(),
      normalGameRenderer: true,
      shadowContact: {
        refined: review.contactShadows,
        guardedNormalBias: review.guardedNormalBias,
        bias: shadows.bias,
        normalBias: shadows.normalBias,
        mapSize: shadows.getShadowMap()?.getSize(),
        casters: shadows.getShadowMap()?.renderList?.length,
        pcf: shadows.usePercentageCloserFiltering,
        transform: shadows.getTransformMatrix().asArray(),
        normalizedDepthMin: star.getDepthMinZ(camera),
        normalizedDepthMax: star.getDepthMaxZ(camera),
        projectionNear: star.shadowMinZ ?? camera.minZ,
        projectionFar: star.shadowMaxZ ?? camera.maxZ,
        autoDepthBounds: star.autoCalcShadowZBounds,
        autoXYExtents: star.autoUpdateExtends,
        shadowFrustumSize: star.shadowFrustumSize,
        fitted: review.fittedShadowDepth,
        lightView: lightView.asArray(),
        casterDepths,
      },
      practicalLighting: {
        enabled: review.practicals,
        sourceRows: practicalRows,
        mapping:
          "2 * clamp(watts * 2.2 / 140, 0.8, 3); artistic standard falloff; range4; PBR diffuse/specular",
        disabledStudioFill: "construction-fill",
        lights: practicals.map((light) => ({
          name: light.name,
          position: light.position.asArray(),
          intensity: light.intensity,
          scaledIntensity: light.getScaledIntensity(),
          range: light.range,
          radius: light.radius,
          enabled: light.isEnabled(),
          diffuse: light.diffuse.asArray(),
          intensityMode: light.intensityMode,
          falloffType: light.falloffType,
        })),
        effectiveMeshLightCounts: [
          ...new Set(candidate.meshes.map((mesh) => mesh.lightSources.length)),
        ],
        expectedLightNames: expectedLights,
        backendCapabilities: pbrLightCapabilities(scene.getEngine()),
        backendLightLimit: pbrLightLimit(
          pbrLightCapabilities(scene.getEngine()),
        ),
        materialLightLimits: [
          ...new Set(
            candidate.meshes.map(
              (mesh) => (mesh.material as PBRMaterial).maxSimultaneousLights,
            ),
          ),
        ],
        shaderLightWitnesses: candidate.meshes.map((mesh) => ({
          mesh: mesh.name,
          material: mesh.material?.name,
          counts: mesh.subMeshes.map((sub) => {
            const defines = sub.effect?.defines ?? "";
            return Array.from({ length: 8 }, (_, index) =>
              new RegExp(`^#define LIGHT${index}(?![0-9A-Za-z_])`, "m").test(
                defines,
              ),
            ).filter(Boolean).length;
          }),
        })),
      },
    };
    review.ready = true;
    status.textContent =
      "Completed authored kit · normal game materials and lighting";
  });
}
void main().catch((error) => {
  review.error = String(error);
  status.textContent = review.error;
});
