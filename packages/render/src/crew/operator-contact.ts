import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import profiles from "./operator-contact-profiles.json";
import { solveTwoBone } from "./voxel-ik";
import type { createVoxelCrewVisual } from "./voxel-crew";
import type { VoxelHeldItem } from "./voxel-held-item";

/** Scene-owned actual loaded-nav frame, matched to one coherent accepted association.
 * This is not a client authority flag or a public snapshot transform. */
export interface OperatorContactPlacement {
  profileId: string;
  navigationSha256: string;
  associationKey: string;
  navigationLocal: Matrix;
  acceptedX: number;
  acceptedY: number;
  standingElevationM: number;
}

function finiteFrame(matrix: Matrix) {
  if (
    !Array.from(matrix.m).every(Number.isFinite) ||
    Math.abs(matrix.determinant()) < 1e-8
  )
    throw new Error("Operator contact frame unavailable");
  const scale = new Vector3(),
    rotation = new Quaternion(),
    position = new Vector3();
  if (
    !matrix.decompose(scale, rotation, position) ||
    scale.asArray().some((value) => Math.abs(value - 1) > 1e-6)
  )
    throw new Error("Operator contact frame must be rigid");
  return { scale, rotation, position };
}

export function operatorItemStow(itemId: string, sha256: string) {
  const item = (
    profiles.items as Record<
      string,
      {
        sha256: string;
        translation: number[];
        rotationQuaternion: number[];
        placement: string;
      }
    >
  )[itemId];
  if (!item || item.sha256 !== sha256)
    throw new Error("Operator item profile unavailable");
  const matrix = Matrix.Compose(
    Vector3.One(),
    Quaternion.FromArray(item.rotationQuaternion),
    Vector3.FromArray(item.translation),
  );
  finiteFrame(matrix);
  return { matrix, placement: item.placement };
}

/** Applies the immutable b741 contact coordinates in its actually placed GLB scene frame.
 * The caller qualifies the actual activated ship and accepted mount before creating this handle. */
