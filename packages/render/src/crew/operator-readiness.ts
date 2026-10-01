import type { OperatorContactPlacement } from "./operator-contact";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {
  createOperatorAssetTransaction,
  type OperatorAcceptedState,
  type OperatorAssetTicket,
} from "./operator-asset-transaction";
import {
  prepareOperatorEnsemble,
  verifyOperatorEnsemblePlan,
  type OperatorEnsemblePlan,
  type OperatorEnsembleRequest,
  type PreparedOperatorEnsemble,
} from "./operator-ensemble";
import {
  CHARACTER_EQUIPMENT_SLOTS,
  type EquippedCharacterComponents,
} from "@sidereal/content/character-components";
import type { CrewAppearance } from "./appearance";

/** Meaningful measured source mapping, fingerprinted with the renderer; not late registration DATA. */
export type OperatorPlanResolver = (
  packet: Readonly<Record<string, unknown>>,
  associationKey: string,
  requestedKey: string,
) => Promise<OperatorEnsemblePlan>;
/** Uses only the coherent packet's actual pinned visual fields; no seed/current item lookup. */
export function operatorRequestedLook(
  packet: Readonly<Record<string, unknown>>,
) {
  if (
    !packet.appearance ||
    typeof packet.appearance !== "object" ||
    Array.isArray(packet.appearance) ||
    !Array.isArray(packet.visuals)
  )
    throw new Error("Operator requested look unavailable");
  const components: EquippedCharacterComponents = {},
    seen = new Set<string>();
  let heldItem: string | null = null;
  for (const entry of packet.visuals) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.slot !== "string" ||
      seen.has(entry.slot) ||
      typeof entry.definitionId !== "string" ||
      !operatorRevision(entry.definitionRevision)
    )
      throw new Error("Operator requested slot unavailable");
    seen.add(entry.slot);
    if (entry.slot === "hand") {
      if (typeof entry.crewItemId !== "string" || !entry.crewItemId)
        throw new Error("Operator requested hand unavailable");
      heldItem = entry.crewItemId;
    } else {
      const slot = CHARACTER_EQUIPMENT_SLOTS.find(
        (slot) => slot === entry.slot,
      );
      const id = entry.wardrobeId ?? entry.characterComponentId;
      if (!slot || typeof id !== "string" || !id)
        throw new Error("Operator requested worn visual unavailable");
      components[slot] = id;
    }
  }
  return {
    heldItem,
    appearance: {
      ...packet.appearance,
      equippedComponents: components,
      weapon: "none",
      weaponFixture: false,
      backpack: seen.has("back"),
      backpackStyle: "utility",
    } as CrewAppearance,
  };
}
export function verifiedOperatorResolver(
  scene: Scene,
  resolve: OperatorPlanResolver | undefined,
) {
  return async (
    packet: Readonly<Record<string, unknown>>,
    associationKey: string,
    requestedKey: string,
  ) => {
    if (!resolve) throw new Error("Operator measured asset plan unavailable");
    const plan = await resolve(packet, associationKey, requestedKey);
    if (
      plan.associationKey !== associationKey ||
      plan.requestedKey !== requestedKey
    )
      throw new Error("Operator current asset plan unavailable");
    const requested = operatorRequestedLook(packet);
    const look = { ...plan.appearance };
    delete look.headArtRevision;
    if (
      plan.heldItem !== requested.heldItem ||
      operatorCanonical(look) !== operatorCanonical(requested.appearance)
    )
      throw new Error("Operator pinned look source plan mismatch");
    return verifyOperatorEnsemblePlan(scene, plan);
  };
}

export interface OperatorReadinessSignal {
  blocked: boolean;
  error: string | null;
}

