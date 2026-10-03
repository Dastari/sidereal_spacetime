import {
  readFurnishingOverrides,
  type FurnishingOverrides,
} from "@sidereal/content/wayfarer-furnishings";
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
import { Color3 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/Culling/ray";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { IndicesArray } from "@babylonjs/core/types";
import { createObjectOutline } from "./object-outline";
import { G } from "@sidereal/content/construction-grammar";
import {
  prefabOrigin,
  readShipPrefab,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { isWayfarerGameplay } from "@sidereal/content/wayfarer-authored-gameplay";
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
  furnishings?: FurnishingOverrides;
}
/** The trusted prefab binding of a construction document, or undefined. */
export function prefabBindingOf(
  documentJson: string | undefined,
  furnishingsJson?: string,
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
      furnishings: readFurnishingOverrides(furnishingsJson),
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
  const model: PrefabBeamModel = prefabBeamModel(
    binding.doc,
    binding.catalog,
    binding.furnishings,
  );
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

/** Whether an object is drawn (and so pickable/outlinable) in the deck or flight view. */
function inView(o: PrefabShipObject, deck: boolean) {
  return o.view === "both" || (o.view === "deck") === deck;
}

/** Source roles of an outlined object: placed parts, or the door frame for doors. */
const PART_ROLES: ReadonlySet<string> = new Set(["equipment"]);
const DOOR_ROLES: ReadonlySet<string> = new Set(["wall"]);

/** Ship-root-local triangle soups of the rendered ship meshes, cached per mesh (static). */
const shipTriangleCache = new WeakMap<
  Mesh,
  { positions: Float32Array; indices: IndicesArray }
>();
/** Accepted furniture edits preserve batch identities but replace their geometry. */
export function invalidatePrefabShipTriangles(meshes: readonly Mesh[]) {
  for (const mesh of meshes) shipTriangleCache.delete(mesh);
}
function shipTriangles(mesh: Mesh, shipRoot: TransformNode) {
  let hit = shipTriangleCache.get(mesh);
  if (hit) return hit;
  const source = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!source || !indices) return undefined;
  const toRoot = mesh
    .computeWorldMatrix(true)
    .multiply(Matrix.Invert(shipRoot.computeWorldMatrix(true)));
  const positions = new Float32Array(source.length);
  const v = new Vector3();
  for (let i = 0; i < source.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      source[i],
      source[i + 1],
      source[i + 2],
      toRoot,
      v,
    );
    positions[i] = v.x;
    positions[i + 1] = v.y;
    positions[i + 2] = v.z;
  }
  hit = { positions, indices };
  shipTriangleCache.set(mesh, hit);
  return hit;
}

/**
 * Boxes of the other objects drawn in the same view that own triangles inside `box`: smaller
 * overlapping boxes (ties by id). A triangle belongs to the smallest object box containing it, so
 * an outline never spills onto a neighbour whose geometry sits inside a larger object's box.
 */
