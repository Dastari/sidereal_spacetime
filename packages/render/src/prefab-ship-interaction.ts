/**
 * Presentation helpers for prefab ships (SHIP-INTERACTION): beam clipping against the same
 * compiled structure the server uses, the shot impact flash, and object picking/highlighting.
 *
 * Nothing here writes simulation state. The beam clip is a prediction of the authoritative
 * `castPrefabBeam` result (the impact flash itself is placed at the server-reported point);
 * picking only selects which already-visible object the details panel describes.
 *
 * Frames: prefab plan (+X fore, +Y port, +Z up) -> ship-root Babylon local
 * (X = -(py - oy), Y = pz, Z = -(px - ox)); ship-local game (x, y) -> Babylon (x, ·, -y).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import "@babylonjs/core/Culling/ray";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { G } from "@sidereal/content/construction-grammar";
import {
  prefabOrigin,
  readShipPrefab,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import {
  prefabShipObjects,
  type PrefabShipObject,
} from "@sidereal/sim/prefab-deck-objects";
import {
  castPrefabBeam,
  prefabBeamModel,
  type PrefabBeamModel,
} from "@sidereal/sim/prefab-beam";
import { setMeshRole } from "./mesh-roles";

/** Selection ids handed to the client are namespaced so they never collide with native parts. */
export const PREFAB_OBJECT_PREFIX = "prefab:";
const FLOOR_TOP = G.deck.floorTopTexels / 16;

export interface PrefabShipBinding {
  doc: ShipPrefabDocumentV1;
  catalog: PrefabComponentCatalog;
}
/** The trusted prefab binding of a construction document, or undefined. */
export function prefabBindingOf(
  documentJson: string | undefined,
): PrefabShipBinding | undefined {
  if (!documentJson) return;
  try {
    const binding = (
      JSON.parse(documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (!binding || typeof binding.catalog !== "string") return;
    return {
      doc: readShipPrefab(binding.document),
      catalog: prefabComponentCatalogFor(binding.catalog),
    };
  } catch {
    return;
  }
}

/**
 * Beam clip for `createCombatAim`: the distance along a world-space beam at which the prefab
 * structure (or the deck floor) stops it, or undefined when nothing does within `range`.
 */
export function createPrefabBeamClip(
  shipRoot: TransformNode,
  binding: PrefabShipBinding,
) {
  const model: PrefabBeamModel = prefabBeamModel(binding.doc, binding.catalog);
  return (origin: Vector3, direction: Vector3, range: number) => {
    const inverse = Matrix.Invert(shipRoot.computeWorldMatrix(true));
    const o = Vector3.TransformCoordinates(origin, inverse);
    const d = Vector3.TransformNormal(direction, inverse).normalize();
    let best = Infinity;
    const horizontal = Math.hypot(d.x, d.z);
    if (horizontal > 1e-6) {
      const hit = castPrefabBeam(
        model,
        [o.x, -o.z],
        Math.atan2(d.x, -d.z),
        range * horizontal,
        Math.max(0.05, o.y - FLOOR_TOP),
      );
      if (hit.kind !== "none") best = hit.distanceM / horizontal;
    }
    if (d.y < -1e-6) best = Math.min(best, (o.y - FLOOR_TOP) / -d.y);
    return best <= range ? best : undefined;
  };
}

/** Short emissive burst at the authoritative impact point (ship-local game metres). */
export function createImpactFlash(
  scene: Scene,
  shipRoot: TransformNode,
  clock: () => number = () => performance.now(),
) {
  const material = new StandardMaterial("prefab-impact-flash", scene);
  material.disableLighting = true;
  material.emissiveColor = new Color3(0.45, 1, 0.55);
  material.diffuseColor = Color3.Black();
  const live: {
    meshes: AbstractMesh[];
    start: number;
    last: number;
    sparks: Vector3[];
  }[] = [];
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = clock();
    for (let i = live.length - 1; i >= 0; i--) {
      const fx = live[i];
      const dt = Math.min((now - fx.last) / 1000, 0.1);
      fx.last = now;
      const k = (now - fx.start) / 350;
      const [core, ...sparks] = fx.meshes;
      core.scaling.setAll(0.12 + k * 0.35);
      core.visibility = Math.max(0, 1 - k);
      sparks.forEach((s, j) => {
        s.position.addInPlace(fx.sparks[j].scale(dt));
        s.visibility = Math.max(0, 1 - k);
      });
      if (k >= 1) {
        for (const m of fx.meshes) m.dispose();
        live.splice(i, 1);
      }
    }
  });
  return {
    meshes: () => live.flatMap((f) => f.meshes),
    /** Play a flash at ship-local (x, y), `heightM` above the deck floor top. */
    play(x: number, y: number, heightM: number) {
      const at = new Vector3(x, FLOOR_TOP + heightM, -y);
      const core = CreateSphere(
        "prefab-impact-core",
        { diameter: 1, segments: 6 },
        scene,
      );
      core.parent = shipRoot;
      core.position.copyFrom(at);
      const meshes: AbstractMesh[] = [core];
      const velocities: Vector3[] = [];
      for (let i = 0; i < 6; i++) {
        const spark = CreateBox("prefab-impact-spark", { size: 0.035 }, scene);
        spark.parent = shipRoot;
        spark.position.copyFrom(at);
        const a = (i / 6) * Math.PI * 2;
        velocities.push(
          new Vector3(
            Math.cos(a) * 1.6,
            0.8 + (i % 3) * 0.5,
            Math.sin(a) * 1.6,
          ),
        );
        meshes.push(spark);
      }
      for (const m of meshes) {
        m.material = material;
        m.isPickable = false;
        setMeshRole(m, "effect");
      }
      const now = clock();
      live.push({ meshes, start: now, last: now, sparks: velocities });
      return meshes;
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const fx of live) for (const m of fx.meshes) m.dispose();
      live.length = 0;
      material.dispose();
    },
  };
}