/** Public fields from ONE filtered current_interior_crew row, including its NULL epoch. */
export interface OperatorInteriorRow {
  characterId: string;
  shipId: string;
  deckId: string;
  visitId: string;
  locationRevision: string;
  localX: number;
  localY: number;
  standingElevationM: number;
  connected: boolean;
  dead: boolean;
  operatorPoseState: "none" | "occupied" | "recovering";
  operatorSnapshot?: string;
}
/** Supplied by the scene's actually activated verified ship handle; never a query or server flag. */
export interface OperatorActivatedCapability {
  profileId: string;
  certificateSha256: string;
  proofSha256: string;
  manifestSha256: string;
  compilerSha256: string;
  geometrySha256: string;
  navigationSha256: string;
  mountSourceId: string;
}
const operatorArtifactFields = [
  "profileId",
  "certificateSha256",
  "proofSha256",
  "manifestSha256",
  "compilerSha256",
  "geometrySha256",
  "navigationSha256",
  "mountSourceId",
] as const;
function operatorRevision(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value))
    return false;
  return BigInt(value) <= 18446744073709551615n;
}
function operatorCanonical(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(operatorCanonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${operatorCanonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
/** No activation follows from this match; actual resource preparation still owns completeness. */
export function operatorProjection(
  row: OperatorInteriorRow,
  capability: OperatorActivatedCapability | null,
) {
  if (!capability) return null;
  if (
    !row.characterId ||
    !row.shipId ||
    !row.deckId ||
    !row.visitId ||
    !operatorRevision(row.locationRevision) ||
    ![row.localX, row.localY, row.standingElevationM].every(Number.isFinite)
  )
    return null;
  const state: OperatorAcceptedState = {
    associationKey: JSON.stringify([
      row.characterId,
      row.shipId,
      row.deckId,
      row.visitId,
      ...operatorArtifactFields.map((field) => capability[field]),
    ]),
    pose: row.operatorPoseState,
    dead: row.dead,
    connected: row.connected,
    acceptedX: row.localX,
    acceptedY: row.localY,
  };
  if (
    row.operatorPoseState !== "occupied" ||
    row.dead ||
    !row.connected ||
    !row.operatorSnapshot
  )
    return {
      state,
      packet: null,
      requestedKey: null,
      status: "withdrawn" as const,
    };
  if (row.operatorSnapshot.length > 65536)
    return {
      state,
      packet: null,
      requestedKey: null,
      status: "withdrawn" as const,
    };
  let packet: Record<string, unknown>;
  try {
    packet = JSON.parse(row.operatorSnapshot);
  } catch {
    return {
      state,
      packet: null,
      requestedKey: null,
      status: "withdrawn" as const,
    };
  }
  if (
    !packet ||
    typeof packet !== "object" ||
    Array.isArray(packet) ||
    packet.version !== 1 ||
    operatorArtifactFields.some(
      (field) => packet[field] !== capability[field],
    ) ||
    packet.characterId !== row.characterId ||
    packet.instanceId !== row.shipId ||
    packet.deckId !== row.deckId ||
    packet.visitId !== row.visitId ||
    packet.locationRevision !== row.locationRevision ||
    packet.pose !== row.operatorPoseState ||
    packet.dead !== row.dead ||
    packet.connected !== row.connected ||
    packet.acceptedX !== row.localX ||
    packet.acceptedY !== row.localY ||
    packet.standingElevationM !== row.standingElevationM ||
    [
      "instanceRevision",
      "bindingRevision",
      "mappingRevision",
      "seatRevision",
    ].some((field) => !operatorRevision(packet[field])) ||
    ["stationId", "seatPlacedObjectId", "consolePlacedObjectId"].some(
      (field) => typeof packet[field] !== "string" || !packet[field],
    )
  )
    return {
      state,
      packet: null,
      requestedKey: null,
      status: "withdrawn" as const,
    };
  // Equal location revision is not a wardrobe/pose epoch: every public pinned field participates.
  const requestedKey = operatorCanonical(packet);
  if (
    packet.status !== "supported" ||
    !Array.isArray(packet.visuals) ||
    !packet.appearance ||
    typeof packet.appearance !== "object" ||
    Array.isArray(packet.appearance)
  )
    return {
      state,
      packet,
      requestedKey,
      status: "visual-unavailable" as const,
    };
  return { state, packet, requestedKey, status: "supported" as const };
}
export function createOperatorReadiness(
  onChange?: (signal: OperatorReadinessSignal) => void,
) {
  type Status = {
    generation: number;
    pending: boolean;
    hasComplete: boolean;
    error: boolean;
    owner: object;
  };
  const actors = new Map<string, Status>();
  let previous = "";
  const emit = () => {
    const values = [...actors.values()];
    const signal = {
      blocked: values.some(
        (value) => value.error || (value.pending && !value.hasComplete),
      ),
      error: values.some((value) => value.error)
        ? "Crew equipment unavailable"
        : null,
    };
    const key = JSON.stringify(signal);
    if (key !== previous) {
      previous = key;
      onChange?.(signal);
    }
  };
  return {
    claim(actor: string) {
      const owner = {};
      let closed = false;
      actors.set(actor, {
        generation: 0,
        pending: false,
        hasComplete: false,
        error: false,
        owner,
      });
      emit();
      return {
        update(
          generation: number,
          status: { pending: boolean; hasComplete: boolean; error: boolean },
        ) {
          const current = actors.get(actor);
          if (
            closed ||
            current?.owner !== owner ||
            generation < current.generation
          )
            return;
          actors.set(actor, { generation, ...status, owner });
          emit();
        },
        cancel(generation: number) {
          const current = actors.get(actor);
          if (
            closed ||
            current?.owner !== owner ||
            generation < current.generation
          )
            return;
          actors.set(actor, {
            generation,
            pending: false,
            hasComplete: false,
            error: false,
            owner,
          });
          emit();
        },
        dispose() {
          if (closed) return;
          closed = true;
          if (actors.get(actor)?.owner === owner) {
            actors.delete(actor);
            emit();
          }
        },
      };
    },
    dispose() {
      actors.clear();
      emit();
    },
  };
}

/** Qualified-only owner; its caller must match the current actual scene capability first. */
export function createOperatorEnsembleOwner(
  scene: Scene,
  parent: TransformNode,
  actorId: string,
  readiness: ReturnType<typeof createOperatorReadiness>,
  options: {
    prepare?: typeof prepareOperatorEnsemble;
    configureMeshes?: (meshes: readonly AbstractMesh[]) => void;
    contactPlacement?: (
      row: OperatorInteriorRow,
      capability: OperatorActivatedCapability,
      associationKey: string,
    ) => OperatorContactPlacement | null;
    onCommitted?: (handle: PreparedOperatorEnsemble) => void;
    restoreAtAcceptedRecovery?: (
      handle: PreparedOperatorEnsemble,
      xy: readonly [number, number],
      adoptOrdinary?: () => void,
    ) => void;
  } = {},
) {
  const signal = readiness.claim(actorId);
  let transferredOrdinary: PreparedOperatorEnsemble | null = null;
  let adoptionError = false;
  const adoptOrdinary = (
    ordinary: PreparedOperatorEnsemble,
    xy: readonly [number, number],
  ) => {
    options.restoreAtAcceptedRecovery?.(ordinary, xy, () => {
      if (transferredOrdinary === ordinary) transferredOrdinary = null;
    });
    if (transferredOrdinary === ordinary)
      throw new Error("Ordinary ensemble ownership not adopted");
    adoptionError = false;
  };
  const transaction = createOperatorAssetTransaction({
    restoreAtAcceptedRecovery: (handle, xy, receipt) => {
      const physical = handle as PreparedOperatorEnsemble;
      const ordinary = physical.ordinaryBaseline;
      if (!ordinary) {
        if (physical.contact)
          throw new Error("Operator ordinary ensemble unavailable");
        options.restoreAtAcceptedRecovery?.(physical, xy);
        return;
      }
      if (!currentRow || currentRow.operatorPoseState !== "none")
        throw new Error("Operator current recovery row unavailable");
      ordinary.root.position.set(xy[0], currentRow.standingElevationM, -xy[1]);
      ordinary.crew.update({
        moving: false,
        seated: false,
        dead: currentRow.dead,
      });
      ordinary.activate();
      // Activation may synchronously supersede this accepted row. Never transfer a stale ordinary body.
      try {
        receipt.assertCurrent();
      } catch (error) {
        if (!ordinary.root.isDisposed()) ordinary.root.setEnabled(false);
        throw error;
      }
      physical.releaseOrdinaryBaseline!(ordinary);
      transferredOrdinary = ordinary;
      receipt.transfer();
      try {
        adoptOrdinary(ordinary, xy);
      } catch (error) {
        adoptionError = transferredOrdinary === ordinary;
        throw error;
      }
    },
  });
  let generation = 0;
  let currentKey: string | null = null;
  let accepted: OperatorAcceptedState | null = null;
  let projectionEpoch: { associationKey: string; revision: bigint } | null =
    null;
  let currentRow: OperatorInteriorRow | null = null;
  let disposed = false;
  let currentPlacement: OperatorContactPlacement | null = null;
  let withdrawalKey: string | null = null;
  let recoveryAttempt: {
    key: string;
    configurationKey: string;
    cancel?: () => void;
  } | null = null;
  const cancelRecovery = () => {
    recoveryAttempt?.cancel?.();
    recoveryAttempt = null;
  };
  const queued = new Map<PreparedOperatorEnsemble, () => void>();
  const publish = () =>
    signal.update(generation, {
      pending: transaction.pending,
      hasComplete: !!transaction.committed || !!transferredOrdinary,
      error:
        adoptionError ||
        !!transaction.error ||
        !!(transaction.committed as PreparedOperatorEnsemble | null)?.contact
          ?.failure,
    });
  const contactStatus = scene.onBeforeRenderObservable.add(() => {
    if (disposed) return;
    if (
      currentKey &&
      (transaction.committed as PreparedOperatorEnsemble | null)?.contact
        ?.failure
    )
      publish();
    const physical = transaction.committed as PreparedOperatorEnsemble | null;
    if (
      accepted?.pose === "none" &&
      transaction.error &&
      physical?.ordinaryBaseline &&
      withdrawalKey &&
      !recoveryAttempt?.cancel
    ) {
      try {
        physical.ordinaryBaseline.checkActivation();
        queueRecoveryTransfer(physical, withdrawalKey, generation);
      } catch {
        retryOrdinaryRecovery(withdrawalKey);
      }
    }
  });
  const cancelQueued = () => {
    for (const [handle, cancel] of queued) {
      cancel();
      handle.dispose();
    }
    queued.clear();
  };
  const enqueue = (
    ticket: OperatorAssetTicket,
    handle: PreparedOperatorEnsemble,
    epoch: number,
  ) => {
    const observer = scene.onBeforeAnimationsObservable.addOnce(() => {
      queued.delete(handle);
      if (disposed || generation !== epoch) {
        handle.dispose();
        return;
      }
      let committed = false;
      try {
        try {
          committed = transaction.complete(ticket, handle);
        } catch {
          // Old resource cleanup may throw after the complete swap; still transfer controller ownership.
          committed = transaction.committed === handle;
          transaction.fail(ticket, "Crew equipment unavailable");
        }
        if (
          committed &&
          !disposed &&
          generation === epoch &&
          transaction.committed === handle
        )
          options.onCommitted?.(handle);
      } catch {
        transaction.fail(ticket, "Crew equipment unavailable");
      } finally {
        publish();
      }
    });
    queued.set(handle, () =>
      scene.onBeforeAnimationsObservable.remove(observer),
    );
  };
  const queueRecoveryTransfer = (
    physical: PreparedOperatorEnsemble,
    key: string,
    epoch: number,
  ) => {
    if (
      disposed ||
      generation !== epoch ||
      withdrawalKey !== key ||
      transaction.committed !== physical ||
      accepted?.pose !== "none" ||
      recoveryAttempt?.cancel
    )
      return;
    const attempt = recoveryAttempt ?? {
      key,
      configurationKey: physical.ordinaryBaseline?.activationKey() ?? "",
    };
    recoveryAttempt = attempt;
    const observer = scene.onBeforeAnimationsObservable.addOnce(() => {
      attempt.cancel = undefined;
      if (
        disposed ||
        generation !== epoch ||
        recoveryAttempt !== attempt ||
        withdrawalKey !== key ||
        transaction.committed !== physical ||
        accepted?.pose !== "none"
      )
        return;
      transaction.accept(accepted);
      if (transaction.error) physical.contact?.freeze();
      publish();
    });
    attempt.cancel = () => scene.onBeforeAnimationsObservable.remove(observer);
  };
  const retryOrdinaryRecovery = (key: string) => {
    const physical = transaction.committed as PreparedOperatorEnsemble | null;
    const ordinary = physical?.ordinaryBaseline;
    if (!ordinary || accepted?.pose !== "none") return;
    const configurationKey = ordinary.activationKey();
    if (
      recoveryAttempt?.key === key &&
      recoveryAttempt.configurationKey === configurationKey
    )
      return;
    cancelRecovery();
    const attempt = { key, configurationKey } as {
      key: string;
      configurationKey: string;
      cancel?: () => void;
    };
    recoveryAttempt = attempt;
    const epoch = generation;
    void ordinary
      .prepareActivation()
      .then(() => {
        if (
          disposed ||
          generation !== epoch ||
          recoveryAttempt !== attempt ||
          withdrawalKey !== key ||
          transaction.committed !== physical ||
          accepted?.pose !== "none"
        )
          return;
        queueRecoveryTransfer(physical!, key, epoch);
      })
      .catch(() => {
        // Same-key flags may become ready later: the normal render check can retry a real ready draw.
        if (!disposed && generation === epoch && recoveryAttempt === attempt)
          publish();
      });
  };
  const begin = (
    state: OperatorAcceptedState,
    requestedKey: string | null,
    resolve: (() => Promise<OperatorEnsembleRequest>) | null,
    unavailable: boolean,
  ) => {
    if (disposed) return;
    if (
      transferredOrdinary &&
      accepted?.associationKey !== state.associationKey
    ) {
      transferredOrdinary.dispose();
      transferredOrdinary = null;
      adoptionError = false;
    }
    accepted = { ...state };
    if (transferredOrdinary && state.pose === "none" && currentRow) {
      const ordinary = transferredOrdinary;
      try {
        ordinary.root.position.set(
          state.acceptedX,
          currentRow.standingElevationM,
          -state.acceptedY,
        );
        ordinary.crew.update({
          moving: false,
          seated: false,
          dead: currentRow.dead,
        });
        ordinary.activate();
        adoptOrdinary(ordinary, [state.acceptedX, state.acceptedY]);
      } catch {
        adoptionError = transferredOrdinary === ordinary;
      }
    }
    transaction.accept(state);
    if (
      (transaction.error || state.pose !== "none") &&
      (!requestedKey ||
        unavailable ||
        state.pose !== "occupied" ||
        state.dead ||
        !state.connected)
    )
      (
        transaction.committed as PreparedOperatorEnsemble | null
      )?.contact?.freeze();
    if (
      !requestedKey ||
      state.pose !== "occupied" ||
      state.dead ||
      !state.connected
    ) {
      const nextWithdrawal = operatorCanonical([state, currentRow]);
      if (nextWithdrawal !== withdrawalKey) {
        generation++;
        cancelRecovery();
      }
      withdrawalKey = nextWithdrawal;
      currentKey = null;
      if (!transaction.error) transaction.invalidate();
      cancelQueued();
      if (transaction.error || adoptionError) {
        publish();
        retryOrdinaryRecovery(nextWithdrawal);
      } else {
        cancelRecovery();
        signal.cancel(generation);
      }
      return;
    }
    withdrawalKey = null;
    cancelRecovery();
    const key = JSON.stringify([
      state.associationKey,
      requestedKey,
      unavailable,
    ]);
    if (key === currentKey) {
      publish();
      return;
    }
    generation++;
    currentKey = key;
    cancelQueued();
    const epoch = generation,
      associationKey = state.associationKey;
    const placement = currentPlacement && {
      ...currentPlacement,
      navigationLocal: currentPlacement.navigationLocal.clone(),
    };
    const ticket = transaction.request(requestedKey);
    if (unavailable || !resolve) {
      transaction.fail(ticket, "Crew equipment unavailable");
      publish();
      return;
    }
    // Descriptor verification is part of this same requested generation, including late-first.
    publish();
    void Promise.resolve()
      .then(resolve)
      .then(async (request) => {
        if (disposed || epoch !== generation) return;
        if (
          request.requestedKey !== requestedKey ||
          request.associationKey !== associationKey
        )
          throw new Error("Operator current asset request unavailable");
        const handle = await (options.prepare ?? prepareOperatorEnsemble)(
          scene,
          parent,
          request,
          undefined,
          options.configureMeshes,
          placement ?? undefined,
        );
        if (disposed || epoch !== generation) {
          handle.dispose();
          return;
        }
        try {
          await handle.prepareActivation();
        } catch {
          handle.dispose();
          if (epoch === generation && !disposed) {
            transaction.fail(ticket, "Crew equipment unavailable");
            publish();
          }
          return;
        }
        if (disposed || epoch !== generation) {
          handle.dispose();
          return;
        }
        enqueue(ticket, handle, epoch);
      })
      .catch(() => {
        if (!disposed && epoch === generation) {
          transaction.fail(ticket, "Crew equipment unavailable");
          publish();
        }
      });
  };
  return {
    sync(
      state: OperatorAcceptedState,
      request: OperatorEnsembleRequest | null,
      unavailableKey?: string,
    ) {
      begin(
        state,
        unavailableKey ?? request?.requestedKey ?? null,
        request ? async () => request : null,
        !!unavailableKey,
      );
    },
    /** The current row and actual scene capability qualify together before any resource fetch. */
    syncProjection(
      row: OperatorInteriorRow,
      capability: OperatorActivatedCapability | null,
      resolve: (
        packet: Readonly<Record<string, unknown>>,
        associationKey: string,
        requestedKey: string,
      ) => Promise<OperatorEnsembleRequest>,
    ) {
      const projection = operatorProjection(row, capability);
      if (!projection) {
        this.withdraw();
        return false;
      }
      const { state, packet, requestedKey, status } = projection;
      const revision = BigInt(row.locationRevision);
      if (
        projectionEpoch?.associationKey === state.associationKey &&
        revision < projectionEpoch.revision
      )
        return false;
      // Revisions can reset on a genuinely new accepted visit; never compare unrelated visits.
      projectionEpoch = { associationKey: state.associationKey, revision };
      currentRow = { ...row };
      currentPlacement =
        status === "supported" && capability
          ? (options.contactPlacement?.(
              currentRow,
              capability,
              state.associationKey,
            ) ?? null)
          : null;
      if (
        options.contactPlacement &&
        status === "supported" &&
        !currentPlacement
      ) {
        begin(state, requestedKey, null, true);
        return true;
      }
      begin(
        state,
        requestedKey,
        packet && requestedKey
          ? () => resolve(packet, state.associationKey, requestedKey)
          : null,
        status === "visual-unavailable",
      );
      return true;
    },
    /** Occupied/recovering resources, including future docked item, survive candidate LOD demotion. */
    mayDemote() {
      return !transaction.committed && !transferredOrdinary;
    },
    get committed() {
      return transaction.committed as PreparedOperatorEnsemble | null;
    },
    get stationary() {
      return !!accepted && accepted.pose !== "none";
    },
    get ownsRequest() {
      return (
        currentKey !== null || !!transaction.committed || !!transferredOrdinary
      );
    },
    get transferredOrdinary() {
      return transferredOrdinary;
    },
    get currentRow() {
      return currentRow && { ...currentRow };
    },
    get qualifies() {
      return transaction.qualifiesCurrentRequest;
    },
    withdraw() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(contactStatus);
      generation++;
      currentRow = null;
      cancelRecovery();
      try {
        cancelQueued();
      } finally {
        try {
          transaction.withdraw();
        } finally {
          const ordinary = transferredOrdinary;
          transferredOrdinary = null;
          try {
            ordinary?.dispose();
          } finally {
            signal.dispose();
          }
        }
      }
    },
  };
}
