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
import { Constants } from "@babylonjs/core/Engines/constants";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { G, TEXEL } from "@sidereal/content/construction-grammar";
import { SHIP_KIT_SLOTS, type ShipKitManifest, type ShipKitSlot } from "@sidereal/content/ship-kit";
import { prefabOrigin, type PrefabComponentCatalog, type ShipPrefabDocumentV1, type ShipThemeId } from "@sidereal/content/ship-prefab";
import { dressShip, type ComponentPlacement, type DressView, type DressedShip } from "@sidereal/sim/ship-dresser";
import { setMeshRole, type MeshRole } from "../mesh-roles";
import { meshBoxes, newBuilder, type GeometryBuilder } from "./box-mesher";
import { appendStandin, componentStandin, emitPlume, type StandinSocket } from "./component-standins";
import { applyDecalTheme, buildDecals, disposeDecals, type DecalHandle } from "./decals";
import {
  componentMatrix,
  frameOfSocket,
  GLTF_TO_ZUP,
  kitInstanceMatrix,
  mountRotation,
  multiply,
  prefabFrameMatrix,
  transformPoint,
  type Mat4,
  type MountSocket,
} from "./frames";
import { loadGlbGeometry, loadJsonOnce, type GlbGeometry } from "./glb-library";
import { placeholderMaterial, plumeMaterial, slotMaterial, slotOfMaterialName } from "./materials";

export type PrefabShipPresentation = "flight" | "deck";

export interface PrefabShipViewOptions {
  catalog: PrefabComponentCatalog;
  view: PrefabShipPresentation;
  /** Kit GLB directory, with trailing slash. Default "/assets/ship-kit/r001/". */
  kitBaseUrl?: string;
  parent?: TransformNode;
  /** When set, component GLBs load from `${componentsBaseUrl}${basename(spec.visual.url)}`. */
  componentsBaseUrl?: string;
  /** Initial theme; default the document's theme. */
  theme?: ShipThemeId;
  /** Real point lights for the brightest deck-view room lights (0-4). Default 0: emissive pools only. */
  roomLights?: number;
  /** Skip component GLB lookups and always draw procedural stand-ins. */
  standinComponents?: boolean;
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
  generatedTriangles: number;
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
  kind: "generated" | "standin" | "plume" | "object-fill" | "object-frame" | "pool" | "decal";
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

const shows = (tag: DressView, view: PrefabShipPresentation) => tag === "both" || tag === view;
const EMISSIVE: ReadonlySet<ShipKitSlot> = new Set(["emit_a", "emit_b"]);
const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function makeMesh(scene: Scene, name: string, parent: TransformNode, g: { positions: ArrayLike<number>; normals: ArrayLike<number>; indices: ArrayLike<number> }, colours?: number[]): Mesh {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = g.positions instanceof Float32Array ? g.positions : Float32Array.from(g.positions);
  vd.normals = g.normals instanceof Float32Array ? g.normals : Float32Array.from(g.normals);
  vd.indices = g.indices instanceof Uint32Array ? g.indices : Uint32Array.from(g.indices);
  if (colours) vd.colors = Float32Array.from(colours);
  vd.applyToMesh(mesh, false);
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
  Matrix.FromArray(prefabFrameMatrix(origin)).decompose(scaling, rotation, position);
  node.rotationQuaternion = rotation;
  node.position = position;
}

const roleOfPiece = (piece: string): MeshRole =>
  piece.startsWith("roof.") || piece.startsWith("deco.") ? "roof" : piece.startsWith("int.floor") ? "floor" : piece.startsWith("int.") ? "wall" : "hull";

const roleOfGenerated = (kind: string): MeshRole => (kind === "floor-slab" ? "floor" : kind === "slope-wall" ? "wall" : "hull");

/** Socket class used for authored-frame rotation. */
function socketOf(c: ComponentPlacement): MountSocket {
  const m = c.placement.mount;
  if (m.attach === "face") return c.placement.rear ? "rear" : "face";
  return m.attach;
}

function standinSocketOf(c: ComponentPlacement): StandinSocket {
  return c.placement.mount.attach;
}

function componentUrl(c: ComponentPlacement, base: string | undefined): string | null {
  const url = c.placement.spec?.visual?.url;
  if (!url) return null;
  if (!base) return url;
  return base + url.split("/").pop();
}

export async function createPrefabShipView(scene: Scene, doc: ShipPrefabDocumentV1, options: PrefabShipViewOptions): Promise<PrefabShipView> {
  if (!scene.useRightHandedSystem) throw Error("createPrefabShipView requires a right-handed scene (scene.useRightHandedSystem = true)");
  const kitBase = options.kitBaseUrl ?? "/assets/ship-kit/r001/";
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
    const out: Built = { dressed, instanced: [], statics: [], decals: [], lights: [], textures: [], materials: [], componentGlbs: 0, componentStandins: 0 };
    await Promise.all([buildKit(out), buildComponents(out)]);
    buildGenerated(out);
    buildObjects(out);
    buildLightPools(out);
    out.decals = buildDecals(scene, frame, dressed, theme).map((h) => ({ ...h, tag: h.decal.view }));
    return out;
  }

