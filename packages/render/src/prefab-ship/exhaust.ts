/**
 * Per-actuator ship exhaust (FLIGHT-IFCS, 2026-09-29; owner: "The engines on my Wren don't seem to
 * show plumes when I accelerate", RCS "don't seem to fire"). Presentation only.
 *
 * Every jet is driven by the server's ACHIEVED command for that actuator (`actuator_output`, the
 * allocation result), never by the pilot's keys: main drives burn a stepped plume whose length and
 * width follow the throttle, reversers flare two short jets forward-outward at the drive's nozzle,
 * and RCS nozzles puff small cold-gas jets. An actuator the server is not firing draws nothing.
 *
 * Reusable ship-exterior interface (for remote prefab exteriors, VIS-1): `createShipExhaust(scene,
 * shipFrame)` attaches to any TransformNode whose local frame is the ship-local game frame
 * rendered as Babylon (x, height, -y) (the prefab `PrefabShipView.root`). Feed it `ExhaustJet`
 * rows each frame. Two adapters build rows:
 * - `prefabExhaustJets(doc, catalog, actuators)`: own ship, from `own_authored_flight_actuators`
 *   rows (compiled nozzle geometry + throttle, keyed by `placedObjectId`);
 * - `prefabNozzleLayout(doc, catalog)` + `jetsFromLayout(layout, throttleBySource)`: any ship whose
 *   prefab document is known, with throttles keyed by flight source id (`mount-<id>[#suffix]`).
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { registerExhaustBatch } from "./exhaust-batching";
import { registerExhaustInstanceSetting } from "./exhaust-settings";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { SHIP_THEMES } from "@sidereal/content/ship-themes";
import { isWayfarerDisabledActuator } from "@sidereal/content/wayfarer-authored-gameplay";
import type {
  PrefabComponentCatalog,
  ShipPrefabDocumentV1,
  ShipThemeId,
} from "@sidereal/content/ship-prefab";
import {
  transformFlightVector,
  type ActuatorDefinition,
} from "@sidereal/sim/flight-definition";
import { prefabFlightModel } from "@sidereal/sim/prefab-flight";
import { emitPlume } from "./component-standins";
import { newBuilder } from "./box-mesher";

export type ExhaustKind = "main" | "reverser" | "rcs";
/** One jet in the ship-local game frame (x starboard, y fore, height up; metres). */
export interface ExhaustJet {
  /** Stable per actuator (e.g. `mount-main-c`, `mount-rcs-bow-s#fore`). */
  id: string;
  kind: ExhaustKind;
  /** Nozzle exit radius (m); jets scale from it. */
  radius: number;
  nozzleX: number;
  nozzleY: number;
  height: number;
  /** Unit exhaust direction (plan). */
  exhaustX: number;
  exhaustY: number;
  /** Achieved command 0..1. */
  throttle: number;
}
/** Below this achieved throttle nothing is drawn. */
export const EXHAUST_VISIBLE_THROTTLE = 0.01;

/** Mount id and exhaust kind of a prefab flight source id (`mount-<id>[#suffix]`). */
export function prefabExhaustActuator(
  sourceId: string,
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): { kind: ExhaustKind; radius: number } | undefined {
  if (isWayfarerDisabledActuator(doc, sourceId)) return undefined;
  if (!sourceId.startsWith("mount-")) return undefined;
  const [mountId, suffix] = sourceId.slice("mount-".length).split("#");
  const mount = doc.mounts.find((m) => m.id === mountId);
  const spec = mount && catalog.get(mount.component);
  if (!spec || spec.category !== "propulsion") return undefined;
  if ((spec.maneuverThrustN ?? 0) > 0 && suffix)
    return { kind: "rcs", radius: spec.sizeClass === "SM" ? 0.09 : 0.14 };
  if ((spec.thrustN ?? 0) > 0) {
    const size = Math.max(1, Math.min(spec.cells[0], spec.cells[1]));
    return {
      kind: suffix === "reverser" ? "reverser" : "main",
      radius: 0.26 * size,
    };
  }
  return undefined;
}

