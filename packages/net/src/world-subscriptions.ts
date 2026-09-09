import {
  spatialCell,
  neighboringSpatialCells,
} from "@sidereal/sim/spatial-cells";
import {
  createConnectionResources,
  subscriptionErrorMessage,
  type RetainedSubscription,
} from "./connection-resources";
import {
  SharedWorldStore,
  type SharedAdmission,
  type SharedShipMotion,
} from "./shared-world-store";

/** These are PUBLIC FILTERED VIEW names, not authoritative base tables. The
 * server must register these exact names and regenerate bindings before wiring. */
export const SHARED_VIEW_SQL = Object.freeze({
  admission: "own_world_admission",
  ships: "visible_ship_motion",
  shipDescriptions: "visible_ship_descriptions",
  bodies: "visible_body_motion",
  bodyDescriptions: "visible_body_descriptions",
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function quotedId(id: string): string {
  if (!uuid.test(id)) throw Error("Invalid shared-world UUID");
  return `'${id}'`;
}
export function sharedCellQueries(
  systemId: string,
  point: { x: number; y: number },
): string[] {
  const system = quotedId(systemId);
  return neighboringSpatialCells(spatialCell(point)).map(
    ({ cellX, cellY }) =>
      `SELECT * FROM ${SHARED_VIEW_SQL.ships} WHERE system_id = ${system} AND cell_x = ${cellX} AND cell_y = ${cellY}`,
  );
}
/** SDK 2.10 SubscriptionHandle has unsubscribeThen. Waiting for its acknowledgement
 * bounds retiring scopes too, rather than accumulating unsubscribe requests. */
export interface WorldSubscriptionHandle extends RetainedSubscription {
  unsubscribeThen(onEnd: () => void): void;
}
export interface WorldSubscriptionTransport {
  subscribe(
    queries: string[],
    callbacks: {
      applied(): void;
      error(context: { event?: unknown }): void;
    },
  ): WorldSubscriptionHandle;
}
type Scope = {
  name: string;
  kind: "baseline" | "own" | "cells";
  key: string;
  phase: "pending" | "active" | "retiring";
  retireRequested: boolean;
  handle?: RetainedSubscription;
};
let nextAdapterId = 0;
/** One socket owns this adapter. Feed ACCEPTED own world motion, never predicted
 * transforms or renderer interpolation. Queries narrow egress; only views authorize.
 * Aggregate SDK table events feed SharedWorldStore separately: a scope ending must
 * never directly delete cached entities that an overlapping scope still includes. */
export function createWorldSubscriptions(options: {
  transport: WorldSubscriptionTransport;
  resources: ReturnType<typeof createConnectionResources>;
  store: SharedWorldStore;
  onError?: (message: string) => void;
  /** Rebind current socket's aggregate listeners to the new store epoch; callbacks
   * from an old socket must retain their old generation and must remain rejected. */
  onEpoch?: (epoch: number) => void;
  /** An empty applied admission view still establishes absence authoritatively. */
  onBaselineApplied?: () => void;
}) {
  const { store, resources, transport } = options;
  const prefix = `shared-world-${++nextAdapterId}-`;
  const scopes = new Set<Scope>();
  let serial = 0,
    running = true,
    disposed = false,
    pumping = false;
  let admission: SharedAdmission | undefined;
  let ownMotion: SharedShipMotion | undefined;
  let desiredCell: string | undefined;
  const contextKey = (a: SharedAdmission) =>
    `${a.characterId}/${a.shipId}/${a.systemId}/${a.revision}`;
  const end = (scope: Scope) => {
    scopes.delete(scope);
    pump();
  };
  const retire = (scope: Scope) => {
    if (scope.retireRequested) return;
    scope.retireRequested = true;
    scope.phase = "retiring";
    resources.remove(scope.name);
  };
  const clearStore = () => {
    const epoch = store.beginEpoch();
    options.onEpoch?.(epoch);
    return epoch;
  };
  const halt = (message?: string) => {
    running = false;
    admission = undefined;
    ownMotion = undefined;
    desiredCell = undefined;
    for (const scope of [...scopes]) retire(scope);
    clearStore();
    if (message) options.onError?.(message);
  };
  function open(kind: Scope["kind"], key: string, queries: string[]) {
    const scope: Scope = {
      name: prefix + ++serial,
      kind,
      key,
      phase: "pending",
      retireRequested: false,
    };
    scopes.add(scope);
    try {
      // SDK callbacks are asynchronous. Deferring also handles deterministic fake
      // transports and prevents a callback racing assignment of the retained handle.
      const raw = transport.subscribe(queries, {
        applied: () =>
          queueMicrotask(() => {
            if (!scopes.has(scope)) return;
            if (!resources.applied(scope.handle!)) return;
            if (!running || disposed || scope.retireRequested) {
              retire(scope);
              return;
            }
            scope.phase = "active";
            if (kind === "baseline") options.onBaselineApplied?.();
            if (kind === "cells") {
              // Preserve the previous coverage until the replacement is applied.
              for (const old of scopes)
                if (
                  old !== scope &&
                  old.kind === "cells" &&
                  old.phase === "active"
                )
                  retire(old);
            }
            pump();
          }),
        error: (context) =>
          queueMicrotask(() => {
            if (!scopes.has(scope)) return;
            const wasRetired = scope.retireRequested;
            scopes.delete(scope);
            resources.remove(scope.name);
            if (!wasRetired && running && !disposed)
              halt(subscriptionErrorMessage(context));
            else pump();
          }),
      });
      scope.handle = {
        isActive: () => raw.isActive(),
        isEnded: () => raw.isEnded(),
        unsubscribe: () => raw.unsubscribeThen(() => end(scope)),
      };
      resources.retain(scope.name, scope.handle);
    } catch (error) {
      scopes.delete(scope);
      halt(
        error instanceof Error ? error.message : "World subscription failed",
      );
    }
  }
  function pump() {
    if (!running || disposed || pumping) return;
    pumping = true;
    try {
      // At most one baseline and one own-motion handle, including pending release.
      if (![...scopes].some((s) => s.kind === "baseline")) {
        open("baseline", "baseline", [
          `SELECT * FROM ${SHARED_VIEW_SQL.admission}`,
          `SELECT * FROM ${SHARED_VIEW_SQL.shipDescriptions}`,
          `SELECT * FROM ${SHARED_VIEW_SQL.bodyDescriptions}`,
          // The present view includes bounded charted planets/stars outside nearby
          // cells. Keep it subscribed until a separate keyed chart-motion view exists.
          `SELECT * FROM ${SHARED_VIEW_SQL.bodies}`,
        ]);
      }
      if (!running || !admission) return;
      let own = [...scopes].find((s) => s.kind === "own");
      if (!own) {
        open("own", contextKey(admission), [
          `SELECT * FROM ${SHARED_VIEW_SQL.ships} WHERE ship_id = ${quotedId(admission.shipId)} AND system_id = ${quotedId(admission.systemId)}`,
        ]);
        own = [...scopes].find((s) => s.kind === "own");
      }
      if (
        own?.phase !== "active" ||
        own.key !== contextKey(admission) ||
        !ownMotion ||
        !desiredCell
      )
        return;
      const cells = [...scopes].filter((s) => s.kind === "cells");
      // Two nine-cell sets maximum, including pending apply AND retiring scopes.
      // While either awaits transport acknowledgment, only the latest desired cell
      // is kept. There is no queue of intermediate crossings.
      if (
        cells.length >= 2 ||
        cells.some((s) => s.phase === "pending") ||
        cells.some((s) => s.key === desiredCell && !s.retireRequested)
      )
        return;
      open(
        "cells",
        desiredCell,
        sharedCellQueries(admission.systemId, ownMotion),
      );
    } finally {
      pumping = false;
    }
  }
  const reset = () => {
    if (disposed) return store.getEpoch();
    running = false;
    admission = undefined;
    ownMotion = undefined;
    desiredCell = undefined;
    for (const scope of [...scopes]) retire(scope);
    const epoch = clearStore();
    running = true;
    pump();
    return epoch;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    halt();
  };
  resources.listen(dispose);
  pump();
  return {
    /** Called first with admission alone to bootstrap own-motion subscription,
     * then on each accepted own row. Stale socket epochs and out-of-order motion
     * cannot change cells. Admission removal revokes all shared subscriptions. */
    acceptObserver(
      next: SharedAdmission | undefined,
      motion?: SharedShipMotion,
      epoch = store.getEpoch(),
    ): boolean {
      if (disposed || !running || epoch !== store.getEpoch()) return false;
      if (!next) {
        halt();
        return true;
      }
      if (
        !uuid.test(next.characterId) ||
        !uuid.test(next.shipId) ||
        !uuid.test(next.systemId) ||
        typeof next.revision !== "bigint" ||
        next.revision < 0n
      )
        return false;
      if (admission && contextKey(admission) !== contextKey(next)) {
        if (
          admission.characterId === next.characterId &&
          next.revision <= admission.revision
        )
          return false;
        reset();
      }
      if (motion) {
        if (
          motion.shipId !== next.shipId ||
          motion.systemId !== next.systemId ||
          typeof motion.serverTick !== "bigint" ||
          motion.serverTick < 0n ||
          ![
            motion.x,
            motion.y,
            motion.vx,
            motion.vy,
            motion.heading,
            motion.omega,
          ].every(Number.isFinite)
        )
          return false;
        let cell: ReturnType<typeof spatialCell>;
        try {
          cell = spatialCell(motion);
        } catch {
          return false;
        }
        if (
          motion.cellX !== BigInt(cell.cellX) ||
          motion.cellY !== BigInt(cell.cellY)
        )
          return false;
        if (ownMotion && motion.serverTick < ownMotion.serverTick) return false;
        ownMotion = { ...motion };
        desiredCell = `${next.systemId}/${cell.cellX}/${cell.cellY}`;
      }
      admission = { ...next };
      // Admission replacement cleared the cache epoch. Keep these accepted source
      // rows present; onEpoch lets the parent rehydrate other aggregate SDK rows.
      store.batch(() => {
        store.upsert("admission", admission!);
        if (ownMotion) store.upsert("shipMotion", ownMotion);
      });
      pump();
      return true;
    },
    reset,
    revoke: () => {
      if (!disposed) halt();
    },
    dispose,
    getState: () => ({
      running: running && !disposed,
      epoch: store.getEpoch(),
      handles: scopes.size,
      pending: [...scopes].filter((s) => s.phase === "pending").length,
      cellSets: [...scopes].filter((s) => s.kind === "cells").length,
      desiredCell,
    }),
  };
}