  async function buildKit(out: Built) {
    const manifest = await loadJsonOnce<ShipKitManifest>(scene, `${kitBase}manifest.json`);
    const byPiece = new Map<string, Buckets>();
    for (const k of out.dressed.kit) {
      let b = byPiece.get(k.piece);
      if (!b) byPiece.set(k.piece, (b = buckets()));
      pushMatrix(b[k.view], kitInstanceMatrix(k.x, k.y, k.z, k.rotDeg));
    }
    await Promise.all(
      [...byPiece].map(async ([piece, matrices]) => {
        const file = manifest?.pieces[piece]?.file ?? (manifest ? null : `${piece}.glb`);
        if (!file) return warnOnce(`kit:${piece}`, `prefab-ship: kit piece ${piece} is not in ${kitBase}manifest.json`);
        const geom = await loadGlbGeometry(scene, kitBase + file);
        if (!geom) return warnOnce(`kit:${piece}`, `prefab-ship: kit piece ${piece} failed to load from ${kitBase}${file}`);
        addInstanced(out, geom, piece, matrices, roleOfPiece(piece));
      }),
    );
  }

  function addInstanced(out: Built, geom: GlbGeometry, piece: string | null, matrices: Buckets, role: MeshRole) {
    geom.primitives.forEach((p, i) => {
      const slot = slotOfMaterialName(p.material);
      if (!slot) warnOnce(`material:${geom.url}:${p.material}`, `prefab-ship: ${geom.url} material "${p.material}" is not a theme slot; using primary`);
      const mesh = makeMesh(scene, `${piece ?? geom.url}:${p.material || i}`, frame, p);
      mesh.material = slotMaterial(scene, theme, slot ?? "primary");
      setMeshRole(mesh, role);
      out.instanced.push({ mesh, slot: slot ?? "primary", piece, matrices, triangles: p.triangles, count: 0 });
    });
  }

  function buildGenerated(out: Built) {
    for (const g of out.dressed.generated) {
      if (!g.boxes.length) continue;
      const result = meshBoxes(g.boxes);
      for (const s of result.slots) {
        const slot = SHIP_KIT_SLOTS[s.slot];
        const mesh = makeMesh(scene, `${g.id}:${slot}`, frame, s);
        mesh.material = slotMaterial(scene, theme, slot);
        setMeshRole(mesh, roleOfGenerated(g.kind));
        out.statics.push({ mesh, tag: g.view, slot, triangles: s.triangles, kind: "generated" });
      }
    }
  }

