import { publishedShipAccessBytes as publishedAccessBytes } from "./prefab-ship/wayfarer-access-assets";
import { createFurnishingPreview } from "./furnishing-preview";
import type { FurnishingOverride } from "@sidereal/content/wayfarer-furnishings";
import { getAuthoredAssetLightSources } from "./authored-asset-lighting";
import { createPbrLightBudget } from "./pbr-light-budget";
import type { SpaceRegion } from "@sidereal/sim/space-background";
import { celestialObservationRadius } from "./environment/reviewed-star-catalog";
import { createFlightActiveSet } from "./flight-active-set";
import { createDrawMeshCandidates } from "./draw-mesh-candidates";
import { createFastSnapshot } from "./fast-snapshot";
import {
  createStaticMaterialFreeze,
  invalidateStaticMaterials,
} from "./static-material-freeze";
import { createDebugVisibilityRevision } from "./debug-visibility-revision";
import { createShipGlowOccluders } from "./ship-glow-occluders";
import { setMeshRole } from "./mesh-roles";
import { legacyMeshRole, legacyCutawayFade } from "./legacy-mesh-role";
import {
  loadNativeStairEgress,
  type NativeStairEgressGeometry,
} from "./native-stair-scene";
import {
  loadNativeStairConstruction,
  type NativeStairAcceptedState,
} from "./native-stair-scene";
import type {
  ConstructionTraversalAcceptedState,
  resolveConstructionTraversalFrame,
} from "./construction-traversal";
import { createGroundItems, type GroundItem } from "./ground-items";
import {
  loadConstructionInstance,
  createConstructionLighting,
  type ConstructionRenderInput,
} from "./construction-instance";
import {
  createLocalLightBudget,
  type LocalLightLimit,
} from "./local-light-budget";
import { createAntialiasing } from "./antialiasing-pipeline";
import { createRenderEngine } from "./render-engine";
import {
  readRenderBackend,
  readWebGPUFailure,
  recordWebGPUFailure,
  resolveRenderBackend,
  createRenderBackendPreference,
  type RenderBackendChoice,
} from "./render-backend";
import { invalidatesTemporalHistory } from "./antialiasing-history";
import type { AntialiasingSettings } from "./antialiasing-settings";
import { maintainSceneTransmission } from "./transmission-lifecycle";
import {
  createGraphicsSettings,
  type GraphicsSettings,
} from "./graphics-settings";
import { createCombatAim } from "./combat-aim";
import { posePlacementHeading } from "./crew/pose-integration-motion";
import type { VoxelCrewEva } from "./crew/voxel-crew-clips";
import {
  createEvaBodyPresentation,
  evaHipLiftCorrection,
} from "./eva/eva-body";
import { createDebugFeatures, type DebugFeature } from "./debug-features";
import { createDebugCollisionSource } from "./debug-collision-source";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { cabinIsVisible, createCabinVisibility } from "./cabin-visibility";
import { LAB_INTERACTIONS } from "../../content/src/interactions";
import { PILOT_LAYOUT } from "../../content/src/pilot-layout";
import type { InstalledPlacement } from "./installed-equipment";
import { createObjectPresentation } from "./object-presentation";
import { applyCutawayVisibility, prepareCutawayMeshes } from "./cutaway";
import {
  createFlightEffects,
  type FlightEffectActuator,
} from "./flight-effects";
import { createRenderDiagnostics } from "./diagnostics";
import type { EquipmentAsset } from "./equipment";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { CrewAppearance } from "./crew/appearance";
import { createVoxelCrewVisual } from "./crew/voxel-crew";
import { createRemoteCrew, type RemoteCrewState } from "./crew/remote-crew";
import {
  createVoxelHeldItem,
  type VoxelHeldItem,
} from "./crew/voxel-held-item";
import { createVoxelFxPlayer } from "./equipment/voxel-item-fx";
import { createCombatFx, type CombatActionState } from "./combat-fx";
export type { RemoteCrewState } from "./crew/remote-crew";
export type { CombatActionState } from "./combat-fx";
import {
  moldedLightRig,
  refreshMoldedFinishes,
  setMoldedClearCoat,
  setMoldedFinishEnabled,
} from "./molded-plastic";
import { createContactShading } from "./contact-shading";
import {
  applyRenderQualityQuery,
  hardwareScalingForRenderScale,
  normalizeRenderQuality,
  readStoredRenderQuality,
  RENDER_QUALITY_DEFAULTS,
  writeRenderQuality,
  type RenderQuality,
} from "./render-quality";
import {
  createVoxelCrewOutfit,
  toneCrewEmissive,
} from "./crew/voxel-crew-outfit";
import { setGlowOccludingActors } from "./glow-occluders";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  loadPrefabShipPresentation,
  type PrefabShipViewHandle,
} from "./prefab-ship-presentation";
import {
  createImpactFlash,
  createPrefabBeamClip,
  createPrefabObjectPicker,
  prefabBindingOf,
  invalidatePrefabShipTriangles,
  type PrefabObjectPicker,
} from "./prefab-ship-interaction";
import {
  createAcceptedFurnishings,
  type AcceptedFurnishings,
} from "./accepted-furnishings";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import {
  cameraAlpha,
  angleDelta,
  screenToDeck,
  RPG_BETA,
  easeCameraZoom,
  deckCameraActorWeight,
  createObservationCamera,
} from "./camera";
import { createSpaceEnvironment, type SpaceBodyState } from "./environment";
import { DEFAULT_SPACE_VISTA } from "../../content/src/environment";
import { createPresentationFrameGate } from "./presentation-suspension";
import "@babylonjs/loaders/glTF";
export type SceneState = {
  /** Server-accepted instance overlay; independent of the immutable ship document. */
  furnishings?: AcceptedFurnishings;
  groundItems?: readonly GroundItem[];
  combat?: {
    active: boolean;
    angle: number;
    range: number;
    itemId?: string;
    shotSequence?: bigint;
    /** Server-resolved end of the latest accepted shot (ship-local metres). */
    impact?: { shotSequence: bigint; x: number; y: number; kind: string };
  };
  selectedObject?: string;
  /** Accepted occupied deck; changing UI selection cannot supply this value. */
  constructionDeckId?: string;
  /** Server-qualified standing support in metres, including the deck top. */
  constructionSupportElevation?: number;
  /** Stair accepted poses share the existing construction movement channel;
   * the kind tag prevents a stale ladder pose from driving a stair fixture. */
  constructionTraversal?:
    | ConstructionTraversalAcceptedState
    | (NativeStairAcceptedState & { kind: "stair" })
    | null;
  constructionDoors?: readonly {
    openingId: string;
    fraction: number;
    sealRetraction?: number;
  }[];
  objectLights?: readonly { placementId: string; enabled: boolean }[];
  vx?: number;
  vy?: number;
  flightActuators?: readonly FlightEffectActuator[];
  /** Retired r008 equipment asset in hand; ignored (the voxel crew draws `heldItem`). */
  equippedAsset?: EquipmentAsset | null;
  /** Voxel crew: the r001 item in the authoritative hand (its inventory definition's crewItemId);
   * null = empty hand, omitted = follow the cosmetic weapon (previews). */
  heldItem?: string | null;
  /** The local character's id (combat actions of this body drive the local crew). */
  selfCharacterId?: string;
  /** Accepted combat actions of bodies on this deck, own included (visible_combat_actions). */
  combatActions?: readonly CombatActionState[];
  heading: number;
  x: number;
  y: number;
  localX: number;
  localY: number;
  interior: boolean;
  inspect: boolean;
  grid: boolean;
  seated?: boolean;
  seatFacing?: number;
  seatContact?: { lift: number; lean: number; footSupport: number };
  sprinting?: boolean;
  /** Own character is dead (authoritative vitals): the crew rig plays and holds `death`. */
  dead?: boolean;
  vistaId?: string;
  spaceRegion?: SpaceRegion;
  reducedMotion?: boolean;
  bodies?: readonly SpaceBodyState[];
  crewAppearance?: CrewAppearance;
  /** Other characters on this deck (server views only; never inventory or health). */
  crewmates?: readonly RemoteCrewState[];
  /** Own character outside the ship (EVA): accepted pose in the own ship's frame (wiki `Systems/EVA`). */
  eva?: EvaSceneState | null;
  /** Other EVA bodies in view (`visible_eva_bodies`), in the own ship's frame. */
  evaBodies?: readonly RemoteCrewState[];
  /** The own running airlock cycle (`own_eva_airlock_cycle`): animates that hatch's outer door. */
  airlockCycle?: import("./prefab-ship/doors").AirlockCycleState | null;
  /** Ship logic of the loaded ship (`visible_ship_logic`): actuated door states and button lights. */
  shipLogic?: {
    doors: ReadonlyMap<string, boolean>;
    panels: ReadonlyMap<string, { light: string; pressedMicros: number }>;
  };
};
export type EvaSceneState = VoxelCrewEva & {
  /** Own-ship-local heading (ship convention: counter-clockwise, forward = (−sin h, cos h)). */
  localHeading: number;
  /** Presentation height above the ship datum (m): floating just above the deck plane (same plane). */
  elevation: number;
};
/** Top-down EVA camera: half view extent (m) on leaving the ship, and the slight tilt. */
const EVA_FLIGHT_ZOOM = 7;
const EVA_CAMERA_BETA = 0.22;
export interface WorldOptions {
  /** Exact reviewed proposal selection; absent keeps published presentation. */
  prefabVisualVariant?: import("./prefab-ship/visual-variant").VisualVariantSelection;
  /** Opt-in accepted shared projections, separate from the private local ship. */
  sharedWorld?: {
    bodies: (nowMs: number) => readonly SpaceBodyState[] | undefined;
    /** Other players' ships from the accepted `visible_ship_*` views (exterior only). */
    ships?: {
      store: import("./prefab-ship/remote-exteriors").RemoteShipStore;
      localShipId: () => string | undefined;
      /** `visible_actuator_exhaust`: firing thrusters per perceived ship (source id -> throttle). */
      exhaust?: () => ReadonlyMap<string, ReadonlyMap<string, number>>;
      exteriorLogic?: () => ReadonlyMap<
        string,
        {
          doors: ReadonlyMap<string, boolean>;
          panels: ReadonlyMap<string, { state: string; light: string }>;
        }
      >;
    };
  };
  construction?: ConstructionRenderInput & { visitId?: string };
  constructionEgress?: NativeStairEgressGeometry;
  /** Allow known authored exhaust geometry; accepted telemetry still drives it. */
  authoredFlightEffects?: boolean;
  onObjectSelected?: (placementId?: string) => void;
  onScene?: (scene: Scene) => void;
  /** Opt-in completed-frame samples for the no-database performance harness.
   * Raw timings use the same boundaries as diagnostics, without HUD smoothing. */
  onFrameDiagnostics?: (sample: {
    renderCpuMs: number;
    frameCpuMs: number;
    updateCpuMs: number;
  }) => void;
  /** Opt-in review pose, applied before camera-dependent controllers and passes.
   * Absent in the client: normal camera behaviour remains owned by this world. */
  onFrameCamera?: (camera: ArcRotateCamera) => void;
  /** Private harness A/B control; normal clients skip undrawn mesh work. */
  undrawnMeshWorkEnabled?: () => boolean;
  blocksCameraInput?: () => boolean;
  blocksObjectSelection?: () => boolean;
  /** Skip hidden world frames only after first usable-frame readiness completes.
   * Does not pause subscriptions, authoritative simulation, or another preview engine. */
  isPresentationSuspended?: () => boolean;
  onLoadError?: (message: string) => void;
  onLoadStage?: (
    stage: "ship" | "environment" | "crew" | "equipment" | "finishing",
  ) => void;
  onPreviewError?: (message: string) => void;
  signal?: AbortSignal;
}
type WorldHandle = Awaited<ReturnType<typeof buildWorld>>;
const canvasStarts = new WeakMap<HTMLCanvasElement, Promise<WorldHandle>>();
/** A remount must finish/dispose an old loader before reusing its WebGL canvas. */
export function createWorld(
  canvas: HTMLCanvasElement,
  onReady: (text: string) => void,
  options: WorldOptions = {},
): Promise<WorldHandle> {
  const previous = canvasStarts.get(canvas);
  const pending = (async () => {
    const old = await previous?.catch(() => undefined);
    old?.dispose();
    options.signal?.throwIfAborted();
    const world = await buildWorld(canvas, onReady, options);
    if (options.signal?.aborted) {
      world.dispose();
      options.signal.throwIfAborted();
    }
    return world;
  })();
  canvasStarts.set(canvas, pending);
  return pending;
}
async function buildWorld(
  canvas: HTMLCanvasElement,
  onReady: (text: string) => void,
  options: WorldOptions,
) {
  options.onLoadStage?.("ship");
  let initialStateApplied = false;
  let backendStorage: Storage | undefined;
  try {
    backendStorage = globalThis.localStorage;
  } catch {
    /* Device storage can be blocked. */
  }
  const requestedBackend = readRenderBackend(backendStorage);
  const webgpuFailure = readWebGPUFailure(backendStorage);
  const resolvedBackend = resolveRenderBackend(requestedBackend, webgpuFailure);
  const pageUrl =
    typeof window === "undefined" ? undefined : new URL(window.location.href);
  // Render-cost switches of the F3 debug window (render-quality.ts): saved preference plus review
  // URL overrides (?ao=, ?coat=, ?plastic=, ?glow=, ?renderScale=). SSAO is off by default.
  let renderQuality: RenderQuality = applyRenderQualityQuery(
    readStoredRenderQuality(backendStorage),
    pageUrl?.search,
  );
  setMoldedClearCoat(renderQuality.clearCoat);
  setMoldedFinishEnabled(renderQuality.plastic);
  const recoveringWebGL =
    pageUrl?.searchParams.get("rendererFallback") === "webgl";
  const reloadWithWebGL = () => {
    if (!pageUrl) return;
    pageUrl.searchParams.set("rendererFallback", "webgl");
    window.location.replace(pageUrl);
  };
  // WebGPU failures after startup (a shader glslang rejects, an invalid pipeline, a lost
  // device) are remembered on this device; Auto then reloads straight into WebGL2 instead
  // of leaving a broken scene. An explicit WebGPU choice keeps running and reports it.
  let backend: ReturnType<typeof createRenderBackendPreference> | undefined;
  const onWebGPUFailure = (reason: string) => {
    console.warn(`WebGPU failure: ${reason}`);
    recordWebGPUFailure(backendStorage, reason);
    backend?.fail(
      requestedBackend === "auto"
        ? `WebGPU failed (${reason}). Reloading with WebGL2.`
        : `WebGPU failed (${reason}). Choose Auto or WebGL2 and reload.`,
    );
    if (requestedBackend === "auto") reloadWithWebGL();
  };
  const createdEngine = await createRenderEngine(
    canvas,
    recoveringWebGL ? "webgl" : resolvedBackend.target,
    onWebGPUFailure,
  );
  if (!createdEngine.engine) {
    reloadWithWebGL();
    throw Error("Reloading with WebGL after WebGPU initialization failed.");
  }
  const engine = createdEngine.engine;
  backend = createRenderBackendPreference(
    createdEngine.active,
    requestedBackend,
    backendStorage,
    recoveringWebGL
      ? `WebGL2 recovery mode${webgpuFailure ? ` after: ${webgpuFailure}` : ""}.`
      : (resolvedBackend.reason ?? createdEngine.reason),
    // Auto on this device: WebGPU unless it is missing or has failed here.
    webgpuFailure || createdEngine.reason ? "webgl" : "webgpu",
  );
  const backendPreference = backend;
  const scene = new Scene(engine);
  const pbrLights = createPbrLightBudget(scene, () =>
    drawMeshCandidates.receivers(),
  );
  // Review aid: `?slowmo=0.25` plays crew clips, draw/holster and weapon effects at that fraction
  // of real time (presentation only; the server clock is unaffected).
  const slowmo = Number(pageUrl?.searchParams.get("slowmo"));
  const presentationScale = slowmo > 0.02 && slowmo < 1 ? slowmo : 1;
  scene.animationTimeScale = presentationScale;
  const presentationNow = () => performance.now() * presentationScale;
  const transmissionLifecycle = maintainSceneTransmission(
    scene,
    () => debugFeatures.snapshot(),
    () => [...lighting.globalLights, ...moldedLightRig(scene).globalLights],
  );
  // Object selection performs one explicit click ray; camera/HUD use DOM input.
  scene.skipPointerMovePicking = true;
  scene.skipPointerDownPicking = true;
  scene.skipPointerUpPicking = true;
  const diagnostics = createRenderDiagnostics(scene);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.018, 0.043, 0.069, 1);
  scene.environmentTexture = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentIntensity = 0.28;
  const camera = new ArcRotateCamera(
    "flight-camera",
    Math.PI / 2,
    0.015,
    90,
    Vector3.Zero(),
    scene,
  );
  camera.mode = Camera.PERSPECTIVE_CAMERA;
  camera.fov = 0.5;
  camera.minZ = 0.1;
  camera.maxZ = 1600;
  options.onScene?.(scene);
  // The DOM loading screen covers startup. Rendering each partial GLB assembly
  // compiles transient material/effect combinations before the final lighting
  // and visibility state exists, competing with asset decoding on slower GPUs.
  // Start rendering only once the scene's loaders and wiring are assembled.
  const shipRoot = new TransformNode("ship-frame", scene);
  const environment = createSpaceEnvironment(scene);
  let crew: Awaited<ReturnType<typeof createVoxelCrewVisual>> | undefined;
  let crewOutfit: ReturnType<typeof createVoxelCrewOutfit> | undefined;
  /** Voxel crew: the held r001 item with draw/holster transitions. */
  let heldItem: VoxelHeldItem | undefined;
  // Set once lighting and glow exist; outfit parts that load later re-register through it.
  let refreshCrewPresentation = () => {};
  let avatar = new TransformNode("crew-unloaded", scene);
  avatar.parent = shipRoot;
  const marker = CreateTorus(
    "crew-marker",
    { diameter: 1.2, thickness: 0.035, tessellation: 32 },
    scene,
  );
  setMeshRole(marker, "effect");
  const cyan = new StandardMaterial("crew-marker-mat", scene);
  cyan.emissiveColor = Color3.FromHexString("#68ded0");
  marker.material = cyan;
  marker.parent = shipRoot;
  let imported: { meshes: AbstractMesh[] };
  let installed: InstalledPlacement[] = [];
  const shipEquipment: InstalledPlacement[] = [];
  let assetFailure = false;
  let walkingElevation = 0.1875;
  let constructionFrame:
    { centerX: number; centerY: number; halfExtent: number } | undefined;
  let updateConstructionView:
    ((position: Vector3, interior: boolean) => void) | undefined;
  let updateConstructionDoors:
    | ((
        states: readonly {
          openingId: string;
          fraction: number;
          sealRetraction?: number;
        }[],
      ) => void)
    | undefined;
  let updateConstructionTraversal:
    | ((
        occupiedDeckId: string | undefined,
        accepted: SceneState["constructionTraversal"],
      ) => ReturnType<typeof resolveConstructionTraversalFrame>)
    | undefined;
  let disposeConstruction: (() => void) | undefined;
  // Trusted prefab ships (SHIPS-PREFABS): the dressed ship replaces the native
  // floor-plate presentation; collision and walking stay authoritative.
  let prefabView: PrefabShipViewHandle | undefined;
  let lastStairPosition: [number, number] | undefined;
  let stairTravelHeading: number | undefined;
  try {
    if (options.construction || options.constructionEgress) {
      const loaded = options.constructionEgress
        ? await loadNativeStairEgress(
            scene,
            shipRoot,
            options.constructionEgress,
          )
        : ((await loadNativeStairConstruction(
            scene,
            shipRoot,
            options.construction!,
          )) ??
          (await loadConstructionInstance(
            scene,
            shipRoot,
            options.construction!,
          )));
      installed = loaded.placements;
      imported = { meshes: loaded.meshes };
      walkingElevation = loaded.walkingElevation;
      constructionFrame = loaded.cameraFrame;
      updateConstructionDoors = loaded.setDoors;
      updateConstructionView = loaded.setView;
      if ("applyAcceptedStair" in loaded)
        updateConstructionTraversal = (deckId, accepted) =>
          loaded.applyAcceptedStair(
            deckId,
            accepted && "kind" in accepted && accepted.kind === "stair"
              ? accepted
              : undefined,
          );
      else if ("applyAcceptedTraversal" in loaded)
        updateConstructionTraversal = (deckId, accepted) =>
          loaded.applyAcceptedTraversal(
            deckId,
            accepted && "destinationDeckId" in accepted ? accepted : undefined,
          );
      if ("dispose" in loaded) disposeConstruction = loaded.dispose;
      if (options.construction) {
        prefabView = await loadPrefabShipPresentation(
          scene,
          shipRoot,
          options.construction.documentJson,
          options.prefabVisualVariant,
          options.construction.furnishingsJson,
          publishedAccessBytes,
        );
        if (prefabView)
          for (const mesh of imported.meshes) mesh.setEnabled(false);
      }
    } else {
      // No authorized construction scene: the character has no vessel.
      imported = { meshes: [] };
      installed = [];
    }
    options.onLoadStage?.("environment");
    await environment.ready;
    options.onLoadStage?.("crew");
    {
      // Voxel crew: authored actions drive the arms. The head kit and armour follow the
      // character's appearance and equipped inventory (see customizeCrew).
      const voxel = await createVoxelCrewVisual(scene, shipRoot, undefined, {
        shared: true,
      });
      crew = voxel;
      crewOutfit = createVoxelCrewOutfit(scene, voxel, {
        onChange: () => refreshCrewPresentation(),
      });
      heldItem = createVoxelHeldItem(scene, voxel, {
        onChange: () => {
          antialiasing.resetHistory();
          refreshCrewPresentation();
        },
        reducedMotion: () => !!state.reducedMotion,
        // The first item of a session is already in hand; later changes draw and holster.
        instant: () => firstFrame,
        now: presentationNow,
        resting: () => !!state.seated || (!state.combat?.active && !state.eva),
      });
      avatar.dispose();
      avatar = crew.root;
    }
  } catch (error) {
    const message = "Ship model could not load: " + String(error);
    if (!options.onLoadError) {
      environment.dispose();
      scene.dispose();
      engine.dispose();
      throw new Error(message);
    }
    assetFailure = true;
    options.onLoadError(message);
    imported = { meshes: [] };
  }
  const assembly = new TransformNode("same-ship-assembly", scene);
  assembly.parent = shipRoot;
  for (const mesh of imported.meshes) if (!mesh.parent) mesh.parent = assembly;
  for (const mesh of imported.meshes) {
    if (!mesh.metadata?.role) setMeshRole(mesh, legacyMeshRole(mesh));
    if (legacyCutawayFade(mesh)) mesh.metadata.cutawayFade = true;
  }
  const roof = imported.meshes.filter(
    (m) =>
      m.getTotalVertices() > 0 &&
      m.metadata?.role === "roof" &&
      m.metadata?.cutawayFade,
  );
  prepareCutawayMeshes(roof);
  const lighting = createConstructionLighting(scene, imported.meshes);
  environment.setPrimaryLight(lighting.primaryLight);
  lighting.addActor(avatar.getChildMeshes());
  const cabinVisibility = createCabinVisibility(
    imported.meshes,
    avatar,
    installed,
    new Set(
      LAB_INTERACTIONS.filter((object) => object.kind === "light").map(
        (object) => object.placementId,
      ),
    ),
  );
  const fixturePlacements = shipEquipment;
  let debugCollision = createDebugCollisionSource(options.construction);
  const debugFeatures = createDebugFeatures(
    scene,
    [
      ...fixturePlacements.map((p) => p.node),
      ...imported.meshes.filter((m) =>
        /^GEO-(equipment(?:-|$)|room-storage-container(?:-|$))/.test(m.name),
      ),
    ],
    [avatar, marker],
    {
      characterRoots: () => [avatar],
      collisionScope: () =>
        options.constructionEgress
          ? "Standalone egress preview has no admitted collision frame"
          : debugCollision.resolve({
              deckId: state.constructionDeckId,
              doors: state.constructionDoors,
            }).scope,
      collisionFrames: () => {
        if (options.constructionEgress) return [];
        const source = debugCollision.resolve({
          deckId: state.constructionDeckId,
          doors: state.constructionDoors,
        });
        const world = shipRoot.computeWorldMatrix(true);
        return source.frames.map((frame, i) => ({
          id: `walking:${i}`,
          frame,
          world,
          scope: source.scope,
        }));
      },
    },
  );
  const labels = new TransformNode("room-labels", scene);
  labels.parent = shipRoot;
  const emissive = new StandardMaterial("instrument-emission", scene);
  emissive.emissiveColor = Color3.FromHexString("#31bafa");
  emissive.disableLighting = true;
  const emitters: Mesh[] = [];
  const glow = new GlowLayer("local-instruments", scene, {
    mainTextureFixedSize: 512,
    blurKernelSize: 24,
  });
  glow.intensity = 0.4;
  const flightEffects =
    !options.construction ||
    !options.authoredFlightEffects ||
    options.constructionEgress
      ? {
          meshes: [] as Mesh[],
          update(_outputs: unknown, _motion?: boolean) {
            return false;
          },
          dispose() {},
        }
      : createFlightEffects(scene, shipRoot);
  const localGlowOcclusion = createShipGlowOccluders(scene, shipRoot, glow);
  // Other characters on this deck: created once the local crew exists (voxel bundle only).
  let remoteCrew: ReturnType<typeof createRemoteCrew> | undefined;
  /** Other characters outside ships (EVA), drawn in every view. */
  let evaCrew: ReturnType<typeof createRemoteCrew> | undefined;
  let ownEva: ReturnType<typeof createEvaBodyPresentation> | undefined;
  let evaShown = false;
  let flightZoomBeforeEva: number | undefined;
  const actorMeshes = () => [
    ...(crew?.root.getChildMeshes() ?? []),
    ...(remoteCrew?.meshes() ?? []),
    ...(evaCrew?.meshes() ?? []),
  ];
  const refreshLocalGlow = () =>
    localGlowOcclusion.set([
      ...flightEffects.meshes,
      ...emitters,
      ...imported.meshes,
      ...actorMeshes(),
    ]);
  refreshLocalGlow();
  environment.setOccluders([
    ...imported.meshes,
    ...(crew?.root.getChildMeshes() ?? []),
  ]);
  // Crew meshes (body, head kit, armour, held item) hide ship bloom behind them in every glow
  // layer, receive the actor lighting and stay capped to a small emissive accent.
  refreshCrewPresentation = () => {
    if (!crew) return;
    const meshes = actorMeshes();
    if (crewOutfit) {
      // Molded-plastic finish (inside toneCrewEmissive) plus the shared cool fill and rim.
      toneCrewEmissive(meshes);
      moldedLightRig(scene).include(meshes);
    }
    refreshLocalGlow();
    environment.setOccluders([...imported.meshes, ...meshes]);
    lighting.addActor(meshes);
    setGlowOccludingActors(scene, meshes);
  };
  setGlowOccludingActors(scene, crew?.root.getChildMeshes() ?? []);
  // Voxel crew parts that loaded before this point get the shared finish and light rig now.
  if (crewOutfit) refreshCrewPresentation();
  // Prefab ships (SHIP-INTERACTION): geometric object picking over the batched dressed view,
  // beam clipping against the compiled structure, and the authoritative impact flash.
  const prefabBinding = prefabView
    ? prefabBindingOf(
        options.construction?.documentJson,
        options.construction?.furnishingsJson,
      )
    : undefined;
  let prefabPicker: PrefabObjectPicker | undefined = prefabBinding
    ? createPrefabObjectPicker(
        scene,
        canvas,
        shipRoot,
        prefabBinding,
        () => state.interior,
      )
    : undefined;
  const furnishingPreview = prefabBinding
    ? createFurnishingPreview(scene, canvas, shipRoot, prefabBinding, () => {
        fastSnapshot?.invalidate();
        flightActiveSet.invalidate();
        antialiasing.resetHistory();
      })
    : undefined;
  const acceptedFurnishings =
    prefabBinding && options.construction
      ? createAcceptedFurnishings(
          scene,
          shipRoot,
          prefabBinding,
          {
            instanceId: options.construction.instanceId,
            revision: options.construction.furnishingRevision ?? 0n,
            json: options.construction.furnishingsJson ?? "{}",
          },
          () => furnishingPreview?.clear(),
          (meshes) => {
            invalidatePrefabShipTriangles(meshes);
            invalidateStaticMaterials(scene);
            fastSnapshot?.invalidate();
            flightActiveSet.invalidate();
            antialiasing.resetHistory();
          },
        )
      : undefined;
  const impactFlash = createImpactFlash(scene, shipRoot);
  let lastImpactSequence: bigint | undefined;
  const objects = createObjectPresentation(
    canvas,
    scene,
    imported.meshes,
    installed,
    () =>
      (options.blocksCameraInput?.() ?? false) ||
      (options.blocksObjectSelection?.() ?? false),
    options.onObjectSelected,
    prefabPicker ? (event) => prefabPicker?.pick(event) : undefined,
  );
  const groundItems = createGroundItems(scene, shipRoot);
  const graphics = createGraphicsSettings(scene);
  const antialiasing = createAntialiasing(scene, camera, {
    temporalResetIntegrated: true,
  });
  // Molded-plastic contact shading (optional SSAO over the pre-pass targets; see contact-shading.ts).
  const contactShading = createContactShading(
    scene,
    camera,
    antialiasing,
    renderQuality.ssao,
  );
  /** Apply (live) and save the F3 render-cost switches. Presentation only. */
  function applyRenderQuality(next: RenderQuality) {
    transmissionLifecycle.invalidate();
    const previous = renderQuality;
    renderQuality = normalizeRenderQuality(next);
    writeRenderQuality(backendStorage, renderQuality);
    contactShading.enabled = renderQuality.ssao;
    if (
      previous.plastic !== renderQuality.plastic ||
      previous.clearCoat !== renderQuality.clearCoat
    ) {
      setMoldedFinishEnabled(renderQuality.plastic);
      setMoldedClearCoat(renderQuality.clearCoat);
      refreshMoldedFinishes(scene);
    }
    if (debugFeatures.snapshot().glow !== renderQuality.glow)
      debugFeatures.toggle("glow");
    if (previous.renderScale !== renderQuality.renderScale) {
      engine.setHardwareScalingLevel(
        hardwareScalingForRenderScale(renderQuality.renderScale),
      );
      resizePending = true;
    }
    fastSnapshot?.invalidate();
    flightActiveSet.invalidate();
    invalidateStaticMaterials(scene);
    antialiasing.resetHistory();
  }
  if (!renderQuality.glow) debugFeatures.toggle("glow");
  // A reconstructed scene starts with fresh history. Newly loaded geometry also
  // invalidates samples; this covers remote exteriors and async equipment.
  let temporalGeometryDirty = false;
  const temporalMeshObserver = scene.onNewMeshAddedObservable.add(() => {
    temporalGeometryDirty = true;
  });
  const temporalGeometryObserver = scene.onBeforeRenderObservable.add(() => {
    if (!temporalGeometryDirty) return;
    temporalGeometryDirty = false;
    antialiasing.resetHistory();
  });
  let temporalStateAt = performance.now();
  let temporalAppearance = "";
  const localLights = createLocalLightBudget();
  const combatAim = createCombatAim(scene, canvas, shipRoot, imported.meshes);
  /** Last pointer position (client pixels) for the EVA facing. */
  let pointerClient: { x: number; y: number } | undefined;
  for (const mesh of combatAim.meshes) glow.addIncludedOnlyMesh(mesh);
  let prefabBeamClip = prefabBinding
    ? createPrefabBeamClip(shipRoot, prefabBinding)
    : undefined;
  if (crewOutfit && !assetFailure)
    remoteCrew = createRemoteCrew(scene, shipRoot, {
      onMeshesChanged: () => refreshCrewPresentation(),
      onEffectMesh: (mesh) => glow.addIncludedOnlyMesh(mesh),
      // Shots of other bodies play the r001 weapon FX from visible_combat_actions.
      tracers: false,
    });
  if (crewOutfit && crew && !assetFailure) {
    const voxel = crew as Awaited<ReturnType<typeof createVoxelCrewVisual>>;
    ownEva = createEvaBodyPresentation(scene, voxel, {
      onMeshes: (meshes) => meshes.forEach((m) => glow.addIncludedOnlyMesh(m)),
    });
    evaCrew = createRemoteCrew(scene, shipRoot, {
      onMeshesChanged: () => refreshCrewPresentation(),
      onEffectMesh: (mesh) => glow.addIncludedOnlyMesh(mesh),
      onShot: (impact) => {
        if (impact.struck)
          for (const mesh of impactFlash.play(impact.x, impact.y, 1.3))
            glow.addIncludedOnlyMesh(mesh as Mesh);
      },
    });
  }
  // r001 weapon effects for every accepted combat action on this deck (local and remote).
  const fxPlayer = heldItem
    ? createVoxelFxPlayer(scene, shipRoot, {
        onMesh: (mesh) => glow.addIncludedOnlyMesh(mesh as Mesh),
        timeScale: presentationScale,
      })
    : undefined;
  const combatFx = fxPlayer
    ? createCombatFx(scene, shipRoot, fxPlayer, (id) => {
        if (id === state.selfCharacterId && crew && "bundle" in crew)
          return {
            root: avatar,
            held: heldItem,
            play: (clip) => crew && "play" in crew && crew.play(clip as never),
          };
        const body = remoteCrew?.body(id);
        return body
          ? {
              root: body.crew.root,
              held: body.held,
              play: (clip) => body.crew.play(clip as never),
            }
          : undefined;
      })
    : undefined;
  // The laser sight stops at structure (prefab ships) and at crewmates, as the server shot does.
  if (prefabBeamClip || remoteCrew)
    combatAim.setClip((origin, direction, range) => {
      const structure = prefabBeamClip?.(origin, direction, range),
        body = remoteCrew?.beamClip(origin, direction, range);
      return structure === undefined
        ? body
        : body === undefined
          ? structure
          : Math.min(structure, body);
    });
  let state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: PILOT_LAYOUT.station.y,
    interior: false,
    inspect: false,
    grid: false,
  };
  const displayed: Pick<
    SceneState,
    "heading" | "x" | "y" | "localX" | "localY"
  > = {
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: PILOT_LAYOUT.station.y,
  };
  let initialized = false;
  const initialDeckZoom = constructionFrame
    ? Math.max(3, Math.min(12, constructionFrame.halfExtent * 1.5))
    : 12;
  const initialFlightZoom = constructionFrame
    ? Math.max(4, constructionFrame.halfExtent * 1.5)
    : 55;
  let blend = 0,
    orbit = 0.45,
    zoom = initialDeckZoom;
  let flightZoom = initialFlightZoom;
  let displayedZoom = zoom,
    displayedFlightZoom = flightZoom;
  let focusedBodyId: string | undefined;
  const observation = createObservationCamera();
  let resizePending = true;
  engine.setHardwareScalingLevel(
    hardwareScalingForRenderScale(renderQuality.renderScale),
  );
  // Resize clears WebGL's drawing buffer. Keep that clear in the render frame
  // that immediately redraws the scene and HUD, never in ResizeObserver's turn.
  const resize = () => {
    resizePending = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  let drag: { id: number; x: number; y: number } | undefined;
  const down = (e: PointerEvent) => {
    if (
      (!state.interior && !focusedBodyId) ||
      e.button !== 2 ||
      options.blocksCameraInput?.()
    )
      return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (focusedBodyId) observation.drag(e.clientX - drag.x, e.clientY - drag.y);
    else orbit -= (e.clientX - drag.x) * 0.007;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const up = () => {
    if (drag && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
    drag = undefined;
  };
  const wheel = (e: WheelEvent) => {
    if (options.blocksCameraInput?.()) return;
    e.preventDefault();
    if (focusedBodyId) {
      observation.wheel(
        e.deltaY *
          (e.deltaMode === 1
            ? 20
            : e.deltaMode === 2
              ? canvas.clientHeight
              : 1),
      );
      return;
    }
    if (!state.interior) {
      flightZoom = Math.max(
        constructionFrame ? 2 : 18,
        Math.min(
          650,
          flightZoom *
            Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.002),
        ),
      );
      return;
    }
    zoom = Math.max(
      constructionFrame ? 2 : 5,
      Math.min(
        18,
        zoom * Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.001),
      ),
    );
  };
  const context = (e: MouseEvent) => {
    if (state.interior || focusedBodyId) e.preventDefault();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("lostpointercapture", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", context);
  window.addEventListener("blur", up);
  // Other players' ships: exterior only, dynamic LOD, one shared prototype per published hull
  // (wiki `Architecture/Visibility and Interest Management`). Loads in the background; a ship
  // whose hull is still loading is drawn as a marker, never hidden.
  const sharedShips = options.sharedWorld?.ships;
  const remoteShips = sharedShips
    ? await import("./prefab-ship/remote-exteriors").then(
        ({ createRemoteShipExteriors }) =>
          createRemoteShipExteriors(scene, sharedShips.store, {
            localShipId: sharedShips.localShipId,
            accessResolver: publishedAccessBytes,
            onError: (error) =>
              console.warn("remote ship exterior unavailable", error),
          }),
      )
    : undefined;
  const visibleBodies = (nowMs: number) =>
    options.sharedWorld?.bodies(nowMs) ?? state.bodies ?? [];
  const debugVisibilityRevision = createDebugVisibilityRevision();
  const drawMeshCandidates = createDrawMeshCandidates(
    scene,
    options.undrawnMeshWorkEnabled,
  );
  const staticMaterials = createStaticMaterialFreeze(
    scene,
    options.undrawnMeshWorkEnabled,
    () => drawMeshCandidates.materialUses(),
  );
  const flightActiveSet = createFlightActiveSet(scene);
  const fastSnapshot = engine.isWebGPU ? createFastSnapshot(scene) : undefined;
  let firstFrame = true;
  const presentationFrames = createPresentationFrameGate(
    options.isPresentationSuspended,
  );
  const renderWorldFrame = () => {
    // A failed initial load stays covered by Retry/Sign out. Do not keep
    // submitting the hidden scene while the user recovers from that failure.
    if (assetFailure) return;
    const frameStarted = performance.now();
    // Reconcile overrides only when normal visibility/power intent changes.
    // Re-enabling every hidden fixture each frame defeats the performance probe.
    debugFeatures.beforeFrame(
      debugVisibilityRevision(
        cabinIsVisible(state.interior, blend, !!focusedBodyId),
        state.objectLights,
      ),
    );
    if (resizePending) {
      resizePending = false;
      engine.resize();
    }
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1),
      motion = 1 - Math.exp(-dt * 18),
      transition = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    if (!initialized) {
      Object.assign(displayed, state);
      initialized = true;
    }
    // All ship, actor and camera transforms share this render-only time line.
    displayed.heading += angleDelta(displayed.heading, state.heading) * motion;
    // A server relocation (respawn) is a jump, not a walk: snap instead of gliding through walls.
    if (
      Math.hypot(
        state.localX - displayed.localX,
        state.localY - displayed.localY,
      ) > 2
    ) {
      displayed.localX = state.localX;
      displayed.localY = state.localY;
    }
    for (const key of ["x", "y", "localX", "localY"] as const)
      displayed[key] += (state[key] - displayed[key]) * motion;
    blend += ((state.interior ? 1 : 0) - blend) * transition;
    displayedZoom = state.reducedMotion
      ? zoom
      : easeCameraZoom(displayedZoom, zoom, dt);
    displayedFlightZoom = state.reducedMotion
      ? flightZoom
      : easeCameraZoom(displayedFlightZoom, flightZoom, dt);
    shipRoot.rotation.y = displayed.heading;
    const traversalFrame = updateConstructionTraversal?.(
      state.constructionDeckId,
      state.constructionTraversal,
    );
    if (traversalFrame) walkingElevation = traversalFrame.walkingElevation;
    if (
      options.construction &&
      state.constructionDeckId &&
      !traversalFrame?.inTransit &&
      Number.isFinite(state.constructionSupportElevation)
    )
      walkingElevation = state.constructionSupportElevation!;
    const eva = state.eva ?? undefined;
    if (eva)
      walkingElevation =
        eva.elevation -
        evaHipLiftCorrection(
          eva,
          (clip) => !!crew && "hasClip" in crew && crew.hasClip(clip),
        );
    if (!!eva !== evaShown) {
      // Leaving the ship: close top-down EVA view; coming back: the previous flight zoom.
      if (eva) {
        flightZoomBeforeEva = flightZoom;
        flightZoom = EVA_FLIGHT_ZOOM;
      } else if (flightZoomBeforeEva !== undefined) {
        flightZoom = flightZoomBeforeEva;
        flightZoomBeforeEva = undefined;
      }
    }
    const acceptedStair =
      state.constructionTraversal &&
      "kind" in state.constructionTraversal &&
      state.constructionTraversal.kind === "stair"
        ? state.constructionTraversal
        : undefined;
    const stairMoving = !!(
      traversalFrame?.inTransit &&
      acceptedStair &&
      ["walking", "stepping", "returning"].includes(acceptedStair.phase)
    );
    if (traversalFrame?.inTransit && acceptedStair) {
      if (lastStairPosition) {
        const sx = acceptedStair.x - lastStairPosition[0],
          sy = acceptedStair.y - lastStairPosition[1];
        if (Math.hypot(sx, sy) > 1e-6) stairTravelHeading = Math.atan2(sx, sy);
      }
      lastStairPosition = [acceptedStair.x, acceptedStair.y];
    } else if (lastStairPosition) {
      // The terminal authority commit changes actor XY/deck together. Do not
      // visually slide back through the source anchor after the stair row clears.
      displayed.localX = state.localX;
      displayed.localY = state.localY;
      lastStairPosition = undefined;
      stairTravelHeading = undefined;
    }
    const dx = state.localX - displayed.localX,
      dy = state.localY - displayed.localY;
    const walking = eva
      ? eva.phase === "maglocked" && eva.walking
      : !state.seated &&
        (stairMoving ||
          (Math.hypot(dx, dy) > 0.015 && !traversalFrame?.inTransit));
    const movementHeading = stairMoving
      ? stairTravelHeading
      : walking
        ? Math.atan2(dx, dy)
        : undefined;
    avatar.rotation.y = -posePlacementHeading({
      currentHeading: -avatar.rotation.y,
      travelHeading: movementHeading,
      bound: false,
      active: !!state.combat?.active,
      sprinting: state.sprinting,
    });
    if (state.combat?.active && !state.seated)
      avatar.rotation.y = -state.combat.angle;
    if (state.seated) avatar.rotation.y = state.seatFacing ?? 0;
    // EVA: the accepted body heading turns the body unless it aims (then it faces the aim). The
    // server heading changes continuously at 20 Hz (rigid-body spin); ease between ticks.
    if (eva && !state.combat?.active)
      avatar.rotation.y +=
        angleDelta(avatar.rotation.y, eva.localHeading) * Math.min(1, dt * 18);
    const cabinVisible = cabinIsVisible(state.interior, blend, !!focusedBodyId);
    updateConstructionDoors?.(state.constructionDoors ?? []);
    cabinVisibility.update(cabinVisible, state.objectLights ?? []);
    lighting.setCabinVisible(cabinVisible);
    groundItems.update(state.groundItems ?? [], cabinVisible);
    // The own body outside the ship is drawn in the (top-down) space view too.
    if (eva) avatar.setEnabled(debugFeatures.snapshot().characters);
    else if (evaShown && !cabinVisible) avatar.setEnabled(false);
    evaShown = !!eva;
    ownEva?.update(eva, dt, {
      reducedMotion: state.reducedMotion,
      dead: state.dead,
    });
    if ((cabinVisible || eva) && debugFeatures.snapshot().characters)
      crew?.update({
        eva,
        moving: walking,
        combat: state.combat?.active ?? false,
        seated: state.seated ?? false,
        sprinting: state.sprinting ?? false,
        dead: state.dead ?? false,
        reducedMotion: state.reducedMotion,
        shotSequence: state.combat?.shotSequence,
      });
    remoteCrew?.frame(cabinVisible && debugFeatures.snapshot().characters, {
      reducedMotion: state.reducedMotion,
    });
    evaCrew?.frame(debugFeatures.snapshot().characters, {
      reducedMotion: state.reducedMotion,
    });
    crew?.setSeatContact(state.seated ? state.seatContact : undefined);
    avatar.position.set(
      displayed.localX,
      walkingElevation + (state.seated ? (state.seatContact?.lift ?? 0) : 0),
      -displayed.localY,
    );
    if (traversalFrame?.acceptedPositionM) {
      const [x, y, z] = traversalFrame.acceptedPositionM;
      avatar.position.set(x, z, -y);
    }
    // Native r002 deck datum; this offset is presentation, not simulation height.
    marker.position.copyFrom(avatar.position);
    marker.position.y += 0.02;
    marker.setEnabled(cabinVisible && blend > 0.2);
    for (const mesh of roof) {
      applyCutawayVisibility(mesh, focusedBodyId ? 1 : 1 - blend);
    }
    const cameraLocal = camera.alpha + displayed.heading;
    labels.setEnabled(cabinVisible && blend > 0.8);
    for (const label of labels.getChildMeshes())
      if (label.metadata?.side)
        label.setEnabled(label.metadata.side * Math.cos(cameraLocal) < 0);
    lighting.update(blend, avatar.position.x, -avatar.position.z);
    if (flightEffects.update(state.flightActuators ?? [], state.reducedMotion))
      refreshLocalGlow();
    camera.alpha +=
      angleDelta(
        camera.alpha,
        cameraAlpha(displayed.heading, state.interior, orbit),
      ) * transition;
    camera.beta +=
      ((state.interior
        ? RPG_BETA
        : state.inspect
          ? 0.6
          : eva
            ? EVA_CAMERA_BETA
            : 0.015) -
        camera.beta) *
      transition;
    const c = Math.cos(displayed.heading),
      s = Math.sin(displayed.heading);
    // EVA: the top-down camera follows the body, not the ship centre.
    const actorBlend = eva
      ? 1
      : blend * deckCameraActorWeight(displayedZoom, initialDeckZoom);
    const targetLocalX =
      (constructionFrame?.centerX ?? 0) * (1 - actorBlend) +
      avatar.position.x * actorBlend;
    const targetLocalY =
      (constructionFrame?.centerY ?? 0) * (1 - actorBlend) +
      -avatar.position.z * actorBlend;
    camera.target.set(
      targetLocalX * c - targetLocalY * s,
      0.8 * blend +
        (options.construction || options.constructionEgress
          ? avatar.position.y
          : 0),
      -(targetLocalX * s + targetLocalY * c),
    );
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight),
      half = displayedFlightZoom * (1 - blend) + displayedZoom * blend;
    camera.radius = half / Math.tan(camera.fov / 2);
    const bodies = visibleBodies(frameStarted);
    const focus = bodies.find((body) => body.id === focusedBodyId);
    if (focusedBodyId && !focus) {
      focusedBodyId = undefined;
      up();
    }
    if (focus) {
      camera.target.set(
        focus.x - displayed.x,
        focus.height,
        -(focus.y - displayed.y),
      );
      const observed = observation.frame(
        celestialObservationRadius(focus, aspect),
        dt,
        state.reducedMotion,
      );
      camera.alpha = observed.alpha;
      camera.beta = observed.beta;
      camera.radius = observed.radius;
    }
    options.onFrameCamera?.(camera);
    camera.minZ = Math.max(0.1, camera.radius * 0.02);
    camera.maxZ = Math.max(1600, camera.radius + 1600);
    if (options.onFrameCamera) camera.getViewMatrix(true);
    updateConstructionView?.(camera.position, state.interior);
    prefabView?.setInterior(state.interior);
    // Per-actuator exhaust from the achieved allocation (own ship; FLIGHT-IFCS).
    prefabView?.updateExhaust(state.flightActuators ?? [], performance.now());
    // Door leaves (presentation only): the airlock outer door follows the EVA cycle; interior
    // doors slide open for nearby characters.
    prefabView?.updateDoors({
      nowMs: Date.now(),
      // Real elapsed time (the frame dt is capped at 0.1 s): on slow software-rendered clients
      // the leaves still finish their stroke inside the airlock cycle window.
      dt: Math.min(engine.getDeltaTime() / 1000, 1),
      cycle: state.airlockCycle ?? null,
      actors: [
        ...(state.eva ? [] : [{ x: displayed.localX, y: displayed.localY }]),
        ...(state.crewmates ?? []).map((c) => ({ x: c.localX, y: c.localY })),
      ],
      cyclingBodies: (state.evaBodies ?? [])
        .filter((b) => b.eva?.cycling)
        .map((b) => ({ x: b.localX, y: b.localY })),
      logic: state.shipLogic?.doors,
    });
    prefabView?.updatePanels(state.shipLogic?.panels, Date.now());
    camera.getViewMatrix(true);
    remoteShips?.update(
      { x: displayed.x, y: displayed.y },
      frameStarted,
      camera,
      engine.getRenderHeight(),
      sharedShips?.exhaust?.(),
      undefined,
      sharedShips?.exteriorLogic?.(),
    );
    environment.update({
      id: state.vistaId ?? DEFAULT_SPACE_VISTA,
      region: state.spaceRegion,
      x: displayed.x,
      y: displayed.y,
      vx: state.vx ?? 0,
      vy: state.vy ?? 0,
      viewHalfExtent: camera.radius * Math.tan(camera.fov / 2),
      dustParallax: !state.interior && !focusedBodyId,
      aspect,
      dt,
      enabled: !state.grid,
      planetsEnabled: debugFeatures.snapshot().planets,
      reducedMotion: state.reducedMotion ?? false,
      bodies,
    });
    debugFeatures.afterFrame();
    const lightingAllowed = scene.lightsEnabled;
    localLights.update(
      [
        ...lighting.getLocalLightSources(lightingAllowed),
        ...getAuthoredAssetLightSources(scene, lightingAllowed),
        ...shipEquipment.flatMap((placement) =>
          placement.lighting.getLocalLightSources(lightingAllowed),
        ),
      ],
      { focus: camera.target },
    );
    if (pbrLights.update(camera.target)) {
      fastSnapshot?.invalidate();
      flightActiveSet.invalidate();
      antialiasing.resetHistory();
    }
    const updateCpuMs = performance.now() - frameStarted;
    staticMaterials.prepare();
    const snapshotCandidate =
      fastSnapshot?.prepare({
        ready:
          !firstFrame &&
          !state.inspect &&
          !focusedBodyId &&
          !furnishingPreview?.active,
        reducedMotion: !!state.reducedMotion,
        temporal: antialiasing.snapshot().effective.mode === "taa",
        displayRevision: 0,
      }) ?? false;
    flightActiveSet.prepare(
      !snapshotCandidate &&
        !firstFrame &&
        !!state.seated &&
        !state.interior &&
        !state.inspect &&
        !focusedBodyId &&
        blend < 0.001,
    );
    const renderStarted = options.onFrameDiagnostics ? performance.now() : 0;
    scene.render();
    const frameCpuMs = performance.now() - frameStarted;
    diagnostics.recordFrameCpu(frameCpuMs, updateCpuMs);
    options.onFrameDiagnostics?.({
      renderCpuMs: frameStarted + frameCpuMs - renderStarted,
      frameCpuMs,
      updateCpuMs,
    });
    if (
      firstFrame &&
      initialStateApplied &&
      !crewOutfit?.pending &&
      scene.isReady() &&
      !assetFailure
    ) {
      firstFrame = false;
      onReady("Vessel ready");
      presentationFrames.ready();
    }
  };
  engine.runRenderLoop(presentationFrames.wrap(renderWorldFrame));
  resize();
  let disposed = false;
  function customizeCrew(next: CrewAppearance) {
    if (disposed || !crew) return;
    const appearanceKey = JSON.stringify(next);
    if (appearanceKey !== temporalAppearance) {
      temporalAppearance = appearanceKey;
      antialiasing.resetHistory();
    }
    crew.customize(next);
    // Voxel crew: head kit from the persisted look, armour/uniform from equipped inventory.
    crewOutfit?.apply(next);
    // r001 item in hand (the inventory definition's crewItemId), drawn and holstered.
    heldItem?.set(
      state.heldItem !== undefined
        ? state.heldItem
        : next.weapon === "pistol"
          ? "pistol"
          : next.weapon === "rifle"
            ? "compact-carbine"
            : null,
    );
  }
  const combatObserver = scene.onAfterAnimationsObservable.add(() => {
    combatAim.update(
      debugFeatures.snapshot().characters &&
        !!state.combat?.active &&
        !state.seated &&
        !state.sprinting &&
        state.interior &&
        !focusedBodyId &&
        heldItem?.visual?.item.animationSet === "rifle" &&
        heldItem.phase === "held",
      heldItem?.muzzle(),
      displayed.localX,
      displayed.localY,
      Math.min(engine.getDeltaTime() / 1000, 0.1),
      state.combat?.range ?? 60,
    );
  });
  const updateFurnishings = (next: AcceptedFurnishings) => {
    if (acceptedFurnishings?.apply(next) && prefabBinding) {
      prefabPicker?.dispose();
      prefabPicker = createPrefabObjectPicker(
        scene,
        canvas,
        shipRoot,
        prefabBinding,
        () => state.interior,
      );
      prefabPicker.select(state.selectedObject);
      prefabBeamClip = createPrefabBeamClip(shipRoot, prefabBinding);
      debugCollision = createDebugCollisionSource({
        ...options.construction!,
        furnishingsJson: next.json,
        furnishingRevision: next.revision,
      });
    }
  };
  return {
    updateFurnishings,
    /** Presentation-only crew handle for review harnesses (never simulation state). */
    getCrewVisual() {
      return crew;
    },
    /** Other characters currently drawn (review diagnostics; presentation only). */
    getRemoteCrew() {
      return remoteCrew?.diagnostics() ?? [];
    },
    /** EVA presentation (review diagnostics): own pose, clips, prone fallback, other bodies. */
    getEva() {
      return {
        active: !!state.eva,
        phase: state.eva?.phase,
        pitch: ownEva?.pitch ?? 0,
        clips: crew && "activeClips" in crew ? crew.activeClips : [],
        position: [avatar.position.x, avatar.position.y, avatar.position.z],
        yaw: avatar.rotation.y,
        enabled: avatar.isEnabled(),
        cameraBeta: camera.beta,
        cameraRadius: camera.radius,
        interior: state.interior,
        pointer: this.pointerDirection(),
        /** Screen-to-ship mapping angle (camera azimuth + ship heading), review drivers only. */
        screenAngle: camera.alpha + state.heading,
        /** The own body's position on screen (CSS pixels in the canvas), review drivers only. */
        bodyScreen: (() => {
          const rect = canvas.getBoundingClientRect();
          const w = engine.getRenderWidth(),
            h = engine.getRenderHeight();
          const p = Vector3.Project(
            avatar.getAbsolutePosition(),
            Matrix.Identity(),
            scene.getTransformMatrix(),
            camera.viewport.toGlobal(w, h),
          );
          return [
            rect.left + (p.x / w) * rect.width,
            rect.top + (p.y / h) * rect.height,
          ];
        })(),
        bodies: evaCrew?.diagnostics() ?? [],
      };
    },
    getAntialiasing() {
      return antialiasing.snapshot();
    },
    getRenderBackend: () => backendPreference.snapshot(),
    setRenderBackend: (value: RenderBackendChoice) =>
      backendPreference.set(value),
    setAntialiasing(patch: Partial<AntialiasingSettings>) {
      fastSnapshot?.invalidate();
      flightActiveSet.invalidate();
      invalidateStaticMaterials(scene);
      antialiasing.set(patch);
    },
    getGraphicsSettings() {
      return graphics.snapshot();
    },
    setGraphicsSettings(patch: Partial<GraphicsSettings>) {
      fastSnapshot?.invalidate();
      graphics.set(patch);
    },
    resetGraphicsSettings() {
      fastSnapshot?.invalidate();
      flightActiveSet.invalidate();
      invalidateStaticMaterials(scene);
      graphics.reset();
      antialiasing.reset();
      localLights.reset();
      if (backendPreference.snapshot().requested !== "auto")
        backendPreference.set("auto");
    },
    getLocalLightBudget() {
      return localLights.snapshot();
    },
    setLocalLightLimit(limit: LocalLightLimit) {
      fastSnapshot?.invalidate();
      flightActiveSet.invalidate();
      invalidateStaticMaterials(scene);
      localLights.setLimit(limit);
    },
    previewFurnishing(
      sourceObjectId: string,
      pose: FurnishingOverride,
      valid = true,
    ) {
      return furnishingPreview?.show(sourceObjectId, pose, valid) ?? false;
    },
    clearFurnishingPreview() {
      furnishingPreview?.clear();
    },
    pickFurnishingPreview(x: number, y: number) {
      return furnishingPreview?.pick(x, y) ?? false;
    },
    furnishingRay(x: number, y: number) {
      return furnishingPreview?.ray(x, y);
    },
    setAimPointer(x: number, y: number) {
      pointerClient =
        Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
      combatAim.pointer(x, y);
    },
    /**
     * Ship-local unit direction from the own body's screen position to the pointer (the EVA suit
     * facing), independent of any deck or hull under the cursor. Presentation input only.
     */
    pointerDirection(): [number, number] | undefined {
      if (!pointerClient) return;
      const rect = canvas.getBoundingClientRect();
      const w = engine.getRenderWidth(),
        h = engine.getRenderHeight();
      if (rect.width <= 0 || rect.height <= 0) return;
      const p = Vector3.Project(
        avatar.getAbsolutePosition(),
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(w, h),
      );
      const sx = ((pointerClient.x - rect.left) / rect.width) * w - p.x,
        sy = ((pointerClient.y - rect.top) / rect.height) * h - p.y;
      const len = Math.hypot(sx, sy);
      if (!Number.isFinite(len) || len < 4) return;
      const d = screenToDeck(sx / len, -sy / len, camera.alpha, state.heading);
      return [d.dx, d.dy];
    },
    aimDirection() {
      // On deck, or outside the hull (EVA aims in the same own-ship frame the body is drawn in).
      return !focusedBodyId && (state.interior || !!state.eva)
        ? combatAim.aim(
            displayed.localX,
            displayed.localY,
            state.combat?.range ?? 60,
            {
              deckHeight: avatar.position.y,
              origin: heldItem?.muzzle()?.position,
            },
          )?.angle
        : undefined;
    },
    getDiagnostics(enabled: boolean) {
      const snapshot = diagnostics.read(enabled);
      return snapshot
        ? {
            ...snapshot,
            renderQuality: { ...renderQuality },
            ...fastSnapshot?.activeStats(),
            renderBackend: createdEngine.active,
            snapshotRendering: fastSnapshot?.snapshot(),
            debugFeatures: debugFeatures.snapshot(),
            debugOverlays: debugFeatures.overlaySnapshot(),
            localLightBudget: localLights.snapshot(),
            planetBuild: environment.planetBuildSnapshot(),
          }
        : undefined;
    },
    toggleDebugFeature(key: DebugFeature) {
      transmissionLifecycle.invalidate();
      fastSnapshot?.invalidate();
      flightActiveSet.invalidate();
      invalidateStaticMaterials(scene);
      debugFeatures.toggle(key);
      antialiasing.resetHistory();
      if (key === "glow") {
        renderQuality = {
          ...renderQuality,
          glow: debugFeatures.snapshot().glow,
        };
        writeRenderQuality(backendStorage, renderQuality);
      }
    },
    resetDebugFeatures() {
      transmissionLifecycle.invalidate();
      fastSnapshot?.invalidate();
      flightActiveSet.invalidate();
      invalidateStaticMaterials(scene);
      debugFeatures.reset();
      applyRenderQuality({ ...RENDER_QUALITY_DEFAULTS });
    },
    /** F3 render-cost switches (plastic, SSAO, clear coat, glow, render scale): live and saved. */
    renderQuality: () => ({ ...renderQuality }),
    setRenderQuality(patch: Partial<RenderQuality>) {
      applyRenderQuality({ ...renderQuality, ...patch });
    },
    /** Other players' ships and remote crew as drawn now: ids, published hull, LOD tier. */
    getSharedWorldDiagnostics: () => ({
      enabled: !!remoteShips,
      remoteShips: remoteShips?.diagnostics(),
      remoteCrew: remoteCrew?.tiers(),
      evaCrew: evaCrew?.tiers(),
    }),
    groundItemLabels: () => groundItems.labels(),
    update(next: SceneState) {
      if (next.furnishings) updateFurnishings(next.furnishings);
      if (
        next.interior !== state.interior ||
        next.inspect !== state.inspect ||
        next.seated !== state.seated
      ) {
        fastSnapshot?.invalidate();
        flightActiveSet.invalidate();
      }
      const temporalNow = performance.now();
      if (
        invalidatesTemporalHistory(state, next, temporalNow - temporalStateAt)
      )
        antialiasing.resetHistory();
      temporalStateAt = temporalNow;
      if (!initialStateApplied) {
        initialStateApplied = true;
        initialized = false;
        blend = next.interior ? 1 : 0;
        camera.alpha = cameraAlpha(next.heading, next.interior, orbit);
        camera.beta = next.interior ? RPG_BETA : next.inspect ? 0.6 : 0.015;
        options.onLoadStage?.("finishing");
      }
      state = next;
      remoteCrew?.sync(next.crewmates ?? [], {
        x: next.localX,
        y: next.localY,
      });
      evaCrew?.sync(next.evaBodies ?? [], { x: next.localX, y: next.localY });
      objects.select(
        furnishingPreview?.active ? undefined : next.selectedObject,
      );
      prefabPicker?.select(
        furnishingPreview?.active ? undefined : next.selectedObject,
      );
      combatFx?.sync(next.combatActions ?? []);
      const impact = combatFx ? undefined : next.combat?.impact;
      if (impact && lastImpactSequence === undefined)
        lastImpactSequence = impact.shotSequence;
      else if (impact && impact.shotSequence !== lastImpactSequence) {
        lastImpactSequence = impact.shotSequence;
        if (impact.kind !== "none")
          for (const mesh of impactFlash.play(impact.x, impact.y, 1.3))
            glow.addIncludedOnlyMesh(mesh as Mesh);
      }
      objects.lights(next.objectLights ?? []);
      if (next.crewAppearance) customizeCrew(next.crewAppearance);
      if (!state.interior && !focusedBodyId) up();
    },
    screenToDeck(horizontal: number, vertical: number) {
      return screenToDeck(horizontal, vertical, camera.alpha, state.heading);
    },
    customizeCrew,
    focusBody(id?: string) {
      const next =
        id && visibleBodies(performance.now()).some((body) => body.id === id)
          ? id
          : undefined;
      if (next && next !== focusedBodyId) observation.reset();
      if (next !== focusedBodyId) antialiasing.resetHistory();
      focusedBodyId = next;
      up();
    },
    resetCamera() {
      antialiasing.resetHistory();
      focusedBodyId = undefined;
      observation.reset();
      up();
      flightZoom = initialFlightZoom;
      orbit = 0.45;
      zoom = initialDeckZoom;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      furnishingPreview?.dispose();
      remoteShips?.dispose();
      fastSnapshot?.dispose();
      flightActiveSet.dispose();
      staticMaterials.dispose();
      drawMeshCandidates.dispose();
      updateConstructionTraversal = undefined;
      updateConstructionDoors = undefined;
      updateConstructionView = undefined;
      scene.onAfterAnimationsObservable.remove(combatObserver);
      groundItems.dispose();
      combatAim.dispose();
      pbrLights.dispose();
      localLights.dispose();
      scene.onNewMeshAddedObservable.remove(temporalMeshObserver);
      scene.onBeforeRenderObservable.remove(temporalGeometryObserver);
      contactShading.dispose();
      antialiasing.dispose();
      graphics.dispose();
      transmissionLifecycle.dispose();
      objects.dispose();
      prefabPicker?.dispose();
      impactFlash.dispose();
      combatFx?.dispose();
      fxPlayer?.dispose();
      heldItem?.dispose();
      up();
      observer.disconnect();
      window.removeEventListener("blur", up);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", context);
      remoteCrew?.dispose();
      remoteCrew = undefined;
      evaCrew?.dispose();
      evaCrew = undefined;
      ownEva?.dispose();
      ownEva = undefined;
      crewOutfit?.dispose();
      crew?.dispose();
      localGlowOcclusion.dispose();
      flightEffects.dispose();
      environment.dispose();
      diagnostics.dispose();
      debugFeatures.dispose();
      disposeConstruction?.();
      prefabView?.dispose();
      disposeConstruction = undefined;
      scene.dispose();
      engine.dispose();
    },
  };
}