type Box = { min: Vector3; max: Vector3 };
/** Plan-metre object box -> ship-root Babylon local box. */
function localBox(o: PrefabShipObject, origin: [number, number]): Box {
  const [ox, oy] = origin;
  return {
    min: new Vector3(-(o.max[1] - oy), o.min[2], -(o.max[0] - ox)),
    max: new Vector3(-(o.min[1] - oy), o.max[2], -(o.min[0] - ox)),
  };
}
/** Slab test; returns the entry distance along a unit ray or undefined. */
function rayBox(o: Vector3, d: Vector3, b: Box): number | undefined {
  let t0 = 0;
  let t1 = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const inv = 1 / d[axis];
    let a = (b.min[axis] - o[axis]) * inv;
    let c = (b.max[axis] - o[axis]) * inv;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t1 < t0) return undefined;
  }
  return t0;
}

/**
 * Click/hover picking of a prefab ship's placed objects in the current view (deck cut-away:
 * modules, furniture, doors, hull-side parts; flight: exterior parts). Draws a thin outline
 * around the hovered and the selected object.
 */
export function createPrefabObjectPicker(
  scene: Scene,
  canvas: HTMLCanvasElement,
  shipRoot: TransformNode,
  binding: PrefabShipBinding,
  isDeckView: () => boolean,
) {
  const origin = prefabOrigin(binding.doc);
  const objects = prefabShipObjects(binding.doc, binding.catalog).map((o) => ({
    object: o,
    box: localBox(o, origin),
  }));
  const outline = (name: string, colour: Color4) => {
    let mesh: LinesMesh | undefined;
    return {
      show(id: string | undefined) {
        mesh?.dispose();
        mesh = undefined;
        const hit = objects.find(
          (o) => PREFAB_OBJECT_PREFIX + o.object.id === id,
        );
        if (!hit) return;
        const pad = 0.04;
        const [a, b] = [hit.box.min, hit.box.max];
        const [x0, y0, z0] = [a.x - pad, a.y, a.z - pad];
        const [x1, y1, z1] = [b.x + pad, b.y + pad, b.z + pad];
        const p = (x: number, y: number, z: number) => new Vector3(x, y, z);
        const lines = [
          [
            p(x0, y0, z0),
            p(x1, y0, z0),
            p(x1, y0, z1),
            p(x0, y0, z1),
            p(x0, y0, z0),
          ],
          [
            p(x0, y1, z0),
            p(x1, y1, z0),
            p(x1, y1, z1),
            p(x0, y1, z1),
            p(x0, y1, z0),
          ],
          [p(x0, y0, z0), p(x0, y1, z0)],
          [p(x1, y0, z0), p(x1, y1, z0)],
          [p(x1, y0, z1), p(x1, y1, z1)],
          [p(x0, y0, z1), p(x0, y1, z1)],
        ];
        mesh = CreateLineSystem(
          name,
          { lines, colors: lines.map((l) => l.map(() => colour)) },
          scene,
        );
        mesh.parent = shipRoot;
        mesh.isPickable = false;
        mesh.renderingGroupId = 1;
        setMeshRole(mesh, "effect");
      },
      dispose() {
        mesh?.dispose();
      },
    };
  };
  const selected = outline(
    "prefab-object-selected",
    new Color4(0.35, 0.95, 1, 1),
  );
  const hovered = outline("prefab-object-hover", new Color4(0.8, 0.9, 1, 0.55));
  let hoverId: string | undefined;
  let selectedId: string | undefined;
  function pickAt(clientX: number, clientY: number): string | undefined {
    const camera = scene.activeCamera;
    if (!camera) return;
    const rect = canvas.getBoundingClientRect();
    const engine = scene.getEngine();
    const scaling = engine.getHardwareScalingLevel();
    const ray = scene.createPickingRay(
      ((clientX - rect.left) / rect.width) * engine.getRenderWidth() * scaling,
      ((clientY - rect.top) / rect.height) * engine.getRenderHeight() * scaling,
      Matrix.Identity(),
      camera,
    );
    const inverse = Matrix.Invert(shipRoot.computeWorldMatrix(true));
    const o = Vector3.TransformCoordinates(ray.origin, inverse);
    const d = Vector3.TransformNormal(ray.direction, inverse).normalize();
    const deck = isDeckView();
    let best: { t: number; id: string } | undefined;
    for (const { object, box } of objects) {
      if (object.view !== "both" && (object.view === "deck") !== deck) continue;
      const t = rayBox(o, d, box);
      // Doors are thin slabs; prefer any object whose box the ray actually enters first.
      if (t !== undefined && (!best || t < best.t))
        best = { t, id: PREFAB_OBJECT_PREFIX + object.id };
    }
    return best?.id;
  }
  const move = (event: PointerEvent) => {
    const id = pickAt(event.clientX, event.clientY);
    if (id === hoverId) return;
    hoverId = id;
    hovered.show(id && id !== selectedId ? id : undefined);
    canvas.style.cursor = id ? "pointer" : "";
    // Hovered object id for assistive tooling and browser reviews (presentation only).
    if (canvas.dataset) canvas.dataset.prefabObject = id ?? "";
  };
  canvas.addEventListener("pointermove", move);
  return {
    pick: (event: { clientX: number; clientY: number }) =>
      pickAt(event.clientX, event.clientY),
    select(id: string | undefined) {
      if (id === selectedId) return;
      selectedId = id?.startsWith(PREFAB_OBJECT_PREFIX) ? id : undefined;
      selected.show(selectedId);
      if (hoverId === selectedId) hovered.show(undefined);
    },
    /** For review harnesses: screen-independent selection by plan object id. */
    objectIds: () => objects.map((o) => PREFAB_OBJECT_PREFIX + o.object.id),
    dispose() {
      canvas.removeEventListener("pointermove", move);
      selected.dispose();
      hovered.dispose();
    },
  };
}
export type PrefabObjectPicker = ReturnType<typeof createPrefabObjectPicker>;
