import {
  ownedGameShipAccess,
  GAME_OWNED_TEMPLATE_NAMESPACE,
  type GameShipAccessDatabase,
} from "./game-ship-access-authority";
import { t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type {
  ConstructionFlightBindingRow,
  ConstructionFlightFittingRow,
} from "./construction-flight-resolver";
interface Find<T> {
  find(id: string): T | null | undefined;
}
interface Owned {
  owner: Identity;
}
export interface FlightViewContext {
  sender: Identity;
  db: {
    character: {
      by_owner: {
        filter(
          owner: Identity,
        ): Iterable<Owned & { id: string; connected: boolean; shipId: string }>;
      };
    };
    constructionFlightBinding: {
      by_owner: {
        filter(owner: Identity): Iterable<ConstructionFlightBindingRow>;
      };
      shipId: Find<ConstructionFlightBindingRow>;
    };
    constructionFlightFitting: {
      by_ship: {
        filter(shipId: string): Iterable<ConstructionFlightFittingRow>;
      };
    };
    constructionInstance: {
      id: Find<
        Owned & {
          id: string;
          revision: bigint;
          workspaceId: string;
          blueprintSha256: string;
        }
      >;
    };
    constructionLocation: {
      characterId: Find<{
        visitId: string;
        revision: bigint;
        instanceId: string;
        deckId: string;
      }>;
    };
    constructionFlightReview: {
      characterId: Find<
        Owned & {
          visitId: string;
          instanceId: string;
          deckId: string;
          reviewAdmissionRevision: bigint;
        }
      >;
    };
    worldAdmission: {
      characterId: Find<Owned & { shipId: string; revision: bigint }>;
    };
    station: {
      id: Find<{
        id: string;
        shipId: string;
        operational: boolean;
        occupantId?: string;
      }>;
    };
    constructionPilotSeat: {
      characterId: Find<
        Owned & {
          stationId: string;
          shipId: string;
          deckId: string;
          revision: bigint;
          recoveryRequested: boolean;
        }
      >;
    };
  } & GameShipAccessDatabase;
}
export type AcceptedFlightContext = {
  sender: Identity;
  db: Pick<
    FlightViewContext["db"],
    | "constructionLocation"
    | "constructionFlightReview"
    | "worldAdmission"
    | "constructionFlightBinding"
    | "constructionInstance"
  > &
    GameShipAccessDatabase;
};
function bounded<T>(rows: Iterable<T>, max: number): T[] | undefined {
  const out: T[] = [];
  for (const row of rows) {
    if (out.length === max) return;
    out.push(row);
  }
  return out;
}
function actor(ctx: FlightViewContext) {
  const rows = bounded(ctx.db.character.by_owner.filter(ctx.sender), 1);
  const a = rows?.length === 1 ? rows[0] : undefined;
  return a?.connected && a.owner.isEqual(ctx.sender) ? a : undefined;
}
/** Accepted membership, not a capability grant. Revoked authoring access cannot
 * erase the saved return relation. Static review visits never pass this guard. */
export function hasAcceptedAuthoredFlight(
  ctx: AcceptedFlightContext,
  a: { id: string; shipId: string },
) {
  const visit = ctx.db.constructionLocation.characterId.find(a.id),
    review = ctx.db.constructionFlightReview.characterId.find(a.id),
    admission = ctx.db.worldAdmission.characterId.find(a.id),
    binding = ctx.db.constructionFlightBinding.shipId.find(a.shipId),
    instance = ctx.db.constructionInstance.id.find(a.shipId);
  if (instance?.workspaceId === GAME_OWNED_TEMPLATE_NAMESPACE) {
    return !!(
      visit &&
      binding &&
      binding.owner.isEqual(ctx.sender) &&
      binding.instanceId === a.shipId &&
      binding.deckId === visit.deckId &&
      binding.instanceRevision === instance.revision &&
      ownedGameShipAccess(ctx, a.shipId, visit.deckId).readInterior
    );
  }
  return !!(
    visit &&
    review &&
    admission &&
    binding &&
    instance &&
    review.owner.isEqual(ctx.sender) &&
    admission.owner.isEqual(ctx.sender) &&
    binding.owner.isEqual(ctx.sender) &&
    instance.owner.isEqual(ctx.sender) &&
    visit.visitId === review.visitId &&
    visit.instanceId === a.shipId &&
    review.instanceId === a.shipId &&
    visit.deckId === review.deckId &&
    visit.deckId === binding.deckId &&
    binding.instanceId === a.shipId &&
    binding.instanceRevision === instance.revision &&
    admission.shipId === a.shipId &&
    admission.revision === review.reviewAdmissionRevision
  );
}
export const authoredFlightProjection = t.row("AuthoredFlightStatus", {
  shipId: t.string().primaryKey(),
  stationId: t.string(),
  stationRevision: t.u64(),
  deckId: t.string(),
  lifecycle: t.string(),
  revision: t.u64(),
  active: t.bool(),
  flightAdmitted: t.bool(),
  visitId: t.string(),
  visitRevision: t.u64(),
  admissionRevision: t.u64(),
  seatState: t.string(),
  seatRevision: t.u64(),
});
/** Root wraps this with auth.gameView. Fields are owned scalar state, never a
 * workspace document, another occupant identity, or an implicit control grant. */
export function ownAuthoredFlights(ctx: FlightViewContext) {
  const a = actor(ctx);
  if (!a) return [];
  const bindings = bounded(
    ctx.db.constructionFlightBinding.by_owner.filter(ctx.sender),
    64,
  );
  if (!bindings) return [];
  const visit = ctx.db.constructionLocation.characterId.find(a.id),
    admission = ctx.db.worldAdmission.characterId.find(a.id),
    seat = ctx.db.constructionPilotSeat.characterId.find(a.id),
    admitted = hasAcceptedAuthoredFlight(ctx, a);
  return bindings
    .filter((b) => b.owner.isEqual(ctx.sender))
    .map((b) => {
      const s = ctx.db.station.id.find(b.stationId),
        i = ctx.db.constructionInstance.id.find(b.shipId);
      const currentVisit =
        visit?.instanceId === b.shipId &&
        visit.deckId === b.deckId &&
        a.shipId === b.shipId;
      const ownSeat =
        seat?.owner.isEqual(ctx.sender) &&
        seat.shipId === b.shipId &&
        seat.stationId === b.stationId;
      return {
        shipId: b.shipId,
        stationId: b.stationId,
        stationRevision: b.revision,
        deckId: b.deckId,
        lifecycle: b.lifecycle,
        revision: b.revision,
        active: !!(
          b.lifecycle === "active" &&
          s?.shipId === b.shipId &&
          s.operational &&
          i?.owner.isEqual(ctx.sender) &&
          i.revision === b.instanceRevision
        ),
        flightAdmitted: admitted && a.shipId === b.shipId,
        visitId: currentVisit ? visit.visitId : "",
        visitRevision: currentVisit ? visit.revision : 0n,
        admissionRevision: admission?.owner.isEqual(ctx.sender)
          ? admission.revision
          : 0n,
        seatState:
          ownSeat && seat
            ? seat.recoveryRequested
              ? "recovery-pending"
              : "seated"
            : "none",
        seatRevision: ownSeat && seat ? seat.revision : 0n,
      };
    });
}
export const authoredFlightFittingProjection = t.row("AuthoredFlightFitting", {
  id: t.string().primaryKey(),
  shipId: t.string(),
  placedObjectId: t.string(),
  sourceDeviceId: t.string(),
  kind: t.string(),
});
/** Separate additive wire contract: existing clients retain the five-field
 * AuthoredFlightFitting projection while Systems subscribes to power state. */
export const authoredFlightPowerFittingProjection = t.row(
  "AuthoredFlightPowerFitting",
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    placedObjectId: t.string(),
    sourceDeviceId: t.string(),
    kind: t.string(),
    powered: t.bool(),
  },
);
function acceptedOwnerFittings(ctx: FlightViewContext) {
  const a = actor(ctx);
  if (!a || !hasAcceptedAuthoredFlight(ctx, a)) return [];
  const rows = bounded(
    ctx.db.constructionFlightFitting.by_ship.filter(a.shipId),
    10,
  );
  if (
    !rows ||
    rows.length !== 10 ||
    rows.some((r) => r.shipId !== a.shipId) ||
    new Set(rows.map((r) => r.id)).size !== 10 ||
    new Set(rows.map((r) => r.sourceDeviceId)).size !== 10 ||
    new Set(rows.map((r) => r.placedObjectId)).size !== 10
  )
    return [];
  return rows;
}
export function ownAuthoredFlightFittings(ctx: FlightViewContext) {
  return acceptedOwnerFittings(ctx).map(
    ({ id, shipId, placedObjectId, sourceDeviceId, kind }) => ({
      id,
      shipId,
      placedObjectId,
      sourceDeviceId,
      kind,
    }),
  );
}
export function ownAuthoredFlightPowerFittings(ctx: FlightViewContext) {
  return acceptedOwnerFittings(ctx).map(
    ({ id, shipId, placedObjectId, sourceDeviceId, kind, powered }) => ({
      id,
      shipId,
      placedObjectId,
      sourceDeviceId,
      kind,
      powered,
    }),
  );
}
