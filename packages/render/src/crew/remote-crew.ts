import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
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
import { createVoxelHeldItem, type VoxelHeldItem } from "./voxel-held-item";
import { createRemoteCrewMotion } from "./remote-crew-motion";
import {
  createOperatorEnsembleOwner,
  operatorProjection,
  type OperatorInteriorRow,
  type OperatorActivatedCapability,
  type createOperatorReadiness,
} from "./operator-readiness";
import type {
  OperatorEnsembleRequest,
  PreparedOperatorEnsemble,
} from "./operator-ensemble";
import {
  assignCrewTiers,
  CREW_LOD,
  type CrewLodTier,
} from "../presentation-lod";
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
  /** Authored seat view direction from the admitted prefab (Babylon yaw). */
  seatFacing?: number;
  seatContact?: { lift: number; lean: number; footSupport: number };
  dead: boolean;
  aimActive: boolean;
  aimAngle: number;
  /** Changes once per accepted shot; the first value seen is a baseline, not a shot. */
  shotSequence: bigint;
  /** Ship-local end of the latest accepted shot. */
  shot?: { x: number; y: number; struck: boolean };
  appearance: CrewAppearance;
  /** r001 item in hand (the inventory definition's crewItemId), or null for an empty hand. */
  heldItem: string | null;
  /** Outside a ship (EVA, `visible_eva_bodies`): zero-g / maglock pose and heading. */
  eva?: VoxelCrewEva & { localHeading: number };
}

/**
 * Skinned full-detail bodies drawn at once (nearest first). Every other body the server delivers
 * is still drawn, as an instanced marker body (crew LOD C3): no cap hides a perceived character
 * (wiki `Architecture/Visibility and Interest Management`, hard rule 5).
 */
export const REMOTE_CREW_FULL_BODIES = CREW_LOD.fullBodyBudget;
/** Beam height used by the authoritative shot (see the server beam and the local impact flash). */
const BEAM_HEIGHT_M = 1.3;
const TRACER_MS = 110;

type VoxelCrew = Awaited<ReturnType<typeof createVoxelCrewVisual>>;

