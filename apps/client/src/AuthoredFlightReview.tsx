import { supportsAuthoredFlightPresentation } from "./construction-flight-presentation";
import type { DbConnection } from "@sidereal/net";
import { createOperationId } from "./operation-id";

/** Explicit review installation/admission; this never runs on login or mount. */
export function AuthoredFlightReview({
  connection,
  instanceId,
  onError,
}: {
  connection: DbConnection;
  instanceId: string;
  onError: (message: string) => void;
}) {
  const instance = [...connection.db.ownConstructionInstances.iter()].find(
    (row) => row.id === instanceId,
  );
  const actor = [...connection.db.ownCharacters.iter()][0];
  const nativeHome = [...connection.db.ownGameShipAccess.iter()].some(
    (row) => row.characterId === actor?.id && row.shipId === instanceId,
  );
  const visit = [...connection.db.ownConstructionLocation.iter()].find(
    (row) => row.characterId === actor?.id && row.instanceId === instanceId,
  );
  const flight = [...connection.db.ownAuthoredFlights.iter()].find(
    (row) => row.shipId === instanceId,
  );
  const physics = [...connection.db.ownAuthoredFlightPhysics.iter()].find(
    (row) => row.shipId === instanceId,
  );
  let envelope: Record<string, number> | undefined;
  try {
    const parsed = JSON.parse(physics?.envelopeJson ?? "null");
    if (
      parsed &&
      [
        "forward",
        "reverse",
        "left",
        "right",
        "angularPositive",
        "angularNegative",
      ].every((key) => Number.isFinite(parsed[key]) && parsed[key] >= 0)
    )
      envelope = parsed;
  } catch {
    /* Missing/rejected compilation has no envelope to display. */
  }
  const act = (action: () => Promise<unknown>) =>
    void action().catch((error) => onError(String(error)));
  // Display pin only. Installation independently reconstructs and validates it.
  const qualified = supportsAuthoredFlightPresentation(
    instance?.blueprintSha256,
  );
  if (!visit || (!flight && !qualified)) return null;
  return (
    <section aria-label="Authored ship flight review">
      <strong>Authored ship flight</strong>
      {physics ? (
        <div aria-label="Compiled flight properties">
          <p role="status">
            {physics.status === "ready"
              ? "Flight ready"
              : `Flight unavailable: ${physics.reason}`}
          </p>
          {physics.massKg > 0 && (
            <dl>
              <dt>Mass</dt>
              <dd>{physics.massKg.toFixed(1)} kg</dd>
              <dt>Centre of mass</dt>
              <dd>
                {physics.centerX.toFixed(3)}, {physics.centerY.toFixed(3)} m
                from frame origin
              </dd>
              <dt>Inertia</dt>
              <dd>{physics.inertiaKgM2.toFixed(1)} kg·m²</dd>
              {envelope && (
                <>
                  <dt>Forward / reverse</dt>
                  <dd>
                    {envelope.forward.toFixed(3)} /{" "}
                    {envelope.reverse.toFixed(3)} m/s²
                  </dd>
                  <dt>Port / starboard</dt>
                  <dd>
                    {envelope.left.toFixed(3)} / {envelope.right.toFixed(3)}{" "}
                    m/s²
                  </dd>
                  <dt>Turn authority + / −</dt>
                  <dd>
                    {envelope.angularPositive.toFixed(3)} /{" "}
                    {envelope.angularNegative.toFixed(3)} rad/s²
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      ) : (
        <small>Waiting for flight compilation.</small>
      )}
      {!flight && instance ? (
        <button
          onClick={() =>
            act(() =>
              connection.reducers.installAuthoredShipFlight({
                instanceId,
                expectedInstanceRevision: instance.revision,
                operationId: createOperationId(),
              }),
            )
          }
        >
          Install qualified flight systems
        </button>
      ) : flight && !flight.active ? (
        <button
          onClick={() =>
            act(() =>
              connection.reducers.activateAuthoredShipFlight({
                shipId: instanceId,
                expectedRevision: flight.revision,
                operationId: createOperationId(),
              }),
            )
          }
        >
          Activate flight systems
        </button>
      ) : flight && !flight.flightAdmitted ? (
        <button
          onClick={() =>
            act(() =>
              connection.reducers.beginAuthoredFlightReview({
                expectedVisitId: visit.visitId,
                expectedVisitRevision: visit.revision,
                expectedAdmissionRevision: flight.admissionRevision,
                operationId: createOperationId(),
              }),
            )
          }
        >
          Begin flight review
        </button>
      ) : (
        <small>
          {flight?.seatState === "seated"
            ? "Piloting. TAB changes the view."
            : "Walk to the pilot seat and press E. TAB changes the view."}
        </small>
      )}
      {!nativeHome && (
        <small>
          Explicit test-ship transfer; your original ship and inventory are
          preserved.
        </small>
      )}
      {flight?.seatState === "recovery-pending" && (
        <small>
          Pilot exit is obstructed. Controls are disabled while a safe exit is
          checked.
        </small>
      )}
    </section>
  );
}
