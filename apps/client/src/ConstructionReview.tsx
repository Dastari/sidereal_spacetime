import type { DbConnection } from "../../../packages/net/src/generated";
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
    visit = [...connection.db.ownConstructionLocation.iter()][0],
    instances = [...connection.db.ownConstructionInstances.iter()];
  if (!actor || !instances.length) return null;
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
        Authored room and ladder review. Powered airlocks and flight remain
        pending.
      </small>
      {visit ? (
        <button
          disabled={!!traversal}
          onClick={() =>
            act(() =>
              connection.reducers.leaveConstructionReview({
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
            disabled={!!traversal || (d.moving && !d.blocked)}
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
