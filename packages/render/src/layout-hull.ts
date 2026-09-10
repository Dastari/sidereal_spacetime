import { layoutPickingCoordinates } from "./layout-picking-coordinates";
import {
  createLayoutStructuralGuides,
  type LayoutStructuralGuide,
} from "./layout-structural-guides";
export type { LayoutStructuralGuide } from "./layout-structural-guides";
import { setMeshRole } from "./mesh-roles";
import {
  editorFitRadius,
  editorGuideStep,
  editorRenderScale,
} from "./editor-surface";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { layoutViewOrientation } from "./layout-view-orientation";
import { snapLayoutPoint } from "./layout-placement-grid";
import { layoutPlaneMatrix } from "./layout-plane-projection";
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
  tool: "select" | "orbit" | "place";
  assetId: string;
  height: number;
  snap: number;
  blocked: boolean;
  projection: string;
  floor?: CompiledLayout;
  structuralGuide?: LayoutStructuralGuide;
  showGrid?: boolean;
  /** Native structural context cannot be selected or dragged as an assembly object. */
  contextOnly?: ReadonlySet<string>;
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
    move: (id: string, p: [number, number, number], copy: boolean) => void;
    place: (id: string, p: [number, number, number]) => void;
    status: (message: string) => void;
    viewChanged?: () => void;
  },
  initialCamera?: HullCameraState,
  initialProjection?: string,
) {
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
  let activeUntil = performance.now() + 2000;
  const requestRender = () => {
    activeUntil = performance.now() + 1500;
  };
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
  let drag:
    | {
        id: string;
        start: Vector3;
        origin: Vector3;
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
    if (state.tool === "orbit") return;
    if (state.tool === "place") return;
    const id = pick(e)?.pickedMesh?.metadata?.partId as string | undefined;
    if (!id) {
      callbacks.select("");
      return;
    }
    callbacks.select(id);
    if (state.blocked) return;
    const node = nodes.get(id)!.node,
      hit = point(e.clientX, e.clientY, node.position.y);
    if (hit) {
      drag = {
        id,
        start: hit,
        origin: node.position.clone(),
        copy: e.ctrlKey || e.metaKey,
        x: e.clientX,
        y: e.clientY,
      };
      canvas.dataset.gestureActive = "true";
      canvas.setPointerCapture(e.pointerId);
    }
  };
  const pointerMove = (e: PointerEvent) => {
    requestRender();
    if (state?.tool === "place" && !state.blocked) {
      const hit = point(e.clientX, e.clientY, state.height - origin.y),
        asset = catalog.assets.find((a) => a.id === state!.assetId);
      if (hit && asset) {
        const p = snap(hit),
          min = asset.bounds.min,
          max = asset.bounds.max;
        ghost.scaling.set(
          Math.max(0.03, max[0] - min[0]),
          Math.max(0.03, max[2] - min[2]),
          Math.max(0.03, max[1] - min[1]),
        );
        ghost.position.set(
          p[0] + (min[0] + max[0]) / 2 - origin.x,
          p[2] + (min[2] + max[2]) / 2 - origin.y,
          -p[1] - (min[1] + max[1]) / 2 - origin.z,
        );
        ghost.setEnabled(true);
      }
    }
    if (!drag || !state) return;
    const hit = point(e.clientX, e.clientY, drag.origin.y);
    if (!hit) return;
    const p = snap(drag.origin.add(hit.subtract(drag.start)));
    nodes
      .get(drag.id)
      ?.node.position.set(p[0] - origin.x, p[2] - origin.y, -p[1] - origin.z);
  };
  function cancel() {
    requestRender();
    if (drag) nodes.get(drag.id)?.node.position.copyFrom(drag.origin);
    drag = undefined;
    down = undefined;
    canvas.dataset.gestureActive = "false";
  }
  const pointerUp = (e: PointerEvent) => {
    if (!state || e.button !== 0) return;
    if (drag) {
      const d = drag,
        p = nodes.get(d.id)!.node.position.clone(),
        moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3;
      cancel();
      if (moved && !state.blocked) callbacks.move(d.id, snap(p), d.copy);
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
    if (
      editorGuideStep(next.snap) !== gridStep &&
      Number.isFinite(next.snap) &&
      next.snap >= 1 / 32
    ) {
      grid.dispose();
      gridStep = editorGuideStep(next.snap);
      grid = buildGrid(gridStep);
    }
    grid.setEnabled(next.showGrid === true || next.tool === "place");
    grid.position.y = next.height - origin.y - 0.025;
    if (next.tool !== "place") hideGhost();
    loadNeeded(next.parts);
    pointerInput.buttons = next.tool === "orbit" ? [0, 1, 2] : [1, 2];
    const orientation = layoutViewOrientation(projection, next.projection);
    projection = next.projection;
    if (orientation) {
      camera.alpha = orientation.alpha;
      camera.beta = orientation.beta;
    }
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
      const category = catalog.assets.find((a) => a.id === p.assetId)?.category;
      entry.node.setEnabled(
        layoutPartVisible(category, next.visible, next.preview),
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
    const floorElevation = (next.structuralGuide?.elevationUnits ?? 0) / 32;
    const nextFloorKey = `${next.floor?.fingerprint ?? ""}:${floorElevation}`;
    if (nextFloorKey !== floorKey) {
      floorKey = nextFloorKey;
      floor?.dispose();
      floor = undefined;
      if (next.floor?.tiles.length) {
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
    structuralGuides.update(
      next.structuralGuide,
      layoutPartVisible("wall", next.visible, next.preview),
      origin.asArray(),
    );
    canvas.dataset.structuralWallGuides = String(structuralGuides.count);
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
          : `${nodes.size} editable components ready`,
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
    if (!placed.length && !guide) {
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
  let last = 0;
  engine.runRenderLoop(() => {
    // Follow display refresh during input. Throttling scene.render also delays
    // camera input consumption and makes otherwise direct dragging feel sticky.
    if (disposed || document.hidden || performance.now() > activeUntil) return;
    scene.render();
    callbacks.viewChanged?.();
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
      await Promise.all(pending.values());
      if (!disposed) await scene.whenReadyAsync();
    },
    dispose() {
      disposed = true;
      selection.dispose();
      structuralGuides.dispose();
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
      canvas.removeEventListener("wheel", requestRender);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      engine.stopRenderLoop();
      // Let in-flight GLB/BRDF texture work finish before releasing its engine.
      // Switching editor modes during a load must not execute a shader callback
      // against an already disposed WebGL program.
      void Promise.allSettled([...pending.values()])
        .then(() => scene.whenReadyAsync())
        .finally(() => {
          scene.dispose();
          engine.dispose();
        });
    },
  };
}
