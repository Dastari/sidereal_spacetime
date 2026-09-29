/**
 * Babylon presentation of a prefab ship (docs/shipyard_player_builder_design.md §3.7, §6, §12).
 *
 * Input is grammar data; `dressShip` (packages/sim) derives kit placements, generated brick boxes,
 * decals, component mounts, object sockets and lights. This module only draws them:
 * - kit pieces: one source mesh per (piece, glTF primitive/slot) with thin instances, one matrix
 *   per placement; GLB geometry is cached per URL per scene (glb-library.ts);
 * - generated geometry: one chamfered-brick mesh per (generated group, slot) (box-mesher.ts);
 * - theme: one PBRMaterial per (scene, theme, slot) (materials.ts); `setTheme` only swaps materials;
 * - components: published GLBs when their URL resolves, otherwise procedural stand-ins merged per
 *   slot; presentation-only plumes on aft engines;
 * - decals, object-socket placeholders and cheap emissive room-light pools.
 *
 * Views: "flight" shows items tagged both/flight (roofed), "deck" shows both/deck (cut away).
 * `setView` swaps thin-instance buffers and toggles meshes; nothing is rebuilt.
 *
 * Frames: `root` is the ship-local game frame (origin `prefabOrigin(doc)`, game +X starboard,
 * game +Y fore, Babylon X = game x, Y = up, Z = -game y). An inner node carries the prefab frame
 * (+X fore, +Y port, +Z up), see frames.ts. Requires `scene.useRightHandedSystem` (the game and
 * dashboard scenes are right-handed). Rendering never writes simulation state.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import { Constants } from "@babylonjs/core/Engines/constants";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { G, TEXEL } from "@sidereal/content/construction-grammar";
import {
  SHIP_KIT_REVISION,
  SHIP_KIT_SLOTS,
  type ShipKitManifest,
  type ShipKitSlot,
} from "@sidereal/content/ship-kit";
import {
  deckObjectVisualUrl,
  interiorArtQuarterTurns,
} from "@sidereal/content/ship-furniture";
import {
  prefabOrigin,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
  type ShipThemeId,
} from "@sidereal/content/ship-prefab";
import {
  dressShip,
  type ComponentPlacement,
  type DressView,
  type DressedShip,
} from "@sidereal/sim/ship-dresser";
import { setMeshRole, type MeshRole } from "../mesh-roles";
import { withoutAirlockLeaves } from "./doors";
import { CONTACT_STRIP_OPACITY } from "../molded-plastic";
import { meshBoxes, newBuilder, type GeometryBuilder } from "./box-mesher";
import {
  appendTransformed,
  localToParent,
  meshGeometry,
  type MergeGroup,
} from "./batch";
import {
  appendStandin,
  componentStandin,
  emitPlume,
  type StandinSocket,
} from "./component-standins";
import {
  applyDecalTheme,
  buildDecals,
  disposeDecals,
  type DecalHandle,
} from "./decals";
import {
  componentMatrix,
  frameOfSocket,
  GLTF_TO_ZUP,
  kitInstanceMatrix,
  mountRotation,
  multiply,
  prefabFrameMatrix,
  prefabToShipLocal,
  transformPoint,
  type Mat4,
  type MountSocket,
} from "./frames";
import { loadGlbGeometry, loadJsonOnce, type GlbGeometry } from "./glb-library";
import { resolveCoplanarLayers } from "./coplanar";
import {
  placeholderMaterial,
  plumeMaterial,
  roleSlotMaterial,
  slotMaterial,
  slotOfMaterialName,
} from "./materials";

const roleOf = (mesh: Mesh): string =>
  (mesh.metadata as { role?: string } | null)?.role ?? "hull";

/** Coplanar winner order: things mounted in or on the ship over the structure that carries them,
 * then detail slots over body slots (trim over the panel it sits on, screens over their bezel). */
const ROLE_DEPTH: Partial<Record<MeshRole, number>> = {
  hull: 0,
  roof: 1,
  floor: 2,
  wall: 3,
  equipment: 4,
  effect: 5,
};
const SLOT_DEPTH: Record<ShipKitSlot, number> = {
  primary: 0,
  secondary: 1,
  dark: 2,
  metal: 3,
  trim: 4,
  accent: 5,
  emit_a: 6,
  emit_b: 7,
  glass: 8,
};
export const coplanarPriority = (role: MeshRole, slot: ShipKitSlot) =>
  (ROLE_DEPTH[role] ?? 0) * 16 + SLOT_DEPTH[slot];

export type PrefabShipPresentation = "flight" | "deck";

export interface PrefabShipViewOptions {
  catalog: PrefabComponentCatalog;
  view: PrefabShipPresentation;
  /** Kit GLB directory, with trailing slash. Default `/assets/ship-kit/${SHIP_KIT_REVISION}/`. */
  kitBaseUrl?: string;
  parent?: TransformNode;
  /** When set, component GLBs load from `${componentsBaseUrl}${basename(spec.visual.url)}`. */
  componentsBaseUrl?: string;
  /** Initial theme; default the document's theme. */
  theme?: ShipThemeId;
  /** Real point lights for the brightest deck-view room lights (0-8). Default: one per room, up to 8. */
  roomLights?: number;
  /** Skip component and furniture GLB lookups and always draw procedural stand-ins. */
  standinComponents?: boolean;
  /** Deck object GLBs (SHIPS-COMPONENTS ship-objects) load from `${objectsBaseUrl}<designId>.glb`.
   * Default `/assets/ship-objects/r001/`. */
  objectsBaseUrl?: string;
  /** Merge static geometry into one mesh per (view, slot, role). Default true; false keeps
   * per-piece thin instances (useful for editors that inspect pieces). */
  batch?: boolean;
  /** The caller draws animated airlock leaves (doors.ts); strip the airlock GLB's baked leaves. */
  externalDoorLeaves?: boolean;
}

