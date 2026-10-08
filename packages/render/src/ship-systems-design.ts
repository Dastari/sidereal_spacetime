/** Isolated, read-only systems inspection. Never changes the live flight scene or ship state. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import "@babylonjs/core/Rendering/outlineRenderer";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import type {
  SystemsDesign,
  DesignChannel,
  DesignComponent,
  DesignPoint,
} from "@sidereal/sim/ship-systems-design";
import { shipPartToShip } from "@sidereal/sim/ship-systems";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { withSceneCoordinateContext } from "./scene-coordinate-context";
import {
  createPrefabShipView,
  type PrefabShipView,
} from "./prefab-ship/ship-view";
import { loadVerifiedGlbGeometry } from "./prefab-ship/glb-library";
import { roleSlotMaterial, slotOfMaterialName } from "./prefab-ship/materials";
import {
  HULL_ACCESS_DOORS,
  isWayfarerHullAccessProfile,
} from "@sidereal/content/hull-access-profile";
import {
  loadAuthoredAccessDoors,
  type AuthoredAccessDoorPlacement,
} from "./prefab-ship/authored-access-doors";
import { publishedShipAccessBytes } from "./prefab-ship/wayfarer-access-assets";

export const SYSTEMS_CHANNEL_COLORS: Record<DesignChannel, string> = {
  power: "#f2a75b",
  data: "#aa97f7",
  coolant: "#55d1df",
  fuel: "#ed7186",
  ventilation: "#91c879",
};
export type SystemsDeckMode = "hidden" | "lifted";
const renderPoint = (p: readonly number[]) => new Vector3(p[0], p[2], -p[1]);
export function componentVertexToRender(
  c: DesignComponent,
  p: ArrayLike<number>,
  normal = false,
): DesignPoint {
  const world = shipPartToShip(
    c.placement,
    [p[0], -p[2], p[1]],
    c.mount,
    !normal,
  );
  return [world[0], world[2], -world[1]];
}
/** The face-authored component's -Y is the outward hatch normal, after its saved yaw. */
export function componentAccessPlacement(
  c: DesignComponent,
): AuthoredAccessDoorPlacement {
  const normal = shipPartToShip(c.placement, [0, -1, 0], c.mount, false);
  return {
    id: c.id,
    variant: c.id === "mount:cargo-outer" ? "cargo.4m" : "personnel",
    center: [c.placement.position[0], c.placement.position[1]],
    normal: [normal[0] || 0, normal[1] || 0],
    floorM: c.placement.position[2],
  };
}
export function componentIndicesToRender(
  c: DesignComponent,
  indices: Uint32Array,
): Uint32Array {
  if (!c.placement.reflected) return indices;
  const reflected = Uint32Array.from(indices);
  for (let i = 0; i < reflected.length; i += 3)
    [reflected[i + 1], reflected[i + 2]] = [reflected[i + 2], reflected[i + 1]];
  return reflected;
}
interface ArtManifest {
  schema: string;
  revision: string;
  components: { id: string; sha256: string; bytes: number }[];
}
const ART_MANIFEST_SHA =
  "58f7d1e53514450c557c8fc6f0edb321054e691b0d8c2eb162511d74cb3642ca";
