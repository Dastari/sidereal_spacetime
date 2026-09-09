import {
  SharedWorldStore,
  type SharedWorldSnapshot,
  type SharedWorldTable,
} from "./shared-world-store";

const TABLES: readonly SharedWorldTable[] = [
  "admission",
  "shipMotion",
  "shipDescription",
  "bodyMotion",
  "bodyDescription",
];
const key = (
  table: SharedWorldTable,
  row: SharedWorldSnapshot[SharedWorldTable][number],
) =>
  table === "admission"
    ? (row as SharedWorldSnapshot["admission"][number]).characterId
    : table.startsWith("ship")
      ? (row as SharedWorldSnapshot["shipMotion"][number]).shipId
      : (row as SharedWorldSnapshot["bodyMotion"][number]).bodyId;

/** Stable renderer-facing cache. Select only the active admitted socket, never
 * the pending replacement. This is presentation filtering, not authorization. */
export function createSharedWorldPresentation(now?: () => number) {
  const store = new SharedWorldStore(now);
  let source: SharedWorldStore | undefined;
  let unsubscribe: (() => void) | undefined;
  let generation = 0;
  let sourceEpoch: number | undefined;
  let context: string | undefined;
  let disposed = false;

  function sync(
    selected: SharedWorldStore | undefined,
    epoch: number,
    replacing = false,
  ) {
    if (disposed || source !== selected || generation !== epoch) return;
    const snapshot = selected?.getSnapshot();
    const admission = snapshot?.admission[0];
    const nextContext = admission
      ? `${admission.characterId}/${admission.shipId}/${admission.systemId}/${admission.revision}`
      : undefined;
    const reset =
      replacing || sourceEpoch !== snapshot?.epoch || context !== nextContext;
    sourceEpoch = snapshot?.epoch;
    context = nextContext;
    // Cell subscriptions overlap while retiring. System transfer must remove the
    // old system immediately, including its otherwise unscoped descriptions.
    const shipMotion = admission
      ? snapshot!.shipMotion.filter(
          (row) => row.systemId === admission.systemId,
        )
      : [];
    const bodyMotion = admission
      ? snapshot!.bodyMotion.filter(
          (row) => row.systemId === admission.systemId,
        )
      : [];
    const ships = new Set(shipMotion.map((row) => row.shipId));
    const bodies = new Set(bodyMotion.map((row) => row.bodyId));
    const rows: Omit<SharedWorldSnapshot, "epoch"> = {
      admission: admission ? [admission] : [],
      shipMotion,
      bodyMotion,
      shipDescription:
        snapshot?.shipDescription.filter((row) => ships.has(row.shipId)) ?? [],
      bodyDescription:
        snapshot?.bodyDescription.filter((row) => bodies.has(row.bodyId)) ?? [],
    };
    store.batch(() => {
      if (reset) store.beginEpoch();
      for (const table of TABLES) {
        const ids = new Set(rows[table].map((row) => key(table, row)));
        for (const row of store.getTableSnapshot(table)) {
          const id = key(table, row);
          if (!ids.has(id)) store.remove(table, id);
        }
        // Equal rows are ignored by the store, preserving receive times and the
        // interpolation buffer when another table or another entity changes.
        for (const row of rows[table])
          store.upsert<SharedWorldTable>(table, row);
      }
    });
  }
  function select(next: SharedWorldStore | undefined) {
    if (disposed || source === next) return;
    unsubscribe?.();
    unsubscribe = undefined;
    source = next;
    const epoch = ++generation;
    if (next) unsubscribe = next.subscribe(() => sync(next, epoch));
    sync(next, epoch, true);
  }
  function dispose() {
    if (disposed) return;
    select(undefined);
    disposed = true;
    unsubscribe?.();
    unsubscribe = undefined;
    store.dispose();
  }
  return { store, select, dispose };
}
