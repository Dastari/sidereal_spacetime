import { useRef, useState } from "react";
import type { DbConnection } from "@sidereal/net";
import { createOperationId } from "./operation-id";
import "./ship-refit.css";
import { ShipRebuildPanel, shipRebuildApplicable } from "./ShipRebuildPanel";

/** Either refit (legacy Wayfarer layout or rebuilt Wayfarer) is on offer. */
export function shipRefitAvailable(connection: DbConnection | null) {
  const actor = connection && [...connection.db.ownCharacters.iter()][0];
  return (
    (!!connection &&
      [...connection.db.ownWayfarerRefitOffer.iter()].some(
        (o) => o.characterId === actor?.id && o.shipId === actor.shipId,
      )) ||
    shipRebuildApplicable(connection)
  );
}

export function ShipRefitPanel({
  connection,
  onError,
  open,
  onClose,
}: {
  connection: DbConnection | null;
  onError: (message: string) => void;
  /** Opened from the system menu's Vessel tab; there is no HUD toggle. */
  open: boolean;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const actor = connection && [...connection.db.ownCharacters.iter()][0];
  const offer =
    connection &&
    [...connection.db.ownWayfarerRefitOffer.iter()].find(
      (o) => o.characterId === actor?.id && o.shipId === actor.shipId,
    );
  if (!offer)
    return (
      <ShipRebuildPanel
        connection={connection}
        onError={onError}
        open={open}
        onClose={onClose}
      />
    );
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
      onClose();
    } catch (error) {
      onError(String(error));
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return (
    <>
      {open && (
        <section className="ship-service-panel" aria-label="Wayfarer refit">
          <button
            className="service-close"
            aria-label="Close ship refit"
            onClick={onClose}
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
