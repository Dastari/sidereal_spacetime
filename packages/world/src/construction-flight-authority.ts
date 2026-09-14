import { insertQualifiedFlightPlan } from "./construction-flight-writer";
import type { Infer, InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type * as tables from "./construction-flight-tables";
import { requireGrant } from "./construction";
import { requireGame } from "./auth";
import {
  installConstructionFlight,
  type ConstructionFlightRequest,
} from "./construction-flight";
import type { FlightSpawnPlacement } from "@sidereal/sim/construction-flight";
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
/** Registered authority adapter; qualification and writes share the canonical writer. */
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
      insertPlan: (plan) => insertQualifiedFlightPlan(ctx, plan),
      insertReceipt: (row) => {
        ctx.db.constructionFlightReceipt.insert({ ...row, owner: ctx.sender });
      },
    },
    args,
  );
}
