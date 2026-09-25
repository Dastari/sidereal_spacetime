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
  const visit = [...connection.db.ownConstructionLocation.iter()].find(
    (row) => row.characterId === actor?.id && row.instanceId === instanceId,
  );
  const flight = [...connection.db.ownAuthoredFlights.iter()].find(
    (row) => row.shipId === instanceId,
  );
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
        <small>Walk to the pilot seat and press E. TAB changes the view.</small>
      )}
      <small>
        Explicit test-ship transfer; your original ship and inventory are
        preserved.
      </small>
      {flight?.seatState === "recovery-pending" && (
        <small>
          Pilot exit is obstructed. Controls are disabled while a safe exit is
          checked.
        </small>
      )}
    </section>
  );
}
