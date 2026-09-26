import { compileShipFlight } from "./construction-flight-compilation";
import { readConstructionFlightInput } from "./construction-flight-input";
import { commitFlightCharacter } from "./construction-flight-dirty";
import {
  ownedGameShipAccess,
  GAME_OWNED_TEMPLATE_NAMESPACE,
} from "./game-ship-access-authority";
import {
  PilotGeometryError,
  prefabPilotPose,
} from "../../sim/src/construction-pilot";
import { PREFAB_FLIGHT_DEFINITION } from "../../sim/src/prefab-flight";
import type { Infer } from "spacetimedb/server";
import type { constructionPilotSeat } from "./construction-pilot-tables";
import type { constructionFlightBinding } from "./construction-flight-tables";
import type { ConstructionFlightContext } from "./construction-flight-authority";
import { requireGame } from "./auth";
import { consumeInputControl } from "./input-control";
import { clearAim } from "./combat";
import { constructionCollision } from "./construction-doors";
import { createConstructionStandingSupport } from "./construction-standing-support";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import {
  enterConstructionPilot,
  constructionPilotCanControl,
  recoverConstructionPilot,
  type PilotRepository,
  type PilotAction,
} from "./construction-pilot";
type SeatRow = Infer<typeof constructionPilotSeat.rowType>;
type BindingRow = Infer<typeof constructionFlightBinding.rowType>;
export type ConstructionPilotContext = Omit<ConstructionFlightContext, "db"> & {
  db: ConstructionFlightContext["db"] & {
    constructionPilotSeat: {
      characterId: {
        find(id: string): SeatRow | null | undefined;
        update(r: SeatRow): unknown;
        delete(id: string): unknown;
      };
      by_recovery: { filter(pending: boolean): Iterable<SeatRow> };
      by_owner: {
        filter(owner: import("spacetimedb").Identity): Iterable<SeatRow>;
      };
      insert(r: SeatRow): unknown;
    };
    constructionFlightBinding: { shipId: { update(row: BindingRow): unknown } };
  };
};
const support = createConstructionStandingSupport();
export function constructionPilotRepository(
  ctx: ConstructionPilotContext,
  characterId: string,
  compilePendingForCommand = false,
): PilotRepository {
  const actorRow = () => ctx.db.character.id.find(characterId);
  const owner = actorRow()?.owner;
  const principalId =
    ctx.sender.isEqual(ctx.databaseIdentity) && owner
      ? owner.toHexString()
      : ctx.sender.toHexString();
  const flight = (shipId: string) =>
    resolveShipFlightDefinition(
      {
        binding: (id) => ctx.db.constructionFlightBinding.shipId.find(id),
        constructionInstanceExists: (id) =>
          !!ctx.db.constructionInstance.id.find(id),
        currentInstanceRevision: (id) =>
          ctx.db.constructionInstance.id.find(id)?.revision,
        fittings: (id) => ctx.db.constructionFlightFitting.by_ship.filter(id),
            compiled: (id) => ctx.db.constructionFlightCompiled.shipId.find(id),
            dirty: (id) => !!ctx.db.constructionFlightDirty.shipId.find(id),
      },
      shipId,
    );
  return {
    principalId,
    requireLiveGame: () => {
      requireGame(ctx);
    },
    actor: () => {
      const a = actorRow(),
        location = ctx.db.constructionLocation.characterId.find(characterId);
      const instance =
          location && ctx.db.constructionInstance.id.find(location.instanceId),
        deck = location && ctx.db.constructionDeck.id.find(location.deckId);
      if (!a || !location || !instance || !deck) return;
      let height: number;
      try {
        height = support({ actor: a, location, instance, deck });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.startsWith("Standing support:")
        )
          throw error;
        return;
      }
      return {
        id: a.id,
        ownerId: a.owner.toHexString(),
        connected: a.connected,
        shipId: a.shipId,
        deckId: location.deckId,
        x: a.localX,
        y: a.localY,
        height,
        standing:
          !ctx.db.couchSeat.characterId.find(a.id) &&
          !ctx.db.constructionStairWalk.characterId.find(a.id) &&
          !ctx.db.constructionTraversal.characterId.find(a.id) &&
          !ctx.db.constructionPilotSeat.characterId.find(a.id),
      };
    },
    station: (id) => {
      const station = ctx.db.station.id.find(id),
        mapping = ctx.db.constructionFlightStation.stationId.find(id),
        binding =
          station &&
          ctx.db.constructionFlightBinding.shipId.find(station.shipId);
      if (
        !station ||
        !mapping ||
        !binding ||
        binding.stationId !== station.id ||
        mapping.shipId !== station.shipId ||
        mapping.deckId !== binding.deckId
      )
        return;
      return {
        id: station.id,
        shipId: station.shipId,
        deckId: mapping.deckId,
        occupantId: station.occupantId,
        operational: station.operational,
        instanceRevision: binding.instanceRevision,
        revision: binding.revision,
        // Trusted prefab installs store the derived station on the station row.
        ...(binding.definitionId === PREFAB_FLIGHT_DEFINITION
          ? { pose: prefabPilotPose([station.localX, station.localY]) }
          : {}),
      };
    },
    seat: (id) =>
      ctx.db.constructionPilotSeat.characterId.find(id) ?? undefined,
    hasCurrentAccess: (a, s) => {
      const row = actorRow(),
        instance = ctx.db.constructionInstance.id.find(s.shipId),
        location = ctx.db.constructionLocation.characterId.find(a.id),
        admission = ctx.db.worldAdmission.characterId.find(a.id);
      if (
        !row ||
        !instance ||
        !instance.owner.isEqual(row.owner) ||
        !admission?.owner.isEqual(row.owner) ||
        admission.shipId !== s.shipId ||
        a.ownerId !== principalId ||
        location?.instanceId !== instance.id ||
        location.deckId !== s.deckId ||
        instance.revision !== s.instanceRevision
      )
        return false;
      if (instance.workspaceId === GAME_OWNED_TEMPLATE_NAMESPACE)
        return ownedGameShipAccess(
          { ...ctx, sender: row.owner },
          instance.id,
          s.deckId,
          ctx.timestamp.microsSinceUnixEpoch,
        ).useObjects;
      return ["draft.read", "instance.spawn"].every((capability) => {
        const grant = ctx.db.constructionGrant.id.find(
          JSON.stringify([a.ownerId, instance.workspaceId, capability]),
        );
        return (
          !!grant &&
          !grant.revoked &&
          grant.expiresMicros > ctx.timestamp.microsSinceUnixEpoch
        );
      });
    },
    hasInputLease: (id) => {
      if (!ctx.sender.isEqual(ctx.databaseIdentity)) {
        const connectionId = ctx.connectionId?.toHexString();
        if (
          !connectionId ||
          ctx.db.inputControl.characterId.find(id)?.connectionId !==
            connectionId
        )
          return false;
      }
      return consumeInputControl(ctx, id);
    },
    hasOperationalFlight: (id) => {
      // Entry/input recording already checked current actor/deck permission. Compile this one
      // pending ship before checking the exact same operational computer gate;
      // the final walking step must not cause a transient false power loss.
      // Tick/recovery repositories never opt in and retain the scheduled budget.
      if (compilePendingForCommand && ctx.db.constructionFlightDirty.shipId.find(id))
        compileShipFlight(ctx.db, id, shipId => readConstructionFlightInput(ctx, shipId));
      const d = flight(id);
      return (
        d.status === "ready" &&
        d.kind === "construction" &&
        d.computer.installed &&
        d.computer.powered
      );
    },
    geometry: (s) => {
      const a = actorRow(),
        location = ctx.db.constructionLocation.characterId.find(characterId),
        instance = ctx.db.constructionInstance.id.find(s.shipId),
        deck = ctx.db.constructionDeck.id.find(s.deckId),
        mapping = ctx.db.constructionFlightStation.stationId.find(s.id);
      if (!a || !location || !instance || !deck || !mapping)
        throw new PilotGeometryError("Current native pilot geometry required");
      return {
        instance,
        frame: constructionCollision(ctx, instance, s.deckId),
        seatPlacedObjectId: mapping.seatPlacedObjectId,
        ...(s.pose ? { pose: s.pose } : {}),
        supportHeightAt: (x, y) =>
          support({
            actor: { ...a, localX: x, localY: y },
            location,
            instance,
            deck,
          }),
      };
    },
    nearbyActors: (s) => {
      const rows = [];
      for (const location of ctx.db.constructionLocation.by_instance.filter(
        s.shipId,
      )) {
        if (location.deckId !== s.deckId) continue;
        const a = ctx.db.character.id.find(location.characterId);
        if (!a) continue;
        rows.push({ id: a.id, x: a.localX, y: a.localY });
        if (rows.length > 128) break;
      }
      return rows;
    },
    receipt: (id) => {
      const r = ctx.db.constructionFlightReceipt.id.find(id);
      return r
        ? {
            id: r.id,
            requestJson: r.requestJson,
            stationId: r.stationId,
            revision: r.revision,
          }
        : undefined;
    },
    storeReceipt: (r) => {
      const s = ctx.db.station.id.find(r.stationId);
      if (!owner || !s) throw Error("Pilot receipt owner required");
      ctx.db.constructionFlightReceipt.insert({
        ...r,
        owner,
        instanceId: s.shipId,
        shipId: s.shipId,
      });
    },
    insertSeat: (r) => {
      if (!owner) throw Error("Pilot owner required");
      ctx.db.constructionPilotSeat.insert({ ...r, owner });
    },
    updateSeat: (r) => {
      const prior = ctx.db.constructionPilotSeat.characterId.find(
        r.characterId,
      );
      if (!prior) throw Error("Pilot reservation missing");
      ctx.db.constructionPilotSeat.characterId.update({ ...prior, ...r });
    },
    deleteSeat: (id) => {
      ctx.db.constructionPilotSeat.characterId.delete(id);
    },
    updateStation: (s) => {
      const prior = ctx.db.station.id.find(s.id),
        binding = ctx.db.constructionFlightBinding.shipId.find(s.shipId);
      if (!prior || !binding) throw Error("Pilot station missing");
      ctx.db.station.id.update({
        ...prior,
        occupantId: s.occupantId,
        operational: s.operational,
      });
      ctx.db.constructionFlightBinding.shipId.update({
        ...binding,
        revision: s.revision,
      });
    },
    setActorPose: (id, p) => {
      const a = ctx.db.character.id.find(id);
      if (!a) throw Error("Pilot actor missing");
      if (a.localX !== p.x || a.localY !== p.y || a.sprinting)
        commitFlightCharacter(ctx, {
          ...a,
          localX: p.x,
          localY: p.y,
          sprinting: false,
        }, row => ctx.db.character.id.update(row));
    },
    clearInputAndAim: (id) => {
      const input = ctx.db.input.characterId.find(id);
      if (
        input &&
        (input.throttle || input.turn || input.dx || input.dy || input.sprint)
      )
        ctx.db.input.characterId.update({
          ...input,
          throttle: 0,
          turn: 0,
          dx: 0,
          dy: 0,
          sprint: false,
        });
      clearAim(ctx, id);
    },
  };
}
export function enterConstructionPilotAuthority(
  ctx: ConstructionPilotContext,
  args: PilotAction,
) {
  const a = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!a) throw Error("Active character required");
  return enterConstructionPilot(constructionPilotRepository(ctx, a.id, true), args);
}
/** Recording still uses every consumption validator. A current crew movement
 * may require one bounded physical refresh before that exact check; scheduled
 * consumption never compiles here and always uses its queue budget. */
