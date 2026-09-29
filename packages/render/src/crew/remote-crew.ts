import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VOXEL_CREW_ASSET_URL } from "@sidereal/content/crew-voxel-bundle";
import { castCharacterBeam } from "@sidereal/sim/combat-damage";
import { setMeshRole } from "../mesh-roles";
import type { CrewAppearance } from "./appearance";
import { createVoxelCrewVisual } from "./voxel-crew";
import { createVoxelCrewOutfit } from "./voxel-crew-outfit";
import { equipVoxelCrewItem } from "./voxel-crew-kit";
import { createRemoteCrewMotion } from "./remote-crew-motion";
import type { VoxelCrewEva } from "./voxel-crew-clips";
import {
  createEvaBodyPresentation,
  evaHipLiftCorrection,
} from "../eva/eva-body";

/** Server-projected presentation of another character (current_interior_crew + visible_crew_presentation). */
export interface RemoteCrewState {
  id: string;
  name: string;
  /** Ship-local metres, the same frame as the local character. */
  localX: number;
  localY: number;
  /** Server-qualified standing elevation (m). */
  elevation: number;
  connected: boolean;
  sprinting: boolean;
  seated: boolean;
  dead: boolean;
  aimActive: boolean;
  aimAngle: number;
  /** Changes once per accepted shot; the first value seen is a baseline, not a shot. */
  shotSequence: bigint;
  /** Ship-local end of the latest accepted shot. */
  shot?: { x: number; y: number; struck: boolean };
  appearance: CrewAppearance;
  /** Held item asset (inventory definition assetId), or null for an empty hand. */
  heldAsset: string | null;
  /** Outside a ship (EVA, `visible_eva_bodies`): zero-g / maglock pose and heading. */
  eva?: VoxelCrewEva & { localHeading: number };
}

/** At most this many other bodies are drawn (nearest first); the view bounds rows at 256. */
export const REMOTE_CREW_MAX_BODIES = 12;
/** Beam height used by the authoritative shot (see the server beam and the local impact flash). */
const BEAM_HEIGHT_M = 1.3;
const TRACER_MS = 110;

type VoxelCrew = Awaited<ReturnType<typeof createVoxelCrewVisual>>;
type HeldItem = Awaited<ReturnType<typeof equipVoxelCrewItem>>;

interface Entry {
  state: RemoteCrewState;
  motion: ReturnType<typeof createRemoteCrewMotion>;
  crew?: VoxelCrew;
  outfit?: ReturnType<typeof createVoxelCrewOutfit>;
  item?: HeldItem;
  itemAsset: string | null;
  itemRevision: number;
  appearanceKey: string;
  /** Name label; absent where no 2D canvas exists (headless tests). */
  label?: Mesh;
  labelKey: string;
  lastShot?: bigint;
  evaBody?: ReturnType<typeof createEvaBodyPresentation>;
  disposed: boolean;
}

/**
 * Other characters on the viewer's deck, drawn with the same voxel crew runtime as the local
 * character: shared body geometry (one parsed GLB per scene), per-body skeleton, clips, tinted
 * materials, head kit, armour and held item, the molded finish via the outfit, and a name label.
 * Presentation only: positions and poses come from accepted server rows and are never written back.
 */
