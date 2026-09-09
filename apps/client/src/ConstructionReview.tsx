import { AuthoredFlightReview } from "./AuthoredFlightReview";
import type { DbConnection } from "@sidereal/net";
import { createOperationId } from "./operation-id";
/** Explicit temporary review transit; this is not physical airlock/docking gameplay. */
export function ConstructionReview({
  connection,
  onError,
}: {
  connection: DbConnection | null;
  onError: (error: string) => void;
}) {
  if (
    !connection ||
    !new URLSearchParams(location.search).has("constructionReview")
  )
    return null;
  const actor = [...connection.db.ownCharacters.iter()][0],
    visit = [...connection.db.ownConstructionLocation.iter()].find(
      (v) => v.characterId === actor?.id,
    ),
    instances = [...connection.db.ownConstructionInstances.iter()];
  if (!actor) return null;
  // Permanent gameplay membership has no review return destination. A query
  // flag must not expose authoring/review controls for a normal owned ship.
  if (
    [...connection.db.ownGameShipAccess.iter()].some(
      (row) => row.characterId === actor.id && row.shipId === actor.shipId,
    )
  )
    return null;
  const stair = [...connection.db.ownConstructionStairWalks.iter()].find(
    (s) =>
      s.characterId === actor.id &&
      s.instanceId === visit?.instanceId &&
      s.visitId === visit?.visitId,
  );
  if (stair?.egressOnly)
    return (
      <aside
        className="construction-review-controls"
        aria-label="Stairway safe exit"
      >
        <strong>Workspace access ended</strong>
        <small>
          Use WASD to reach either stair landing. You will return to your
          original ship safely.
        </small>
      </aside>
    );
  if (!instances.length && !visit) return null;
  const flight = [...connection.db.ownAuthoredFlights.iter()].find(
    (row) => row.shipId === visit?.instanceId,
  );
  const doors = visit
    ? [...connection.db.ownConstructionDoors.iter()].filter(
        (d) => d.instanceId === visit.instanceId && d.deckId === visit.deckId,
      )
    : [];
  const grants = [...connection.db.ownConstructionGrants.iter()];
  const traversal = [...connection.db.ownConstructionTraversals.iter()].find(
    (t) => t.characterId === actor.id && t.instanceId === visit?.instanceId,
  );
  const links = [...connection.db.ownConstructionTraversalLinks.iter()].filter(
    (l) => l.characterId === actor.id && l.instanceId === visit?.instanceId,
  );
  const decks = [...connection.db.ownConstructionDecks.iter()];
  const workspaceId = instances.find(
    (i) => i.id === visit?.instanceId,
  )?.workspaceId;
  const mayTraverse = grants.some(
    (g) =>
      g.workspaceId === workspaceId &&
      g.capability === "instance.spawn" &&
      !g.revoked,
  );
  const pressure =
    visit &&
    [...connection.db.ownConstructionNativePressure.iter()].find(
      (p) => p.instanceId === visit.instanceId && p.deckId === visit.deckId,
    );
  const act = (fn: () => Promise<unknown>) =>
    void fn().catch((e) => onError(String(e)));
  return (
    <aside
      className="construction-review-controls"
      aria-label="Construction walking review"
    >
      <strong>Shipyard walking review</strong>
      <small>
        Authored rooms, stairs and ladders. Qualified ships can enter an
        explicit flight review. Powered airlocks remain pending.
      </small>
      {visit ? (
        <button
          disabled={
            !!traversal || !!stair || (!!flight && flight.seatState !== "none")
          }
          onClick={() =>
            act(() =>
              flight?.flightAdmitted
                ? connection.reducers.returnAuthoredFlightReview({
                    expectedVisitId: visit.visitId,
                    expectedVisitRevision: visit.revision,
                    expectedAdmissionRevision: flight.admissionRevision,
                    operationId: createOperationId(),
                  })
                : connection.reducers.leaveConstructionReview({
                    expectedVisitId: visit.visitId,
                    expectedRevision: visit.revision,
                    operationId: createOperationId(),
                  }),
            )
          }
        >
          Return to original ship
        </button>
      ) : (
        instances.map((i) => (
          <button
            key={i.id}
            disabled={
              !grants.some(
                (g) =>
                  g.workspaceId === i.workspaceId &&
                  g.capability === "instance.spawn" &&
                  !g.revoked,
              )
            }
            onClick={() =>
              act(() =>
                connection.reducers.enterConstructionReview({
                  instanceId: i.id,
                  expectedShipId: actor.shipId,
                  operationId: createOperationId(),
                }),
              )
            }
          >
            Walk {i.name} · {i.id.slice(0, 8)}
          </button>
        ))
      )}
      {visit && (
        <AuthoredFlightReview
          connection={connection}
          instanceId={visit.instanceId}
          onError={onError}
        />
      )}
      {visit && (
        <section aria-label="Deck traversal">
          <strong>
            {decks.find((d) => d.id === visit.deckId)?.name ?? "Occupied deck"}
          </strong>
          {traversal ? (
            <>
              <small>
                {traversal.phase} · {traversal.z.toFixed(2)} m
                {traversal.interruption ? ` · ${traversal.interruption}` : ""}
              </small>
              <button
                disabled={!mayTraverse || traversal.phase === "returning"}
                onClick={() =>
                  act(() =>
                    connection.reducers.cancelConstructionTraversal({
                      traversalId: traversal.traversalId,
                      expectedVisitId: visit.visitId,
                      expectedRevision: traversal.revision,
                      operationId: createOperationId(),
                    }),
                  )
                }
              >
                Cancel climb · return to start
              </button>
            </>
          ) : (
            links.map((link) => {
              const distance = Math.hypot(
                actor.localX - link.x,
                actor.localY - link.y,
              );
              return (
                <button
                  key={link.linkId}
                  disabled={!mayTraverse || !link.atLanding}
                  onClick={() =>
                    act(() =>
                      connection.reducers.beginConstructionTraversal({
                        linkId: link.linkId,
                        expectedVisitId: link.visitId,
                        expectedLocationRevision: link.locationRevision,
                        expectedInstanceRevision: link.instanceRevision,
                        expectedLinkRevision: link.linkRevision,
                        operationId: createOperationId(),
                      }),
                    )
                  }
                >
                  {!link.atLanding
                    ? `Approach ladder · ${distance.toFixed(1)} m`
                    : `Climb to ${decks.find((d) => d.id === link.destinationDeckId)?.name ?? "other deck"}`}
                </button>
              );
            })
          )}
        </section>
      )}
      {pressure && (
        <section aria-label="Compartment pressure">
          <strong>Qualified pressure room</strong>
          <small>Vacuum at spawn · no life support installed</small>
          {pressure.compartments.map((p, i) => (
            <div key={p.id}>
              Compartment {i + 1}: {(p.pressurePa / 1000).toFixed(2)} kPa ·{" "}
              {p.volumeM3.toFixed(3)} m³
            </div>
          ))}
          <small>
            Door seal:{" "}
            {pressure.sealRetraction === 0
              ? "seated"
              : pressure.sealRetraction === 1
                ? "retracted"
                : "moving"}
          </small>
        </section>
      )}
      {visit &&
        doors.map((d) => (
          <button
            key={d.id}
            disabled={!!traversal || !!stair || (d.moving && !d.blocked)}
            onClick={() =>
              act(() =>
                connection.reducers.setConstructionDoor({
                  openingId: d.id,
                  expectedVisitId: visit.visitId,
                  expectedRevision: d.revision,
                  open: !d.targetOpen,
                  operationId: createOperationId(),
                }),
              )
            }
          >
            {d.blocked ? "Obstructed · " : ""}
            {d.targetOpen ? "Close" : "Open"} door {d.id.slice(0, 6)} ·{" "}
            {Math.round(d.fraction * 100)}%
          </button>
        ))}
      {!visit &&
        !grants.some(
          (g) => g.capability === "instance.spawn" && !g.revoked,
        ) && (
          <small>A current workspace review grant is required to enter.</small>
        )}
    </aside>
  );
}