export function canRecordConstructionPilot(ctx: ConstructionPilotContext, characterId: string) {
  return constructionPilotCanControl(constructionPilotRepository(ctx, characterId, true), characterId);
}
export function canConsumeConstructionPilot(
  ctx: ConstructionPilotContext,
  characterId: string,
) {
  return constructionPilotCanControl(
    constructionPilotRepository(ctx, characterId),
    characterId,
  );
}
export function recoverConstructionPilotAuthority(
  ctx: ConstructionPilotContext,
  characterId: string,
  reason: string,
) {
  return recoverConstructionPilot(
    constructionPilotRepository(ctx, characterId),
    characterId,
    reason,
  );
}

/** Grant callbacks call this only for draft.read/instance.spawn changes. Queries
 * touch the affected owner's occupied seats, never all world actors/locations. */
export function recoverConstructionPilotsForGrant(
  ctx: ConstructionPilotContext,
  owner: import("spacetimedb").Identity,
  workspaceId: string,
) {
  const affected = [];
  for (const seat of ctx.db.constructionPilotSeat.by_owner.filter(owner)) {
    if (affected.length >= 64)
      throw Error("Pilot owner recovery budget exceeded");
    if (
      ctx.db.constructionInstance.id.find(seat.shipId)?.workspaceId ===
      workspaceId
    )
      affected.push(seat);
  }
  for (const seat of affected)
    recoverConstructionPilotAuthority(ctx, seat.characterId, "grant-loss");
}
export function recoverPendingConstructionPilots(
  ctx: ConstructionPilotContext,
) {
  const pending = [];
  for (const seat of ctx.db.constructionPilotSeat.by_recovery.filter(true)) {
    if (pending.length >= 64) throw Error("Pilot recovery budget exceeded");
    pending.push(seat);
  }
  for (const seat of pending)
    recoverConstructionPilotAuthority(
      ctx,
      seat.characterId,
      seat.recoveryReason,
    );
}
