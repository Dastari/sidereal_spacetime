import { markShipFlightDirty } from "./construction-flight-dirty";
import type { Infer, InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type * as tables from "./construction-flight-tables";
import { requireGrant } from "./construction";
import { requireGame } from "./auth";
import {
  installConstructionFlight,
  type ConstructionFlightRequest,
} from "./construction-flight";
import type { FlightSpawnPlacement } from "../../sim/src/construction-flight";
type Row<T extends { rowType: unknown }> = T extends { rowType: infer R }
  ? Infer<R>
  : never;
type Binding = Row<typeof tables.constructionFlightBinding>;
type Fitting = Row<typeof tables.constructionFlightFitting>;
type Station = Row<typeof tables.constructionFlightStation>;
type Receipt = Row<typeof tables.constructionFlightReceipt>;
interface Primary<R> {
  find(id: string): R | null | undefined;
}
interface Table<R> {
  insert(row: R): unknown;
}
export interface ConstructionFlightTables {
  constructionFlightBinding: Table<Binding> & { shipId: Primary<Binding> };
  constructionFlightFitting: Table<Fitting> & {
    id: Primary<Fitting>;
    by_ship: { filter(shipId: string): Iterable<Fitting> };
  };
  constructionFlightStation: Table<Station> & { stationId: Primary<Station> };
  constructionFlightReceipt: Table<Receipt> & { id: Primary<Receipt> };
}
type BaseContext = ReducerCtx<InferSchema<typeof world>>;
export type ConstructionFlightContext = Omit<BaseContext, "db"> & {
  db: BaseContext["db"] & ConstructionFlightTables;
};
/** Hook must call the canonical bounded berth selector inside this reducer.
 * Injected by root integration after source freeze, not by a reducer argument. */
export interface ConstructionFlightAuthorityHooks {
  reserveBerth(ctx: ConstructionFlightContext): FlightSpawnPlacement;
}
/** Actual typed ctx.db adapter. Table declarations remain unregistered until the
 * matched release is pinned and native pilot activation is wired separately. */
export function installConstructionFlightAuthority(
  ctx: ConstructionFlightContext,
  args: ConstructionFlightRequest,
  hooks: ConstructionFlightAuthorityHooks,
) {
  return installConstructionFlight(
    {
      principalId: ctx.sender.toHexString(),
      requireLiveGame: () => {
        requireGame(ctx);
      },
      accessibleInstance: (id) => {
        const instance = ctx.db.constructionInstance.id.find(id);
        if (!instance?.owner.isEqual(ctx.sender)) return;
        requireGrant(ctx, instance.workspaceId, "draft.read");
        requireGrant(ctx, instance.workspaceId, "instance.spawn");
        return instance;
      },
      receipt: (id) => {
        const row = ctx.db.constructionFlightReceipt.id.find(id);
        if (!row) return;
        const { owner: _owner, ...receipt } = row;
        return receipt;
      },
      existingBinding: (id) => ctx.db.constructionFlightBinding.shipId.find(id),
      shipExists: (id) => !!ctx.db.ship.id.find(id),
      reserveServerBerth: () => hooks.reserveBerth(ctx),
      allocateUuid: () => ctx.newUuidV4().toString(),
      identityExists: (id) =>
        !!(
          ctx.db.constructionFlightFitting.id.find(id) ||
          ctx.db.station.id.find(id) ||
          ctx.db.ship.id.find(id) ||
          ctx.db.constructionInstance.id.find(id) ||
          ctx.db.inventoryItem.id.find(id) ||
          ctx.db.inventoryContainer.id.find(id) ||
          ctx.db.interactionObject.id.find(id)
        ),
      insertShip: (plan) => {
        ctx.db.ship.insert({ ...plan.ship, owner: ctx.sender });
      },
      insertMotion: (plan) => {
        ctx.db.shipWorldMotion.insert(plan.motion);
      },
      insertStation: (plan) => {
        const s = plan.station;
        ctx.db.station.insert({
          id: s.id,
          shipId: s.shipId,
          localX: s.localX,
          localY: s.localY,
          occupantId: undefined,
          operational: false,
        });
        ctx.db.constructionFlightStation.insert({
          stationId: s.id,
          shipId: s.shipId,
          deckId: s.deckId,
          seatPlacedObjectId: s.placedObjectId,
          consolePlacedObjectId: s.consolePlacedObjectId,
          revision: 1n,
        });
      },
      insertFittings: (plan) => {
        const c = plan.computer;
        ctx.db.constructionFlightFitting.insert({
          id: c.id,
          shipId: c.shipId,
          placedObjectId: c.placedObjectId,
          sourceDeviceId: c.sourceDeviceId,
          definitionId: c.definitionId,
          definitionRevision: 1,
          kind: "computer",
          installed: c.installed,
          powered: c.powered,
          availability: 1,
          revision: 1n,
        });
        for (const a of plan.actuators)
          ctx.db.constructionFlightFitting.insert({
            id: a.id,
            shipId: a.shipId,
            placedObjectId: a.placedObjectId,
            sourceDeviceId: a.sourceDeviceId,
            definitionId: a.definitionId,
            definitionRevision: 1,
            kind: "actuator",
            installed: true,
            powered: true,
            availability: a.availability,
            revision: 1n,
          });
      },
      insertBinding: (plan) => {
        ctx.db.constructionFlightBinding.insert({
          shipId: plan.ship.id,
          instanceId: plan.instanceId,
          owner: ctx.sender,
          deckId: plan.station.deckId,
          stationId: plan.station.id,
          instanceRevision: plan.instanceRevision,
          blueprintSha256: plan.blueprintSha256,
          definitionId: plan.definitionId,
          definitionSha256: plan.definitionSha256,
          lifecycle: plan.activation,
          revision: 1n,
        });
        markShipFlightDirty(ctx, plan.ship.id);
      },
      insertReceipt: (row) => {
        ctx.db.constructionFlightReceipt.insert({ ...row, owner: ctx.sender });
      },
    },
    args,
  );
}
