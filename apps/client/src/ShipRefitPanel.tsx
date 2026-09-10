import { useRef, useState } from "react";
import type { DbConnection } from "@sidereal/net";
import { createOperationId } from "./operation-id";
import "./ship-refit.css";

export function ShipRefitPanel({
  connection,
  onError,
}: {
  connection: DbConnection | null;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false);
  const sending = useRef(false);
  const actor = connection && [...connection.db.ownCharacters.iter()][0];
  const offer =
    connection &&
    [...connection.db.ownWayfarerRefitOffer.iter()].find(
      (o) => o.characterId === actor?.id && o.shipId === actor.shipId,
    );
  if (!offer) return null;
  async function refit() {
    if (!connection || sending.current) return;
    const currentActor = [...connection.db.ownCharacters.iter()][0];
    const current = [...connection.db.ownWayfarerRefitOffer.iter()].find(
      (o) =>
        o.shipId === currentActor?.shipId && o.characterId === currentActor.id,
    );
    if (!current || current.status !== "ready") {
      onError(
        current?.status ?? "Ship availability changed. Reopen the refit panel.",
      );
      return;
    }
    sending.current = true;
    setPending(true);
    try {
      await connection.reducers.refitExistingWayfarer({
        shipId: current.shipId,
        expectedShipRevision: current.expectedShipRevision,
        expectedInventoryRevision: current.expectedInventoryRevision,
        fingerprint: current.fingerprint,
        operationId: createOperationId(),
      });
      setOpen(false);
    } catch (error) {
      onError(String(error));
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <button className="ship-refit-toggle" onClick={() => setOpen((v) => !v)}>
        Ship refit
      </button>
      {open && (
        <section className="ship-service-panel" aria-label="Wayfarer refit">
          <button
            className="service-close"
            aria-label="Close ship refit"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2>Wayfarer refit</h2>
          <p>
            Fit the authored Wayfarer layout to your existing ship. Your
            character, equipment and stored cargo stay with it.
          </p>
          <p>
            Leave the controls, stop moving and stand on clear floor before
            starting.
          </p>
          {offer.status !== "ready" && <p role="status">{offer.status}</p>}
          <button
            disabled={pending || offer.status !== "ready"}
            onClick={() => void refit()}
          >
            {pending ? "Refitting…" : "Refit this ship"}
          </button>
        </section>
      )}
    </>
  );
}
