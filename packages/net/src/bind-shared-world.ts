import type { DbConnection } from "./generated";
import { createConnectionResources } from "./connection-resources";
import {
  SharedWorldStore,
  type SharedWorldSnapshot,
  type SharedWorldTable,
} from "./shared-world-store";
import { createWorldSubscriptions } from "./world-subscriptions";

type Row<K extends SharedWorldTable> = SharedWorldSnapshot[K][number];
export interface SharedWorldReadiness {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
}
interface AggregateTable<R> {
  iter(): Iterable<R>;
  onInsert(fn: (context: unknown, row: R) => void): void;
  onUpdate(fn: (context: unknown, old: R, row: R) => void): void;
  onDelete(fn: (context: unknown, row: R) => void): void;
  removeOnInsert(fn: (context: unknown, row: R) => void): void;
  removeOnUpdate(fn: (context: unknown, old: R, row: R) => void): void;
  removeOnDelete(fn: (context: unknown, row: R) => void): void;
}

/** Bind only after socket admission proof. Every socket gets a separate store:
 * pending token renewal must not erase the still-active connection's presentation.
 * SDK aggregate events own row removal across overlapping cell subscriptions. */
export function bindSharedWorld(options: {
  connection: Pick<DbConnection, "db" | "subscriptionBuilder">;
  resources: ReturnType<typeof createConnectionResources>;
  onError?: (message: string) => void;
}) {
  const { connection, resources } = options;
  const store = new SharedWorldStore();
  let disposed = false;
  let baselineApplied = false;
  const readinessListeners = new Set<() => void>();
  const readiness: SharedWorldReadiness = {
    getSnapshot: () => baselineApplied,
    subscribe(listener) {
      if (disposed) return () => {};
      readinessListeners.add(listener);
      return () => {
        readinessListeners.delete(listener);
      };
    },
  };
  function setReady(value: boolean) {
    if (value === baselineApplied) return;
    baselineApplied = value;
    for (const listener of [...readinessListeners]) listener();
  }
  let removers: (() => void)[] = [];
  const tables = {
    admission: connection.db.ownWorldAdmission,
    shipMotion: connection.db.visibleShipMotion,
    shipDescription: connection.db.visibleShipDescriptions,
    bodyMotion: connection.db.visibleBodyMotion,
    bodyDescription: connection.db.visibleBodyDescriptions,
  } satisfies { [K in SharedWorldTable]: AggregateTable<Row<K>> };
  const subscriptions = createWorldSubscriptions({
    store,
    resources,
    onError: options.onError,
    onBaselineApplied: () => setReady(true),
    transport: {
      subscribe: (queries, callbacks) =>
        connection
          .subscriptionBuilder()
          .onApplied(callbacks.applied)
          .onError(callbacks.error)
          .subscribe(queries),
    },
    onEpoch(epoch) {
      setReady(false);
      // The adapter installs the new admission after this callback returns.
      // Rebind immediately, but defer hydration to avoid recursive context resets.
      rebind(epoch);
      queueMicrotask(() => hydrate(epoch));
    },
  });
  const current = (epoch: number) =>
    !disposed && epoch === store.getEpoch() && subscriptions.getState().running;
  function observe(epoch: number) {
    if (!current(epoch)) return;
    const snapshot = store.getSnapshot();
    const admission = snapshot.admission[0];
    if (!admission) return; // An empty initial cache is not a revocation.
    subscriptions.acceptObserver(
      admission,
      snapshot.shipMotion.find(
        (row) =>
          row.shipId === admission.shipId &&
          row.systemId === admission.systemId,
      ),
      epoch,
    );
  }
  function upsert<K extends SharedWorldTable>(
    table: K,
    row: Row<K>,
    epoch: number,
  ) {
    if (!current(epoch)) return;
    if (table === "admission") {
      subscriptions.acceptObserver(row as Row<"admission">, undefined, epoch);
      observe(store.getEpoch());
    } else if (
      store.upsert<SharedWorldTable>(table, row, epoch) &&
      table === "shipMotion"
    ) {
      observe(epoch);
    }
  }
  function attach<K extends SharedWorldTable>(
    key: K,
    table: AggregateTable<Row<K>>,
    epoch: number,
  ) {
    const insert = (_: unknown, row: Row<K>) => upsert(key, row, epoch);
    const update = (_: unknown, _old: Row<K>, row: Row<K>) =>
      upsert(key, row, epoch);
    const remove = (_: unknown, row: Row<K>) => {
      if (!current(epoch)) return;
      const id =
        key === "admission"
          ? (row as Row<"admission">).characterId
          : key.startsWith("ship")
            ? (row as Row<"shipMotion">).shipId
            : (row as Row<"bodyMotion">).bodyId;
      if (store.remove(key, id, epoch) && key === "admission")
        subscriptions.revoke();
    };
    table.onInsert(insert);
    table.onUpdate(update);
    table.onDelete(remove);
    removers.push(() => {
      table.removeOnInsert(insert);
      table.removeOnUpdate(update);
      table.removeOnDelete(remove);
    });
  }
  function detach() {
    for (const remove of removers) remove();
    removers = [];
  }
  function rebind(epoch: number) {
    detach();
    if (disposed) return;
    attach("admission", tables.admission, epoch);
    attach("shipMotion", tables.shipMotion, epoch);
    attach("shipDescription", tables.shipDescription, epoch);
    attach("bodyMotion", tables.bodyMotion, epoch);
    attach("bodyDescription", tables.bodyDescription, epoch);
  }
  function hydrate(epoch: number) {
    if (!current(epoch)) return;
    store.batch(() => {
      for (const row of tables.admission.iter())
        upsert("admission", row, epoch);
      for (const row of tables.shipMotion.iter())
        upsert("shipMotion", row, epoch);
      for (const row of tables.shipDescription.iter())
        upsert("shipDescription", row, epoch);
      for (const row of tables.bodyMotion.iter())
        upsert("bodyMotion", row, epoch);
      for (const row of tables.bodyDescription.iter())
        upsert("bodyDescription", row, epoch);
    });
    observe(epoch);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    detach();
    subscriptions.dispose();
    setReady(false);
    readinessListeners.clear();
  }
  resources.listen(dispose);
  rebind(store.getEpoch());
  hydrate(store.getEpoch());
  return { store, subscriptions, readiness, dispose };
}
