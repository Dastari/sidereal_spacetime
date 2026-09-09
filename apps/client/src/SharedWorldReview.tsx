import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  DbConnection,
  SharedWorldStore,
  SharedWorldReadiness,
  SharedAdmission,
  SharedShipDescription,
  SharedBodyDescription,
} from "@sidereal/net";
import { createOperationId } from "./operation-id";
import { sharedWorldJoinDecision } from "./shared-world-review";
const noSubscribe = () => () => {};
const notReady = () => false;
const noAdmissions: readonly SharedAdmission[] = [];
const noShips: readonly SharedShipDescription[] = [];
const noBodies: readonly SharedBodyDescription[] = [];

/** Development entry only. Explicit migration does not replace physical travel. */
export function SharedWorldReview({
  connection,
  source,
  readiness,
  onError,
}: {
  connection: DbConnection | null;
  source: SharedWorldStore | undefined;
  readiness: SharedWorldReadiness | undefined;
  onError?: (message: string) => void;
}) {
  const admissions = useSyncExternalStore(
    useCallback(
      (listener) => source?.subscribeTable("admission", listener) ?? (() => {}),
      [source],
    ),
    useCallback(
      () => source?.getTableSnapshot("admission") ?? noAdmissions,
      [source],
    ),
  );
  const ships = useSyncExternalStore(
    useCallback(
      (listener) =>
        source?.subscribeTable("shipDescription", listener) ?? (() => {}),
      [source],
    ),
    useCallback(
      () => source?.getTableSnapshot("shipDescription") ?? noShips,
      [source],
    ),
  );
  const bodies = useSyncExternalStore(
    useCallback(
      (listener) =>
        source?.subscribeTable("bodyDescription", listener) ?? (() => {}),
      [source],
    ),
    useCallback(
      () => source?.getTableSnapshot("bodyDescription") ?? noBodies,
      [source],
    ),
  );
  const ready = useSyncExternalStore(
    readiness?.subscribe ?? noSubscribe,
    readiness?.getSnapshot ?? notReady,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const pendingRef = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    pendingRef.current = false;
    setPending(false);
    setMessage("");
    return () => {
      generation.current++;
    };
  }, [connection]);
  const params = new URLSearchParams(location.search);
  if (!params.has("sharedWorldReview") || params.has("constructionReview"))
    return null;
  const decide = () =>
    sharedWorldJoinDecision({
      active: !!connection?.isActive,
      admissionReady: readiness?.getSnapshot() ?? false,
      inConstructionReview:
        !!connection &&
        [...connection.db.ownConstructionLocation.iter()].length > 0,
      characters: connection ? [...connection.db.ownCharacters.iter()] : [],
      ships: connection ? [...connection.db.ownShips.iter()] : [],
      // Read the actual accepted SDK cache again on every click, not a captured UI row.
      admissions: connection ? [...connection.db.ownWorldAdmission.iter()] : [],
    });
  const decision = decide();
  const accepted = admissions[0];
  async function join() {
    if (pendingRef.current || !connection) return;
    const current = decide();
    if (current.kind !== "join") {
      setMessage(
        current.kind === "admitted"
          ? "Already in the shared system."
          : current.reason,
      );
      return;
    }
    pendingRef.current = true;
    const requestGeneration = generation.current;
    setPending(true);
    setMessage("");
    try {
      await connection.reducers.joinSharedSystem({
        ...current.args,
        operationId: createOperationId(),
      });
      if (generation.current === requestGeneration)
        setMessage("Join accepted; waiting for the shared view.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Shared-system join failed.";
      if (generation.current === requestGeneration) {
        setMessage(message);
        onError?.(message);
      }
    } finally {
      if (generation.current === requestGeneration) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }
  return (
    <aside
      className="construction-review-controls"
      aria-label="Shared world review"
      data-testid="shared-world-review"
    >
      <strong>Shared world review</strong>
      <small>
        {accepted
          ? "Shared system admitted"
          : ready
            ? "Private legacy space"
            : "Checking admission…"}
      </small>
      <div>
        System:{" "}
        <span title={accepted?.systemId}>
          {accepted?.systemId ?? "Not joined"}
        </span>
      </div>
      <div>
        Other ship contacts:{" "}
        {ships.filter((ship) => ship.shipId !== accepted?.shipId).length} ·
        Bodies: {bodies.length}
      </div>
      <small>
        Actor: {accepted?.characterId ?? "Awaiting admission"}
        <br />
        Admission revision: {accepted?.revision.toString() ?? "—"} · Socket:{" "}
        {connection?.connectionId?.toHexString().slice(0, 8) ?? "offline"}
      </small>
      <button
        disabled={pending || decision.kind !== "join"}
        onClick={() => void join()}
      >
        {pending
          ? "Joining…"
          : decision.kind === "admitted"
            ? "Already joined"
            : "Join shared system"}
      </button>
      {decision.kind === "blocked" && <small>{decision.reason}</small>}
      {message && <small role="status">{message}</small>}
      <small>
        Development migration: the server assigns your berth. Construction
        review remains separate.
      </small>
    </aside>
  );
}