export function createRemoteCrew(
  scene: Scene,
  shipRoot: TransformNode,
  options: {
    now?: () => number;
    maxBodies?: number;
    assetUrl?: string;
    /** Called when meshes are added or removed (lighting, glow occlusion, molded finish). */
    onMeshesChanged?: () => void;
    /** Called once per accepted shot of another body (ship-local end point). */
    onShot?: (impact: { x: number; y: number; struck: boolean }) => void;
    /** A short-lived emissive effect mesh (shot tracer) was created (glow inclusion). */
    onEffectMesh?: (mesh: Mesh) => void;
  } = {},
) {
  const now = options.now ?? (() => performance.now());
  const maxBodies = options.maxBodies ?? REMOTE_CREW_MAX_BODIES;
  const group = new TransformNode("remote-crew", scene);
  group.parent = shipRoot;
  const entries = new Map<string, Entry>();
  let disposed = false;
  let visible = true;
  let reducedMotion = false;
  let lastFrameAt: number | undefined;
  const onEffectMesh = options.onEffectMesh;
  const changed = () => {
    if (!disposed) options.onMeshesChanged?.();
  };

  // One tracer material and one label material family; tracers are short-lived boxes.
  const tracerMaterial = new StandardMaterial("remote-crew-tracer", scene);
  tracerMaterial.disableLighting = true;
  tracerMaterial.emissiveColor = new Color3(0.15, 1, 0.35);
  tracerMaterial.diffuseColor = Color3.Black();
  const tracers: { mesh: Mesh; start: number }[] = [];

  const canDrawText =
    typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";
  const makeLabel = (id: string) => {
    if (!canDrawText) return undefined;
    const plane = CreatePlane(
      "remote-crew-label-" + id,
      { width: 1.4, height: 0.22 },
      scene,
    );
    setMeshRole(plane, "effect");
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    const texture = new DynamicTexture(
      "remote-crew-label-" + id,
      { width: 512, height: 80 },
      scene,
      false,
    );
    texture.hasAlpha = true;
    const material = new StandardMaterial("remote-crew-label-" + id, scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    material.disableLighting = true;
    material.backFaceCulling = false;
    plane.material = material;
    plane.parent = group;
    return plane;
  };
  const drawLabel = (entry: Entry) => {
    const { name, connected, dead } = entry.state;
    const key = `${name}|${connected}|${dead}`;
    if (key === entry.labelKey || !entry.label) return;
    entry.labelKey = key;
    const material = entry.label.material as StandardMaterial;
    const texture = material.diffuseTexture as DynamicTexture;
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 512, 80);
    ctx.fillStyle = "rgba(8, 14, 24, 0.62)";
    ctx.beginPath();
    ctx.arc(86, 40, 30, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.arc(426, 40, 30, (Math.PI * 3) / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    const text = name.length > 22 ? name.slice(0, 21) + "…" : name;
    // x null centres the text; no clear colour keeps the pill drawn above.
    texture.drawText(
      text,
      null,
      54,
      "600 38px sans-serif",
      dead ? "#ff8f8f" : connected ? "#e8f1ff" : "#8b98ab",
      null,
      true,
      true,
    );
  };

  const applyLook = (entry: Entry) => {
    const crew = entry.crew;
    if (!crew || entry.disposed) return;
    const key = JSON.stringify(entry.state.appearance);
    if (key !== entry.appearanceKey) {
      entry.appearanceKey = key;
      crew.customize(entry.state.appearance);
      entry.outfit?.apply(entry.state.appearance);
    }
    const asset = entry.state.heldAsset;
    if (asset === entry.itemAsset) return;
    entry.itemAsset = asset;
    const revision = ++entry.itemRevision;
    entry.item?.dispose();
    entry.item = undefined;
    if (!asset) return changed();
    equipVoxelCrewItem(scene, crew, asset)
      .then((item) => {
        if (entry.disposed || revision !== entry.itemRevision)
          return item.dispose();
        entry.item = item;
        changed();
      })
      .catch((error) =>
        console.warn(`remote crew item ${asset} unavailable`, error),
      );
  };

  const create = (state: RemoteCrewState) => {
    const entry: Entry = {
      state,
      motion: createRemoteCrewMotion(),
      itemAsset: null,
      itemRevision: 0,
      appearanceKey: "",
      label: makeLabel(state.id),
      labelKey: "",
      disposed: false,
    };
    entry.label?.setEnabled(false);
    entries.set(state.id, entry);
    createVoxelCrewVisual(
      scene,
      group,
      options.assetUrl ?? VOXEL_CREW_ASSET_URL,
      {
        shared: true,
      },
    )
      .then((crew) => {
        if (entry.disposed || disposed) return crew.dispose();
        crew.root.name = "remote-crew-" + state.id;
        crew.root.setEnabled(false);
        entry.crew = crew;
        entry.outfit = createVoxelCrewOutfit(scene, crew, {
          onChange: changed,
        });
        if (entry.label) {
          entry.label.parent = crew.root;
          entry.label.position.set(0, 2.15, 0);
        }
        applyLook(entry);
        changed();
      })
      .catch((error) => console.warn("remote crew body unavailable", error));
    return entry;
  };

  const destroy = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entry.disposed = true;
    entries.delete(id);
    entry.item?.dispose();
    entry.outfit?.dispose();
    const material = entry.label?.material;
    entry.label?.dispose();
    entry.evaBody?.dispose();
    material?.dispose(true, true);
    entry.crew?.dispose();
    changed();
  };

  const fireTracer = (entry: Entry) => {
    const shot = entry.state.shot;
    const crew = entry.crew;
    if (!shot || !crew) return;
    const ship = shipRoot.computeWorldMatrix(true);
    const muzzle = entry.item?.getMuzzleWorld()?.position;
    const origin =
      muzzle ??
      Vector3.TransformCoordinates(
        crew.root.position.add(new Vector3(0, BEAM_HEIGHT_M, 0)),
        ship,
      );
    const end = Vector3.TransformCoordinates(
      new Vector3(shot.x, crew.root.position.y + BEAM_HEIGHT_M, -shot.y),
      ship,
    );
    const length = Vector3.Distance(origin, end);
    options.onShot?.(shot);
    if (length < 0.05 || reducedMotion) return;
    const mesh = CreateBox("remote-crew-tracer", { size: 1 }, scene);
    setMeshRole(mesh, "effect");
    mesh.material = tracerMaterial;
    mesh.isPickable = false;
    mesh.position.copyFrom(origin.add(end).scale(0.5));
    mesh.scaling.set(0.018, 0.018, length);
    mesh.lookAt(end);
    tracers.push({ mesh, start: now() });
    options.onEffectMesh?.(mesh);
  };

  return {
    group,
    /** Replace the visible set (called whenever accepted rows change). */
    sync(states: readonly RemoteCrewState[], local?: { x: number; y: number }) {
      if (disposed) return;
      const t = now();
      const chosen = local
        ? [...states]
            .sort(
              (a, b) =>
                Math.hypot(a.localX - local.x, a.localY - local.y) -
                Math.hypot(b.localX - local.x, b.localY - local.y),
            )
            .slice(0, maxBodies)
        : states.slice(0, maxBodies);
      const wanted = new Set(chosen.map((s) => s.id));
      for (const id of [...entries.keys()]) if (!wanted.has(id)) destroy(id);
      for (const state of chosen) {
        const entry = entries.get(state.id) ?? create(state);
        entry.state = state;
        entry.motion.push(t, state.localX, state.localY, state.elevation);
        applyLook(entry);
        drawLabel(entry);
      }
    },
    /** Per render frame: place, pose and animate every loaded body. */
    frame(show: boolean, options: { reducedMotion?: boolean } = {}) {
      if (disposed) return;
      visible = show;
      reducedMotion = !!options.reducedMotion;
      const t = now();
      const dt = Math.min(0.1, Math.max(0, (t - (lastFrameAt ?? t)) / 1000));
      lastFrameAt = t;
      for (const entry of entries.values()) {
        const { crew, state } = entry;
        if (!crew || !entry.motion.ready) continue;
        crew.root.setEnabled(visible);
        entry.label?.setEnabled(visible);
        if (!visible) continue;
        const pose = {
          seated: state.seated,
          dead: state.dead,
          aimActive: state.aimActive,
          aimAngle: state.aimAngle,
          // Same seat facing rule as the local character (seats face the aisle).
          seatFacing: (Math.sign(state.localX) * Math.PI) / 2,
        };
        const d = entry.motion.sample(t, pose);
        crew.root.position.set(d.x, d.z, -d.y);
        crew.root.rotation.y = d.yaw;
        if (state.eva) {
          crew.root.position.y -= evaHipLiftCorrection(state.eva, (clip) =>
            crew.hasClip(clip),
          );
          // Outside a ship: the accepted heading (or the aim) turns the body; zero-g clips play.
          crew.root.rotation.y = state.aimActive
            ? -state.aimAngle
            : state.eva.localHeading;
          entry.evaBody ??= createEvaBodyPresentation(scene, crew, {
            onMeshes: (meshes) => meshes.forEach((m) => onEffectMesh?.(m)),
          });
        }
        entry.evaBody?.update(state.eva, dt, {
          reducedMotion,
          dead: state.dead,
        });
        crew.update({
          eva: state.eva,
          moving: state.eva ? state.eva.walking : d.moving,
          seated: state.seated,
          sprinting: state.sprinting && d.moving,
          combat: state.aimActive,
          dead: state.dead,
          reducedMotion,
          shotSequence: state.shotSequence,
        });
        if (
          entry.lastShot !== undefined &&
          state.shotSequence !== entry.lastShot
        )
          fireTracer(entry);
        entry.lastShot = state.shotSequence;
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        const k = (t - tracers[i].start) / TRACER_MS;
        if (k >= 1) {
          tracers[i].mesh.dispose();
          tracers.splice(i, 1);
        } else tracers[i].mesh.visibility = 1 - k;
      }
    },
    /** Every mesh of every loaded body (lighting, shadows, glow occlusion). */
    meshes(): AbstractMesh[] {
      return [...entries.values()].flatMap(
        (e) =>
          e.crew?.root
            .getChildMeshes()
            .filter((m) => !m.name.startsWith("remote-crew-label")) ?? [],
      );
    },
    tracerMeshes(): AbstractMesh[] {
      return tracers.map((t) => t.mesh);
    },
    /**
     * Beam clip matching the server's character test (connected, alive bodies as 0.3 m discs at
     * their displayed position): the local laser sight stops at a crewmate like the shot will.
     */
    beamClip(origin: Vector3, direction: Vector3, range: number) {
      const inverse = Matrix.Invert(shipRoot.computeWorldMatrix(true));
      const o = Vector3.TransformCoordinates(origin, inverse);
      const d = Vector3.TransformNormal(direction, inverse).normalize();
      const horizontal = Math.hypot(d.x, d.z);
      if (horizontal < 1e-6) return undefined;
      const targets = [...entries.entries()]
        .filter(([, e]) => e.state.connected && !e.state.dead && e.motion.last)
        .map(([id, e]) => ({ id, x: e.motion.last!.x, y: e.motion.last!.y }));
      if (!targets.length) return undefined;
      const hit = castCharacterBeam(
        [o.x, -o.z],
        Math.atan2(d.x, -d.z),
        range * horizontal,
        targets,
      );
      return hit ? hit.distanceM / horizontal : undefined;
    },
    /** Review diagnostics: loaded bodies and their current clip selection. */
    diagnostics() {
      return [...entries.entries()].map(([id, e]) => ({
        id,
        name: e.state.name,
        loaded: !!e.crew,
        enabled: !!e.crew?.root.isEnabled(),
        clips: e.crew?.activeClips ?? [],
        position: e.motion.last
          ? [e.motion.last.x, e.motion.last.y, e.motion.last.z]
          : undefined,
        item: e.itemAsset,
        armour: e.outfit?.armour ?? {},
        dead: e.state.dead,
      }));
    },
    get count() {
      return entries.size;
    },
    dispose() {
      if (disposed) return;
      for (const id of [...entries.keys()]) destroy(id);
      disposed = true;
      for (const t of tracers) t.mesh.dispose();
      tracers.length = 0;
      tracerMaterial.dispose();
      group.dispose();
    },
  };
}
