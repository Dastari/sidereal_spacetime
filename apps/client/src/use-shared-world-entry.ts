import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getSharedWorldBinding, type DbConnection } from "@sidereal/net";
import type { SharedEntryState } from "@sidereal/canvas-ui/shared-entry";
import {
  createSharedWorldJoinSession,
  sharedJoinJournalKey,
} from "./shared-world-join-action";
import { sharedWorldJoinDecision } from "./shared-world-review";
const noSubscribe = () => () => {};
const notReady = () => false;
const noShips: readonly { shipId: string }[] = [];
/** A selected active socket only; mounting and reconnecting never trigger relocation. */
export function useSharedWorldEntry(
  connection: DbConnection | null,
  enabled: boolean,
) {
  const current = useRef(connection);
  current.current = connection;
  const binding = enabled ? getSharedWorldBinding(connection) : undefined;
  const ready = useSyncExternalStore(
    binding?.readiness.subscribe ?? noSubscribe,
    binding?.readiness.getSnapshot ?? notReady,
  );
  const ships = useSyncExternalStore(
    useCallback(
      (listener) =>
        binding?.store.subscribeTable("shipDescription", listener) ??
        (() => {}),
      [binding],
    ),
    useCallback(
      () => binding?.store.getTableSnapshot("shipDescription") ?? noShips,
      [binding],
    ),
  );
  const readContext = () => {
    const c = current.current;
    return {
      identity: c?.identity?.toHexString() ?? "",
      database: import.meta.env.VITE_DATABASE,
      active: !!c?.isActive,
      admissionReady: !!getSharedWorldBinding(c)?.readiness.getSnapshot(),
      inConstructionReview: !!c && c.db.ownConstructionLocation.count() > 0n,
      characters: c ? [...c.db.ownCharacters.iter()] : [],
      ships: c ? [...c.db.ownShips.iter()] : [],
      admissions: c ? [...c.db.ownWorldAdmission.iter()] : [],
    };
  };
  const contextReader = useRef(readContext);
  contextReader.current = readContext;
  const [action] = useState(() =>
    createSharedWorldJoinSession({
      readContext: () => contextReader.current(),
      journal: {
        read: (key) => localStorage.getItem(key),
        write: (key, value) => localStorage.setItem(key, value),
        remove: (key) => localStorage.removeItem(key),
      },
      send: (request) => current.current!.reducers.joinSharedSystem(request),
    }),
  );
  const accountKey =
    connection?.identity && enabled
      ? sharedJoinJournalKey({
          identity: connection.identity.toHexString(),
          database: import.meta.env.VITE_DATABASE,
        })
      : undefined;
  useEffect(() => {
    action.select(accountKey);
    return () => action.select(undefined);
  }, [action, accountKey]);
  const actionState = useSyncExternalStore(
    action.subscribe,
    action.getSnapshot,
  );
  const decision = sharedWorldJoinDecision(readContext());
  const admitted = decision.kind === "admitted";
  const selected = action.getKey() === accountKey;
  const state: SharedEntryState = {
    admitted,
    ready,
    canJoin: selected && decision.kind === "join",
    pending:
      selected &&
      (actionState.phase === "pending" || actionState.phase === "submitted"),
    contactCount: Math.max(
      0,
      ships.length -
        (admitted && ships.some((s) => s.shipId === decision.admission.shipId)
          ? 1
          : 0),
    ),
    message:
      decision.kind === "blocked"
        ? decision.reason
        : selected
          ? actionState.message
          : "",
    reviewRequired: selected && !!actionState.reviewRequired,
  };
  return {
    state,
    join: () => {
      if (action.getKey() === accountKey) void action.join();
    },
    review: () => {
      if (action.getKey() === accountKey) action.discardPending();
    },
  };
}
