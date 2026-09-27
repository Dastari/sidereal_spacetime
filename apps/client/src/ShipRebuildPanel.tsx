import { useEffect, useRef, useState } from "react";
import { tables, type DbConnection } from "@sidereal/net";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { createOperationId } from "./operation-id";

/** An owner-reviewed, revision-checked refit; opening this panel never edits a ship. */
export function ShipRebuildPanel({
  connection,
  onError,
}: {
  connection: DbConnection | null;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [reviewed, setReviewed] = useState("");
  const [, redraw] = useState(0);
  const sending = useRef(false);
  const actor = connection && [...connection.db.ownCharacters.iter()][0];
  const access =
    connection &&
    [...connection.db.ownGameShipAccess.iter()].find(
      (a) => a.shipId === actor?.shipId,
    );
  const applicable = access?.templateSha256 === WAYFARER_STARTER.sha256;
  useEffect(() => {
    if (!connection || !open || !applicable) return;
    let disposed = false;
    setReady(false);
    setUnavailable(false);
    setReviewed("");
    const table = connection.db.ownWayfarerRebuildOffer;
    const changed = () => {
      if (!disposed) redraw((n) => n + 1);
    };
    table.onInsert(changed);
    table.onDelete(changed);
    table.onUpdate(changed);
    const subscription = connection
      .subscriptionBuilder()
      .onApplied(() => {
        if (disposed) subscription.unsubscribe();
        else setReady(true);
      })
      .onError(() => {
        if (!disposed) setUnavailable(true);
      })
      .subscribe(tables.ownWayfarerRebuildOffer);
    return () => {
      disposed = true;
      table.removeOnInsert(changed);
      table.removeOnDelete(changed);
      table.removeOnUpdate(changed);
      if (subscription.isActive()) subscription.unsubscribe();
    };
  }, [connection, open, applicable]);
  if (!connection || !applicable) return null;
  const offer = [...connection.db.ownWayfarerRebuildOffer.iter()].find(
    (o) => o.shipId === actor?.shipId,
  );
  let report:
    | {
        counts?: { actors: number; containers: number; items: number };
        retainedObjects?: unknown[];
        removed?: unknown[];
      }
    | undefined;
  try {
    report = offer?.reportJson ? JSON.parse(offer.reportJson) : undefined;
  } catch {
    /* incomplete offer stays unavailable */
  }
  const canApply =
    ready &&
    offer?.eligible &&
    report?.counts &&
    reviewed === offer.fingerprint;
  async function apply() {
    if (!connection || !canApply || !offer || sending.current) return;
    sending.current = true;
    setPending(true);
    try {
      await connection.reducers.refitRebuiltWayfarer({
        shipId: offer.shipId,
        expectedInstanceRevision: offer.expectedInstanceRevision,
        expectedShipRevision: offer.expectedShipRevision,
        fingerprint: offer.fingerprint,
        operationId: createOperationId(),
      });
      setOpen(false);
    } catch (error) {
      onError(String(error));
      setReviewed("");
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
        <section
          className="ship-service-panel"
          aria-label="Rebuilt Wayfarer refit"
        >
          <button
            className="service-close"
            aria-label="Close ship refit"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2>Rebuilt Wayfarer</h2>
          <p>
            Fit the new walls, rooms and floors while keeping your cockpit,
            equipment and ship identity.
          </p>
          <p>
            Passages remain open. Pressure sealing is not enabled for this
            design.
          </p>
          {unavailable ? (
            <p role="status">
              This world does not have the rebuild available yet.
            </p>
          ) : !ready ? (
            <p role="status">Checking your ship…</p>
          ) : !offer?.eligible ? (
            <p role="status">
              {offer?.reason || "No compatible ship is available."}
            </p>
          ) : (
            report?.counts && (
              <>
                <p>
                  Preserve {report.counts.actors} crew, {report.counts.items}{" "}
                  items, {report.counts.containers} containers and{" "}
                  {report.retainedObjects?.length ?? 0} installed objects. Cargo
                  contents and fitting identities stay with this ship.
                </p>
                <p>
                  Replace {report.removed?.length ?? 0} structural pieces.
                  Retain the existing floorplan, cockpit and propulsion
                  fittings.
                </p>
                <details>
                  <summary>Exact refit record</summary>
                  <p>Ship: {offer.shipId}</p>
                  <p>
                    Revision: {String(offer.expectedInstanceRevision)} →{" "}
                    {String(offer.expectedInstanceRevision + 1n)}
                  </p>
                  <p style={{ overflowWrap: "anywhere" }}>
                    Design: {offer.targetSha256}
                  </p>
                  <a
                    download="wayfarer-conservation.json"
                    href={`data:application/json;charset=utf-8,${encodeURIComponent(offer.reportJson)}`}
                  >
                    Download conservation report
                  </a>
                </details>
                <label>
                  <input
                    type="checkbox"
                    checked={reviewed === offer.fingerprint}
                    onChange={(e) =>
                      setReviewed(e.target.checked ? offer.fingerprint : "")
                    }
                  />
                  I approve this ship’s conservation report.
                </label>
              </>
            )
          )}
          <button disabled={pending || !canApply} onClick={() => void apply()}>
            {pending ? "Refitting…" : "Apply reviewed rebuild"}
          </button>
        </section>
      )}
    </>
  );
}