export function outlineExclusions(
  objects: readonly { id: string; box: Box }[],
  id: string,
): Box[] {
  const volume = (b: Box) =>
    (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
  const own = objects.find((o) => o.id === id);
  if (!own) return [];
  const size = volume(own.box);
  return objects
    .filter(
      (o) =>
        o.id !== id &&
        (volume(o.box) < size || (volume(o.box) === size && o.id < id)) &&
        o.box.min.x < own.box.max.x &&
        o.box.max.x > own.box.min.x &&
        o.box.min.y < own.box.max.y &&
        o.box.max.y > own.box.min.y &&
        o.box.min.z < own.box.max.z &&
        o.box.max.z > own.box.min.z,
    )
    .map((o) => o.box);
}

/**
 * Outline proxy for one picked object: the triangles of the currently drawn (batched) ship
 * meshes whose centroid lies inside the object's box, in ship-root space; the box itself when the
 * view has no geometry there (stand-ins, tests). Never drawn in the main pass (layerMask 0).
 */
export function objectProxyMesh(
  scene: Scene,
  shipRoot: TransformNode,
  viewRoot: TransformNode | undefined,
  box: { min: Vector3; max: Vector3 },
  name: string,
  /** Source roles the object is cut from (batch `roleRanges`); all triangles when omitted. */
  roles?: ReadonlySet<string>,
  /** Boxes owned by other objects (see outlineExclusions): their triangles are left out. */
  exclude: readonly Box[] = [],
) {
  // Batches merge every role per material, so the object is cut out by containment: every
  // vertex within the box (plus a small tolerance) and the centroid strictly inside it. Large
  // floor, wall and hull faces that merely cross the box are left out.
  const inset = 0.015;
  const slack = 0.03;
  const lo = box.min.add(new Vector3(inset, inset, inset));
  const hi = box.max.subtract(new Vector3(inset, inset, inset));
  const outer = (i: number, p: ArrayLike<number>) =>
    p[i] < box.min.x - slack ||
    p[i] > box.max.x + slack ||
    p[i + 1] < box.min.y - slack ||
    p[i + 1] > box.max.y + slack ||
    p[i + 2] < box.min.z - slack ||
    p[i + 2] > box.max.z + slack;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const mesh of viewRoot?.getChildMeshes(false) ?? []) {
    if (
      !(mesh instanceof Mesh) ||
      !mesh.isEnabled() ||
      !mesh.isVisible ||
      mesh.layerMask === 0 ||
      mesh.hasThinInstances
    )
      continue;
    const tris = shipTriangles(mesh, shipRoot);
    if (!tris) continue;
    const p = tris.positions;
    const ind = tris.indices;
    const ranges = (
      mesh.metadata?.roleRanges as
        { role: string; first: number; count: number }[] | undefined
    )
      ?.filter((r) => !roles || roles.has(r.role))
      .map((r) => [r.first, r.first + r.count] as const) ?? [
      [0, ind.length] as const,
    ];
    for (const [from, to] of ranges)
      for (let t = from; t < to; t += 3) {
        const a = ind[t] * 3,
          b = ind[t + 1] * 3,
          c = ind[t + 2] * 3;
        const x = (p[a] + p[b] + p[c]) / 3;
        const y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
        const z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
        if (
          x < lo.x ||
          x > hi.x ||
          y < lo.y ||
          y > hi.y ||
          z < lo.z ||
          z > hi.z
        )
          continue;
        if (outer(a, p) || outer(b, p) || outer(c, p)) continue;
        if (
          exclude.some(
            (e) =>
              x > e.min.x &&
              x < e.max.x &&
              y > e.min.y &&
              y < e.max.y &&
              z > e.min.z &&
              z < e.max.z,
          )
        )
          continue;
        const base = positions.length / 3;
        for (const k of [a, b, c]) positions.push(p[k], p[k + 1], p[k + 2]);
        indices.push(base, base + 1, base + 2);
      }
  }
  let proxy: Mesh;
  if (indices.length) {
    proxy = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.applyToMesh(proxy);
  } else {
    proxy = CreateBox(
      name,
      {
        width: box.max.x - box.min.x,
        height: box.max.y - box.min.y,
        depth: box.max.z - box.min.z,
      },
      scene,
    );
    proxy.position.copyFrom(box.min.add(box.max).scale(0.5));
  }
  proxy.parent = shipRoot;
  proxy.layerMask = 0;
  proxy.isPickable = false;
  setMeshRole(proxy, "effect");
  return proxy;
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
  const objects = prefabShipObjects(
    binding.doc,
    binding.catalog,
    binding.furnishings,
  ).map((o) => ({
    object: o,
    box: localBox(o, origin),
  }));
  // Silhouette outline (object-outline.ts): a thin edge on hover, a strong one on selection,
  // around the picked object's own geometry only (cut out of the batched ship meshes).
  const silhouette = createObjectOutline(scene);
  const viewRootName = `prefab-ship:${binding.doc.id}`;
  const outline = (name: string, kind: "selected" | "hover") => {
    let mesh: Mesh | undefined;
    return {
      show(id: string | undefined) {
        silhouette.set(kind, undefined);
        mesh?.dispose();
        mesh = undefined;
        const hit = objects.find(
          (o) => PREFAB_OBJECT_PREFIX + o.object.id === id,
        );
        if (!hit) return;
        const viewRoot = shipRoot
          .getChildTransformNodes(false)
          .find((n) => n.name === viewRootName);
        const deck = isDeckView() || isWayfarerGameplay(binding.doc);
        mesh = objectProxyMesh(
          scene,
          shipRoot,
          viewRoot,
          hit.box,
          name,
          hit.object.id.startsWith("door:") ? DOOR_ROLES : PART_ROLES,
          outlineExclusions(
            objects
              .filter((o) => inView(o.object, deck))
              .map((o) => ({ id: o.object.id, box: o.box })),
            hit.object.id,
          ),
        );
        silhouette.set(kind, mesh);
      },
      dispose() {
        silhouette.set(kind, undefined);
        mesh?.dispose();
      },
    };
  };
  const selected = outline("prefab-object-selected", "selected");
  const hovered = outline("prefab-object-hover", "hover");
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
    const deck = isDeckView() || isWayfarerGameplay(binding.doc);
    let best: { t: number; id: string } | undefined;
    for (const { object, box } of objects) {
      if (!inView(object, deck)) continue;
      const t = rayBox(o, d, box);
      // Doors are thin slabs; prefer any object whose box the ray actually enters first.
      if (t !== undefined && (!best || t < best.t))
        best = { t, id: PREFAB_OBJECT_PREFIX + object.id };
    }
    return best?.id;
  }
  // Exactly one hovered object: each move replaces the previous one, and leaving the canvas
  // (or losing the pointer) clears it rather than leaving a stale outline behind.
  const hover = (id: string | undefined) => {
    if (id === hoverId) return;
    hoverId = id;
    hovered.show(id && id !== selectedId ? id : undefined);
    // Hovered object id for assistive tooling and browser reviews (presentation only). The
    // HUD owns the canvas cursor and shows its themed "interact" pointer while this is set.
    if (canvas.dataset) canvas.dataset.prefabObject = id ?? "";
  };
  const move = (event: PointerEvent) =>
    hover(pickAt(event.clientX, event.clientY));
  const leave = () => hover(undefined);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("pointercancel", leave);
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
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
      selected.dispose();
      hovered.dispose();
      silhouette.dispose();
    },
  };
}
export type PrefabObjectPicker = ReturnType<typeof createPrefabObjectPicker>;