  async function buildComponents(out: Built) {
    const glbs = new Map<string, { list: ComponentPlacement[] }>();
    const standins: ComponentPlacement[] = [];
    for (const c of out.dressed.components) {
      const url = options.standinComponents ? null : componentUrl(c, options.componentsBaseUrl);
      if (!url) standins.push(c);
      else {
        let e = glbs.get(url);
        if (!e) glbs.set(url, (e = { list: [] }));
        e.list.push(c);
      }
    }
    const plumes: Record<DressView, { g: GeometryBuilder; colours: number[] }> = {
      both: { g: newBuilder(), colours: [] },
      flight: { g: newBuilder(), colours: [] },
      deck: { g: newBuilder(), colours: [] },
    };
    const missing: string[] = [];
    await Promise.all(
      [...glbs].map(async ([url, { list }]) => {
        const geom = await loadGlbGeometry(scene, url);
        if (!geom) {
          missing.push(url);
          standins.push(...list);
          return;
        }
        const matrices = buckets();
        for (const c of list) {
          const spec = c.placement.spec;
          const authored = frameOfSocket(spec?.attach[0]);
          const place = componentMatrix(c.placement.anchor, c.placement.anchorZ * TEXEL, c.placement.quarterTurns);
          const m = multiply(multiply(GLTF_TO_ZUP, mountRotation(authored, socketOf(c))), place);
          pushMatrix(matrices[c.view], m);
          if (isMainEngine(c)) {
            // Nozzle exit: the GLB's outward extreme (component -Y is glTF +Z).
            const r = Math.min(geom.bounds[3] - geom.bounds[0], geom.bounds[4] - geom.bounds[1]) * 0.32;
            emitPlumeAt(plumes[c.view], place, [0, -geom.bounds[5], 0], r, c);
          }
        }
        addInstanced(out, geom, null, matrices, "equipment");
        out.componentGlbs += list.length;
      }),
    );
    if (missing.length)
      warnOnce(`components:${missing.sort().join(",")}`, `prefab-ship: ${missing.length} component GLB(s) not published (e.g. ${missing[0]}); drawing procedural stand-ins`);
    const perTag: Record<DressView, Map<ShipKitSlot, GeometryBuilder>> = { both: new Map(), flight: new Map(), deck: new Map() };
    for (const c of standins) {
      const s = componentStandin(c.placement.spec, standinSocketOf(c));
      const place = componentMatrix(c.placement.anchor, c.placement.anchorZ * TEXEL, c.placement.quarterTurns);
      appendStandin(s, place, perTag[c.view]);
      if (s.nozzle && isMainEngine(c)) emitPlumeAt(plumes[c.view], place, s.nozzle.at, s.nozzle.radius, c);
      out.componentStandins++;
    }
    for (const tag of ["both", "flight", "deck"] as const) {
      for (const [slot, g] of perTag[tag]) {
        const mesh = makeMesh(scene, `${out.dressed.id}:standins:${tag}:${slot}`, frame, g);
        mesh.material = slotMaterial(scene, theme, slot);
        setMeshRole(mesh, "equipment");
        out.statics.push({ mesh, tag, slot, triangles: g.indices.length / 3, kind: "standin" });
      }
      const p = plumes[tag];
      if (!p.g.indices.length) continue;
      const mesh = makeMesh(scene, `${out.dressed.id}:plumes:${tag}`, frame, p.g, p.colours);
      mesh.hasVertexAlpha = true;
      mesh.material = plumeMaterial(scene, theme);
      setMeshRole(mesh, "effect");
      out.statics.push({ mesh, tag, slot: null, triangles: p.g.indices.length / 3, kind: "plume" });
    }
  }

  function isMainEngine(c: ComponentPlacement) {
    return c.placement.spec?.category === "propulsion" && c.placement.rear && c.placement.mount.attach === "face";
  }

  function emitPlumeAt(target: { g: GeometryBuilder; colours: number[] }, place: Mat4, at: [number, number, number], radius: number, c: ComponentPlacement) {
    const local = newBuilder();
    const colours: number[] = [];
    const main = !!c.placement.spec?.thrustN;
    emitPlume(local, colours, at, radius, (main ? 3.2 : 1.2) * radius + (main ? 1.5 : 0.3));
    const base = target.g.positions.length / 3;
    for (let i = 0; i < local.positions.length; i += 3) {
      const p = transformPoint(place, [local.positions[i], local.positions[i + 1], local.positions[i + 2]]);
      target.g.positions.push(...p);
      target.g.normals.push(0, 0, 1);
    }
    for (const idx of local.indices) target.g.indices.push(base + idx);
    target.colours.push(...colours);
  }

  function buildObjects(out: Built) {
    const fill: Record<DressView, GeometryBuilder> = { both: newBuilder(), flight: newBuilder(), deck: newBuilder() };
    const edges: Record<DressView, GeometryBuilder> = { both: newBuilder(), flight: newBuilder(), deck: newBuilder() };
    const z0 = G.deck.floorTopTexels * TEXEL;
    for (const o of out.dressed.objects) {
      const inset = 0.08;
      const lo = [o.at[0] + inset, o.at[1] + inset, z0 + 0.01];
      const hi = [o.at[0] + o.size[0] - inset, o.at[1] + o.size[1] - inset, z0 + Math.max(0.3, o.heightTexels * TEXEL)];
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
      for (const [kind, g, isFrame] of [["object-fill", fill[tag], false], ["object-frame", edges[tag], true]] as const) {
        if (!g.indices.length) continue;
        const mesh = makeMesh(scene, `${out.dressed.id}:${kind}:${tag}`, frame, g);
        mesh.material = placeholderMaterial(scene, theme, isFrame);
        setMeshRole(mesh, "proxy");
        out.statics.push({ mesh, tag, slot: null, triangles: g.indices.length / 3, kind });
      }
    }
  }

