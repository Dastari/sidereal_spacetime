import { setMeshRole } from "./mesh-roles";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import { constructionHash } from "@sidereal/sim/construction-transactions";

const GLB_SHA =
  "c65a2c6273e8773956e555ea26879b8b4d0d58d483e42eef94b55c8052e75092";
export interface NativeSealBinding {
  openingId: string;
  /** Exact original doorway module frame and its existing physical leaf hinge. */
  frame: TransformNode;
  hinge: TransformNode;
}
/** Staged r002 adapter. Caller supplies exact bytes and existing physical hinges.
 * It neither creates a second hinge nor assigns leaf rotation independently. Native
 * contact acceptance and server sequencing are required before gameplay installation. */
export async function loadConstructionDoorSeals(
  scene: Scene,
  bytes: Uint8Array,
  bindings: readonly NativeSealBinding[],
) {
  if (!scene.useRightHandedSystem)
    throw Error("Native gasket requires right-handed frame");
  if (constructionHash(bytes) !== GLB_SHA)
    throw Error("Native gasket GLB hash mismatch");
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (
      !binding.openingId ||
      seen.has(binding.openingId) ||
      binding.frame.getScene() !== scene ||
      binding.hinge.getScene() !== scene ||
      binding.hinge.parent !== binding.frame
    )
      throw Error("Invalid native seal binding");
    if (
      Math.abs(binding.hinge.position.x - 0.3125) > 1e-9 ||
      Math.abs(binding.hinge.position.y) > 1e-9 ||
      Math.abs(binding.hinge.position.z - 0.0625) > 1e-9
    )
      throw Error("Native seal hinge bind mismatch");
    seen.add(binding.openingId);
  }
  const imported = await SceneLoader.ImportMeshAsync(
    "",
    "",
    bytes,
    scene,
    undefined,
    ".glb",
  );
  const sources = imported.meshes
    .map((m) => setMeshRole(m, "wall"))
    .filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  const matrices = new Map(
    sources.map((m) => [m, m.computeWorldMatrix(true).clone()]),
  );
  imported.meshes.forEach((m) => {
    m.isVisible = false;
    m.isPickable = false;
  });
  const ring = sources.filter((m) =>
    m.name.startsWith("GEO-door-perimeter-seal--surface"),
  );
  const seats = sources.filter((m) =>
    m.name.startsWith("GEO-door-frame-seal-seat--surface"),
  );
  if (
    ring.length !== 1 ||
    seats.length !== 1 ||
    ring[0].morphTargetManager?.numTargets !== 1 ||
    ring[0].morphTargetManager.getTarget(0).name !== "SealRetracted"
  )
    throw Error("Native gasket selectors/morph missing");
  const inverseBind = Matrix.Translation(-0.3125, 0, -0.0625);
  const entries = bindings.map((binding) => {
    const clone = (source: Mesh, moving: boolean) => {
      const mesh = source.clone(
        `gasket:${binding.openingId}:${source.name}`,
        moving ? binding.hinge : binding.frame,
        true,
      )!;
      const transform = moving
        ? matrices.get(source)!.multiply(inverseBind)
        : matrices.get(source)!;
      const rotation = new Quaternion();
      transform.decompose(mesh.scaling, rotation, mesh.position);
      mesh.rotationQuaternion = rotation;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.isVisible = !moving;
      mesh.metadata = {
        constructionSeal: true,
        role: "wall",
        openingId: binding.openingId,
        nativeRevision: "r002",
        pressureReady: false,
      };
      if (moving) {
        mesh.morphTargetManager = source.morphTargetManager!.clone();
        mesh.morphTargetManager.getTarget(0).influence = 1;
      }
      return mesh;
    };
    return {
      ...binding,
      ring: clone(ring[0], true),
      seats: clone(seats[0], false),
    };
  });
  return {
    entries,
    /** Unknown, invalid or unsynchronized state hides moving gasket; it cannot
     * appear deployed using the source export's default weight0. */
    setStates(
      states: readonly {
        openingId: string;
        hingeFraction: number;
        sealRetraction: number;
      }[],
    ) {
      const byId = new Map(states.map((s) => [s.openingId, s]));
      for (const entry of entries) {
        const state = byId.get(entry.openingId);
        const valid =
          !!state &&
          [state.hingeFraction, state.sealRetraction].every(
            (n) => Number.isFinite(n) && n >= 0 && n <= 1,
          ) &&
          (state.hingeFraction === 0 || state.sealRetraction === 1) &&
          Math.abs(
            entry.hinge.rotation.y + (state.hingeFraction * Math.PI) / 2,
          ) < 1e-9;
        entry.ring.isVisible = valid;
        entry.ring.morphTargetManager!.getTarget(0).influence = valid
          ? state!.sealRetraction
          : 1;
      }
    },
    dispose() {
      for (const entry of entries) {
        const manager = entry.ring.morphTargetManager;
        entry.ring.dispose();
        manager?.dispose();
        entry.seats.dispose();
      }
      const sourceManagers = new Set(
        sources
          .map((mesh) => mesh.morphTargetManager)
          .filter((manager) => manager !== null),
      );
      for (const mesh of imported.meshes) mesh.dispose(false, true);
      for (const manager of sourceManagers) manager.dispose();
      for (const node of imported.transformNodes) node.dispose();
    },
  };
}