export interface PrefabShipMetrics {
  /** Engine draw calls of the last rendered frame (whole scene, including post/glow passes). */
  drawCalls: number;
  /** Enabled thin instances (kit pieces and component GLB primitives). */
  instances: number;
  /** Triangles this view draws in the current presentation (instanced triangles expanded). */
  triangles: number;
  /** Distinct kit piece ids drawn in the current presentation. */
  pieces: number;
  /** Enabled meshes of this view; each is one draw call per render pass. */
  meshes: number;
  kitTriangles: number;
  /** Visible TypeScript-generated structure/stand-in triangles (hull visuals must keep this at 0). */
  generatedTriangles: number;
  /** Visible triangles from Blender GLBs (kit, components, furniture), batched or instanced. */
  glbTriangles: number;
  /** Presentation effects: plumes, light pools, contact shadows, labels, placeholders. */
  effectTriangles: number;
  componentGlbs: number;
  componentStandins: number;
}

export interface PrefabShipView {
  root: TransformNode;
  readonly dressed: DressedShip;
  setView(v: PrefabShipPresentation): void;
  update(doc: ShipPrefabDocumentV1): Promise<void>;
  setTheme(themeId: ShipThemeId): void;
  dispose(): void;
  metrics(): PrefabShipMetrics;
  /** Meshes carrying emissive light (emit slots, plumes, light pools) for an optional glow layer. */
  emissiveMeshes(): Mesh[];
}

/** Matrices per view tag for one instanced source. */
interface Buckets {
  both: number[];
  flight: number[];
  deck: number[];
}
const buckets = (): Buckets => ({ both: [], flight: [], deck: [] });
/** Real room lights per ship; slot materials accept this many plus the scene's own lights. */
const MAX_ROOM_LIGHTS = 8;

interface InstancedEntry {
  mesh: Mesh;
  slot: ShipKitSlot | null;
  piece: string | null;
  matrices: Buckets;
  triangles: number;
  count: number;
}

interface StaticEntry {
  mesh: Mesh;
  tag: DressView;
  slot: ShipKitSlot | null;
  triangles: number;
  kind:
    | "generated"
    | "standin"
    | "plume"
    | "object-fill"
    | "object-frame"
    | "pool"
    | "decal";
  /** Batched meshes: triangles that came from Blender GLBs vs TypeScript-generated geometry. */
  origin?: { glb: number; ts: number };
}

interface Built {
  dressed: DressedShip;
  instanced: InstancedEntry[];
  statics: StaticEntry[];
  decals: (DecalHandle & { tag: DressView })[];
  lights: { light: PointLight; tag: DressView }[];
  textures: DynamicTexture[];
  materials: StandardMaterial[];
  componentGlbs: number;
  componentStandins: number;
}

const shows = (tag: DressView, view: PrefabShipPresentation) =>
  tag === "both" || tag === view;
const EMISSIVE: ReadonlySet<ShipKitSlot> = new Set(["emit_a", "emit_b"]);
const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function makeMesh(
  scene: Scene,
  name: string,
  parent: TransformNode,
  g: {
    positions: ArrayLike<number>;
    normals: ArrayLike<number>;
    indices: ArrayLike<number>;
  },
  colours?: number[],
): Mesh {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions =
    g.positions instanceof Float32Array
      ? g.positions
      : Float32Array.from(g.positions);
  vd.normals =
    g.normals instanceof Float32Array
      ? g.normals
      : Float32Array.from(g.normals);
  vd.indices =
    g.indices instanceof Uint32Array ? g.indices : Uint32Array.from(g.indices);
  if (colours) vd.colors = Float32Array.from(colours);
  vd.applyToMesh(mesh, false);
  // Prefab geometry (glTF GLBs, box-mesher polygons, merged batches) is wound counter-clockwise
  // seen from outside. A new Mesh in a right-handed scene defaults to clockwise front faces
  // (Babylon's own builders), so without this every prefab surface rendered inside-out: the far
  // interior faces were drawn and the near exterior culled. The glTF loader sets the same value
  // on the meshes it creates; extraction into our own meshes has to restore it.
  mesh.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation;
  mesh.parent = parent;
  mesh.isPickable = false;
  return mesh;
}

function pushMatrix(target: number[], m: Mat4) {
  for (let i = 0; i < 16; i++) target.push(m[i]);
}

function applyFrame(node: TransformNode, origin: [number, number]) {
  const scaling = new Vector3();
  const rotation = new Quaternion();
  const position = new Vector3();
  Matrix.FromArray(prefabFrameMatrix(origin)).decompose(
    scaling,
    rotation,
    position,
  );
  node.rotationQuaternion = rotation;
  node.position = position;
}

const roleOfPiece = (piece: string): MeshRole =>
  piece.startsWith("canopy.nav.")
    ? "effect"
    : piece.startsWith("roof.") || piece.startsWith("deco.")
      ? "roof"
      : piece.startsWith("int.floor")
        ? "floor"
        : piece.startsWith("int.")
          ? "wall"
          : "hull";

const roleOfGenerated = (kind: string): MeshRole =>
  kind === "floor-slab"
    ? "floor"
    : kind === "slope-wall" || kind === "shell-band"
      ? "wall"
      : "hull";