  function buildLightPools(out: Built) {
    const lights = out.dressed.lights;
    if (!lights.length) return;
    const tex = new DynamicTexture(`prefab-light-pool`, { width: 64, height: 64 }, scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.18)");
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
    const per: Record<DressView, { positions: number[]; normals: number[]; indices: number[]; uvs: number[]; colours: number[] }> = {
      both: { positions: [], normals: [], indices: [], uvs: [], colours: [] },
      flight: { positions: [], normals: [], indices: [], uvs: [], colours: [] },
      deck: { positions: [], normals: [], indices: [], uvs: [], colours: [] },
    };
    const z = G.deck.floorTopTexels * TEXEL + 0.02;
    for (const l of lights) {
      const g = per[l.view];
      const r = 1.2 + l.intensity * 1.6;
      const base = g.positions.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        g.positions.push(l.at[0] + (u * 2 - 1) * r, l.at[1] + (v * 2 - 1) * r, z);
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
      mesh.parent = frame;
      mesh.isPickable = false;
      mesh.material = mat;
      setMeshRole(mesh, "effect");
      out.statics.push({ mesh, tag, slot: null, triangles: g.indices.length / 3, kind: "pool" });
    }
    const count = Math.max(0, Math.min(4, options.roomLights ?? 0));
    [...lights]
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, count)
      .forEach((l, i) => {
        const light = new PointLight(`${out.dressed.id}:room-light:${i}`, new Vector3(l.at[0], l.at[1], l.at[2]), scene);
        light.parent = frame;
        light.diffuse = new Color3(...l.colour);
        light.specular = Color3.Black();
        light.intensity = l.intensity * 4;
        light.range = 7;
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
      for (const e of built.instanced) if (e.slot) e.mesh.material = slotMaterial(scene, t, e.slot);
      for (const s of built.statics) {
        if (s.kind === "generated" || s.kind === "standin") s.mesh.material = slotMaterial(scene, t, s.slot!);
        else if (s.kind === "plume") s.mesh.material = plumeMaterial(scene, t);
        else if (s.kind === "object-fill" || s.kind === "object-frame") s.mesh.material = placeholderMaterial(scene, t, s.kind === "object-frame");
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
      if (!b) return { drawCalls, instances: 0, triangles: 0, pieces: 0, meshes: 0, kitTriangles: 0, generatedTriangles: 0, componentGlbs: 0, componentStandins: 0 };
      let instances = 0;
      let kitTriangles = 0;
      let generatedTriangles = 0;
      let triangles = 0;
      let meshes = 0;
      const pieces = new Set<string>();
      for (const e of b.instanced)
        if (e.mesh.isEnabled() && e.count) {
          instances += e.count;
          meshes++;
          triangles += e.triangles * e.count;
          if (e.piece) {
            pieces.add(e.piece);
            kitTriangles += e.triangles * e.count;
          }
        }
      for (const s of b.statics)
        if (s.mesh.isEnabled()) {
          meshes++;
          triangles += s.triangles;
          if (s.kind === "generated") generatedTriangles += s.triangles;
        }
      for (const d of b.decals)
        if (d.mesh.isEnabled()) {
          meshes++;
          triangles += 2;
        }
      return { drawCalls, instances, triangles, pieces: pieces.size, meshes, kitTriangles, generatedTriangles, componentGlbs: b.componentGlbs, componentStandins: b.componentStandins };
    },
    emissiveMeshes() {
      if (!built) return [];
      return [
        ...built.instanced.filter((e) => e.slot && EMISSIVE.has(e.slot)).map((e) => e.mesh),
        ...built.statics.filter((s) => (s.slot && EMISSIVE.has(s.slot)) || s.kind === "plume" || s.kind === "object-frame").map((s) => s.mesh),
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
    for (const [su, sv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = [0, 0, 0];
      p[axis] = side > 0 ? hi[axis] : lo[axis];
      p[u] = su ? hi[u] : lo[u];
      p[v] = sv ? hi[v] : lo[v];
      out.positions.push(p[0], p[1], p[2]);
      out.normals.push(n[0], n[1], n[2]);
    }
    // (u, v, axis) is a right-handed cycle, so u x v = +axis: counter-clockwise for side > 0.
    if (side > 0) out.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    else out.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }
  out.boxes++;
}