/** Jet shape for a throttle: width factor and length in nozzle radii. Pure. */
export function exhaustShape(kind: ExhaustKind, throttle: number) {
  const t = Math.max(0, Math.min(1, throttle));
  if (kind === "rcs") return { width: 0.9 + 0.5 * t, length: 3 + 12 * t };
  if (kind === "reverser")
    return { width: 0.55 + 0.25 * t, length: 1.5 + 4 * t };
  return { width: 0.8 + 0.35 * Math.sqrt(t), length: 2 + 11 * t };
}

/** Own ship: `own_authored_flight_actuators` rows (placedObjectId `<shipId>:<sourceId>`). */
export function prefabExhaustJets(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  actuators: readonly {
    placedObjectId?: string;
    nozzleX: number;
    nozzleY: number;
    height: number;
    exhaustX: number;
    exhaustY: number;
    throttle: number;
  }[],
): ExhaustJet[] {
  const jets: ExhaustJet[] = [];
  for (const a of actuators) {
    const at = a.placedObjectId?.indexOf(":mount-") ?? -1;
    if (at < 0) continue;
    const id = a.placedObjectId!.slice(at + 1);
    const kind = prefabExhaustActuator(id, doc, catalog);
    if (kind)
      jets.push({
        id,
        ...kind,
        nozzleX: a.nozzleX,
        nozzleY: a.nozzleY,
        height: a.height,
        exhaustX: a.exhaustX,
        exhaustY: a.exhaustY,
        throttle: a.throttle,
      });
  }
  return jets;
}

/** Nozzle geometry of every prefab actuator (same compile as the server's flight definition). */
export function prefabNozzleLayout(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): Omit<ExhaustJet, "throttle">[] {
  const model = prefabFlightModel(doc, catalog);
  const defs = new Map(model.catalog.definitions.map((d) => [d.id, d]));
  const out: Omit<ExhaustJet, "throttle">[] = [];
  for (const part of model.parts) {
    const d = defs.get(part.definitionId);
    if (d?.kind !== "actuator") continue;
    const a = d as ActuatorDefinition;
    const kind = prefabExhaustActuator(part.sourceId, doc, catalog);
    if (!kind) continue;
    const n = transformFlightVector(a.nozzleOffset, part.rotation, false);
    const f = transformFlightVector(a.forceAxis, part.rotation, false);
    out.push({
      id: part.sourceId,
      ...kind,
      nozzleX: part.position[0] + n[0],
      nozzleY: part.position[1] + n[1],
      height: part.position[2] + a.nozzleHeight,
      exhaustX: -f[0],
      exhaustY: -f[1],
    });
  }
  return out;
}
export const jetsFromLayout = (
  layout: readonly Omit<ExhaustJet, "throttle">[],
  throttleBySource: ReadonlyMap<string, number>,
): ExhaustJet[] =>
  layout.map((n) => ({ ...n, throttle: throttleBySource.get(n.id) ?? 0 }));

/** Unit plume (radius 1, length 1) along Babylon +Z from the origin, stepped voxel style. */
function unitPlume(scene: Scene, name: string, material: StandardMaterial) {
  const g = newBuilder();
  const colours: number[] = [];
  // emitPlume builds along local -Y with Z up; (x, y, z) -> Babylon (x, z, -y) puts the jet on +Z.
  emitPlume(g, colours, [0, 0, 0], 1, 1);
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < g.positions.length; i += 3) {
    positions.push(g.positions[i], g.positions[i + 2], -g.positions[i + 1]);
    normals.push(g.normals[i], g.normals[i + 2], -g.normals[i + 1]);
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = g.indices.slice();
  data.colors = colours;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.setEnabled(false);
  return mesh;
}

function jetMaterial(scene: Scene, name: string, colour: Color3) {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = colour;
  m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  return m;
}

export interface ShipExhaust {
  /** Apply the latest achieved outputs (call every frame; `nowMs` drives a small flicker). */
  update(jets: readonly ExhaustJet[], nowMs: number): void;
  /** Jet meshes created so far (emissive; add to a glow layer). */
  meshes(): AbstractMesh[];
  /** Hidden render owners plus placed handles for both stock and custom glow admission. */
  glowMeshes(): AbstractMesh[];
  /** Currently lit jets (diagnostics and review harnesses). */
  lit(): { id: string; kind: ExhaustKind; throttle: number }[];
  dispose(): void;
}