export function createOperatorContact(
  scene: Scene,
  stage: TransformNode,
  crew: Awaited<ReturnType<typeof createVoxelCrewVisual>>,
  held: VoxelHeldItem,
  placement: OperatorContactPlacement,
  associationKey: string,
  heldSource: { id: string; sha256: string } | null,
) {
  if (
    profiles.schema !== "sidereal.operator-contacts.v1" ||
    placement.profileId !== profiles.profileId ||
    placement.navigationSha256 !== profiles.navigationSha256 ||
    !associationKey ||
    placement.associationKey !== associationKey ||
    ![
      placement.acceptedX,
      placement.acceptedY,
      placement.standingElevationM,
    ].every(Number.isFinite)
  )
    throw new Error("Operator contact identity unavailable");
  // This immutable local frame was captured before loading; parent world motion is live.
  const local = placement.navigationLocal.clone();
  const transform = finiteFrame(local);
  if (
    Math.abs(transform.position.x - placement.acceptedX) > 1e-6 ||
    Math.abs(transform.position.z + placement.acceptedY) > 1e-6 ||
    Math.abs(transform.position.y - placement.standingElevationM) > 1e-6
  )
    throw new Error(
      "Operator accepted anchor disagrees with loaded navigation",
    );
  const stow = heldSource
    ? operatorItemStow(heldSource.id, heldSource.sha256)
    : null;
  if (held.itemId !== (heldSource?.id ?? null))
    throw new Error("Operator actual item disagrees with profile");
  const wrists = new Map(
    ["L", "R"].map((side) => {
      const upper = crew.joints.get(`upper_arm.${side}`),
        lower = crew.joints.get(`forearm.${side}`),
        end = crew.joints.get(`hand.${side}`);
      if (!upper || !lower || !end)
        throw new Error("Operator hand chain unavailable");
      const target = Matrix.FromArray(
        profiles.wristMatrices[side as "L" | "R"],
      );
      finiteFrame(target);
      return [side, { upper, lower, end, target }] as const;
    }),
  );
  stage.position.copyFrom(transform.position);
  stage.rotationQuaternion = transform.rotation;
  stage.scaling.copyFrom(transform.scale);
  crew.root.position.copyFrom(Vector3.FromArray(profiles.bodyTranslation));
  crew.root.rotationQuaternion = Quaternion.FromArray(
    profiles.bodyRotationQuaternion,
  );
  crew.setSeatContact(profiles.seatContact);
  // Establish full seated weights immediately, then resume ordinary distinct sit-idle phases.
  crew.update({ moving: false, seated: true, reducedMotion: true });
  crew.update({ moving: false, seated: true, reducedMotion: false });
  const token = Symbol("qualified-operator-contact");
  const stowRoot = new TransformNode("operator-owned-stow", scene);
  stowRoot.parent = stage;
  let itemScope: ReturnType<typeof held.claimOperatorStow>;
  try {
    itemScope = held.claimOperatorStow(
      token,
      heldSource?.id ?? null,
      stowRoot,
      stow?.matrix ?? Matrix.Identity(),
    );
  } catch (error) {
    stowRoot.dispose();
    throw error;
  }
  let poseScope: ReturnType<typeof crew.claimOperatorPose>;
  try {
    poseScope = crew.claimOperatorPose(token);
  } catch (error) {
    itemScope.release();
    stowRoot.dispose();
    throw error;
  }
  const originals = new Map<TransformNode, Quaternion | null>();
  let disposed = false;
  let residual = Infinity;
  let evaluated = false;
  let failure: Error | null = null;
  const evaluatedWaiters = new Set<{
    resolve(): void;
    reject(error: Error): void;
  }>();
  const finishWaiters = (error?: Error) => {
    for (const waiter of evaluatedWaiters)
      error ? waiter.reject(error) : waiter.resolve();
    evaluatedWaiters.clear();
  };
  const restore = () => {
    for (const [node, rotation] of originals)
      node.rotationQuaternion = rotation?.clone() ?? null;
    originals.clear();
  };
  const before = scene.onBeforeAnimationsObservable.add(() => {
    if (!disposed && !poseScope.frozen) restore();
  });
  const after = scene.onAfterAnimationsObservable.add(() => {
    if (disposed || poseScope.frozen) return;
    try {
      const rootInverse = crew.root.computeWorldMatrix(true).clone().invert();
      const frame = stage.computeWorldMatrix(true);
      residual = 0;
      for (const { upper, lower, end, target } of wrists.values()) {
        for (const node of [upper, lower, end])
          originals.set(node, node.rotationQuaternion?.clone() ?? null);
        const shoulder = upper
          .computeWorldMatrix(true)
          .multiply(rootInverse)
          .getTranslation();
        const [out, up, forward] = profiles.poleDirectionMagnitudes;
        const error = solveTwoBone(
          { root: crew.root, upper, lower, end, effector: end },
          target.multiply(frame),
          true,
          new Vector3(shoulder.x > 0 ? out : -out, up, forward),
        );
        residual = Math.max(residual, error);
        if (!Number.isFinite(error) || error > profiles.maximumHandResidualM)
          throw new Error("Operator hand target unreachable");
      }
      evaluated = true;
      finishWaiters();
    } catch (error) {
      failure =
        error instanceof Error
          ? error
          : new Error("Operator hand contact unavailable");
      poseScope.freeze();
      originals.clear();
      finishWaiters(failure);
    }
  });
  const rendered = scene.onAfterRenderObservable.add(() => {
    if (!disposed && evaluated && !failure && stage.isEnabled())
      poseScope.checkpoint();
  });
  return {
    get failure() {
      return failure;
    },
    get residual() {
      return residual;
    },
    get evaluated() {
      return evaluated;
    },
    async whenEvaluated(timeoutMs = 15000) {
      if (disposed) throw new Error("Operator contact withdrawn");
      if (failure) throw failure;
      if (evaluated) return;
      await new Promise<void>((resolve, reject) => {
        const waiter = {
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject: (error: Error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        const timer = setTimeout(() => {
          evaluatedWaiters.delete(waiter);
          reject(new Error("Operator contact evaluation unavailable"));
        }, timeoutMs);
        evaluatedWaiters.add(waiter);
      });
    },
    assertReady() {
      if (failure) throw failure;
      if (
        !evaluated ||
        !Number.isFinite(residual) ||
        residual > profiles.maximumHandResidualM
      )
        throw new Error("Operator contact has not evaluated");
    },
    setReducedMotion(reducedMotion: boolean) {
      if (!disposed) poseScope.setReducedMotion(reducedMotion);
    },
    get frozen() {
      return poseScope.frozen;
    },
    freeze() {
      if (disposed) return;
      poseScope.freeze();
      // The captured pose already includes the last evaluated contacts: never restore its pre-IK arms.
      originals.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      finishWaiters(new Error("Operator contact withdrawn"));
      scene.onBeforeAnimationsObservable.remove(before);
      scene.onAfterAnimationsObservable.remove(after);
      scene.onAfterRenderObservable.remove(rendered);
      restore();
      poseScope.release();
      itemScope.release();
      stowRoot.dispose();
    },
  };
}

export type OperatorContact = ReturnType<typeof createOperatorContact>;
