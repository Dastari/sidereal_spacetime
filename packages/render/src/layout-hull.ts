import { isExteriorAsset } from "@sidereal/content/layout-asset-scope";
import { framedWayfarerVisual } from "./framed-wayfarer-visuals";
import { createVertexMeasurement } from "./layout-vertex-measurement";
import type { MeasurementPoint } from "./layout-measurement";
import { createLayoutDoorwayPreview } from "./layout-doorway-preview";
import { doorwayWallSpans } from "./layout-doorway-walls";
import {
  createLayoutFloorSlabs,
  type FloorSlabInput,
} from "./layout-floor-slabs";
import { createLayoutInsetPreview } from "./layout-inset-preview";
import type { LayoutInsetPreviewInput } from "./layout-inset-visual-plan";
import { createLayoutNativeWalls } from "./layout-native-walls";
import { layoutPickingCoordinates } from "./layout-picking-coordinates";
import {
  createLayoutStructuralGuides,
  type LayoutStructuralGuide,
} from "./layout-structural-guides";
export type { LayoutStructuralGuide } from "./layout-structural-guides";
import {
  createLayoutHullEnvelope,
  type LayoutHullEnvelope,
} from "./layout-hull-envelope";
import { setMeshRole } from "./mesh-roles";
import {
  editorFitRadius,
  editorGuideStep,
  editorRenderScale,
} from "./editor-surface";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { layoutViewOrientation } from "./layout-view-orientation";
import { snapLayoutPoint } from "./layout-placement-grid";
import {
  verticalDragMetresPerPixel,
  verticalDragPosition,
} from "./layout-vertical-drag";
import {
  layoutPlaneMatrix,
  PLAN_OVERLAY_TILT_LIMIT,
} from "./layout-plane-projection";
import { updateHullDecals } from "./hull-decals";
/** Hull authoring viewport. Reuses exported surfaces; never remeshes or publishes art. */
import "@babylonjs/core/Culling/ray";
import "@babylonjs/loaders/glTF";
import { createLayoutSelection } from "./layout-selection";
import {
  layoutPartVisible,
  type LayoutPreviewPolicy,
} from "./layout-preview-policy";
export type {
  LayoutPreviewPolicy,
  LayoutPreviewLayers,
} from "./layout-preview-policy";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { configureLayoutCameraMotion } from "./layout-camera-motion";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { loadEquipmentPrototypes } from "./installed-equipment";
import type {
  PartCatalog,
  PartPlacement,
  PartCategory,
} from "@sidereal/content/assembly";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
export interface HullViewState {
  parts: PartPlacement[];
  selected: string;
  visible: ReadonlySet<PartCategory>;
  preview?: LayoutPreviewPolicy;
  tool: "select" | "orbit" | "place" | "measure";
  assetId: string;
  height: number;
  snap: number;
  blocked: boolean;
  projection: string;
  lockTop?: boolean;
  floor?: CompiledLayout;
  floorSlabs?: FloorSlabInput;
  structuralGuide?: LayoutStructuralGuide;
  suppressNativeWalls?: boolean;
  insetPreview?: LayoutInsetPreviewInput;
  showGrid?: boolean;
  /** Draw the build grid whenever the camera is tilted enough that the plan
   * SVG overlay is withdrawn (see PLAN_OVERLAY_TILT_LIMIT). */
  gridWhenTilted?: boolean;
  /** Hull size boundary drawn natively whenever the plan overlay is withdrawn. */
  hullEnvelope?: LayoutHullEnvelope;
  /** Native structural context cannot be selected or dragged as an assembly object. */
  contextOnly?: ReadonlySet<string>;
  /** Resolve the authored attachment frame for both pointer previews and commits. */
  resolvePlacement?: (
    part: PartPlacement,
    axis?: "xy" | "z",
  ) => PartPlacement | null;
}
export interface HullCameraState {
  alpha: number;
  beta: number;
  radius: number;
  target: [number, number, number];
}
export function createHullViewport(
  canvas: HTMLCanvasElement,
  catalog: PartCatalog,
  callbacks: {
    select: (id: string) => void;
    move: (
      id: string,
      p: [number, number, number],
      copy: boolean,
      axis?: "xy" | "z",
    ) => void;
    place: (id: string, p: [number, number, number]) => void;
    status: (message: string) => void;
    viewChanged?: () => void;
    wallFit?: (notes: string[]) => void;
    floorFit?: (notes: string[]) => void;
    measurementChanged?: (points: MeasurementPoint[]) => void;
  },
  initialCamera?: HullCameraState,
  initialProjection?: string,
) {
  // Only this viewport receives the new surface. Draft validation retains the
  // original catalog and its qualified snapping/collision interfaces.
  catalog = {
    ...catalog,
    assets: catalog.assets.map((a) => framedWayfarerVisual(a)),
  };
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true }),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  // This editor explicitly picks once on selection. Babylon's automatic hover,
  // down and up picks otherwise repeat triangle tests across the whole ship.
  scene.skipPointerMovePicking = true;
  scene.skipPointerDownPicking = true;
  scene.skipPointerUpPicking = true;
  scene.clearColor = new Color4(0.028, 0.075, 0.105, 1);
  const camera = new ArcRotateCamera(
    "hull-editor-camera",
    Math.PI / 10,
    Math.PI / 4,
    45,
    Vector3.Zero(),
    scene,
  );
  new FxaaPostProcess("editor-edge-antialiasing", 1, camera);
  camera.fov = 0.65;
  camera.minZ = 0.02;
  camera.maxZ = 2000;
  camera.lowerRadiusLimit = 0.5;
  camera.upperRadiusLimit = 800;
  camera.lowerBetaLimit = 0.03;
  camera.upperBetaLimit = Math.PI - 0.03;
  configureLayoutCameraMotion(camera);
  camera.attachControl(canvas, false);
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  const pointerInput = camera.inputs.attached.pointers as unknown as {
    buttons: number[];
  };
  pointerInput.buttons = [1, 2];
  camera.movement.input.addEntry({
    source: "pointer",
    button: 1,
    interaction: "rotate",
  });
  if (initialCamera) {
    camera.alpha = initialCamera.alpha;
    camera.beta = initialCamera.beta;
    camera.radius = initialCamera.radius;
    camera.target.copyFromFloats(...initialCamera.target);
  }
  new HemisphericLight("hull-fill", new Vector3(0, 1, 0), scene).intensity =
    0.85;
  new DirectionalLight(
    "hull-key",
    new Vector3(-0.4, -1, 0.3),
    scene,
  ).intensity = 1.7;
  scene.environmentTexture = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentIntensity = 0.6;
  const selection = createLayoutSelection(scene);
  const structuralGuides = createLayoutStructuralGuides(scene);
  const hullEnvelope = createLayoutHullEnvelope(scene);
  let activeUntil = performance.now() + 2000;
  const requestRender = () => {
    activeUntil = performance.now() + 1500;
  };
  const floorSlabs = createLayoutFloorSlabs(scene, requestRender);
  let wallStatus = "";
  let doorwayNotes: string[] = [];
  let insetMode = false;
  /** The inward (v2) planner is all-or-nothing per deck. When it cannot cover
   * the current deck, the per-span native kit is shown instead so straight
   * spans still get real walls and only unsupported spans stay wireframe. */
  let fallbackWalls = false;
  const usingNativeKit = () => !insetMode || fallbackWalls;
  let guideState: {
    input: Parameters<typeof structuralGuides.update>[0];
    visible: boolean;
  } = { input: undefined, visible: false };
  const planeTilted = () =>
    projection === "3D" || camera.beta > PLAN_OVERLAY_TILT_LIMIT;
  /** Wireframe guides are the fallback for spans without a qualified native
   * wall. Once every span on the deck has its mesh they only add a second
   * outline, and in plan projections the wall-top ring reads as a second grid. */
  function refreshGuides() {
    const complete = usingNativeKit()
      ? nativeWalls.meshes.length > 0 &&
        (nativeWalls.plan?.issues.length ?? 0) === 0
      : insetWalls.meshes.length > 0 && insetWalls.plan.issues.length === 0;
    const visible = guideState.visible && !complete;
    structuralGuides.update(guideState.input, visible, origin.asArray(), {
      baseOnly: !planeTilted(),
    });
    canvas.dataset.structuralWallGuides = String(
      visible ? structuralGuides.count : 0,
    );
  }
  function publishWallNotes(message: string) {
    wallStatus = message;
    const issues = [
      ...(insetMode ? insetWalls.plan.issues : []),
      ...(usingNativeKit() ? (nativeWalls.plan?.issues ?? []) : []),
      ...doorwayNotes.map((message, i) => ({ key: `doorway:${i}`, message })),
    ];
    canvas.dataset.nativeWallPieces = String(
      usingNativeKit()
        ? (nativeWalls.plan?.placements.length ?? 0)
        : insetWalls.plan.requests.length,
    );
    canvas.dataset.nativeWallMeshes = String(
      usingNativeKit() ? nativeWalls.meshes.length : insetWalls.meshes.length,
    );
    canvas.dataset.nativeWallIssues = JSON.stringify(issues);
    canvas.dataset.nativeWallFallback = String(fallbackWalls);
    canvas.dataset.nativeDoorwayPieces = String(doorways.plan.requests.length);
    canvas.dataset.nativeDoorwayMeshes = String(doorways.meshes.length);
    canvas.dataset.nativeDoorwayIssues = JSON.stringify(doorwayNotes);
    refreshGuides();
    requestRender();
    callbacks.wallFit?.(issues.map((issue) => issue.message));
    callbacks.status(message);
  }
  const nativeWalls = createLayoutNativeWalls(scene, (message) => {
    if (insetMode && !fallbackWalls) return;
    publishWallNotes(
      fallbackWalls ? `${message} · per-span kit shown instead` : message,
    );
  });
  const insetWalls = createLayoutInsetPreview(scene, (message) => {
    if (!insetMode || fallbackWalls) return;
    publishWallNotes(message);
  });
  const doorways = createLayoutDoorwayPreview(scene, (notes) => {
    doorwayNotes = notes;
    publishWallNotes(wallStatus);
  });
  const prototypes = new Map<string, Mesh[]>(),
    pending = new Map<string, Promise<void>>(),
    failed = new Set<string>();
  const nodes = new Map<string, { assetId: string; node: TransformNode }>();
  let disposed = false,
    state: HullViewState | undefined,
    projection = initialCamera ? (initialProjection ?? "") : "",
    floor: Mesh | undefined,
    floorKey = "",
    origin = Vector3.Zero();
  let externalMeasuring = false;
  const measurement = createVertexMeasurement(
    scene,
    camera,
    canvas,
    pickingCoordinates,
    () => origin,
    (points) => callbacks.measurementChanged?.(points),
    requestRender,
    callbacks.status,
  );
  let drag:
    | {
        id: string;
        start: Vector3;
        origin: Vector3;
        part: PartPlacement;
        last?: PartPlacement;
        axis: "xy" | "z";
        metresPerPixel: number;
        pointerId: number;
        copy: boolean;
        x: number;
        y: number;
      }
    | undefined;
  let down: { x: number; y: number } | undefined;
  const material = new StandardMaterial("floorplan-guide", scene);
  material.diffuseColor = Color3.FromHexString("#3c6575");
  material.alpha = 0.35;
  material.backFaceCulling = false;
  let gridStep = 1;
  function buildGrid(step: number) {
    const lines: Vector3[][] = [];
    for (let i = -Math.ceil(24 / step); i <= Math.ceil(24 / step); i++) {
      const n = i * step;
      lines.push(
        [new Vector3(n, 0, -24), new Vector3(n, 0, 24)],
        [new Vector3(-24, 0, n), new Vector3(24, 0, n)],
      );
    }
    const mesh = CreateLineSystem("hull-build-plane", { lines }, scene);
    setMeshRole(mesh, "effect");
    mesh.color = new Color3(0.09, 0.21, 0.27);
    mesh.isPickable = false;
    return mesh;
  }
  let grid = buildGrid(gridStep);
  grid.setEnabled(false);
  let planeGuideState = {
    grid: false,
    gridWhenTilted: false,
    envelope: undefined as LayoutHullEnvelope | undefined,
    elevationUnits: 0,
  };
  /** Plan views draw the grid and hull boundary in the SVG; once the camera is
   * tilted (or in the 3D projection) the scene draws them, so nothing
   * rasterized is ever warped through a perspective. Re-run on camera change. */
  function refreshPlaneGuides() {
    const tilted = planeTilted();
    grid.setEnabled(
      planeGuideState.grid || (planeGuideState.gridWhenTilted && tilted),
    );
    hullEnvelope.update(
      planeGuideState.envelope,
      planeGuideState.elevationUnits,
      tilted,
      origin.asArray(),
    );
  }
  const ghost = CreateBox("placement-bounds", { size: 1 }, scene);
  setMeshRole(ghost, "effect");
  const ghostMaterial = new StandardMaterial(
    "placement-bounds-material",
    scene,
  );
  ghostMaterial.emissiveColor = new Color3(0.27, 0.85, 0.96);
  ghostMaterial.wireframe = true;
  ghost.material = ghostMaterial;
  ghost.isPickable = false;
  ghost.setEnabled(false);
  function hideGhost() {
    if (ghost.isEnabled()) requestRender();
    ghost.setEnabled(false);
  }
  function loadNeeded(parts: PartPlacement[]) {
    const missing = [...new Set(parts.map((p) => p.assetId))].filter(
      (id) => !prototypes.has(id) && !failed.has(id),
    );
    const legacy = missing.filter(
      (id) => !catalog.assets.find((a) => a.id === id)?.visual,
    );
    if (legacy.length && !pending.has("legacy")) {
      const work = SceneLoader.ImportMeshAsync(
        "",
        "/assets/assembly/",
        "parts.glb",
        scene,
      )
        .then((imported) => {
          if (disposed) return;
          for (const mesh of imported.meshes) {
            mesh.isVisible = false;
            mesh.isPickable = false;
            if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
            const id = mesh.name.match(/^GEO-(part-[a-f0-9]+)--/)?.[1];
            if (!id) continue;
            const list = prototypes.get(id) ?? [];
            list.push(mesh);
            prototypes.set(id, list);
          }
          for (const id of legacy) if (!prototypes.has(id)) failed.add(id);
          if (state) update(state);
        })
        .catch((e) => {
          if (!disposed) {
            legacy.forEach((id) => failed.add(id));
            callbacks.status(
              `Part library unavailable: ${String(e)}. Draft preserved.`,
            );
          }
        });
      pending.set("legacy", work);
    }
    const groups = new Map<string, string[]>();
    for (const id of missing) {
      const a = catalog.assets.find((a) => a.id === id);
      if (a?.visual) {
        const group = groups.get(a.visual.url) ?? [];
        group.push(id);
        groups.set(a.visual.url, group);
      }
    }
    for (const [url, ids] of groups) {
      if (pending.has(url)) continue;
      // Load all definitions sharing this kit once; prototypes retain exact mesh groups.
      const assets = catalog.assets.filter((a) => a.visual?.url === url);
      const work = loadEquipmentPrototypes(scene, assets)
        .then((found) => {
          if (disposed) return;
          for (const [id, meshes] of found) prototypes.set(id, meshes);
          if (state) update(state);
        })
        .catch((e) => {
          if (!disposed) {
            ids.forEach((id) => failed.add(id));
            callbacks.status(
              `Visual unavailable: ${String(e)}. Draft preserved.`,
            );
          }
        });
      pending.set(url, work);
    }
  }
  function pickingCoordinates(x: number, y: number) {
    return layoutPickingCoordinates(
      x,
      y,
      canvas.getBoundingClientRect(),
      engine.getRenderWidth(),
      engine.getRenderHeight(),
      engine.getHardwareScalingLevel(),
    );
  }
  function point(x: number, y: number, height: number) {
    const coordinates = pickingCoordinates(x, y);
    if (!coordinates) return null;
    const ray = scene.createPickingRay(
      coordinates[0],
      coordinates[1],
      Matrix.Identity(),
      camera,
    );
    const distance = ray.intersectsPlane(new Plane(0, 1, 0, -height));
    return distance === null || distance < 0
      ? null
      : ray.origin.add(ray.direction.scale(distance));
  }
  function snap(p: Vector3): [number, number, number] {
    return snapLayoutPoint(
      [p.x + origin.x, -p.z - origin.z, p.y + origin.y],
      state!.snap,
    );
  }
  const pick = (e: PointerEvent) => {
    const coordinates = pickingCoordinates(e.clientX, e.clientY);
    return coordinates
      ? scene.pick(
          coordinates[0],
          coordinates[1],
          (m) => m.isPickable && m.isEnabled(),
        )
      : null;
  };
  const pointerDown = (e: PointerEvent) => {
    requestRender();
    if (!state || e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    down = { x: e.clientX, y: e.clientY };
    if (state.tool === "measure") return;
    if (state.tool === "orbit") return;
    if (state.tool === "place") return;
    const id = pick(e)?.pickedMesh?.metadata?.partId as string | undefined;
    if (!id) {
      callbacks.select("");
      return;
    }
    callbacks.select(id);
    if (state.blocked) return;
    const part = state.parts.find((part) => part.id === id);
    if (!part) return;
    const node = nodes.get(id)!.node,
      hit = point(e.clientX, e.clientY, node.position.y);
    if (hit || e.shiftKey) {
      drag = {
        id,
        start: hit ?? node.position.clone(),
        origin: node.position.clone(),
        part,
        last: part,
        axis: e.shiftKey ? "z" : "xy",
        metresPerPixel: verticalDragMetresPerPixel(
          Math.max(1, canvas.clientHeight),
          camera.mode === 1
            ? camera.radius
            : Math.max(
                camera.minZ,
                Vector3.Distance(camera.position, node.position),
              ),
          camera.fov,
        ),
        pointerId: e.pointerId,
        copy: e.ctrlKey || e.metaKey,
        x: e.clientX,
        y: e.clientY,
      };
      canvas.dataset.gestureActive = "true";
      canvas.dataset.dragAxis = drag.axis;
      canvas.style.cursor = drag.axis === "z" ? "ns-resize" : "grabbing";
      canvas.setPointerCapture(e.pointerId);
    }
  };
  const pointerMove = (e: PointerEvent) => {
    requestRender();
    if (state?.tool === "measure") {
      measurement.measureAt(e.clientX, e.clientY, false);
      return;
    }
    if (state?.tool === "place" && !state.blocked) {
      const hit = point(e.clientX, e.clientY, state.height - origin.y),
        asset = catalog.assets.find((a) => a.id === state!.assetId);
      if (hit && asset) {
        const proposal: PartPlacement = {
          id: "preview",
          assetId: asset.id,
          position: snap(hit),
          rotation: 0,
          flipped: false,
          removedCells: [],
        };
        const resolved = state.resolvePlacement
          ? state.resolvePlacement(proposal)
          : proposal;
        if (!resolved) {
          hideGhost();
          return;
        }
        const p = resolved.position,
          min = asset.bounds.min,
          max = asset.bounds.max;
        const cx = (min[0] + max[0]) / 2,
          cy = (min[1] + max[1]) / 2;
        const c = Math.cos(resolved.rotation),
          s = Math.sin(resolved.rotation);
        ghost.scaling.set(
          Math.max(0.03, max[0] - min[0]),
          Math.max(0.03, max[2] - min[2]),
          Math.max(0.03, max[1] - min[1]),
        );
        ghost.position.set(
          p[0] + cx * c - cy * s - origin.x,
          p[2] + (min[2] + max[2]) / 2 - origin.y,
          -p[1] - cx * s - cy * c - origin.z,
        );
        ghost.rotation.y = resolved.rotation;
        ghost.setEnabled(true);
      }
    }
    updateDrag(e);
  };
  function updateDrag(e: PointerEvent) {
    if (!drag || !state) return;
    let p: [number, number, number];
    if (drag.axis === "z") {
      p = verticalDragPosition(
        drag.part.position,
        e.clientY - drag.y,
        drag.metresPerPixel,
        state.snap,
      );
    } else {
      const hit = point(e.clientX, e.clientY, drag.origin.y);
      if (!hit) return;
      p = snap(drag.origin.add(hit.subtract(drag.start)));
      p[2] = drag.part.position[2];
    }
    const part = drag.part;
    const resolved = state.resolvePlacement
      ? state.resolvePlacement({ ...part, position: p }, drag.axis)
      : { ...part, position: p };
    drag.last = resolved ?? undefined;
    const node = nodes.get(drag.id)?.node;
    if (resolved && node) {
      node.position.set(
        resolved.position[0] - origin.x,
        resolved.position[2] - origin.y,
        -resolved.position[1] - origin.z,
      );
      node.rotation.y = resolved.rotation;
      canvas.dataset.dragPosition = JSON.stringify(resolved.position);
    }
  }
  function cancel() {
    requestRender();
    if (drag) {
      const node = nodes.get(drag.id)?.node;
      node?.position.copyFrom(drag.origin);
      const part = state?.parts.find((p) => p.id === drag!.id);
      if (node && part) node.rotation.y = part.rotation;
      if (canvas.hasPointerCapture(drag.pointerId))
        canvas.releasePointerCapture(drag.pointerId);
    }
    drag = undefined;
    down = undefined;
    canvas.dataset.gestureActive = "false";
    delete canvas.dataset.dragAxis;
    delete canvas.dataset.dragPosition;
    canvas.style.cursor = "";
  }
  const pointerUp = (e: PointerEvent) => {
    if (!state || e.button !== 0) return;
    if (state.tool === "measure") {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4)
        measurement.measureAt(e.clientX, e.clientY, true);
      down = undefined;
      return;
    }
    if (drag) {
      updateDrag(e);
      const d = drag,
        p = d.last?.position,
        moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3;
      cancel();
      if (
        moved &&
        p &&
        !state.blocked &&
        p.some((value, i) => value !== d.part.position[i])
      )
        callbacks.move(d.id, [...p], d.copy, d.axis);
    } else if (
      down &&
      state.tool === "place" &&
      !state.blocked &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4
    ) {
      const p = point(e.clientX, e.clientY, state.height - origin.y);
      if (p) callbacks.place(state.assetId, snap(p));
      down = undefined;
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") cancel();
  };
  const context = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("contextmenu", context);
  canvas.addEventListener("pointerleave", hideGhost);
  canvas.addEventListener("pointerleave", measurement.hideHover);
  canvas.addEventListener("wheel", requestRender, { passive: true });
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", key);
  const syncSurface = () => {
    engine.setHardwareScalingLevel(
      editorRenderScale(
        window.devicePixelRatio,
        canvas.clientWidth,
        canvas.clientHeight,
      ),
    );
    engine.resize();
    const background = getComputedStyle(canvas)
      .getPropertyValue("--viewport-background")
      .trim();
    if (/^#[0-9a-f]{6}$/i.test(background)) {
      const color = Color3.FromHexString(background);
      scene.clearColor = new Color4(color.r, color.g, color.b, 1);
    }
    requestRender();
  };
  syncSurface();
  const themeObserver = new MutationObserver(syncSurface);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-creator-theme"],
  });
  document.addEventListener("visibilitychange", requestRender);
  const resize = new ResizeObserver(() => {
    syncSurface();
    requestRender();
  });
  resize.observe(canvas);
  function update(next: HullViewState) {
    requestRender();
    if (disposed) return;
    state = next;
    measurement.setActive(externalMeasuring || next.tool === "measure");
    if (
      editorGuideStep(next.snap) !== gridStep &&
      Number.isFinite(next.snap) &&
      next.snap >= 1 / 32
    ) {
      grid.dispose();
      gridStep = editorGuideStep(next.snap);
      grid = buildGrid(gridStep);
    }
    planeGuideState = {
      grid: next.showGrid === true || next.tool === "place",
      gridWhenTilted: next.gridWhenTilted === true,
      envelope: next.hullEnvelope,
      elevationUnits: next.structuralGuide?.elevationUnits ?? 0,
    };
    grid.position.y = next.height - origin.y - 0.025;
    if (next.tool !== "place") hideGhost();
    loadNeeded(next.parts);
    const lockTop = next.lockTop || next.preview?.lockTop;
    pointerInput.buttons = lockTop
      ? []
      : next.tool === "orbit" && !externalMeasuring
        ? [0, 1, 2]
        : [1, 2];
    camera.mode = next.projection === "3D" && !lockTop ? 0 : 1;
    const orientation = lockTop
      ? { alpha: Math.PI / 2, beta: 0.000001 }
      : layoutViewOrientation(projection, next.projection);
    camera.lowerBetaLimit = lockTop ? 0.000001 : 0.03;
    projection = next.projection;
    if (orientation) {
      camera.alpha = orientation.alpha;
      camera.beta = orientation.beta;
    }
    refreshPlaneGuides();
    const ids = new Set(next.parts.map((p) => p.id));
    for (const [id, e] of nodes)
      if (!ids.has(id)) {
        e.node.dispose();
        nodes.delete(id);
      }
    for (const p of next.parts) {
      let entry = nodes.get(p.id);
      if (entry && entry.assetId !== p.assetId) {
        entry.node.dispose();
        nodes.delete(p.id);
        entry = undefined;
      }
      if (!entry) {
        const sources = prototypes.get(p.assetId);
        if (!sources) continue;
        const node = new TransformNode("hull-placement-" + p.id, scene);
        node.metadata = { partId: p.id };
        for (const source of sources) {
          const mesh = source.createInstance(
            "hull-" + p.id + "--" + source.name,
          );
          mesh.parent = node;
          mesh.isVisible = true;
          mesh.isPickable = true;
          mesh.metadata = {
            partId: p.id,
            assetId: p.assetId,
            role: source.metadata?.role ?? "hull",
          };
        }
        entry = { assetId: p.assetId, node };
        nodes.set(p.id, entry);
      }
      for (const mesh of entry.node.getChildMeshes())
        mesh.isPickable = !next.contextOnly?.has(p.id);
      updateHullDecals(scene, entry.node, p.decals, p.flipped);
      const asset = catalog.assets.find((a) => a.id === p.assetId);
      const category =
        asset && isExteriorAsset(asset) ? "superstructure" : asset?.category;
      entry.node.setEnabled(
        layoutPartVisible(category, next.visible, next.preview) &&
          (asset?.category !== "roof" ||
            layoutPartVisible("roof", next.visible, next.preview)),
      );
      if (drag?.id !== p.id)
        entry.node.position.set(
          p.position[0] - origin.x,
          p.position[2] - origin.y,
          -p.position[1] - origin.z,
        );
      entry.node.rotation.y = p.rotation;
      entry.node.scaling.x = p.flipped ? -1 : 1;
    }
    const slabNotes = floorSlabs.update(
      next.floorSlabs,
      layoutPartVisible("floor", next.visible, next.preview),
      origin.asArray(),
    );
    canvas.dataset.floorSlabs = String(floorSlabs.meshes.length);
    canvas.dataset.nativeFloorIssues = JSON.stringify(slabNotes);
    callbacks.floorFit?.(slabNotes);
    const floorElevation = (next.structuralGuide?.elevationUnits ?? 0) / 32;
    const nextFloorKey = `${next.floor?.fingerprint ?? ""}:${floorElevation}:${!!next.floorSlabs}`;
    if (nextFloorKey !== floorKey) {
      floorKey = nextFloorKey;
      floor?.dispose();
      floor = undefined;
      if (!next.floorSlabs && next.floor?.tiles.length) {
        const positions: number[] = [],
          indices: number[] = [];
        for (const tile of next.floor.tiles) {
          const start = positions.length / 3;
          for (const p of tile.vertices)
            positions.push(
              p[0] / 32 - origin.x,
              floorElevation - 0.02 - origin.y,
              -p[1] / 32 - origin.z,
            );
          for (let i = 1; i < tile.vertices.length - 1; i++)
            indices.push(start, start + i, start + i + 1);
        }
        floor = new Mesh("floorplan-guide", scene);
        setMeshRole(floor, "effect");
        const data = new VertexData();
        data.positions = positions;
        data.indices = indices;
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        data.normals = normals;
        data.applyToMesh(floor);
        floor.material = material;
        floor.isPickable = false;
      }
    }
    floor?.setEnabled(layoutPartVisible("floor", next.visible, next.preview));
    doorways.update(
      next.suppressNativeWalls
        ? undefined
        : (next.floorSlabs ?? next.insetPreview),
      layoutPartVisible("wall", next.visible, next.preview),
      origin.asArray(),
    );
    const structuralGuide = next.structuralGuide
      ? {
          ...next.structuralGuide,
          walls: doorwayWallSpans(next.structuralGuide.walls, doorways.plan),
        }
      : undefined;
    guideState = {
      input: structuralGuide,
      visible: layoutPartVisible("wall", next.visible, next.preview),
    };
    insetMode = !!next.insetPreview;
    insetWalls.update(
      next.suppressNativeWalls ? undefined : next.insetPreview,
      {
        wall: layoutPartVisible("wall", next.visible, next.preview),
        roof: layoutPartVisible("roof", next.visible, next.preview),
        floor:
          !next.floorSlabs &&
          layoutPartVisible("floor", next.visible, next.preview),
      },
      origin.asArray(),
    );
    // The inset plan is computed synchronously; if it produced nothing for a
    // deck that has boundary issues, show the per-span kit for this deck.
    fallbackWalls =
      insetMode &&
      !next.suppressNativeWalls &&
      insetWalls.plan.requests.length === 0 &&
      insetWalls.plan.issues.length > 0;
    nativeWalls.update(
      next.suppressNativeWalls || (insetMode && !fallbackWalls)
        ? undefined
        : structuralGuide,
      layoutPartVisible("wall", next.visible, next.preview),
      origin.asArray(),
    );
    if (insetMode && fallbackWalls)
      publishWallNotes(
        `Inward wall kit cannot cover this deck · ${insetWalls.plan.issues.length} fit notes · per-span kit shown instead`,
      );
    refreshGuides();
    selection.update(
      [...nodes.values()].flatMap((e) => e.node.getChildMeshes()),
      next.selected,
    );
    canvas.dataset.placements = String(nodes.size);
    canvas.dataset.expectedPlacements = String(next.parts.length);
    if (nodes.size === next.parts.length)
      callbacks.status(
        next.contextOnly?.size
          ? `${nodes.size - next.contextOnly.size} editable components ready · ${next.contextOnly.size} structural context parts`
          : `${nodes.size} editable components ready${wallStatus ? ` · ${wallStatus}` : ""}`,
      );
  }
  function fit(id?: string) {
    if (disposed) return;
    requestRender();
    const placed = [...nodes].filter(
      ([key, e]) => (!id || key === id) && e.node.isEnabled(),
    );
    const guide =
      !id && structuralGuides.mesh?.isEnabled()
        ? structuralGuides.mesh
        : undefined;
    const wallMeshes = id
      ? []
      : [
          ...nativeWalls.meshes,
          ...insetWalls.meshes,
          ...floorSlabs.meshes,
          ...doorways.meshes,
        ].filter((m) => m.isEnabled());
    if (!placed.length && !guide && !wallMeshes.length) {
      if (state?.floor) {
        const bounds = state.floor.bounds;
        camera.target.set(
          (bounds.min[0] + bounds.max[0]) / 64 - origin.x,
          (state.structuralGuide?.elevationUnits ?? state.height * 32) / 32 -
            origin.y,
          -(bounds.min[1] + bounds.max[1]) / 64 - origin.z,
        );
        camera.radius = Math.max(
          3,
          (Math.hypot(
            bounds.max[0] - bounds.min[0],
            bounds.max[1] - bounds.min[1],
          ) /
            32) *
            1.25,
        );
      }
      return;
    }
    let min = new Vector3(Infinity, Infinity, Infinity),
      max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const [, e] of placed) {
      e.node.computeWorldMatrix(true);
      const b = e.node.getHierarchyBoundingVectors(true);
      min = Vector3.Minimize(min, b.min);
      max = Vector3.Maximize(max, b.max);
    }
    for (const mesh of wallMeshes) {
      mesh.computeWorldMatrix(true);
      const b = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, b.minimumWorld);
      max = Vector3.Maximize(max, b.maximumWorld);
    }
    if (guide) {
      guide.computeWorldMatrix(true);
      const box = guide.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, box.minimumWorld);
      max = Vector3.Maximize(max, box.maximumWorld);
    }
    const center = min.add(max).scale(0.5);
    camera.target.copyFrom(center);
    camera.radius = editorFitRadius(
      max.subtract(min).asArray(),
      camera.alpha,
      camera.beta,
      canvas.clientWidth / Math.max(1, canvas.clientHeight),
      camera.fov,
    );
  }
  let last = 0,
    lastView = "";
  engine.runRenderLoop(() => {
    // Follow display refresh during input. Throttling scene.render also delays
    // camera input consumption and makes otherwise direct dragging feel sticky.
    if (disposed || document.hidden || performance.now() > activeUntil) return;
    if (camera.mode === 1) {
      const half = camera.radius * Math.tan(camera.fov / 2);
      const aspect =
        engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
      camera.orthoLeft = -half * aspect;
      camera.orthoRight = half * aspect;
      camera.orthoTop = half;
      camera.orthoBottom = -half;
    }
    scene.render();
    // The overlay callback rewrites DOM styles; only fire it when the camera or
    // render size actually changed, not on every warm frame after an input.
    const view = [
      camera.alpha,
      camera.beta,
      camera.radius,
      camera.target.x,
      camera.target.y,
      camera.target.z,
      camera.fov,
      camera.orthoLeft,
      camera.orthoRight,
      camera.orthoTop,
      camera.orthoBottom,
      engine.getRenderWidth(),
      engine.getRenderHeight(),
    ].join(",");
    if (view !== lastView) {
      lastView = view;
      refreshPlaneGuides();
      measurement.refresh();
      callbacks.viewChanged?.();
    }
    if (performance.now() - last > 750) {
      last = performance.now();
      canvas.dataset.camera = JSON.stringify(getCamera());
      canvas.dataset.meshes = String(scene.getActiveMeshes().length);
    }
  });
  function getCamera(): HullCameraState {
    return {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: camera.target.asArray() as [number, number, number],
    };
  }
  return {
    update,
    fit,
    cancel,
    getCamera,
    setMeasuring(active: boolean) {
      externalMeasuring = active;
      measurement.setActive(active || state?.tool === "measure");
      if (state)
        pointerInput.buttons =
          state.lockTop || state.preview?.lockTop
            ? []
            : state.tool === "orbit" && !active
              ? [0, 1, 2]
              : [1, 2];
    },
    measureAt: measurement.measureAt,
    clearMeasurements: measurement.clear,
    removeMeasurementPoint: measurement.removeLast,
    planeTransform(elevation: number) {
      camera.getViewMatrix();
      const matrix = camera
        .getViewMatrix()
        .multiply(camera.getProjectionMatrix());
      return layoutPlaneMatrix(
        matrix.m,
        origin.asArray(),
        elevation,
        canvas.clientWidth,
        canvas.clientHeight,
      );
    },
    floorPoint(
      x: number,
      y: number,
      elevation: number,
    ): [number, number] | null {
      const hit = point(x, y, elevation - origin.y);
      return hit ? [(hit.x + origin.x) * 32, (-hit.z - origin.z) * 32] : null;
    },
    zoom(delta: number) {
      camera.radius = Math.max(
        0.5,
        Math.min(800, camera.radius * Math.exp(delta * 0.0015)),
      );
      requestRender();
    },
    orbit(dx: number, dy: number) {
      if (state?.lockTop || state?.preview?.lockTop) return;
      camera.alpha -= dx * 0.005;
      camera.beta = Math.max(
        0.03,
        Math.min(Math.PI - 0.03, camera.beta - dy * 0.005),
      );
      requestRender();
    },
    pan(x: number, y: number, dx: number, dy: number, elevation: number) {
      const before = point(x - dx, y - dy, elevation - origin.y);
      const after = point(x, y, elevation - origin.y);
      if (before && after) camera.target.addInPlace(before.subtract(after));
      requestRender();
    },
    dropPoint(x: number, y: number) {
      const p = point(x, y, (state?.height ?? 0) - origin.y);
      return p ? snap(p) : null;
    },
    async ready() {
      await Promise.all([
        ...pending.values(),
        nativeWalls.ready(),
        insetWalls.ready(),
        doorways.ready(),
      ]);
      if (!disposed) await scene.whenReadyAsync();
    },
    dispose() {
      disposed = true;
      floorSlabs.dispose();
      selection.dispose();
      structuralGuides.dispose();
      hullEnvelope.dispose();
      nativeWalls.dispose();
      insetWalls.dispose();
      doorways.dispose();
      measurement.dispose();
      cancel();
      resize.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", requestRender);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("pointerleave", hideGhost);
      canvas.removeEventListener("pointerleave", measurement.hideHover);
      canvas.removeEventListener("wheel", requestRender);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      engine.stopRenderLoop();
      // Let in-flight GLB/BRDF texture work finish before releasing its engine.
      // Switching editor modes during a load must not execute a shader callback
      // against an already disposed WebGL program.
      void Promise.allSettled([
        ...pending.values(),
        nativeWalls.ready(),
        insetWalls.ready(),
        doorways.ready(),
      ])
        .then(() => scene.whenReadyAsync())
        .finally(() => {
          scene.dispose();
          engine.dispose();
        });
    },
  };
}
