import { createOperationId } from "./operation-id";
import { sharedWorldJoinDecision } from "./shared-world-review";

type DecisionInput = Parameters<typeof sharedWorldJoinDecision>[0];
export interface SharedJoinContext extends DecisionInput {
  /** Verified connection identity and configured database; never tokens or names. */
  identity: string;
  database: string;
}
export interface SharedJoinRequest {
  characterId: string;
  shipId: string;
  expectedShipRevision: bigint;
  expectedAdmissionRevision: bigint;
  operationId: string;
}
export interface SharedJoinJournal {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}
export interface SharedJoinActionState {
  phase: "idle" | "pending" | "submitted" | "admitted" | "blocked" | "error";
  message: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const u64 = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(0|[1-9][0-9]{0,19})$/.test(value) &&
  BigInt(value) < 2n ** 64n;
export function sharedJoinJournalKey(
  context: Pick<SharedJoinContext, "database" | "identity">,
) {
  if (!context.database || !/^[0-9a-f]{64}$/i.test(context.identity))
    throw Error("Verified account connection required.");
  return (
    "sidereal.shared-join.v1:" +
    JSON.stringify([context.database, context.identity.toLowerCase()])
  );
}
export function encodeSharedJoinRequest(request: SharedJoinRequest): string {
  return JSON.stringify({
    ...request,
    expectedShipRevision: String(request.expectedShipRevision),
    expectedAdmissionRevision: String(request.expectedAdmissionRevision),
  });
}
export function decodeSharedJoinRequest(
  text: string,
): SharedJoinRequest | undefined {
  try {
    const row = JSON.parse(text);
    if (
      !row ||
      typeof row !== "object" ||
      ![row.characterId, row.shipId, row.operationId].every(
        (value) => typeof value === "string" && uuid.test(value),
      ) ||
      !u64(row.expectedShipRevision) ||
      !u64(row.expectedAdmissionRevision)
    )
      return;
    return {
      characterId: row.characterId,
      shipId: row.shipId,
      operationId: row.operationId,
      expectedShipRevision: BigInt(row.expectedShipRevision),
      expectedAdmissionRevision: BigInt(row.expectedAdmissionRevision),
    };
  } catch {
    return;
  }
}

/** Explicit user action only. Persist the operation before sending so an uncertain
 * response can be retried identically after socket renewal or page reload. */
export function createSharedWorldJoinAction(options: {
  readContext(): SharedJoinContext;
  journal: SharedJoinJournal;
  send(request: SharedJoinRequest): Promise<unknown>;
  operationId?: () => string;
}) {
  let disposed = false;
  let inFlight: Promise<SharedJoinActionState> | undefined;
  let snapshot: SharedJoinActionState = { phase: "idle", message: "" };
  const listeners = new Set<() => void>();
  function set(phase: SharedJoinActionState["phase"], message: string) {
    if (
      !disposed &&
      (phase !== snapshot.phase || message !== snapshot.message)
    ) {
      snapshot = Object.freeze({ phase, message });
      for (const listener of [...listeners]) listener();
    }
    return snapshot;
  }
  async function perform(): Promise<SharedJoinActionState> {
    try {
      const context = options.readContext();
      const decision = sharedWorldJoinDecision(context);
      if (decision.kind === "blocked") return set("blocked", decision.reason);
      const key = sharedJoinJournalKey(context);
      if (decision.kind === "admitted") {
        options.journal.remove(key);
        return set("admitted", "Your ship is in the shared system.");
      }
      const saved = options.journal.read(key);
      const prior = saved ? decodeSharedJoinRequest(saved) : undefined;
      if (saved && !prior)
        return set(
          "blocked",
          "The saved join request is invalid. Clear it before trying again.",
        );
      if (
        prior &&
        (prior.characterId !== decision.args.characterId ||
          prior.shipId !== decision.args.shipId ||
          prior.expectedShipRevision !== decision.args.expectedShipRevision ||
          prior.expectedAdmissionRevision !==
            decision.args.expectedAdmissionRevision)
      ) {
        return set(
          "blocked",
          "Your ship changed since the saved request. Review the current ship before starting a new join.",
        );
      }
      const request = prior ?? {
        ...decision.args,
        operationId: (options.operationId ?? createOperationId)(),
      };
      if (!decodeSharedJoinRequest(encodeSharedJoinRequest(request)))
        throw Error("Invalid join operation.");
      options.journal.write(key, encodeSharedJoinRequest(request));
      set("pending", "Joining the shared system…");
      await options.send(request);
      if (disposed) return snapshot;
      const accepted = options.readContext();
      if (sharedJoinJournalKey(accepted) !== key) return set("idle", "");
      const latest = sharedWorldJoinDecision(accepted);
      if (
        latest.kind === "admitted" &&
        latest.admission.characterId === request.characterId &&
        latest.admission.shipId === request.shipId
      ) {
        options.journal.remove(key);
        return set("admitted", "Your ship is in the shared system.");
      }
      return set(
        "submitted",
        "Join sent. Waiting for the accepted shared-system view.",
      );
    } catch (error) {
      return set(
        "error",
        error instanceof Error
          ? error.message
          : "Could not join the shared system. Retry when connected.",
      );
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    join(): Promise<SharedJoinActionState> {
      if (disposed) return Promise.resolve(snapshot);
      if (!inFlight)
        inFlight = perform().finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
    /** Explicit secondary action after a revision conflict; never an automatic
     * retry with silently changed expected revisions or another actor's UUIDs. */
    discardPending() {
      if (disposed || inFlight) return false;
      const context = options.readContext();
      if (!context.active || !context.admissionReady) return false;
      options.journal.remove(sharedJoinJournalKey(context));
      set("idle", "Review your ship, then choose Join shared system again.");
      return true;
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
