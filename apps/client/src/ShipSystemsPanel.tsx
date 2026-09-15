import { useEffect, useRef, useState } from "react";
import { tables, type DbConnection } from "@sidereal/net";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
import { createOperationId } from "./operation-id";
import "./ship-refit.css";
import "./ship-systems.css";

function engineName(sourceId: string): string {
  const definition = LAB_FLIGHT_ACTUATORS.find(
    (engine) => engine.id === sourceId,
  );
  if (!definition) return "Engine";
  const side =
    definition.x < 0 ? "Port" : definition.x > 0 ? "Starboard" : "Centre";
  if (sourceId.startsWith("drives-main")) return `${side} main drive`;
  if (sourceId.startsWith("drives-retro")) return `${side} retro drive`;
  return `${side} ${definition.y < 0 ? "aft" : "forward"} maneuver drive`;
}

/** Read-only when opened. Every switch is a revision-checked owner command. */
export function ShipSystemsPanel({
  connection,
  onError,
}: {
  connection: DbConnection | null;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [, redraw] = useState(0);
  const sending = useRef(false);
  useEffect(() => {
    if (!connection || !open) return;
    let disposed = false;
    setReady(false);
    setError("");
    const changed = () => {
      if (!disposed) redraw((revision) => revision + 1);
    };
    const watched = [
      connection.db.ownAuthoredFlights,
      connection.db.ownAuthoredFlightPowerFittings,
    ];
    for (const table of watched) {
      table.onInsert(changed);
      table.onDelete(changed);
      table.onUpdate(changed);
    }
    const subscription = connection
      .subscriptionBuilder()
      .onApplied(() => {
        if (disposed) subscription.unsubscribe();
        else setReady(true);
      })
      .onError(() => {
        if (!disposed)
          setError("Ship systems are unavailable. Reconnect and try again.");
      })
      .subscribe([
        tables.ownAuthoredFlights,
        tables.ownAuthoredFlightPowerFittings,
      ]);
    return () => {
      disposed = true;
      for (const table of watched) {
        table.removeOnInsert(changed);
        table.removeOnDelete(changed);
        table.removeOnUpdate(changed);
      }
      if (subscription.isActive()) subscription.unsubscribe();
    };
  }, [connection, open]);
  if (!connection) return null;
  const actor = [...connection.db.ownCharacters.iter()][0];
  if (!actor) return null;
  const binding = [...connection.db.ownAuthoredFlights.iter()].find(
    (row) => row.shipId === actor.shipId,
  );
  const engines = [...connection.db.ownAuthoredFlightPowerFittings.iter()]
    .filter((row) => row.shipId === actor.shipId && row.kind === "actuator")
    .sort((a, b) => a.sourceDeviceId.localeCompare(b.sourceDeviceId));
  async function setPower(placedObjectId: string, connected: boolean) {
    if (!connection || sending.current || !ready) return;
    const currentActor = [...connection.db.ownCharacters.iter()][0];
    const currentBinding = [...connection.db.ownAuthoredFlights.iter()].find(
      (row) => row.shipId === currentActor?.shipId,
    );
    const engine = [
      ...connection.db.ownAuthoredFlightPowerFittings.iter(),
    ].find(
      (row) =>
        row.shipId === currentBinding?.shipId &&
        row.placedObjectId === placedObjectId &&
        row.kind === "actuator",
    );
    if (!currentBinding || !engine) {
      setError("Your current ship changed. Reopen ship systems.");
      return;
    }
    sending.current = true;
    setPending(placedObjectId);
    setError("");
    try {
      await connection.reducers.setConstructionEnginePower({
        shipId: currentBinding.shipId,
        enginePlacedObjectId: placedObjectId,
        connected,
        expectedRevision: currentBinding.revision,
        operationId: createOperationId(),
      });
    } catch (failure) {
      const message = String(failure);
      setError(message);
      onError(message);
    } finally {
      sending.current = false;
      setPending("");
    }
  }
  return (
    <>
      <button
        className="ship-refit-toggle ship-systems-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Ship systems
      </button>
      {open && (
        <section
          className="ship-service-panel ship-systems-panel"
          aria-label="Ship power systems"
        >
          <button
            className="service-close"
            aria-label="Close ship systems"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2>Ship systems</h2>
          {error && <p role="alert">{error}</p>}
          {!ready ? (
            <p role="status">Loading ship connections…</p>
          ) : !binding || !engines.length ? (
            <p>No compatible power installation on this ship.</p>
          ) : (
            <>
              <p>Reactor · emits power</p>
              <small>
                Output capacity is unrated.{" "}
                {engines.filter((engine) => engine.powered).length} of{" "}
                {engines.length} engines connected.
              </small>
              <div className="ship-power-connections">
                {engines.map((engine) => (
                  <label key={engine.placedObjectId}>
                    <input
                      type="checkbox"
                      checked={engine.powered}
                      disabled={!!pending || binding.lifecycle !== "active"}
                      aria-label={`Power connection for ${engineName(engine.sourceDeviceId)}`}
                      onChange={(event) =>
                        void setPower(
                          engine.placedObjectId,
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      {engineName(engine.sourceDeviceId)}
                      <small>
                        {pending === engine.placedObjectId
                          ? "Updating…"
                          : engine.powered
                            ? "Accepts power · connected"
                            : "Accepts power · disconnected"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
