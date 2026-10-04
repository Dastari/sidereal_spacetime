import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/loaders/glTF";
import {
  SHIP_ACCESS_DOOR_PACK,
  shipAccessDoorVariant,
  snapshotShipAccessDoorPack,
  type ShipAccessDoorPack,
  type ShipAccessDoorVariant,
  type ShipAccessDoorPart,
  type ShipAccessDoorPiece,
} from "@sidereal/content/ship-access-doors";
import { readAuthoredGlb } from "./wayfarer-authored-study";
import { setMeshRole } from "../mesh-roles";
import type { PrefabDoorSpec } from "./doors";

export interface AuthoredAccessDoorPlacement {
  id: string;
  variant: ShipAccessDoorVariant;
  /** Accepted ship-local metres: X starboard, Y fore, height above ship datum. */
  center: readonly [number, number];
  normal: readonly [number, number];
  floorM: number;
}
export interface AuthoredAccessDoorState {
  /** Server-authorized open command, not a client proximity heuristic. */
  open: boolean;
  locked?: boolean;
}
export function accessDoorPlacements(
  specs: readonly PrefabDoorSpec[],
): AuthoredAccessDoorPlacement[] {
  return specs
    .filter((spec) => spec.exterior)
    .map((spec) => {
      const variant: ShipAccessDoorVariant =
        spec.kind === "blast"
          ? (`cargo.${spec.span}m` as ShipAccessDoorVariant)
          : "personnel";
      const source = shipAccessDoorVariant(variant);
      if (Math.abs(source.spanM - spec.span) > 1e-6)
        throw Error(`Access door span differs from authored pack: ${spec.id}`);
      return {
        id: spec.id,
        variant,
        center: [...spec.center],
        normal: [...spec.normal],
        floorM: 0.1875,
      };
    });
}

/** No generic scale-to-fit: every model keeps its authored dimensions. */
export function accessDoorMatrix(
  placement: AuthoredAccessDoorPlacement,
): Matrix {
  const { center, normal, floorM } = placement;
  if (
    !Array.isArray(center) ||
    center.length !== 2 ||
    !Array.isArray(normal) ||
    normal.length !== 2 ||
    ![...center, ...normal, floorM].every(Number.isFinite) ||
    Math.abs(Math.hypot(...normal) - 1) > 1e-6
  )
    throw Error("Invalid authored access door placement");
  // glTF +X spans the opening, +Y up, +Z points into the ship. Positive determinant.
  return Matrix.FromArray([
    normal[1],
    0,
    normal[0],
    0,
    0,
    1,
    0,
    0,
    -normal[0],
    0,
    normal[1],
    0,
    center[0],
    floorM,
    -center[1],
    1,
  ]);
}

const libraries = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();
async function sourcePart(
  scene: Scene,
  id: string,
  fetchBytes: (piece: ShipAccessDoorPiece) => Promise<Uint8Array>,
  pack: ShipAccessDoorPack,
) {
  let library = libraries.get(scene);
  if (!library) {
    library = new Map();
    libraries.set(scene, library);
  }
  const piece = pack.pieces.find((piece) => piece.id === id);
  if (!piece) throw Error(`Missing authored access door part: ${id}`);
  // Snapshot the trusted pin before caller code runs. A resolver receives metadata,
  // never the mutable catalogue object or its nested arrays.
  const expectedSha = piece.sha256;
  const request: ShipAccessDoorPiece = Object.freeze({
    ...piece,
    boundsMin: Object.freeze([...piece.boundsMin]),
    boundsMax: Object.freeze([...piece.boundsMax]),
  });
  const cacheKey = `${id}:${expectedSha}`;
  let pending = library.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const bytes = Uint8Array.from(await fetchBytes(request));
      if (scene.isDisposed) throw Error("Authored access door load cancelled");
      readAuthoredGlb(bytes, expectedSha);
      const container = await LoadAssetContainerAsync(bytes, scene, {
        pluginExtension: ".glb",
      });
      if (scene.isDisposed) {
        container.dispose();
        throw Error("Authored access door load cancelled");
      }
      scene.onDisposeObservable.addOnce(() => container.dispose());
      return container;
    })();
    library.set(cacheKey, pending);
    pending.catch(() => {
      if (library!.get(cacheKey) === pending) library!.delete(cacheKey);
    });
  }
  return pending;
}

/** Additive renderer for a qualified doorway. It never writes collision, pressure or commands.
 * Callers must supply only placements/state they are authorized to see; absent state closes.
 * The proposed pack is not selected by the default game presentation until exact art/profile review. */
