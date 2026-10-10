import type { DbConnection } from "@sidereal/net";
import {
  createServiceWindow,
  type ServiceRow,
} from "@sidereal/canvas-ui/service-window";
import { createOperationId } from "./operation-id";
export function testShipCount(connection: DbConnection | null) {
  const actor = connection && [...connection.db.ownCharacters.iter()][0];
  if (!connection || !actor) return undefined;
  return [...connection.db.ownConstructionInstances.iter()].filter(
    (i) =>
      i.id !== actor.shipId && i.workspaceId !== "trusted-starter-templates",
  ).length;
}
/** Existing explicit review/traversal intents; canvas kit owns every control. */
export function openShipReviewService(
  connection: DbConnection,
  close: () => void,
  invalidate: () => void,
  onError: (message: string) => void,
) {
  let pending = false,
    error = "",
    disposed = false;
  const act = async (action: () => Promise<unknown>) => {
    if (disposed || pending || !connection.isActive) return;
    pending = true;
    error = "";
    invalidate();
    try {
      await action();
    } catch (e) {
      if (!disposed) {
        error = String(e);
        onError(error);
      }
    } finally {
      pending = false;
      if (!disposed) invalidate();
    }
  };
  const display = createServiceWindow(() => {
    const actor = [...connection.db.ownCharacters.iter()][0];
    if (!actor) return { title: "Test ships", rows: [], pending };
    const location = [...connection.db.ownConstructionLocation.iter()].find(
      (v) => v.characterId === actor.id,
    );
    const nativeHome = [...connection.db.ownGameShipAccess.iter()].some(
      (v) => v.characterId === actor.id && v.shipId === actor.shipId,
    );
    const visit = nativeHome ? undefined : location;
    const flight = [...connection.db.ownAuthoredFlights.iter()].find(
      (f) => f.shipId === visit?.instanceId,
    );
    const physics = [...connection.db.ownAuthoredFlightPhysics.iter()].find(
      (f) => f.shipId === visit?.instanceId,
    );
    const stair = [...connection.db.ownConstructionStairWalks.iter()].find(
      (s) => s.characterId === actor.id && s.instanceId === visit?.instanceId,
    );
    const traversal = [...connection.db.ownConstructionTraversals.iter()].find(
      (t) => t.characterId === actor.id && t.instanceId === visit?.instanceId,
    );
    const grants = [...connection.db.ownConstructionGrants.iter()];
    const workspace = [...connection.db.ownConstructionInstances.iter()].find(
      (i) => i.id === visit?.instanceId,
    )?.workspaceId;
    const mayTraverse = grants.some(
      (g) =>
        g.workspaceId === workspace &&
        g.capability === "instance.spawn" &&
        !g.revoked,
    );
    const rows: ServiceRow[] = [];
    if (error) rows.push({ kind: "text", text: error, tone: "error" });
    if (stair?.egressOnly) {
      rows.push({
        kind: "text",
        text: "Workspace access ended. Use WASD to reach either stair landing and return safely.",
        tone: "warning",
      });
      return { title: "Stairway safe exit", rows, pending };
    }
    if (visit)
      rows.push({
        kind: "button",
        id: "review-return",
        text: "Return to original ship",
        disabled:
          pending ||
          !!traversal ||
          !!stair ||
          (!!flight && flight.seatState !== "none"),
        run: () =>
          void act(() =>
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
          ),
      });
    for (const instance of connection.db.ownConstructionInstances.iter()) {
      if (
        instance.id === actor.shipId ||
        instance.workspaceId === "trusted-starter-templates"
      )
        continue;
      const permitted = grants.some(
        (g) =>
          g.workspaceId === instance.workspaceId &&
          g.capability === "instance.spawn" &&
          !g.revoked,
      );
      rows.push({
        kind: "button",
        id: `review-${instance.id}`,
        text: `${visit ? "Switch to" : "Test"} ${instance.name}`,
        disabled:
          pending ||
          !permitted ||
          (!!visit && (!!traversal || !!stair || !!flight?.flightAdmitted)),
        run: () =>
          void act(() =>
            visit
              ? connection.reducers.switchConstructionReview({
                  instanceId: instance.id,
                  expectedInstanceRevision: instance.revision,
                  expectedVisitId: visit.visitId,
                  expectedRevision: visit.revision,
                  operationId: createOperationId(),
                })
              : connection.reducers.enterConstructionReview({
                  instanceId: instance.id,
                  expectedShipId: actor.shipId,
                  operationId: createOperationId(),
                }),
          ),
      });
    }
    if (visit && flight) {
      rows.push({
        kind: "text",
        text:
          physics?.status === "ready"
            ? "Flight ready"
            : `Flight unavailable: ${physics?.reason ?? "Waiting for compilation"}`,
        tone: "normal",
      });
      if (physics?.massKg)
        rows.push(
          {
            kind: "text",
            text: `Mass ${physics.massKg.toFixed(1)} kg · Inertia ${physics.inertiaKgM2.toFixed(1)} kg·m²`,
          },
          {
            kind: "text",
            text: `Centre of mass ${physics.centerX.toFixed(3)}, ${physics.centerY.toFixed(3)} m`,
          },
        );
      if (flight.active && !flight.flightAdmitted)
        rows.push({
          kind: "button",
          id: "review-flight",
          text: "Begin flight review",
          disabled: pending,
          run: () =>
            void act(() =>
              connection.reducers.beginAuthoredFlightReview({
                expectedVisitId: visit.visitId,
                expectedVisitRevision: visit.revision,
                expectedAdmissionRevision: flight.admissionRevision,
                operationId: createOperationId(),
              }),
            ),
        });
      else
        rows.push({
          kind: "text",
          text:
            flight.seatState === "seated"
              ? "Piloting. Tab changes view."
              : "Walk to the pilot seat and press E. Tab changes view.",
        });
    }
    if (visit) {
      const decks = [...connection.db.ownConstructionDecks.iter()];
      if (traversal)
        rows.push(
          {
            kind: "text",
            text: `Traversal ${traversal.phase} · ${traversal.z.toFixed(2)} m`,
          },
          {
            kind: "button",
            id: "review-cancel-climb",
            text: "Cancel climb · return to start",
            disabled:
              pending || !mayTraverse || traversal.phase === "returning",
            run: () =>
              void act(() =>
                connection.reducers.cancelConstructionTraversal({
                  traversalId: traversal.traversalId,
                  expectedVisitId: visit.visitId,
                  expectedRevision: traversal.revision,
                  operationId: createOperationId(),
                }),
              ),
          },
        );
      else
        for (const link of connection.db.ownConstructionTraversalLinks.iter())
          if (
            link.characterId === actor.id &&
            link.instanceId === visit.instanceId
          )
            rows.push({
              kind: "button",
              id: `review-climb-${link.linkId}`,
              text: link.atLanding
                ? `Climb to ${decks.find((d) => d.id === link.destinationDeckId)?.name ?? "other deck"}`
                : "Approach ladder",
              disabled: pending || !mayTraverse || !link.atLanding || !!stair,
              run: () =>
                void act(() =>
                  connection.reducers.beginConstructionTraversal({
                    linkId: link.linkId,
                    expectedVisitId: link.visitId,
                    expectedLocationRevision: link.locationRevision,
                    expectedInstanceRevision: link.instanceRevision,
                    expectedLinkRevision: link.linkRevision,
                    operationId: createOperationId(),
                  }),
                ),
            });
    }
    const pressure =
      visit &&
      [...connection.db.ownConstructionNativePressure.iter()].find(
        (p) => p.instanceId === visit.instanceId && p.deckId === visit.deckId,
      );
    if (pressure) {
      rows.push({
        kind: "text",
        text: "Qualified pressure room",
        tone: "normal",
      });
      for (const [index, part] of pressure.compartments.entries())
        rows.push({
          kind: "text",
          text: `Compartment ${index + 1}: ${(part.pressurePa / 1000).toFixed(2)} kPa · ${part.volumeM3.toFixed(3)} m³`,
        });
    }
    if (physics?.envelopeJson)
      try {
        const envelope = JSON.parse(physics.envelopeJson);
        for (const [label, a, b] of [
          ["Forward / reverse", "forward", "reverse"],
          ["Port / starboard", "left", "right"],
          ["Turn authority + / −", "angularPositive", "angularNegative"],
        ])
          if (Number.isFinite(envelope[a]) && Number.isFinite(envelope[b]))
            rows.push({
              kind: "text",
              text: `${label}: ${envelope[a].toFixed(3)} / ${envelope[b].toFixed(3)} ${a.startsWith("angular") ? "rad/s²" : "m/s²"}`,
            });
      } catch {
        /* A rejected compile is already disclosed above. */
      }
    const airlock =
      location &&
      [...connection.db.ownNativeAirlocks.iter()].find(
        (a) => a.id === location.instanceId && a.deckId === location.deckId,
      );
    if (location)
      for (const door of connection.db.ownConstructionDoors.iter()) {
        if (
          door.instanceId !== location.instanceId ||
          door.deckId !== location.deckId
        )
          continue;
        const inner = door.id === airlock?.innerDoorId,
          outer = door.id === airlock?.outerDoorId;
        const can = airlock
          ? inner
            ? airlock.innerCanService
            : outer
              ? airlock.outerCanService
              : false
          : true;
        if (airlock && (inner || outer)) {
          const fraction = inner
              ? airlock.innerFraction
              : airlock.outerFraction,
            seal = inner
              ? airlock.innerSealRetraction
              : airlock.outerSealRetraction;
          rows.push({
            kind: "text",
            text: `${inner ? "Inner" : "Outer"} door · ${Math.round(fraction * 100)}% · Seal ${seal === 0 ? "seated" : seal === 1 ? "retracted" : "moving"}`,
          });
          for (const open of [true, false])
            rows.push({
              kind: "button",
              id: `review-door-${door.id}-${open}`,
              text: `${open ? "Open / resume" : "Close / resume"} ${inner ? "inner" : "outer"} door`,
              disabled:
                pending ||
                !can ||
                airlock.manualServiceActive ||
                (open
                  ? fraction === 1 && seal === 1
                  : fraction === 0 && seal === 0),
              run: () =>
                void act(() =>
                  connection.reducers.setConstructionDoor({
                    openingId: door.id,
                    expectedVisitId: location.visitId,
                    expectedRevision: door.revision,
                    open,
                    operationId: createOperationId(),
                  }),
                ),
            });
          continue;
        }
        rows.push({
          kind: "button",
          id: `review-door-${door.id}`,
          text: `${door.blocked ? "Obstructed · " : ""}${door.targetOpen ? "Close" : "Open"} ${inner ? "inner" : outer ? "outer" : ""} door · ${Math.round(door.fraction * 100)}%`,
          disabled:
            pending ||
            !!traversal ||
            !!stair ||
            !can ||
            !!airlock?.manualServiceActive ||
            (door.moving && !door.blocked),
          run: () =>
            void act(() =>
              connection.reducers.setConstructionDoor({
                openingId: door.id,
                expectedVisitId: location.visitId,
                expectedRevision: door.revision,
                open: !door.targetOpen,
                operationId: createOperationId(),
              }),
            ),
        });
      }
    if (
      !visit &&
      !grants.some((g) => g.capability === "instance.spawn" && !g.revoked)
    )
      rows.push({
        kind: "text",
        text: "A current workspace review grant is required to enter.",
      });
    return { title: "Test ships", rows, pending };
  }, close);
  return {
    display,
    dispose() {
      disposed = true;
    },
  };
}