export function createShipExhaust(
  scene: Scene,
  shipFrame: TransformNode,
  theme: ShipThemeId,
  options: {
    /** Private experiment; defaults to the established individual plume path. */
    instances?: boolean;
    onGlowMesh?: (mesh: AbstractMesh) => void;
  } = {},
): ShipExhaust {
  const root = new TransformNode("ship-exhaust", scene);
  root.parent = shipFrame;
  const hot = jetMaterial(
    scene,
    `ship-exhaust-${theme}`,
    new Color3(...SHIP_THEMES[theme].plume),
  );
  const cold = jetMaterial(scene, "ship-rcs-puff", new Color3(0.85, 0.95, 1));
  const templates = {
    hot: unitPlume(scene, "ship-exhaust:hot", hot),
    cold: unitPlume(scene, "ship-exhaust:cold", cold),
  };
  templates.hot.parent = root;
  templates.cold.parent = root;
  let useInstances = false;
  let disposed = false;
  const entries = new Map<
    string,
    {
      kind: ExhaustKind;
      node: TransformNode;
      jets: AbstractMesh[];
      clones: AbstractMesh[];
      instances?: AbstractMesh[];
      throttle: number;
      sides: number[];
      phases: number[];
      batched: boolean;
    }
  >();
  let phase = 0;
  const announced = new Set<AbstractMesh>();
  const announce = (mesh: AbstractMesh) => {
    if (announced.has(mesh)) return;
    announced.add(mesh);
    options.onGlowMesh?.(mesh);
    mesh.onDisposeObservable.addOnce(() => announced.delete(mesh));
  };
  const createJet = (
    source: Mesh,
    node: TransformNode,
    side: number,
    phaseValue: number,
    name: string,
    batched: boolean,
  ): AbstractMesh => {
    const mesh = batched
      ? new InstancedMesh(name, source)
      : source.clone(name, node);
    mesh.parent = node;
    mesh.setEnabled(true);
    mesh.isVisible = true;
    mesh.isPickable = false;
    mesh.layerMask = source.layerMask;
    mesh.alphaIndex = source.alphaIndex;
    mesh.cullingStrategy = source.cullingStrategy;
    mesh.hasVertexAlpha = source.hasVertexAlpha;
    mesh.useVertexColors = source.useVertexColors;
    mesh.rotation.y = side * 1.22;
    mesh.metadata = { exhaustPhase: phaseValue };
    announce(mesh);
    return mesh;
  };
  let releaseBatches: (() => void)[] = [];
  function setInstances(enabled: boolean) {
    const next = enabled && !!scene.getEngine().getCaps().instancedArrays;
    if (disposed || next === useInstances) return;
    useInstances = next;
    if (!next) {
      releaseBatches.forEach((release) => release());
      releaseBatches = [];
      for (const entry of entries.values()) {
        if (!entry.batched) continue;
        entry.clones.forEach((mesh, i) => {
          mesh.scaling.copyFrom(entry.jets[i].scaling);
          mesh.setEnabled(true);
          mesh.computeWorldMatrix(true);
        });
        entry.jets.forEach((mesh) => mesh.setEnabled(false));
        entry.jets = entry.clones;
        entry.batched = false;
      }
      for (const source of Object.values(templates)) source.setEnabled(false);
      return;
    }
    for (const source of Object.values(templates)) {
      source.isVisible = false;
      if (entries.size) announce(source);
    }
    releaseBatches = Object.values(templates).map((source) => {
      const status = { stable: 0 };
      return registerExhaustBatch(scene, {
        source,
        jets: () =>
          [...entries.values()]
            .filter(
              (entry) =>
                (entry.kind === "rcs" ? templates.cold : templates.hot) ===
                source,
            )
            .flatMap((entry) => entry.jets),
        handles: () =>
          [...entries.values()]
            .filter(
              (entry) =>
                (entry.kind === "rcs" ? templates.cold : templates.hot) ===
                source,
            )
            .flatMap((entry) => [...entry.clones, ...(entry.instances ?? [])]),
        allow(allowed) {
          if (disposed) return;
          if (!allowed) status.stable = 0;
          else status.stable++;
          const next = allowed && status.stable >= 3;
          source.setEnabled(next);
          for (const [id, entry] of entries) {
            if (
              (entry.kind === "rcs" ? templates.cold : templates.hot) !==
                source ||
              entry.batched === next
            )
              continue;
            const old = entry.jets;
            // Keep prepared clones for immediate fallback. Effect/helper
            // registrations may be deferred, so creating a replacement at
            // fallback time could omit it from that frame's capture pass.
            const target = next
              ? (entry.instances ??= entry.clones.map((_, i) =>
                  createJet(
                    source,
                    entry.node,
                    entry.sides[i],
                    entry.phases[i],
                    `ship-exhaust:${id}:${i}:instance`,
                    true,
                  ),
                ))
              : entry.clones;
            target.forEach((mesh, i) => {
              mesh.scaling.copyFrom(old[i].scaling);
              mesh.setEnabled(true);
              mesh.computeWorldMatrix(true);
            });
            old.forEach((mesh) => mesh.setEnabled(false));
            entry.jets = target;
            entry.batched = next;
          }
        },
      });
    });
  }
  const releaseSetting = registerExhaustInstanceSetting(
    scene,
    setInstances,
    options.instances,
  );
  const ownerDisposed = root.onDisposeObservable.addOnce(() => dispose());
  function dispose() {
    if (disposed) return;
    disposed = true;
    releaseSetting();
    releaseBatches.forEach((release) => release());
    root.onDisposeObservable.remove(ownerDisposed);
    root.dispose();
    hot.dispose();
    cold.dispose();
    entries.clear();
    announced.clear();
  }

  return {
    update(jets, nowMs) {
      if (disposed) return;
      const seen = new Set<string>();
      for (const j of jets) {
        if (
          !j.id ||
          ![
            j.radius,
            j.nozzleX,
            j.nozzleY,
            j.height,
            j.exhaustX,
            j.exhaustY,
            j.throttle,
          ].every(Number.isFinite)
        )
          continue;
        seen.add(j.id);
        let e = entries.get(j.id);
        if (!e) {
          const node = new TransformNode(`ship-exhaust:${j.id}`, scene);
          node.parent = root;
          const template = j.kind === "rcs" ? templates.cold : templates.hot;
          const sides = j.kind === "reverser" ? [-1, 1] : [0];
          const phases = sides.map(() => (phase += 1.7));
          // Start with the established representation; admission occurs in
          // the pre-evaluation phase once the current scene has been checked.
          const batched = false;
          if (useInstances) {
            announce(templates.hot);
            announce(templates.cold);
          }
          const meshes = sides.map((side, i) =>
            createJet(
              template,
              node,
              side,
              phases[i],
              `ship-exhaust:${j.id}:${i}`,
              batched,
            ),
          );
          e = {
            kind: j.kind,
            node,
            jets: meshes,
            clones: meshes,
            throttle: 0,
            sides,
            phases,
            batched,
          };
          entries.set(j.id, e);
        }
        const t = Math.max(0, Math.min(1, j.throttle));
        e.throttle = t;
        const on = t > EXHAUST_VISIBLE_THROTTLE;
        e.node.setEnabled(on);
        if (!on) continue;
        e.node.position.set(j.nozzleX, j.height, -j.nozzleY);
        // Local +Z (the jet) points along the plan exhaust (x, y) -> Babylon (x, -y).
        e.node.rotation.y = Math.atan2(j.exhaustX, -j.exhaustY);
        const shape = exhaustShape(j.kind, t);
        for (const jet of e.jets) {
          const flicker =
            1 + 0.08 * Math.sin(nowMs * 0.037 + jet.metadata.exhaustPhase);
          const w = j.radius * shape.width;
          jet.scaling.set(w, w, j.radius * shape.length * flicker);
        }
      }
      for (const [id, e] of entries)
        if (!seen.has(id)) {
          e.node.dispose();
          entries.delete(id);
        }
    },
    meshes: () => [...entries.values()].flatMap((e) => e.jets),
    glowMeshes: () => [
      ...(useInstances ? Object.values(templates) : []),
      ...[...entries.values()].flatMap((e) => [
        ...e.clones,
        ...(e.instances ?? []),
      ]),
    ],
    lit: () =>
      [...entries]
        .filter(([, e]) => e.throttle > EXHAUST_VISIBLE_THROTTLE)
        .map(([id, e]) => ({ id, kind: e.kind, throttle: e.throttle })),
    dispose,
  };
}