interface Entry {
  state: RemoteCrewState;
  motion: ReturnType<typeof createRemoteCrewMotion>;
  /** Presentation tier (presentation-lod.ts); a marker body is still a drawn, perceived body. */
  tier: CrewLodTier;
  /** Marker tier: one instance of the shared low-poly body. */
  marker?: InstancedMesh;
  /** Bumped on every tier change: a body load from an older promotion is discarded. */
  generation: number;
  crew?: VoxelCrew;
  outfit?: ReturnType<typeof createVoxelCrewOutfit>;
  /** Draws and holsters the held item like the local character. */
  held?: VoxelHeldItem;
  appearanceKey: string;
  /** Name label; absent where no 2D canvas exists (headless tests). */
  label?: Mesh;
  labelKey: string;
  lastShot?: bigint;
  evaBody?: ReturnType<typeof createEvaBodyPresentation>;
  lookApplied?: boolean;
  disposed: boolean;
  legacyLoading?: boolean;
  operator?: ReturnType<typeof createOperatorEnsembleOwner>;
  operatorRow?: OperatorInteriorRow;
  ordinary?: PreparedOperatorEnsemble;
  operatorBaseline?: {
    crew?: VoxelCrew;
    outfit?: ReturnType<typeof createVoxelCrewOutfit>;
    held?: VoxelHeldItem;
    ordinary?: PreparedOperatorEnsemble;
  };
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
    /** Full-detail (skinned) body budget; bodies past it are drawn as markers, never hidden. */
    fullBodies?: number;
    assetUrl?: string;
    /** Called when meshes are added or removed (lighting, glow occlusion, molded finish). */
    onMeshesChanged?: () => void;
    /** Called once per accepted shot of another body (ship-local end point). */
    onShot?: (impact: { x: number; y: number; struck: boolean }) => void;
    /** A short-lived emissive effect mesh (shot tracer) was created (glow inclusion). */
    onEffectMesh?: (mesh: Mesh) => void;
    /** Draw the plain green tracer per shot (off where the r001 weapon FX play instead). */
    tracers?: boolean;
    /** Actual scene capability only; absent capability preserves the complete legacy path. */
    operator?: {
      readiness: ReturnType<typeof createOperatorReadiness>;
      capability: () => OperatorActivatedCapability | null;
      contactPlacement?: NonNullable<
        Parameters<typeof createOperatorEnsembleOwner>[4]
      >["contactPlacement"];
      resolve: (
        packet: Readonly<Record<string, unknown>>,
        associationKey: string,
        requestedKey: string,
      ) => Promise<OperatorEnsembleRequest>;
      configureMeshes?: (meshes: readonly AbstractMesh[]) => void;
      prepare?: NonNullable<
        Parameters<typeof createOperatorEnsembleOwner>[4]
      >["prepare"];
    };
  } = {},
) {
  const now = options.now ?? (() => performance.now());
  const fullBodies = options.fullBodies ?? REMOTE_CREW_FULL_BODIES;
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

  // Crew LOD C3: one low-poly body source per crowd; every marker body is an instance of it, so
  // any number of marker bodies costs one draw call. Unlit, so it needs no light binding.
  let markerSource: Mesh | undefined;
  let markerMaterial: StandardMaterial | undefined;
  const markerOf = (id: string) => {
    if (!markerSource) {
      markerSource = CreateCylinder(
        "crowd-marker-source",
        {
          height: 1.6,
          diameterTop: 0.34,
          diameterBottom: 0.52,
          tessellation: 8,
        },
        scene,
      );
      // Feet at the origin, like the crew body.
      markerSource.bakeTransformIntoVertices(Matrix.Translation(0, 0.8, 0));
      markerMaterial = new StandardMaterial("crowd-marker", scene);
      markerMaterial.disableLighting = true;
      markerMaterial.emissiveColor = new Color3(0.62, 0.72, 0.86);
      markerMaterial.diffuseColor = Color3.Black();
      markerMaterial.specularColor = Color3.Black();
      markerSource.material = markerMaterial;
      markerSource.parent = group;
      markerSource.isPickable = false;
      markerSource.isVisible = false;
      setMeshRole(markerSource, "effect");
    }
    const marker = markerSource.createInstance("crowd-marker-" + id);
    marker.parent = group;
    marker.isPickable = false;
    marker.setEnabled(false);
    setMeshRole(marker, "effect");
    return marker;
  };

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
    if (entry.operator?.stationary && entry.operator.ownsRequest) return;
    const crew = entry.crew;
    if (!crew || entry.disposed) return;
    const key = JSON.stringify(entry.state.appearance);
    if (key !== entry.appearanceKey) {
      entry.appearanceKey = key;
      crew.customize(entry.state.appearance);
      entry.outfit?.apply(entry.state.appearance);
    }
    entry.held ??= createVoxelHeldItem(scene, crew, {
      onChange: changed,
      reducedMotion: () => reducedMotion,
      // A body first seen already holds its item (no draw replayed on arrival).
      instant: () => !entry.lookApplied,
    });
    entry.held.set(entry.state.heldItem);
    entry.lookApplied = true;
  };

  /** Full tier: load the skinned body, outfit, held item and name label. */
  const promote = (entry: Entry) => {
    entry.tier = "full";
    if (entry.operator?.stationary) return;
    entry.marker?.dispose();
    entry.marker = undefined;
    const token = ++entry.generation;
    entry.legacyLoading = true;
    entry.label ??= makeLabel(entry.state.id);
    entry.labelKey = "";
    entry.label?.setEnabled(false);
    createVoxelCrewVisual(
      scene,
      group,
      options.assetUrl ?? VOXEL_CREW_ASSET_URL,
      {
        shared: true,
      },
    )
      .then((crew) => {
        if (entry.disposed || disposed || token !== entry.generation)
          return crew.dispose();
        entry.legacyLoading = false;
        crew.root.name = "remote-crew-" + entry.state.id;
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
      .catch((error) => {
        if (token === entry.generation) entry.legacyLoading = false;
        console.warn("remote crew body unavailable", error);
      });
  };

  /** Release the full-detail body (skinned mesh, outfit, held item, label, EVA effects). */
  const releaseFull = (entry: Entry) => {
    if (entry.operator) {
      restoreOperator(entry);
      entry.operator.withdraw();
      entry.operator = undefined;
    }
    entry.generation++;
    entry.legacyLoading = false;
    if (!entry.ordinary) entry.held?.dispose();
    entry.held = undefined;
    if (!entry.ordinary) entry.outfit?.dispose();
    entry.outfit = undefined;
    const material = entry.label?.material;
    entry.label?.dispose();
    entry.label = undefined;
    material?.dispose(true, true);
    entry.evaBody?.dispose();
    entry.evaBody = undefined;
    const hadBody = !!entry.crew;
    if (entry.ordinary) entry.ordinary.dispose();
    else entry.crew?.dispose();
    entry.ordinary = undefined;
    entry.crew = undefined;
    entry.appearanceKey = "";
    entry.lookApplied = false;
    if (hadBody) changed();
  };

  /** Marker tier: the body stays on screen as an instance of the shared low-poly body. */
  const demote = (entry: Entry) => {
    if (entry.operator && !entry.operator.mayDemote()) return;
    entry.tier = "marker";
    releaseFull(entry);
    entry.marker ??= markerOf(entry.state.id);
  };

  function restoreOperator(
    entry: Entry,
    row = entry.operatorRow,
    ordinary?: PreparedOperatorEnsemble,
    adopt?: () => void,
  ) {
    const previous = entry.operatorBaseline;
    if (!previous && !ordinary) return;
    entry.evaBody?.dispose();
    entry.evaBody = undefined;
    entry.crew = ordinary?.crew ?? previous?.crew;
    entry.outfit = ordinary?.outfit ?? previous?.outfit;
    entry.held = ordinary?.held ?? previous?.held;
    entry.ordinary = ordinary ?? previous?.ordinary;
    entry.operatorBaseline = undefined;
    adopt?.();
    if (ordinary && previous) {
      if (previous.ordinary) previous.ordinary.dispose();
      else {
        try {
          previous.held?.dispose();
        } finally {
          try {
            previous.outfit?.dispose();
          } finally {
            previous.crew?.dispose();
          }
        }
      }
    }
    if (entry.crew) {
      if (row)
        (entry.ordinary?.root ?? entry.crew.root).position.set(
          row.localX,
          row.standingElevationM,
          -row.localY,
        );
      entry.crew.root.setEnabled(visible);
      if (entry.label) {
        entry.label.parent = entry.crew.root;
        entry.label.position.set(0, 2.15, 0);
      }
    }
    changed();
  }
  function syncOperator(entry: Entry, row: OperatorInteriorRow | undefined) {
    const source = options.operator,
      capability = source?.capability() ?? null;
    const projection = row && operatorProjection(row, capability);
    if (!source || !projection) {
      if (entry.operator) {
        restoreOperator(entry, row);
        entry.operator.withdraw();
        entry.operator = undefined;
      }
      return;
    }
    if (!entry.operator && projection.status !== "withdrawn") {
      // In-flight legacy promotion must not remove a marker or overwrite the candidate ensemble.
      entry.generation++;
      entry.legacyLoading = false;
      entry.marker ??= entry.crew ? undefined : markerOf(entry.state.id);
      entry.operator = createOperatorEnsembleOwner(
        scene,
        group,
        entry.state.id,
        source.readiness,
        {
          prepare: source.prepare,
          configureMeshes: source.configureMeshes,
          contactPlacement: source.contactPlacement,
          onCommitted: (handle) => {
            entry.operatorBaseline ??= {
              crew: entry.crew,
              outfit: entry.outfit,
              held: entry.held,
              ordinary: entry.ordinary,
            };
            entry.ordinary = undefined;
            entry.operatorBaseline.crew?.root.setEnabled(false);
            entry.evaBody?.dispose();
            entry.evaBody = undefined;
            const current = entry.operatorRow;
            if (!current)
              throw new Error("Operator current accepted body unavailable");
            if (!handle.contact)
              handle.root.position.set(
                current.localX,
                current.standingElevationM,
                -current.localY,
              );
            entry.crew = handle.crew;
            entry.outfit = handle.outfit;
            entry.held = handle.held;
            entry.tier = "full";
            // Marker ownership changes only after verified complete activation succeeds.
            entry.marker?.dispose();
            entry.marker = undefined;
            // A later ensemble release must not dispose the crowd's independently owned label.
            if (entry.label) entry.label.parent = group;
            changed();
          },
          restoreAtAcceptedRecovery: (handle, xy, adopt) =>
            restoreOperator(
              entry,
              {
                ...(entry.operator?.currentRow ?? row),
                localX: xy[0],
                localY: xy[1],
              },
              adopt ? handle : undefined,
              adopt,
            ),
        },
      );
    }
    if (entry.operator?.syncProjection(row, capability, source.resolve))
      entry.operatorRow = entry.operator.currentRow ?? undefined;
    if (entry.operatorBaseline && !entry.operator?.committed)
      restoreOperator(entry, row);
  }

  const create = (
    state: RemoteCrewState,
    tier: CrewLodTier,
    row?: OperatorInteriorRow,
  ) => {
    const entry: Entry = {
      state,
      motion: createRemoteCrewMotion(),
      tier,
      generation: 0,
      appearanceKey: "",
      labelKey: "",
      disposed: false,
    };
    entries.set(state.id, entry);
    syncOperator(entry, row);
    if (!entry.operator) {
      if (tier === "full") promote(entry);
      else demote(entry);
    }
    return entry;
  };

  const destroy = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entry.disposed = true;
    entries.delete(id);
    releaseFull(entry);
    entry.marker?.dispose();
    entry.marker = undefined;
    changed();
  };

  const fireTracer = (entry: Entry) => {
    const shot = entry.state.shot;
    const crew = entry.crew;
    if (!shot || !crew) return;
    const ship = shipRoot.computeWorldMatrix(true);
    const muzzle = entry.held?.muzzle()?.position;
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
    if (length < 0.05 || reducedMotion || options.tracers === false) return;
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
    sync(
      states: readonly RemoteCrewState[],
      local?: { x: number; y: number },
      operatorRows?: readonly OperatorInteriorRow[],
    ) {
      if (disposed) return;
      const t = now();
      // Every delivered body is drawn; the nearest get the full tier (presentation-lod.ts).
      const tiers = assignCrewTiers(
        states.map((s, i) => ({
          id: s.id,
          distanceM: local
            ? Math.hypot(s.localX - local.x, s.localY - local.y)
            : i,
          previous: entries.get(s.id)?.tier,
        })),
        fullBodies,
      );
      for (const id of [...entries.keys()]) if (!tiers.has(id)) destroy(id);
      for (const state of states) {
        const tier = tiers.get(state.id)!;
        let entry = entries.get(state.id);
        if (!entry)
          entry = create(
            state,
            tier,
            operatorRows?.find((row) => row.characterId === state.id),
          );
        else if (entry.tier !== tier) {
          if (tier === "full") promote(entry);
          else demote(entry);
        }
        entry.state = state;
        syncOperator(
          entry,
          operatorRows?.find((row) => row.characterId === state.id),
        );
        if (
          entry.operator &&
          !entry.crew &&
          !entry.operator.stationary &&
          entry.tier === "full" &&
          !entry.legacyLoading
        )
          promote(entry);
        const accepted = entry.operator?.stationary
          ? entry.operator.currentRow
          : undefined;
        entry.motion.push(
          t,
          accepted?.localX ?? state.localX,
          accepted?.localY ?? state.localY,
          accepted?.standingElevationM ?? state.elevation,
        );
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
        const { crew } = entry;
        const accepted = entry.operator?.stationary
          ? entry.operator.currentRow
          : undefined;
        const state = accepted
          ? {
              ...entry.state,
              localX: accepted.localX,
              localY: accepted.localY,
              elevation: accepted.standingElevationM,
              seated: true,
              dead: accepted.dead,
              connected: accepted.connected,
              aimActive: false,
            }
          : entry.state;
        const pose = {
          seated: state.seated,
          dead: state.dead,
          aimActive: state.aimActive,
          aimAngle: state.aimAngle,
          // Same seat facing rule as the local character (seats face the aisle).
          seatFacing:
            state.seatFacing ?? (Math.sign(state.localX) * Math.PI) / 2,
        };
        const marker = entry.marker;
        if (marker) {
          // Marker tier: position and facing only; lying down when dead.
          marker.setEnabled(visible && entry.motion.ready);
          if (!visible || !entry.motion.ready) continue;
          const sampled = entry.motion.sample(t, pose);
          const d = accepted
            ? {
                ...sampled,
                x: accepted.localX,
                y: accepted.localY,
                z: accepted.standingElevationM,
                moving: false,
                speed: 0,
              }
            : sampled;
          marker.position.set(
            d.x,
            d.z +
              (state.dead
                ? 0.26
                : state.seated
                  ? (state.seatContact?.lift ?? 0)
                  : 0),
            -d.y,
          );
          marker.rotation.set(0, d.yaw, state.dead ? Math.PI / 2 : 0);
          continue;
        }
        if (!crew || !entry.motion.ready) continue;
        crew.root.setEnabled(visible);
        entry.label?.setEnabled(visible);
        if (!visible) continue;
        const sampled = entry.motion.sample(t, pose);
        const d = accepted
          ? {
              ...sampled,
              x: accepted.localX,
              y: accepted.localY,
              z: accepted.standingElevationM,
              moving: false,
              speed: 0,
            }
          : sampled;
        entry.operator?.committed?.contact?.setReducedMotion(reducedMotion);
        crew.setSeatContact(state.seated ? state.seatContact : undefined);
        const placementRoot = entry.ordinary?.root ?? crew.root;
        if (!entry.operator?.committed?.contact) {
          placementRoot.position.set(
            d.x,
            d.z + (state.seated ? (state.seatContact?.lift ?? 0) : 0),
            -d.y,
          );
          placementRoot.rotation.y = d.yaw;
        }
        if (entry.operator?.committed && entry.label?.parent === group)
          entry.label.position.set(
            crew.root.position.x,
            crew.root.position.y + 2.15,
            crew.root.position.z,
          );
        if (state.eva) {
          placementRoot.position.y -= evaHipLiftCorrection(state.eva, (clip) =>
            crew.hasClip(clip),
          );
          // Outside a ship: the accepted heading (or the aim) turns the body; zero-g clips play.
          placementRoot.rotation.y = state.aimActive
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
    /** A loaded body on this deck: its crew visual, held item and ship-frame position. */
    body(id: string) {
      const e = entries.get(id);
      return e?.crew ? { crew: e.crew, held: e.held } : undefined;
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
        tier: e.tier,
        loaded: !!e.crew,
        enabled: !!(e.crew?.root.isEnabled() || e.marker?.isEnabled()),
        clips: e.crew?.activeClips ?? [],
        position: e.motion.last
          ? [e.motion.last.x, e.motion.last.y, e.motion.last.z]
          : undefined,
        item: e.held?.itemId ?? null,
        itemPhase: e.held?.phase ?? null,
        armour: e.outfit?.armour ?? {},
        dead: e.state.dead,
      }));
    },
    /** Every represented body (full and marker tiers). */
    get count() {
      return entries.size;
    },
    /** Bodies per presentation tier (review diagnostics). */
    tiers() {
      let full = 0,
        marker = 0;
      for (const e of entries.values())
        if (e.tier === "full") full++;
        else marker++;
      return { full, marker };
    },
    dispose() {
      if (disposed) return;
      for (const id of [...entries.keys()]) destroy(id);
      disposed = true;
      for (const t of tracers) t.mesh.dispose();
      tracers.length = 0;
      tracerMaterial.dispose();
      markerSource?.dispose();
      markerMaterial?.dispose();
      group.dispose();
    },
  };
}
