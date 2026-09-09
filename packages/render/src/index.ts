import {
  loadNativeStairEgress,
  type NativeStairEgressGeometry,
} from "./native-stair-scene";
import { SHARED_STOCK_EXTERIOR_ID } from "@sidereal/content/shared-system";
import {
  createRemoteShips,
  loadRemoteShipPrototype,
  type RemoteShipStore,
  type StockExteriorManifest,
} from "./remote-ships";
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
import { maintainSceneTransmission } from "./transmission-lifecycle";
import {
  createGraphicsSettings,
  type GraphicsSettings,
} from "./graphics-settings";
import type { EquipmentPoseConfiguration } from "./crew/pose-review-config";
export {
  loadPoseReviewConfiguration,
  loadEquipmentPoseConfiguration,
} from "./crew/pose-review-config";
import { createCombatAim } from "./combat-aim";
import { posePlacementHeading } from "./crew/pose-integration-motion";
import { createDebugFeatures, type DebugFeature } from "./debug-features";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { cabinIsVisible, createCabinVisibility } from "./cabin-visibility";
import { LAB_INTERACTIONS } from "../../content/src/interactions";
import { PILOT_LAYOUT } from "../../content/src/pilot-layout";
import { loadInstalledHull } from "./installed-hull";
import { loadInstalledModules } from "./installed-modules";
import { loadInstalledEquipment } from "./installed-equipment";
import { createObjectPresentation } from "./object-presentation";
import { applyCutawayVisibility } from "./cutaway";
import { createShipLighting } from "./ship-lighting";
import { createFlightEffects } from "./flight-effects";
import { createRenderDiagnostics } from "./diagnostics";
import { createEquipmentVisual, type EquipmentAsset } from "./equipment";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createCrewVisual, type CrewAppearance } from "./crew";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CABIN_ROOMS } from "../../content/src/interior";
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
  createObservationCamera,
} from "./camera";
import { createSpaceEnvironment, type SpaceBodyState } from "./environment";
import { DEFAULT_SPACE_VISTA } from "../../content/src/environment";
import "@babylonjs/loaders/glTF";
export type SceneState = {
  groundItems?: readonly GroundItem[];
  combat?: {
    active: boolean;
    angle: number;
    range: number;
    itemId?: string;
    shotSequence?: bigint;
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
  actuatorOutputs?: readonly { actuatorId: string; throttle: number }[];
  /** Omitted for authoring previews; null explicitly means empty authoritative hand. */
  equippedAsset?: EquipmentAsset | null;
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
  sprinting?: boolean;
  vistaId?: string;
  reducedMotion?: boolean;
  bodies?: readonly SpaceBodyState[];
  crewAppearance?: CrewAppearance;
};
export interface WorldOptions {
  /** Opt-in accepted shared projections, separate from the private local ship. */
  sharedWorld?: {
    store: RemoteShipStore;
    localShipId: () => string | undefined;
    bodies: (nowMs: number) => readonly SpaceBodyState[] | undefined;
  };
  construction?: ConstructionRenderInput & { visitId?: string };
  constructionEgress?: NativeStairEgressGeometry;
  equipmentPose?: EquipmentPoseConfiguration;
  onObjectSelected?: (placementId?: string) => void;
  source?: "voxel" | "original" | "engine-original" | "engine-voxel";
  onScene?: (scene: Scene) => void;
  blocksCameraInput?: () => boolean;
  blocksObjectSelection?: () => boolean;
  onLoadError?: (message: string) => void;
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
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new Scene(engine);
  const transmissionLifecycle = maintainSceneTransmission(scene);
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
  const loadingFrame = () => scene.render();
  engine.runRenderLoop(loadingFrame);
  const shipRoot = new TransformNode("ship-frame", scene);
  const environment = createSpaceEnvironment(scene);
  let crew: Awaited<ReturnType<typeof createCrewVisual>> | undefined;
  let equipmentPose:
    | ReturnType<
        Awaited<ReturnType<typeof createCrewVisual>>["createPoseController"]
      >
    | undefined;
  let avatar = new TransformNode("crew-unloaded", scene);
  avatar.parent = shipRoot;
  const marker = CreateTorus(
    "crew-marker",
    { diameter: 1.2, thickness: 0.035, tessellation: 32 },
    scene,
  );
  const cyan = new StandardMaterial("crew-marker-mat", scene);
  cyan.emissiveColor = Color3.FromHexString("#68ded0");
  marker.material = cyan;
  marker.parent = shipRoot;
  let imported: { meshes: AbstractMesh[] };
  let installed: Awaited<
    ReturnType<typeof loadInstalledEquipment>
  >["placements"] = [];
  let shipEquipment: Awaited<
    ReturnType<typeof loadInstalledEquipment>
  >["placements"] = [];
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
  let lastStairPosition: [number, number] | undefined;
  let stairTravelHeading: number | undefined;
  const engineStudy = options.source?.startsWith("engine-") ?? false;
  const sourceFile = engineStudy
    ? options.source === "engine-original"
      ? "engine-pod-original.glb"
      : "engine-pod.glb"
    : "wayfarer.glb";
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
    } else {
      imported = await SceneLoader.ImportMeshAsync(
        "",
        options.source === "original" ? "/assets/" : "/assets/voxels/",
        sourceFile,
        scene,
      );
      if (!options.source || options.source === "voxel") {
        const native = await loadInstalledEquipment(
          scene,
          shipRoot,
          imported.meshes,
        );
        const cargo = await loadInstalledModules(scene, shipRoot, "cargo");
        const floors = await loadInstalledModules(scene, shipRoot, "floor");
        const cargoIds = new Set(
          cargo.placements.map((p) => p.node.metadata.partId as string),
        );
        const retained = native.meshes.filter((mesh) => {
          const replaced = [...cargoIds].some(
            (id) =>
              mesh.name === `GEO-${id}` ||
              mesh.name.startsWith(`GEO-${id}--`) ||
              mesh.name.startsWith(`GEO-${id}_`),
          );
          if (replaced) mesh.dispose();
          return !replaced;
        });
        shipEquipment = [...native.placements, ...cargo.placements];
        const hull = await loadInstalledHull(scene, shipRoot);
        installed = [
          ...shipEquipment,
          ...hull.placements,
          ...floors.placements,
        ];
        imported = {
          ...imported,
          meshes: [
            ...retained,
            ...cargo.meshes,
            ...hull.meshes,
            ...floors.meshes,
          ],
        };
      }
    }
    await environment.ready;
    if (!options.source || options.source === "voxel") {
      crew = await createCrewVisual(
        scene,
        shipRoot,
        options.equipmentPose?.crewUrl,
      );
      if (options.equipmentPose) {
        equipmentPose = crew.createPoseController();
        equipmentPose.setAimSpace(options.equipmentPose.aimSpace);
      }
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
  if (options.source === "original" || engineStudy) {
    const bound = assembly.getHierarchyBoundingVectors(),
      center = bound.min.add(bound.max).scale(0.5),
      scale =
        24 / Math.max(bound.max.x - bound.min.x, bound.max.z - bound.min.z);
    assembly.scaling.setAll(scale);
    assembly.position.copyFrom(center.scale(-scale));
    avatar.setEnabled(false);
  }
  const roof = imported.meshes.filter(
    (m) => m.getTotalVertices() > 0 && /GEO-(roof|markings)/.test(m.name),
  );
  const upperWalls = imported.meshes.filter(
    (m) => m.getTotalVertices() > 0 && m.name.startsWith("GEO-cutaway"),
  );
  for (const mesh of [...roof, ...upperWalls])
    if (mesh.material && !mesh.metadata?.hullDecal) {
      mesh.material = mesh.material.clone(mesh.name + "-cutaway-material");
      if (mesh.material)
        mesh.material.transparencyMode = Material.MATERIAL_OPAQUE;
    }
  const lighting =
    options.construction || options.constructionEgress
      ? createConstructionLighting(scene, imported.meshes)
      : createShipLighting(scene, shipRoot, imported.meshes);
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
  const debugFeatures = createDebugFeatures(
    scene,
    [
      ...fixturePlacements.map((p) => p.node),
      ...imported.meshes.filter((m) =>
        /^GEO-(equipment(?:-|$)|room-storage-container(?:-|$))/.test(m.name),
      ),
    ],
    [avatar, marker],
  );
  const labels = new TransformNode("room-labels", scene);
  labels.parent = shipRoot;
  const emissive = new StandardMaterial("instrument-emission", scene);
  emissive.emissiveColor = Color3.FromHexString("#31bafa");
  emissive.disableLighting = true;
  const emitters: Mesh[] = [];
  for (const room of options.construction || options.constructionEgress
    ? []
    : CABIN_ROOMS) {
    const plate = CreatePlane(
      "room-sign-" + room.id,
      { width: 1.5, height: 0.25, sideOrientation: Mesh.FRONTSIDE },
      scene,
    );
    plate.parent = labels;
    // Stand in front of the innermost service insert, facing into the room.
    plate.position.set(Math.sign(room.x) * 4.35, 2.0625, -room.y);
    plate.rotation.y = (Math.sign(room.x) * Math.PI) / 2;
    plate.metadata = { side: Math.sign(room.x) };
    const texture = new DynamicTexture(
      "room-sign-" + room.id,
      { width: 512, height: 96 },
      scene,
      false,
    );
    texture.hasAlpha = true;
    texture.drawText(
      room.name,
      null,
      66,
      "bold 54px sans-serif",
      "#edf1ff",
      "#202638",
      true,
      true,
    );
    const mat = new StandardMaterial("room-sign-material-" + room.id, scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.disableLighting = true;
    mat.backFaceCulling = true;
    plate.material = mat;
    const strip = CreateBox(
      "door-strip-" + room.id,
      { width: 0.15, height: 0.08, depth: 1 },
      scene,
    );
    strip.position.set(Math.sign(room.x) * 1.4, 1.46, -room.y);
    strip.parent = labels;
    strip.material = emissive;
    emitters.push(strip);
  }
  const glow = new GlowLayer("local-instruments", scene, {
    mainTextureFixedSize: 512,
    blurKernelSize: 24,
  });
  glow.intensity = 0.4;
  const flightEffects =
    options.construction || options.constructionEgress
      ? {
          meshes: [] as Mesh[],
          update(_outputs: unknown, _motion?: boolean) {},
          dispose() {},
        }
      : createFlightEffects(scene, shipRoot);
  for (const mesh of flightEffects.meshes) glow.addIncludedOnlyMesh(mesh);
  for (const mesh of emitters) glow.addIncludedOnlyMesh(mesh);
  // Opaque crew parts also write black/depth into the glow mask, so lenses
  // cannot shine through the rear helmet shell. Only emissive materials glow.
  for (const mesh of crew?.root.getChildMeshes() ?? [])
    glow.addIncludedOnlyMesh(mesh as Mesh);
  // Walls must contribute black/depth to the glow mask as well as emitters;
  // otherwise a hidden fixture blooms straight through an opaque bulkhead.
  for (const mesh of imported.meshes) glow.addIncludedOnlyMesh(mesh as Mesh);
  environment.setOccluders([
    ...imported.meshes,
    ...(crew?.root.getChildMeshes() ?? []),
  ]);
  const objects = createObjectPresentation(
    canvas,
    scene,
    imported.meshes,
    installed,
    () =>
      (options.blocksCameraInput?.() ?? false) ||
      (options.blocksObjectSelection?.() ?? false),
    options.onObjectSelected,
  );
  const groundItems = createGroundItems(scene, shipRoot, options.equipmentPose);
  const graphics = createGraphicsSettings(scene);
  const localLights = createLocalLightBudget();
  const combatAim = createCombatAim(scene, canvas, shipRoot, imported.meshes);
  for (const mesh of combatAim.meshes) glow.addIncludedOnlyMesh(mesh);
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
  let sharedExteriorReady = false;
  const remoteShips = options.sharedWorld
    ? createRemoteShips(scene, options.sharedWorld.store, {
        assetId: SHARED_STOCK_EXTERIOR_ID,
        localShipId: options.sharedWorld.localShipId,
        loadPrototype: async () => {
          const response = await fetch(
            "/assets/assembly/wayfarer-exterior-r001.json",
            { signal: options.signal },
          );
          if (!response.ok) throw Error("Shared exterior manifest unavailable");
          const manifest = (await response.json()) as StockExteriorManifest;
          const prototype = await loadRemoteShipPrototype(
            scene,
            manifest,
            SHARED_STOCK_EXTERIOR_ID,
          );
          sharedExteriorReady = true;
          return prototype;
        },
        onError: (error) =>
          options.onPreviewError?.(
            error instanceof Error
              ? error.message
              : "Shared ship exterior unavailable",
          ),
      })
    : undefined;
  const visibleBodies = (nowMs: number) =>
    options.sharedWorld?.bodies(nowMs) ?? state.bodies ?? [];
  let firstFrame = true;
  engine.stopRenderLoop(loadingFrame);
  engine.runRenderLoop(() => {
    const frameStarted = performance.now();
    // Reconcile overrides only when normal visibility/power intent changes.
    // Re-enabling every hidden fixture each frame defeats the performance probe.
    debugFeatures.beforeFrame(
      JSON.stringify([
        cabinIsVisible(state.interior, blend, !!focusedBodyId),
        state.objectLights,
      ]),
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
    const walking =
      !state.seated &&
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
      bound: !!equipmentPose?.isBound,
      active: !!state.combat?.active,
      sprinting: state.sprinting,
    });
    if (!equipmentPose?.isBound && state.combat?.active && !state.seated)
      avatar.rotation.y = -state.combat.angle;
    if (state.seated) avatar.rotation.y = state.seatFacing ?? 0;
    const cabinVisible = cabinIsVisible(state.interior, blend, !!focusedBodyId);
    updateConstructionDoors?.(state.constructionDoors ?? []);
    cabinVisibility.update(cabinVisible, state.objectLights ?? []);
    lighting.setCabinVisible(cabinVisible);
    groundItems.update(state.groundItems ?? [], cabinVisible);
    if (cabinVisible && debugFeatures.snapshot().characters)
      crew?.update({
        moving: walking,
        combat: state.combat?.active ?? false,
        seated: state.seated ?? false,
        sprinting: state.sprinting ?? false,
        reducedMotion: state.reducedMotion,
      });
    const poseItem = selectedAsset
      ? options.equipmentPose?.items[selectedAsset]
      : undefined;
    if (equipmentPose && poseItem)
      equipmentPose.update(
        {
          yaw: state.combat?.angle ?? -avatar.rotation.y,
          pitch: 0,
          facing: -avatar.rotation.y,
          active: !!state.combat?.active,
          moving: walking,
          movementHeading,
          seated: !!state.seated,
          sprinting: state.sprinting,
          hidden: !cabinVisible || !debugFeatures.snapshot().characters,
          reducedMotion: state.reducedMotion,
          profile: poseItem.profile,
          itemId: state.combat?.itemId,
          shotSequence: state.combat?.shotSequence,
        },
        dt,
      );
    // Native r002 deck datum; this offset is presentation, not simulation height.
    avatar.position.set(displayed.localX, walkingElevation, -displayed.localY);
    if (traversalFrame?.acceptedPositionM) {
      const [x, y, z] = traversalFrame.acceptedPositionM;
      avatar.position.set(x, z, -y);
    }
    marker.position.copyFrom(avatar.position);
    marker.position.y += 0.02;
    marker.setEnabled(cabinVisible && blend > 0.2);
    for (const mesh of roof) {
      applyCutawayVisibility(mesh, focusedBodyId ? 1 : 1 - blend);
    }
    const cameraLocal = camera.alpha + displayed.heading;
    for (const mesh of upperWalls) {
      const side = mesh.name.match(
        /^GEO-cutaway-(port|starboard|aft|bow)/,
      )?.[1];
      const facing =
        side === "port"
          ? -Math.cos(cameraLocal)
          : side === "starboard"
            ? Math.cos(cameraLocal)
            : side === "aft"
              ? Math.sin(cameraLocal)
              : -Math.sin(cameraLocal);
      const target = focusedBodyId ? 1 : facing > 0 ? 1 - blend : 1;
      applyCutawayVisibility(
        mesh,
        focusedBodyId
          ? 1
          : mesh.visibility + (target - mesh.visibility) * transition,
      );
    }
    labels.setEnabled(
      cabinVisible &&
        blend > 0.8 &&
        options.source !== "original" &&
        !engineStudy,
    );
    for (const label of labels.getChildMeshes())
      if (label.metadata?.side)
        label.setEnabled(label.metadata.side * Math.cos(cameraLocal) < 0);
    lighting.update(blend, avatar.position.x, -avatar.position.z);
    flightEffects.update(state.actuatorOutputs ?? [], state.reducedMotion);
    camera.alpha +=
      angleDelta(
        camera.alpha,
        cameraAlpha(displayed.heading, state.interior, orbit),
      ) * transition;
    camera.beta +=
      ((state.interior ? RPG_BETA : state.inspect ? 0.6 : 0.015) -
        camera.beta) *
      transition;
    const c = Math.cos(displayed.heading),
      s = Math.sin(displayed.heading);
    const targetLocalX =
      (constructionFrame?.centerX ?? 0) * (1 - blend * 0.6) +
      avatar.position.x * blend * 0.6;
    const targetLocalY =
      (constructionFrame?.centerY ?? 0) * (1 - blend * 0.6) +
      -avatar.position.z * blend * 0.6;
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
      const observed = observation.frame(focus.radius, dt, state.reducedMotion);
      camera.alpha = observed.alpha;
      camera.beta = observed.beta;
      camera.radius = observed.radius;
    }
    camera.minZ = Math.max(0.1, camera.radius * 0.02);
    camera.maxZ = Math.max(1600, camera.radius + 1600);
    updateConstructionView?.(camera.position, state.interior);
    camera.getViewMatrix(true);
    environment.update({
      id: state.vistaId ?? DEFAULT_SPACE_VISTA,
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
    remoteShips?.update({ x: displayed.x, y: displayed.y }, frameStarted);
    debugFeatures.afterFrame();
    const lightingAllowed = scene.lightsEnabled;
    localLights.update(
      [
        ...lighting.getLocalLightSources(lightingAllowed),
        ...shipEquipment.flatMap((placement) =>
          placement.lighting.getLocalLightSources(lightingAllowed),
        ),
      ],
      { focus: camera.target },
    );
    const updateCpuMs = performance.now() - frameStarted;
    scene.render();
    diagnostics.recordFrameCpu(performance.now() - frameStarted, updateCpuMs);
    if (firstFrame && scene.isReady() && !assetFailure) {
      firstFrame = false;
      onReady(
        engineStudy
          ? options.source === "engine-original"
            ? "Original engine · 39 modeled solids"
            : "Voxel engine · 7 materials preserved"
          : options.source === "original"
            ? "Original Blender study loaded"
            : "Voxel Wayfarer loaded",
      );
    }
  });
  resize();
  let disposed = false;
  let equipment: Awaited<ReturnType<typeof createEquipmentVisual>> | undefined;
  let equipmentRevision = 0;
  let selectedAsset: EquipmentAsset | null = null;
  function customizeCrew(next: CrewAppearance) {
    if (disposed || !crew) return;
    crew.customize({ ...next, weaponFixture: !equipment });
    const asset =
      state.equippedAsset !== undefined
        ? state.equippedAsset
        : next.weapon === "pistol"
          ? "compact-pistol"
          : next.weapon === "rifle"
            ? "carbine"
            : null;
    if (asset === selectedAsset) return;
    selectedAsset = asset;
    const revision = ++equipmentRevision;
    equipmentPose?.bind(undefined);
    crew.bindHeldEquipment(undefined);
    equipment?.dispose();
    equipment = undefined;
    crew.customize({ weaponFixture: true });
    if (!selectedAsset) return;
    createEquipmentVisual(
      scene,
      crew.sockets.handR,
      selectedAsset,
      selectedAsset && options.equipmentPose?.items[selectedAsset]
        ? options.equipmentPose.equipmentUrl
        : undefined,
    )
      .then((visual) => {
        if (disposed || revision !== equipmentRevision) {
          visual.dispose();
          return;
        }
        equipment = visual;
        const poseItem = options.equipmentPose?.items[selectedAsset!];
        if (equipmentPose && crew && poseItem)
          equipmentPose.bind(visual.createPoseBinding(crew.root, poseItem));
        else crew?.bindHeldEquipment(visual);
        for (const mesh of visual.root.getChildMeshes())
          glow.addIncludedOnlyMesh(mesh as Mesh);
        environment.setOccluders([
          ...imported.meshes,
          ...(crew?.root.getChildMeshes() ?? []),
        ]);
        lighting.addActor(crew?.root.getChildMeshes() ?? []);
        crew?.customize({ weaponFixture: false });
      })
      .catch((error) => {
        if (!disposed && revision === equipmentRevision)
          options.onPreviewError?.(
            "Equipment preview could not load: " + String(error),
          );
      });
  }
  const combatObserver = scene.onAfterAnimationsObservable.add(() => {
    combatAim.update(
      debugFeatures.snapshot().characters &&
        !!state.combat?.active &&
        !state.seated &&
        !state.sprinting &&
        state.interior &&
        !focusedBodyId &&
        ["carbine", "long-rifle"].includes(selectedAsset ?? ""),
      equipmentPose?.isBound
        ? equipmentPose.diagnostics.muzzle
        : equipment?.getMuzzleWorld(),
      displayed.localX,
      displayed.localY,
      Math.min(engine.getDeltaTime() / 1000, 0.1),
      state.combat?.range ?? 60,
    );
  });
  return {
    getGraphicsSettings() {
      return graphics.snapshot();
    },
    setGraphicsSettings(patch: Partial<GraphicsSettings>) {
      graphics.set(patch);
    },
    resetGraphicsSettings() {
      graphics.reset();
      localLights.reset();
    },
    getLocalLightBudget() {
      return localLights.snapshot();
    },
    setLocalLightLimit(limit: LocalLightLimit) {
      localLights.setLimit(limit);
    },
    setAimPointer(x: number, y: number) {
      combatAim.pointer(x, y);
    },
    aimDirection() {
      return !focusedBodyId && state.interior
        ? combatAim.aim(
            displayed.localX,
            displayed.localY,
            state.combat?.range ?? 60,
          )?.angle
        : undefined;
    },
    getDiagnostics(enabled: boolean) {
      const snapshot = diagnostics.read(enabled);
      return snapshot
        ? {
            ...snapshot,
            debugFeatures: debugFeatures.snapshot(),
            localLightBudget: localLights.snapshot(),
          }
        : undefined;
    },
    toggleDebugFeature(key: DebugFeature) {
      debugFeatures.toggle(key);
    },
    resetDebugFeatures() {
      debugFeatures.reset();
    },
    groundItemLabels: () => groundItems.labels(),
    getSharedWorldDiagnostics: () => ({
      enabled: !!remoteShips,
      exteriorReady: sharedExteriorReady,
      remoteShipIds: remoteShips?.getRootIds() ?? [],
    }),
    update(next: SceneState) {
      state = next;
      objects.select(next.selectedObject);
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
      focusedBodyId = next;
      up();
    },
    resetCamera() {
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
      updateConstructionTraversal = undefined;
      updateConstructionDoors = undefined;
      updateConstructionView = undefined;
      scene.onAfterAnimationsObservable.remove(combatObserver);
      groundItems.dispose();
      remoteShips?.dispose();
      combatAim.dispose();
      localLights.dispose();
      graphics.dispose();
      transmissionLifecycle.dispose();
      objects.dispose();
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
      equipmentRevision++;
      equipmentPose?.bind(undefined);
      equipment?.dispose();
      crew?.dispose();
      flightEffects.dispose();
      environment.dispose();
      diagnostics.dispose();
      debugFeatures.dispose();
      disposeConstruction?.();
      disposeConstruction = undefined;
      scene.dispose();
      engine.dispose();
    },
  };
}