/** Socket class used for authored-frame rotation. */
function socketOf(c: ComponentPlacement): MountSocket {
  const m = c.placement.mount;
  if (m.attach === "face") return c.placement.rear ? "rear" : "face";
  return m.attach;
}

/** Placement quarter turns plus the art turn that points an interior GLB's +Y (access side) the
 * way the facing convention needs (ship-furniture.ts: a console's operator looks at `facing`). */
function artQuarterTurns(c: ComponentPlacement): number {
  const extra =
    c.placement.mount.attach === "interior" && c.placement.spec
      ? interiorArtQuarterTurns(c.placement.spec.id)
      : 0;
  return (c.placement.quarterTurns + extra) % 4;
}

function standinSocketOf(c: ComponentPlacement): StandinSocket {
  return c.placement.mount.attach;
}

/** Component-frame quarter turns that point a deck object's +Y front along its socket facing. */
const FACING_QT: Record<"fore" | "port" | "aft" | "starboard", number> = {
  fore: 0,
  port: 1,
  aft: 2,
  starboard: 3,
};

function componentUrl(
  c: ComponentPlacement,
  base: string | undefined,
): string | null {
  const url = c.placement.spec?.visual?.url;
  if (!url) return null;
  if (!base) return url;
  return base + url.split("/").pop();
}

