import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { tables, type DbConnection } from "@sidereal/net";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
import { createOperationId } from "./operation-id";
import {
  budgetLines,
  budgetOfReport,
  budgetStatus,
  estimateShipSystems,
  type ShipBudget,
} from "./ship-systems-budget";
import { systemsDesignSource } from "./systems-design-source";
const SystemsDesignView = lazy(() => import("./SystemsDesignView"));
import "./ship-refit.css";
import "./ship-systems.css";
import "./systems-design.css";

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
  open,
  onClose,
}: {
  connection: DbConnection | null;
  onError: (message: string) => void;
  /** Opened from the system menu's Vessel tab; there is no HUD toggle. */
  open: boolean;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [, redraw] = useState(0);
  const sending = useRef(false);
  const [designOpen, setDesignOpen] = useState(false);
  const currentActor = connection
    ? [...connection.db.ownCharacters.iter()][0]
    : undefined;
  const isOwner =
    !!currentActor &&
    !!connection &&
    [...connection.db.ownShips.iter()].some(
      (s) => s.id === currentActor.shipId,
    );
  const designJson =
    isOwner && connection
      ? [...connection.db.ownConstructionInstances.iter()].find(
          (i) => i.id === currentActor?.shipId,
        )?.documentJson
      : undefined;
  const designSource = useMemo(
    () => systemsDesignSource(designJson),
    [designJson],
  );
  useEffect(() => {
    if (!open || !designSource) setDesignOpen(false);
  }, [open, designSource]);
  useEffect(() => {
    if (!connection || !open) return;
    let disposed = false;
    setReady(false);
    setError("");
    const changed = () => {
      if (!disposed) redraw((revision) => revision + 1);
    };
    const watched = [
      connection.db.ownConstructionInstances,
      connection.db.ownCharacters,
      connection.db.ownShips,
      connection.db.ownAuthoredFlights,
      connection.db.ownAuthoredFlightPowerFittings,
      connection.db.ownShipNetworks,
      connection.db.ownShipSystemsReport,
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
        tables.ownShipNetworks,
        tables.ownShipSystemsReport,
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
  // S4-1: the server-compiled budget (owner or admitted crew); while it is pending the owner
  // sees the client estimate over the same document and damage rows.
  const network = [...connection.db.ownShipNetworks.iter()].find(
    (row) => row.shipId === actor.shipId,
  );
  const report = [...connection.db.ownShipSystemsReport.iter()].find(
    (row) => row.shipId === actor.shipId,
  );
  const owned = [...connection.db.ownShips.iter()].some(
    (row) => row.id === actor.shipId,
  );
  const estimate =
    !network && owned
      ? estimateShipSystems(
          [...connection.db.ownConstructionInstances.iter()].find(
            (row) => row.id === actor.shipId,
          )?.documentJson,
          [...connection.db.ownShipComponentDamage.iter()]
            .filter((row) => row.shipId === actor.shipId)
            .map((row) => ({
              objectId: row.objectId,
              performance: row.performance,
            })),
        )
      : undefined;
  const budget: ShipBudget | undefined =
    network ??
    (estimate &&
      budgetOfReport(estimate.report, estimate.damaged, estimate.destroyed));
  const issues = (() => {
    const json = report?.reportJson;
    if (!json && !estimate) return [];
    try {
      const parsed = json
        ? (JSON.parse(json) as {
            issues: { severity: string; message: string }[];
          })
        : estimate!.report;
      return parsed.issues
        .filter((i) => i.severity !== "info")
        .slice(0, 5)
        .map((i) => i.message);
    } catch {
      return [];
    }
  })();
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
      {open && designOpen && designSource && (
        <Suspense fallback={<p role="status">Opening systems design…</p>}>
          <SystemsDesignView
            key={designJson}
            source={designSource}
            onClose={() => setDesignOpen(false)}
          />
        </Suspense>
      )}
      {open && (
        <section
          className="ship-service-panel ship-systems-panel"
          aria-label="Ship power systems"
        >
          <button
            className="service-close"
            aria-label="Close ship systems"
            onClick={onClose}
          >
            ×
          </button>
          <h2>Ship systems</h2>
          {ready && designSource && (
            <button
              className="systems-design-open"
              onClick={() => setDesignOpen(true)}
            >
              Open systems design view
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          {ready && budget && (
            <div className="ship-systems-budget" aria-label="Systems budget">
              <p>
                {budgetStatus(budget)}
                <small>
                  {network
                    ? `Server compile r${network.compileRevision}${network.access === "crew" ? " · crew view" : ""}`
                    : "Estimate · server compile pending"}
                </small>
              </p>
              <dl>
                {budgetLines(budget).map((line) => (
                  <div key={line.label}>
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                  </div>
                ))}
              </dl>
              {issues.length > 0 && (
                <ul className="ship-systems-issues">
                  {issues.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!ready ? (
            <p role="status">Loading ship connections…</p>
          ) : !binding || !engines.length ? (
            budget ? null : (
              <p>No compatible power installation on this ship.</p>
            )
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