export async function loadAuthoredAccessDoors(
  scene: Scene,
  parent: TransformNode,
  placements: readonly AuthoredAccessDoorPlacement[],
  options: {
    fetchBytes: (piece: ShipAccessDoorPiece) => Promise<Uint8Array>;
    pack?: ShipAccessDoorPack;
  },
) {
  if (!options || typeof options.fetchBytes !== "function")
    throw Error(
      "Authored access doors require an explicit byte resolver; proposal assets are unpublished",
    );
  if (!scene.useRightHandedSystem)
    throw Error("Authored access doors require the game frame");
  const pack = snapshotShipAccessDoorPack(
    options.pack ?? SHIP_ACCESS_DOOR_PACK,
  );
  const parentMatrix = parent.computeWorldMatrix(true);
  const values = parentMatrix.asArray();
  const bases = [0, 4, 8].map((offset) => [
    values[offset],
    values[offset + 1],
    values[offset + 2],
  ]);
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  if (
    !values.every(Number.isFinite) ||
    Math.abs(parentMatrix.determinant() - 1) > 1e-6 ||
    bases.some((basis) => Math.abs(dot(basis, basis) - 1) > 1e-6) ||
    Math.abs(dot(bases[0], bases[1])) > 1e-6 ||
    Math.abs(dot(bases[0], bases[2])) > 1e-6 ||
    Math.abs(dot(bases[1], bases[2])) > 1e-6
  )
    throw Error(
      "Authored access doors require a rigid, unit-scale, unreflected parent",
    );
  const ids = new Set<string>();
  for (const placement of placements) {
    if (!placement.id || ids.has(placement.id))
      throw Error("Duplicate authored access door identity");
    ids.add(placement.id);
    shipAccessDoorVariant(placement.variant, pack);
    accessDoorMatrix(placement);
  }
  const rows: {
    id: string;
    root: TransformNode;
    leaves: { node: TransformNode; direction: number }[];
    open: number;
    stroke: number;
  }[] = [];
  const entries: ReturnType<AssetContainer["instantiateModelsToScene"]>[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.onDisposeObservable.remove(observer);
    for (const entry of entries) entry.dispose();
    for (const row of rows) row.root.dispose();
  };
  const observer = scene.onDisposeObservable.addOnce(dispose);
  try {
    for (const placement of placements) {
      const variant = shipAccessDoorVariant(placement.variant, pack);
      const parts: ShipAccessDoorPart[] =
        variant.motion === "single-sliding"
          ? ["frame", "leaf"]
          : ["frame", "left", "right"];
      const sources = await Promise.all(
        parts.map((part) =>
          sourcePart(
            scene,
            (variant.parts as Partial<Record<ShipAccessDoorPart, string>>)[
              part
            ]!,
            options.fetchBytes,
            pack,
          ),
        ),
      );
      if (disposed || parent.isDisposed() || scene.isDisposed)
        throw Error("Authored access door load cancelled");
      const root = new TransformNode(`access-door:${placement.id}`, scene);
      root.parent = parent;
      root.setPreTransformMatrix(accessDoorMatrix(placement));
      const leaves: { node: TransformNode; direction: number }[] = [];
      rows.push({
        id: placement.id,
        root,
        leaves,
        open: 0,
        stroke: variant.strokeM,
      });
      for (let i = 0; i < sources.length; i++) {
        const part = parts[i];
        const group = new TransformNode(
          `access-door:${placement.id}:${part}`,
          scene,
        );
        group.parent = root;
        const entry = sources[i].instantiateModelsToScene(
          (name) => `access-door:${placement.id}:${part}:${name}`,
          false,
        );
        entries.push(entry);
        for (const node of entry.rootNodes) node.parent = group;
        for (const mesh of group.getChildMeshes()) {
          mesh.isPickable = false;
          setMeshRole(mesh, "equipment");
          mesh.metadata = {
            ...mesh.metadata,
            authoredAccessDoor: {
              id: placement.id,
              variant: placement.variant,
              part,
              revision: pack.revision,
            },
          };
        }
        if (part !== "frame")
          leaves.push({
            node: group,
            direction:
              part === "leaf"
                ? (variant.leafDirection ?? -1)
                : part === "right"
                  ? 1
                  : -1,
          });
      }
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    update(
      states: ReadonlyMap<string, AuthoredAccessDoorState> | undefined,
      dt: number,
    ) {
      if (disposed) return;
      if (!Number.isFinite(dt) || dt < 0)
        throw Error("Invalid authored door frame time");
      for (const row of rows) {
        const state = states?.get(row.id);
        const target = state?.open && !state.locked ? 1 : 0;
        // Unknown/revoked state is never retained as an open visual across a grant change.
        row.open =
          state === undefined
            ? 0
            : Math.max(
                0,
                Math.min(
                  1,
                  row.open + (Math.sign(target - row.open) * dt) / 0.7,
                ),
              );
        if (target > 0) row.open = Math.min(target, row.open);
        else row.open = Math.max(target, row.open);
        for (const leaf of row.leaves)
          leaf.node.position.x = leaf.direction * row.stroke * row.open;
      }
    },
    states: () => rows.map((row) => ({ id: row.id, open: row.open })),
    meshes: (): AbstractMesh[] =>
      rows.flatMap((row) => row.root.getChildMeshes()),
    setEnabled: (enabled: boolean) =>
      rows.forEach((row) => row.root.setEnabled(enabled)),
    dispose,
  };
}