export async function createPrefabShipView(
  scene: Scene,
  doc: ShipPrefabDocumentV1,
  options: PrefabShipViewOptions,
): Promise<PrefabShipView> {
  if (!scene.useRightHandedSystem)
    throw Error(
      "createPrefabShipView requires a right-handed scene (scene.useRightHandedSystem = true)",
    );
  const kitBase =
    options.kitBaseUrl ?? `/assets/ship-kit/${SHIP_KIT_REVISION}/`;
  const root = new TransformNode(`prefab-ship:${doc.id}`, scene);
  if (options.parent) root.parent = options.parent;
  const frame = new TransformNode(`prefab-ship:${doc.id}:prefab-frame`, scene);
  frame.parent = root;
  let view: PrefabShipPresentation = options.view;
  let theme: ShipThemeId = options.theme ?? doc.theme;
  let built: Built | null = null;
  let generation = 0;
  let disposed = false;

  async function build(d: ShipPrefabDocumentV1): Promise<Built> {
    const dressed = dressShip(d, { catalog: options.catalog });
    const out: Built = {
      dressed,
      instanced: [],
      statics: [],
      decals: [],
      lights: [],
      textures: [],
      materials: [],
      componentGlbs: 0,
      componentStandins: 0,
    };
    await Promise.all([buildKit(out), buildComponents(out), buildObjects(out)]);
    buildGenerated(out);
    buildLightPools(out);
    buildContactShadows(out);
    buildLabels(out, prefabOrigin(d));
    out.decals = buildDecals(scene, frame, dressed, theme).map((h) => ({
      ...h,
      tag: h.decal.view,
    }));
    if (options.batch !== false) batchBuilt(out);
    return out;
  }

  /**
   * Bake thin-instanced primitives and static slot meshes into one mesh per
   * (view tag, slot, role). Plumes, light pools, object placeholders and decals keep their
   * own materials and stay separate (a handful of draws).
   */
  function batchBuilt(out: Built) {
    // One mesh per (presentation, material): "both"-tagged geometry is baked into the flight and
    // the deck mesh alike, so each view draws once per material instead of once per tag x slot x role.
    type Group = MergeGroup & {
      view: "flight" | "deck";
      slot: ShipKitSlot;
      roles: Map<MeshRole, number>;
      glb: number;
      ts: number;
    };
    const groups = new Map<string, Group>();
    // Every appended placement primitive, per presentation, for the coplanar pass below.
    const chunks: Record<
      "flight" | "deck",
      {
        group: Group;
        first: number;
        count: number;
        priority: number;
        role: MeshRole;
      }[]
    > = { flight: [], deck: [] };
    const views = (tag: DressView): ("flight" | "deck")[] =>
      tag === "both" ? ["flight", "deck"] : [tag];
    const add = (
      tag: DressView,
      slot: ShipKitSlot,
      role: MeshRole,
      geo: NonNullable<ReturnType<typeof meshGeometry>>,
      m: ArrayLike<number>,
      glb: boolean,
    ) => {
      const mat = roleSlotMaterial(scene, theme, slot, role).name;
      for (const view of views(tag)) {
        const key = `${view}|${mat}`;
        let g = groups.get(key);
        if (!g)
          groups.set(
            key,
            (g = {
              key,
              view,
              slot,
              roles: new Map(),
              positions: [],
              normals: [],
              indices: [],
              glb: 0,
              ts: 0,
            }),
          );
        const first = g.indices.length;
        appendTransformed(g, geo.positions, geo.normals, geo.indices, m);
        chunks[view].push({
          group: g,
          first,
          count: geo.indices.length,
          priority: coplanarPriority(role, slot),
          role,
        });
        const tris = geo.indices.length / 3;
        g.roles.set(role, (g.roles.get(role) ?? 0) + tris);
        if (glb) g.glb += tris;
        else g.ts += tris;
      }
    };
    for (const e of out.instanced) {
      const geo = meshGeometry(e.mesh);
      const role = ((e.mesh.metadata as { role?: MeshRole } | null)?.role ??
        "hull") as MeshRole;
      if (geo)
        for (const tag of ["both", "flight", "deck"] as const) {
          const m = e.matrices[tag];
          for (let i = 0; i < m.length; i += 16)
            add(tag, e.slot ?? "primary", role, geo, m.slice(i, i + 16), true);
        }
      e.mesh.dispose();
    }
    out.instanced = [];
    const kept: StaticEntry[] = [];
    for (const st of out.statics) {
      if ((st.kind !== "generated" && st.kind !== "standin") || !st.slot) {
        kept.push(st);
        continue;
      }
      const geo = meshGeometry(st.mesh);
      const role = ((st.mesh.metadata as { role?: MeshRole } | null)?.role ??
        "hull") as MeshRole;
      if (geo) add(st.tag, st.slot, role, geo, localToParent(st.mesh), false);
      st.mesh.dispose();
    }
    // Coplanar faces of different materials (trim flush with a body panel, a module flush with a
    // wall, a floor flush with a hull base) z-fight. Give each overlap one deterministic winner by
    // role, then slot, before the geometry is frozen into meshes.
    for (const view of ["flight", "deck"] as const)
      resolveCoplanarLayers(
        chunks[view].map((c) => ({
          positions: c.group.positions,
          normals: c.group.normals,
          indices: c.group.indices,
          first: c.first,
          count: c.count,
          priority: c.priority,
          material: c.group.key,
        })),
      );
    for (const g of groups.values()) {
      if (!g.indices.length) continue;
      const role = [...g.roles].sort((a, b) => b[1] - a[1])[0][0];
      const mesh = makeMesh(
        scene,
        `${out.dressed.id}:batch:${g.key}`,
        frame,
        g,
      );
      mesh.material = roleSlotMaterial(scene, theme, g.slot, role);
      setMeshRole(mesh, role);
      // Index ranges per source role (a batch merges every role of one material), so an
      // outline can cut one placed object's triangles out of the batch (prefab-ship-interaction).
      mesh.metadata.roleRanges = (["flight", "deck"] as const).flatMap((v) =>
        chunks[v]
          .filter((c) => c.group === g)
          .map((c) => ({ role: c.role, first: c.first, count: c.count })),
      );
      // No freezeWorldMatrix: the ship root moves in game, and a frozen world matrix would
      // leave the hull at its spawn pose. Geometry is baked relative to the parent frame.
      kept.push({
        mesh,
        tag: g.view,
        slot: g.slot,
        triangles: g.indices.length / 3,
        kind: "generated",
        origin: { glb: g.glb, ts: g.ts },
      });
    }
    out.statics = kept;
  }

  async function buildKit(out: Built) {
    const manifest = await loadJsonOnce<ShipKitManifest>(
      scene,
      `${kitBase}manifest.json`,
    );
    const byPiece = new Map<string, Buckets>();
    for (const k of out.dressed.kit) {
      let b = byPiece.get(k.piece);
      if (!b) byPiece.set(k.piece, (b = buckets()));
      pushMatrix(
        b[k.view],
        kitInstanceMatrix(k.x, k.y, k.z, k.rotDeg, k.mirror),
      );
    }
    await Promise.all(
      [...byPiece].map(async ([piece, matrices]) => {
        const file =
          manifest?.pieces[piece]?.file ?? (manifest ? null : `${piece}.glb`);
        if (!file)
          return warnOnce(
            `kit:${piece}`,
            `prefab-ship: kit piece ${piece} is not in ${kitBase}manifest.json`,
          );
        const geom = await loadGlbGeometry(
          scene,
          kitBase + file,
          manifest?.pieces[piece]?.node,
        );
        if (!geom)
          return warnOnce(
            `kit:${piece}`,
            `prefab-ship: kit piece ${piece} failed to load from ${kitBase}${file}`,
          );
        addInstanced(out, geom, piece, matrices, roleOfPiece(piece));
      }),
    );
  }

  function addInstanced(
    out: Built,
    geom: GlbGeometry,
    piece: string | null,
    matrices: Buckets,
    role: MeshRole,
  ) {
    geom.primitives.forEach((p, i) => {
      const slot = slotOfMaterialName(p.material);
      if (!slot)
        warnOnce(
          `material:${geom.url}:${p.material}`,
          `prefab-ship: ${geom.url} material "${p.material}" is not a theme slot; using primary`,
        );
      const mesh = makeMesh(
        scene,
        `${piece ?? geom.url}:${p.material || i}`,
        frame,
        p,
      );
      const finishRole =
        piece?.startsWith("bow.") && slot === "emit_b" ? "effect" : role;
      mesh.material = roleSlotMaterial(
        scene,
        theme,
        slot ?? "primary",
        finishRole,
      );
      setMeshRole(mesh, finishRole);
      out.instanced.push({
        mesh,
        slot: slot ?? "primary",
        piece,
        matrices,
        triangles: p.triangles,
        count: 0,
      });
    });
  }

  function buildGenerated(out: Built) {
    for (const g of out.dressed.generated) {
      if (!g.boxes.length) continue;
      const result = meshBoxes(g.boxes);
      for (const s of result.slots) {
        const slot = SHIP_KIT_SLOTS[s.slot];
        const mesh = makeMesh(scene, `${g.id}:${slot}`, frame, s);
        mesh.material = roleSlotMaterial(
          scene,
          theme,
          slot,
          roleOfGenerated(g.kind),
        );
        setMeshRole(mesh, roleOfGenerated(g.kind));
        out.statics.push({
          mesh,
          tag: g.view,
          slot,
          triangles: s.triangles,
          kind: "generated",
        });
      }
    }
  }

  async function buildComponents(out: Built) {
    const glbs = new Map<string, { list: ComponentPlacement[] }>();
    const standins: ComponentPlacement[] = [];
    for (const c of out.dressed.components) {
      const url = options.standinComponents
        ? null
        : componentUrl(c, options.componentsBaseUrl);
      if (!url) standins.push(c);
      else {
        let e = glbs.get(url);
        if (!e) glbs.set(url, (e = { list: [] }));
        e.list.push(c);
      }
    }
    const plumes: Record<DressView, { g: GeometryBuilder; colours: number[] }> =
      {
        both: { g: newBuilder(), colours: [] },
        flight: { g: newBuilder(), colours: [] },
        deck: { g: newBuilder(), colours: [] },
      };
    const missing: string[] = [];
    await Promise.all(
      [...glbs].map(async ([url, { list }]) => {
        const loaded = await loadGlbGeometry(scene, url);
        const geom =
          loaded && options.externalDoorLeaves
            ? withoutAirlockLeaves(loaded)
            : loaded;
        if (!geom) {
          missing.push(url);
          standins.push(...list);
          return;
        }
        const matrices = buckets();
        for (const c of list) {
          const spec = c.placement.spec;
          const authored = frameOfSocket(spec?.attach[0]);
          const place = componentMatrix(
            c.placement.anchor,
            c.placement.anchorZ * TEXEL,
            artQuarterTurns(c),
          );
          // Edge hatches (airlocks, cargo doors, docking ports) are authored to the grammar's deck
          // height classes (flush with the side cassettes, top at the tier top), so no rescaling.
          const m = multiply(
            multiply(GLTF_TO_ZUP, mountRotation(authored, socketOf(c))),
            place,
          );
          pushMatrix(matrices[c.view], m);
          if (isMainEngine(c)) {
            // Nozzle exit: the GLB's outward extreme (component -Y is glTF +Z).
            const r =
              Math.min(
                geom.bounds[3] - geom.bounds[0],
                geom.bounds[4] - geom.bounds[1],
              ) * 0.26;
            emitPlumeAt(plumes[c.view], place, [0, -geom.bounds[5], 0], r, c);
          }
        }
        addInstanced(out, geom, null, matrices, "equipment");
        out.componentGlbs += list.length;
      }),
    );
    if (missing.length)
      warnOnce(
        `components:${missing.sort().join(",")}`,
        `prefab-ship: ${missing.length} component GLB(s) not published (e.g. ${missing[0]}); drawing procedural stand-ins`,
      );
    const perTag: Record<DressView, Map<ShipKitSlot, GeometryBuilder>> = {
      both: new Map(),
      flight: new Map(),
      deck: new Map(),
    };
    for (const c of standins) {
      const s = componentStandin(c.placement.spec, standinSocketOf(c));
      const place = componentMatrix(
        c.placement.anchor,
        c.placement.anchorZ * TEXEL,
        artQuarterTurns(c),
      );
      appendStandin(s, place, perTag[c.view]);
      if (s.nozzle && isMainEngine(c))
        emitPlumeAt(plumes[c.view], place, s.nozzle.at, s.nozzle.radius, c);
      out.componentStandins++;
    }
    for (const tag of ["both", "flight", "deck"] as const) {
      for (const [slot, g] of perTag[tag]) {
        const mesh = makeMesh(
          scene,
          `${out.dressed.id}:standins:${tag}:${slot}`,
          frame,
          g,
        );
        mesh.material = slotMaterial(scene, theme, slot);
        setMeshRole(mesh, "equipment");
        out.statics.push({
          mesh,
          tag,
          slot,
          triangles: g.indices.length / 3,
          kind: "standin",
        });
      }
      const p = plumes[tag];
      if (!p.g.indices.length) continue;
      const mesh = makeMesh(
        scene,
        `${out.dressed.id}:plumes:${tag}`,
        frame,
        p.g,
        p.colours,
      );
      mesh.hasVertexAlpha = true;
      mesh.material = plumeMaterial(scene, theme);
      setMeshRole(mesh, "effect");
      out.statics.push({
        mesh,
        tag,
        slot: null,
        triangles: p.g.indices.length / 3,
        kind: "plume",
      });
    }
  }

  function isMainEngine(c: ComponentPlacement) {
    return (
      c.placement.spec?.category === "propulsion" &&
      c.placement.rear &&
      c.placement.mount.attach === "face"
    );
  }

  function emitPlumeAt(
    target: { g: GeometryBuilder; colours: number[] },
    place: Mat4,
    at: [number, number, number],
    radius: number,
    c: ComponentPlacement,
  ) {
    const local = newBuilder();
    const colours: number[] = [];
    const main = !!c.placement.spec?.thrustN;
    // Compact exhaust like the reference engine assemblies: about one nozzle diameter long.
    emitPlume(local, colours, at, radius, (main ? 2.0 : 1.2) * radius);
    const base = target.g.positions.length / 3;
    for (let i = 0; i < local.positions.length; i += 3) {
      const p = transformPoint(place, [
        local.positions[i],
        local.positions[i + 1],
        local.positions[i + 2],
      ]);
      target.g.positions.push(...p);
      target.g.normals.push(0, 0, 1);
    }
    for (const idx of local.indices) target.g.indices.push(base + idx);
    target.colours.push(...colours);
  }

  function objectUrl(designId: string): string | null {
    const url = deckObjectVisualUrl(designId);
    if (!url) return null;
    const base = options.objectsBaseUrl;
    return base ? base + url.split("/").pop() : url;
  }

  /** Deck furniture: published GLBs where a design has one (ship-furniture.ts), else placeholder boxes. */
  async function buildObjects(out: Built) {
    const fill: Record<DressView, GeometryBuilder> = {
      both: newBuilder(),
      flight: newBuilder(),
      deck: newBuilder(),
    };
    const edges: Record<DressView, GeometryBuilder> = {
      both: newBuilder(),
      flight: newBuilder(),
      deck: newBuilder(),
    };
    const z0 = G.deck.floorTopTexels * TEXEL;
    type DeckObject = DressedShip["objects"][number];
    const byUrl = new Map<string, DeckObject[]>();
    const placeholders: DeckObject[] = [];
    for (const o of out.dressed.objects) {
      const url = options.standinComponents ? null : objectUrl(o.designId);
      if (!url) placeholders.push(o);
      else byUrl.set(url, [...(byUrl.get(url) ?? []), o]);
    }
    await Promise.all(
      [...byUrl].map(async ([url, list]) => {
        const geom = await loadGlbGeometry(scene, url);
        if (!geom) {
          warnOnce(
            `object:${url}`,
            `prefab-ship: deck object GLB ${url} not published; drawing a placeholder`,
          );
          placeholders.push(...list);
          return;
        }
        const matrices = buckets();
        for (const o of list) {
          const anchor: [number, number] = [
            o.at[0] + o.size[0] / 2,
            o.at[1] + o.size[1] / 2,
          ];
          const place = componentMatrix(
            anchor,
            z0,
            (FACING_QT[o.facing] + interiorArtQuarterTurns(o.designId)) % 4,
          );
          pushMatrix(
            matrices[o.view],
            multiply(
              multiply(GLTF_TO_ZUP, mountRotation("interior", "interior")),
              place,
            ),
          );
        }
        addInstanced(out, geom, null, matrices, "equipment");
      }),
    );
    for (const o of placeholders) {
      const inset = 0.08;
      const lo = [o.at[0] + inset, o.at[1] + inset, z0 + 0.01];
      const hi = [
        o.at[0] + o.size[0] - inset,
        o.at[1] + o.size[1] - inset,
        z0 + Math.max(0.3, o.heightTexels * TEXEL),
      ];
      appendBox(fill[o.view], lo, hi);
      const t = 0.035;
      for (const a of [0, 1, 2] as const) {
        const b = (a + 1) % 3;
        const c = (a + 2) % 3;
        for (const vb of [lo[b], hi[b] - t])
          for (const vc of [lo[c], hi[c] - t]) {
            const l = [0, 0, 0];
            const h = [0, 0, 0];
            l[a] = lo[a];
            h[a] = hi[a];
            l[b] = vb;
            h[b] = vb + t;
            l[c] = vc;
            h[c] = vc + t;
            appendBox(edges[o.view], l, h);
          }
      }
    }
    for (const tag of ["both", "flight", "deck"] as const) {
      for (const [kind, g, isFrame] of [
        ["object-fill", fill[tag], false],
        ["object-frame", edges[tag], true],
      ] as const) {
        if (!g.indices.length) continue;
        const mesh = makeMesh(
          scene,
          `${out.dressed.id}:${kind}:${tag}`,
          frame,
          g,
        );
        mesh.material = placeholderMaterial(scene, theme, isFrame);
        setMeshRole(mesh, "proxy");
        out.statics.push({
          mesh,
          tag,
          slot: null,
          triangles: g.indices.length / 3,
          kind,
        });
      }
    }
  }

  /**
   * Soft contact shadows where walls meet the deck (baked-AO stand-in): a translucent black
   * gradient strip on the floor either side of every deck-view wall run. One mesh, deck view.
   */
  function buildContactShadows(out: Built) {
    if (!out.dressed.contacts.length) return;
    const g = {
      positions: [] as number[],
      normals: [] as number[],
      indices: [] as number[],
    };
    const colours: number[] = [];
    const z = G.deck.floorTopTexels * TEXEL + 0.012;
    const W = 0.42;
    for (const [a, b] of out.dressed.contacts) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) continue;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      for (const side of [1, -1]) {
        const base = g.positions.length / 3;
        const o = [n[0] * W * side, n[1] * W * side];
        for (const [p, far] of [
          [a, 0],
          [b, 0],
          [b, 1],
          [a, 1],
        ] as const) {
          g.positions.push(p[0] + o[0] * far, p[1] + o[1] * far, z);
          g.normals.push(0, 0, 1);
          colours.push(0, 0, 0, far ? 0 : CONTACT_STRIP_OPACITY);
        }
        if (side > 0)
          g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else g.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    const mesh = makeMesh(
      scene,
      `${out.dressed.id}:contact-shadows`,
      frame,
      g,
      colours,
    );
    mesh.hasVertexAlpha = true;
    mesh.isPickable = false;
    const mat = new StandardMaterial(
      `${out.dressed.id}:contact-shadows`,
      scene,
    );
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.Black();
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.alpha = 0.999; // force the transparent pass so vertex alpha blends
    mesh.material = mat;
    out.materials.push(mat);
    setMeshRole(mesh, "effect");
    out.statics.push({
      mesh,
      tag: "deck",
      slot: null,
      triangles: g.indices.length / 3,
      kind: "pool",
    });
  }

  /** Room label plates (deck view): dark plate, white stencil text, cyan edge; Y-billboards. */
  function buildLabels(out: Built, origin: [number, number]) {
    out.dressed.labels.forEach((l, i) => {
      const text = l.text.toUpperCase();
      const tw = Math.max(160, 26 * text.length + 48);
      const tex = new DynamicTexture(
        `${out.dressed.id}:label:${i}`,
        { width: tw, height: 64 },
        scene,
        true,
      );
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      ctx.fillStyle = "#0b0d1c";
      ctx.fillRect(0, 0, tw, 64);
      ctx.strokeStyle = "#3fb8ff";
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, tw - 6, 58);
      ctx.fillStyle = "#e8ecf8";
      ctx.font = "bold 36px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, tw / 2, 34);
      tex.update(true);
      const h = 0.34;
      const w = (h * tw) / 64;
      const mesh = new Mesh(`${out.dressed.id}:label:${i}`, scene);
      const vd = new VertexData();
      vd.positions = [
        -w / 2,
        -h / 2,
        0,
        w / 2,
        -h / 2,
        0,
        w / 2,
        h / 2,
        0,
        -w / 2,
        h / 2,
        0,
      ];
      vd.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
      vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
      vd.indices = [0, 2, 1, 0, 3, 2];
      vd.applyToMesh(mesh);
      // Parent to the (unmirrored, Y-up) ship root: billboards misbehave under the prefab frame.
      mesh.parent = root;
      const [x, y, z] = prefabToShipLocal([l.at[0], l.at[1], 2.2], origin);
      mesh.position.set(x, y, z);
      mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
      mesh.isPickable = false;
      const mat = new StandardMaterial(`${out.dressed.id}:label:${i}`, scene);
      mat.disableLighting = true;
      mat.emissiveTexture = tex;
      mat.diffuseColor = Color3.Black();
      mat.specularColor = Color3.Black();
      mat.backFaceCulling = false;
      mesh.material = mat;
      out.textures.push(tex);
      out.materials.push(mat);
      setMeshRole(mesh, "effect");
      out.statics.push({
        mesh,
        tag: l.view,
        slot: null,
        triangles: 2,
        kind: "decal",
      });
    });
  }

  function buildLightPools(out: Built) {
    const lights = out.dressed.lights;
    if (!lights.length) return;
    const tex = new DynamicTexture(
      `prefab-light-pool`,
      { width: 64, height: 64 },
      scene,
      true,
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.8)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.3)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    tex.hasAlpha = true;
    tex.update(true);
    const mat = new StandardMaterial(`${out.dressed.id}:light-pools`, scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.disableDepthWrite = true;
    out.textures.push(tex);
    out.materials.push(mat);
    const per: Record<
      DressView,
      {
        positions: number[];
        normals: number[];
        indices: number[];
        uvs: number[];
        colours: number[];
      }
    > = {
      both: { positions: [], normals: [], indices: [], uvs: [], colours: [] },
      flight: { positions: [], normals: [], indices: [], uvs: [], colours: [] },
      deck: { positions: [], normals: [], indices: [], uvs: [], colours: [] },
    };
    const z = G.deck.floorTopTexels * TEXEL + 0.02;
    for (const l of lights) {
      const g = per[l.view];
      const r = 1.2 + l.intensity * 1.6;
      const base = g.positions.length / 3;
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        g.positions.push(
          l.at[0] + (u * 2 - 1) * r,
          l.at[1] + (v * 2 - 1) * r,
          z,
        );
        g.normals.push(0, 0, 1);
        g.uvs.push(u, v);
        const k = Math.min(1, 0.35 + l.intensity * 0.5);
        g.colours.push(l.colour[0] * k, l.colour[1] * k, l.colour[2] * k, 1);
      }
      g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    for (const tag of ["both", "flight", "deck"] as const) {
      const g = per[tag];
      if (!g.indices.length) continue;
      const mesh = new Mesh(`${out.dressed.id}:light-pools:${tag}`, scene);
      const vd = new VertexData();
      vd.positions = g.positions;
      vd.normals = g.normals;
      vd.indices = g.indices;
      vd.uvs = g.uvs;
      vd.colors = g.colours;
      vd.applyToMesh(mesh);
      mesh.sideOrientation = Constants.MATERIAL_CounterClockWiseSideOrientation; // see makeMesh
      mesh.parent = frame;
      mesh.isPickable = false;
      mesh.material = mat;
      setMeshRole(mesh, "effect");
      out.statics.push({
        mesh,
        tag,
        slot: null,
        triangles: g.indices.length / 3,
        kind: "pool",
      });
    }
    // Ceiling lights, one per room: linear falloff to a range sized to the room so small ships
    // are evenly lit in any scene environment (the game has no IBL inside hulls).
    const count = Math.max(
      0,
      Math.min(MAX_ROOM_LIGHTS, options.roomLights ?? lights.length),
    );
    [...lights]
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, count)
      .forEach((l, i) => {
        const light = new PointLight(
          `${out.dressed.id}:room-light:${i}`,
          new Vector3(l.at[0], l.at[1], l.at[2]),
          scene,
        );
        light.parent = frame;
        light.diffuse = new Color3(
          ...(l.colour.map((c) => 0.35 + 0.65 * c) as [number, number, number]),
        );
        light.specular = Color3.Black();
        light.falloffType = Light.FALLOFF_STANDARD;
        light.intensity = 1.0 + l.intensity * 0.8;
        light.range = 4.5 + l.intensity * 3;
        out.lights.push({ light, tag: l.view });
      });
  }

  function apply(b: Built) {
    for (const e of b.instanced) {
      const m = e.matrices;
      const data = new Float32Array(m.both.length + m[view].length);
      data.set(m.both, 0);
      data.set(m[view], m.both.length);
      e.count = data.length / 16;
      if (!e.count) {
        e.mesh.setEnabled(false);
        continue;
      }
      e.mesh.thinInstanceSetBuffer("matrix", data, 16, true);
      e.mesh.thinInstanceRefreshBoundingInfo(false);
      e.mesh.setEnabled(true);
    }
    for (const s of b.statics) s.mesh.setEnabled(shows(s.tag, view));
    for (const d of b.decals) d.mesh.setEnabled(shows(d.tag, view));
    for (const l of b.lights) l.light.setEnabled(shows(l.tag, view));
  }

  function release(b: Built) {
    for (const e of b.instanced) e.mesh.dispose();
    for (const s of b.statics) s.mesh.dispose();
    for (const l of b.lights) l.light.dispose();
    for (const t of b.textures) t.dispose();
    for (const m of b.materials) m.dispose();
    disposeDecals(b.decals);
  }

  async function rebuild(d: ShipPrefabDocumentV1) {
    const mine = ++generation;
    applyFrame(frame, prefabOrigin(d));
    const next = await build(d);
    if (disposed || mine !== generation) {
      release(next);
      return;
    }
    if (built) release(built);
    built = next;
    apply(next);
  }

  await rebuild(doc);

  const handle: PrefabShipView = {
    root,
    get dressed() {
      return built!.dressed;
    },
    setView(v) {
      if (v === view) return;
      view = v;
      if (built) apply(built);
    },
    update: (d) => rebuild(d),
    setTheme(t) {
      theme = t;
      if (!built) return;
      for (const e of built.instanced)
        if (e.slot)
          e.mesh.material = roleSlotMaterial(scene, t, e.slot, roleOf(e.mesh));
      for (const s of built.statics) {
        if (s.kind === "generated" || s.kind === "standin")
          s.mesh.material = roleSlotMaterial(scene, t, s.slot!, roleOf(s.mesh));
        else if (s.kind === "plume") s.mesh.material = plumeMaterial(scene, t);
        else if (s.kind === "object-fill" || s.kind === "object-frame")
          s.mesh.material = placeholderMaterial(
            scene,
            t,
            s.kind === "object-frame",
          );
      }
      for (const d of built.decals) applyDecalTheme(d, t);
    },
    dispose() {
      disposed = true;
      if (built) release(built);
      built = null;
      frame.dispose();
      root.dispose();
    },
    metrics() {
      const b = built;
      const engine = scene.getEngine();
      const drawCalls = engine._drawCalls?.current ?? 0;
      if (!b)
        return {
          drawCalls,
          instances: 0,
          triangles: 0,
          pieces: 0,
          meshes: 0,
          kitTriangles: 0,
          generatedTriangles: 0,
          glbTriangles: 0,
          effectTriangles: 0,
          componentGlbs: 0,
          componentStandins: 0,
        };
      let instances = 0;
      let kitTriangles = 0;
      let generatedTriangles = 0;
      let glbTriangles = 0;
      let effectTriangles = 0;
      let triangles = 0;
      let meshes = 0;
      const pieces = new Set<string>();
      for (const e of b.instanced)
        if (e.mesh.isEnabled() && e.count) {
          instances += e.count;
          meshes++;
          triangles += e.triangles * e.count;
          glbTriangles += e.triangles * e.count;
          if (e.piece) {
            pieces.add(e.piece);
            kitTriangles += e.triangles * e.count;
          }
        }
      for (const s of b.statics)
        if (s.mesh.isEnabled()) {
          meshes++;
          triangles += s.triangles;
          if (s.origin) {
            glbTriangles += s.origin.glb;
            generatedTriangles += s.origin.ts;
          } else if (s.kind === "generated" || s.kind === "standin")
            generatedTriangles += s.triangles;
          else effectTriangles += s.triangles;
        }
      for (const d of b.decals)
        if (d.mesh.isEnabled()) {
          meshes++;
          triangles += 2;
        }
      return {
        drawCalls,
        instances,
        triangles,
        pieces: pieces.size,
        meshes,
        kitTriangles,
        generatedTriangles,
        glbTriangles,
        effectTriangles,
        componentGlbs: b.componentGlbs,
        componentStandins: b.componentStandins,
      };
    },
    emissiveMeshes() {
      if (!built) return [];
      return [
        ...built.instanced
          .filter((e) => e.slot && EMISSIVE.has(e.slot))
          .map((e) => e.mesh),
        ...built.statics
          .filter(
            (s) =>
              (s.slot && EMISSIVE.has(s.slot)) ||
              s.kind === "plume" ||
              s.kind === "object-frame",
          )
          .map((s) => s.mesh),
      ];
    },
  };
  return handle;
}

/** Plain 12-triangle box (placeholders), outward winding. */
function appendBox(out: GeometryBuilder, lo: number[], hi: number[]) {
  const faces: [number, number][] = [
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 1],
    [2, -1],
    [2, 1],
  ];
  for (const [axis, side] of faces) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const n = [0, 0, 0];
    n[axis] = side;
    const start = out.positions.length / 3;
    for (const [su, sv] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const p = [0, 0, 0];
      p[axis] = side > 0 ? hi[axis] : lo[axis];
      p[u] = su ? hi[u] : lo[u];
      p[v] = sv ? hi[v] : lo[v];
      out.positions.push(p[0], p[1], p[2]);
      out.normals.push(n[0], n[1], n[2]);
    }
    // (u, v, axis) is a right-handed cycle, so u x v = +axis: counter-clockwise for side > 0.
    if (side > 0)
      out.indices.push(
        start,
        start + 1,
        start + 2,
        start,
        start + 2,
        start + 3,
      );
    else
      out.indices.push(
        start,
        start + 2,
        start + 1,
        start,
        start + 3,
        start + 2,
      );
  }
  out.boxes++;
}