async function fetchBytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`Asset unavailable (${r.status}): ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

export function createSystemsDesignView(
  canvas: HTMLCanvasElement,
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  model: SystemsDesign,
  callbacks: {
    onSelect: (id: string) => void;
    onStatus: (message: string) => void;
    onError: (message: string) => void;
  },
) {
  return withSceneCoordinateContext(undefined, () =>
    buildView(canvas, doc, catalogRevision, model, callbacks),
  );
}
function buildView(
  canvas: HTMLCanvasElement,
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  model: SystemsDesign,
  callbacks: {
    onSelect: (id: string) => void;
    onStatus: (message: string) => void;
    onError: (message: string) => void;
  },
) {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    useHighPrecisionMatrix: true,
  });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.045, 0.075, 0.115, 1);
  const environment = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    64,
    false,
    true,
    false,
    true,
    undefined,
    () => {
      if (scene.isDisposed) return;
      scene.environmentTexture = null;
      environment.dispose();
    },
  );
  scene.environmentTexture = environment;
  scene.environmentIntensity = 0.55;
  const camera = new ArcRotateCamera(
    "systems-camera",
    -Math.PI / 3,
    Math.PI / 3.1,
    30,
    new Vector3(0, -0.5, 0),
    scene,
  );
  camera.minZ = 0.05;
  camera.maxZ = 500;
  camera.lowerRadiusLimit = 2;
  camera.upperRadiusLimit = 100;
  camera.wheelDeltaPercentage = 0.015;
  camera.panningSensibility = 80;
  camera.attachControl(canvas, true);
  new HemisphericLight(
    "systems-fill",
    new Vector3(0.4, 1, 0.2),
    scene,
  ).intensity = 0.85;
  new DirectionalLight(
    "systems-key",
    new Vector3(-0.4, -1, 0.6),
    scene,
  ).intensity = 2;
  const deckHost = new TransformNode("systems-deck-context", scene);
  deckHost.setEnabled(false);
  let disposed = false,
    context: PrefabShipView | undefined,
    equipmentReady = false,
    loadingDeck = false,
    deckMode: SystemsDeckMode = "hidden",
    belowOnly = true,
    selected: string | undefined;
  let channels = new Set<DesignChannel>(["power"]);
  const meshes = new Map<string, AbstractMesh[]>(),
    routeMeshes = new Map<string, Mesh>(),
    portMeshes = new Map<string, Mesh>();
  const material = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(color);
    m.specularColor = Color3.Black();
    return m;
  };
  const routeMaterials = new Map(
    Object.entries(SYSTEMS_CHANNEL_COLORS).map(([ch, color]) => [
      ch,
      material(`service-${ch}`, color),
    ]),
  );
  for (const route of model.routes) {
    const mesh = CreateTube(
      `service:${route.id}`,
      {
        path: route.points.map(renderPoint),
        radius: 0.05,
        tessellation: 6,
        cap: Mesh.CAP_ALL,
      },
      scene,
    );
    mesh.material = routeMaterials.get(route.channel)!;
    mesh.isPickable = false;
    routeMeshes.set(route.id, mesh);
  }
  for (const c of model.components)
    for (const p of c.ports) {
      const m = CreateSphere(
        `port:${p.key}`,
        { diameter: 0.15, segments: 6 },
        scene,
      );
      m.position = renderPoint(p.position);
      m.material = routeMaterials.get(p.channel)!;
      m.metadata = { componentId: c.id };
      portMeshes.set(p.key, m);
    }
  function applySelection() {
    const neighbors = new Set<string>();
    const connected = new Set<string>();
    for (const r of model.routes)
      if (
        r.from.startsWith(`${selected}/`) ||
        r.to.startsWith(`${selected}/`)
      ) {
        connected.add(r.id);
        neighbors.add(r.from.slice(0, r.from.lastIndexOf("/")));
        neighbors.add(r.to.slice(0, r.to.lastIndexOf("/")));
      }
    for (const [id, parts] of meshes)
      for (const m of parts) {
        const component = model.components.find((c) => c.id === id)!;
        m.setEnabled(!belowOnly || component.belowDeck);
        m.renderOutline = id === selected || neighbors.has(id);
        m.outlineColor =
          id === selected
            ? new Color3(0.39, 0.85, 0.92)
            : new Color3(0.53, 0.67, 0.75);
        m.outlineWidth = id === selected ? 0.035 : 0.015;
      }
    for (const r of model.routes) {
      const m = routeMeshes.get(r.id)!;
      m.setEnabled(channels.has(r.channel));
      m.visibility = !selected || connected.has(r.id) ? 1 : 0.18;
    }
    for (const c of model.components)
      for (const p of c.ports) {
        const m = portMeshes.get(p.key)!;
        m.setEnabled(channels.has(p.channel as DesignChannel));
        m.visibility =
          !selected || c.id === selected || neighbors.has(c.id) ? 1 : 0.38;
      }
  }
  function setDeck(mode: SystemsDeckMode) {
    deckMode = mode;
    deckHost.position.y = mode === "lifted" ? 4 : 0;
    deckHost.setEnabled(mode === "lifted");
    if (equipmentReady) {
      callbacks.onStatus(
        mode === "lifted" && !context ? "Loading deck illustration…" : "",
      );
      if (mode === "lifted" && !context && !loadingDeck) void loadDeck();
    }
  }
  function fit() {
    const points = model.components.flatMap((c) => c.bounds.map(renderPoint));
    if (deckMode === "lifted" && context)
      for (const mesh of context.root.getChildMeshes()) {
        if (!mesh.isEnabled()) continue;
        mesh.computeWorldMatrix(true);
        const b = mesh.getBoundingInfo().boundingBox;
        points.push(b.minimumWorld, b.maximumWorld);
      }
    const coords = points.map((p) => [p.x, p.y, p.z]);
    const lo = [0, 1, 2].map((i) => Math.min(...coords.map((p) => p[i]))),
      hi = [0, 1, 2].map((i) => Math.max(...coords.map((p) => p[i])));
    camera.setTarget(Vector3.FromArray(lo.map((v, i) => (v + hi[i]) / 2)));
    camera.radius = Math.max(
      10,
      (Math.hypot(...hi.map((v, i) => v - lo[i])) /
        (2 * Math.tan(camera.fov / 2))) *
        1.05,
    );
  }
  fit();
  applySelection();
  const pick = scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERPICK) return;
    const id = info.pickInfo?.pickedMesh?.metadata?.componentId;
    if (typeof id === "string") callbacks.onSelect(id);
  });
  const loop = () => {
    if (!disposed && document.visibilityState !== "hidden")
      withSceneCoordinateContext(scene, () => scene.render());
  };
  engine.runRenderLoop(loop);
  const resize = new ResizeObserver(() => {
    if (!disposed) engine.resize();
  });
  resize.observe(canvas);
  callbacks.onStatus("Loading installed equipment…");
  const ready = (async () => {
    const bytes = await fetchBytes(
      "/assets/ship-components/r004/manifest.json",
    );
    if (bytesToHex(sha256(bytes)) !== ART_MANIFEST_SHA)
      throw Error("Component art manifest differs from the published revision");
    const manifest = JSON.parse(new TextDecoder().decode(bytes)) as ArtManifest;
    if (
      manifest.schema !== "sidereal.ship-component-art.v1" ||
      manifest.revision !== "r004"
    )
      throw Error("Unsupported component art revision");
    const failures: string[] = [];
    const nativeDoors = isWayfarerHullAccessProfile(doc)
      ? model.components.filter((c) =>
          ["mount:cargo-outer", "mount:personnel-outer"].includes(c.id),
        )
      : [];
    for (const c of model.components.filter((c) => !nativeDoors.includes(c))) {
      if (disposed) return;
      try {
        const pin = manifest.components.find((p) => p.id === c.definition.id);
        if (!pin) throw Error("No published model");
        const url = `/assets/ship-components/r004/${c.definition.id}.glb`,
          data = await fetchBytes(url);
        if (disposed) return;
        if (data.length !== pin.bytes)
          throw Error("Model byte count differs from the published revision");
        const geometry = await loadVerifiedGlbGeometry(
          scene,
          url,
          data,
          pin.sha256,
        );
        if (disposed) return;
        const parts: Mesh[] = [];
        for (const p of geometry.primitives) {
          const positions = new Float32Array(p.positions.length),
            normals = new Float32Array(p.normals.length);
          for (let i = 0; i < positions.length; i += 3) {
            positions.set(
              componentVertexToRender(c, p.positions.subarray(i, i + 3)),
              i,
            );
            normals.set(
              componentVertexToRender(c, p.normals.subarray(i, i + 3), true),
              i,
            );
          }
          const m = new Mesh(`equipment:${c.id}:${parts.length}`, scene),
            v = new VertexData();
          v.positions = positions;
          v.normals = normals;
          v.indices = componentIndicesToRender(c, p.indices);
          if (p.uvs) v.uvs = Float32Array.from(p.uvs);
          v.applyToMesh(m);
          m.material = roleSlotMaterial(
            scene,
            doc.theme,
            slotOfMaterialName(p.material) ?? "primary",
            "equipment",
          );
          m.metadata = { componentId: c.id };
          m.setEnabled(!belowOnly || c.belowDeck);
          parts.push(m);
        }
        meshes.set(c.id, parts);
        applySelection();
      } catch (e) {
        if (!disposed)
          failures.push(
            `${c.name}: ${e instanceof Error ? e.message : String(e)}`,
          );
      }
    }
    if (nativeDoors.length && !disposed) {
      try {
        const parent = new TransformNode("systems-native-access", scene);
        parent.setEnabled(false);
        const doors = await loadAuthoredAccessDoors(
          scene,
          parent,
          nativeDoors.map(componentAccessPlacement),
          { pack: HULL_ACCESS_DOORS, fetchBytes: publishedShipAccessBytes },
        );
        if (disposed) {
          doors.dispose();
          return;
        }
        for (const mesh of doors.meshes()) {
          const id = mesh.metadata?.authoredAccessDoor?.id as string;
          mesh.metadata = { ...mesh.metadata, componentId: id };
          mesh.isPickable = true;
          const parts = meshes.get(id) ?? [];
          parts.push(mesh);
          meshes.set(id, parts);
        }
        applySelection();
        parent.setEnabled(true);
      } catch (e) {
        if (!disposed)
          failures.push(
            `Hull doors: ${e instanceof Error ? e.message : String(e)}`,
          );
      }
    }
    if (disposed) return;
    applySelection();
    equipmentReady = true;
    setDeck(deckMode);
    if (failures.length)
      callbacks.onError(
        `Some machinery models could not load. The equipment list remains available. ${failures.join("; ")}`,
      );
  })().catch((e) => {
    if (!disposed) {
      callbacks.onStatus("");
      callbacks.onError(e instanceof Error ? e.message : String(e));
    }
  });
  async function loadDeck() {
    loadingDeck = true;
    // Native batches acquire their final parent only after asynchronous imports.
    // Keep intermediate meshes off screen until the complete context is ready.
    const inspectionMeshes = new Set(scene.meshes);
    const contextGuard = scene.onBeforeRenderObservable.add(() => {
      for (const mesh of scene.meshes)
        if (!inspectionMeshes.has(mesh)) mesh.setEnabled(false);
    });
    try {
      const ship = await createPrefabShipView(scene, doc, {
        catalog: prefabComponentCatalogFor(catalogRevision),
        view: "deck",
        roomLights: 0,
        staticPlumes: false,
        parent: deckHost,
      });
      if (disposed) {
        ship.dispose();
        return;
      }
      context = ship;
      scene.onBeforeRenderObservable.remove(contextGuard);
      context.setView("deck");
      const ghost = new StandardMaterial("systems-deck-ghost", scene);
      ghost.disableLighting = true;
      ghost.emissiveColor = new Color3(0.35, 0.48, 0.6);
      ghost.alpha = 0.12;
      ghost.disableDepthWrite = true;
      for (const mesh of context.root.getChildMeshes()) {
        mesh.isPickable = false;
        mesh.material = ghost;
      }
      setDeck(deckMode);
      if (deckMode === "lifted") fit();
    } catch (e) {
      if (!disposed)
        callbacks.onError(
          `The deck illustration could not load. Machinery inspection remains available. ${e instanceof Error ? e.message : String(e)}`,
        );
    } finally {
      scene.onBeforeRenderObservable.remove(contextGuard);
      loadingDeck = false;
      if (!disposed) callbacks.onStatus("");
    }
  }
  return {
    ready,
    select(id: string | undefined) {
      selected = id;
      applySelection();
    },
    setChannels(values: readonly DesignChannel[]) {
      channels = new Set(values);
      applySelection();
    },
    setBelowOnly(value: boolean) {
      belowOnly = value;
      applySelection();
    },
    setDeck,
    fit,
    focus(id: string) {
      const c = model.components.find((c) => c.id === id);
      if (c) {
        camera.setTarget(renderPoint(c.placement.position));
        camera.radius = 7;
      }
    },
    metrics() {
      return {
        equipmentModels: meshes.size,
        routeMeshes: routeMeshes.size,
        activeRoutes: [...routeMeshes.values()].filter((m) => m.isEnabled())
          .length,
        deckMode,
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resize.disconnect();
      scene.onPointerObservable.remove(pick);
      engine.stopRenderLoop(loop);
      camera.detachControl();
      withSceneCoordinateContext(scene, () => {
        context?.dispose();
        scene.dispose();
        engine.dispose();
      });
    },
  };
}
