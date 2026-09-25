import {
  CURRENT_WAYFARER_STARTER,
  type WayfarerStarterTemplate,
} from "../../content/src/wayfarer-current-starter";
import { requireWayfarerReplacementOperator } from "./wayfarer-replacement-operator";
import type { Infer, InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type {
  personalStarterReceipt,
  gameShipAccess,
} from "./wayfarer-starter-tables";
import { createWayfarerStarter } from "./wayfarer-starter";
import { requireGame } from "./auth";
import { ensureCanonicalSystem, reserveBerth } from "./shared-world";
import { installDoors, constructionCollision } from "./construction-doors";
import { installQualifiedInstanceCargo } from "./scoped-inventory-installation";
import { installQualifiedInstanceInteractions } from "./construction-interactions";
import { insertQualifiedFlightPlan } from "./construction-flight-writer";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import { qualifyPilotGeometry } from "@sidereal/sim/construction-pilot";
import { wayfarerThresholdElevation } from "@sidereal/sim/wayfarer-threshold";
import { issueWayfarerPersonalKit } from "./wayfarer-personal-kit";

type Receipt = Infer<typeof personalStarterReceipt.rowType>;
type Access = Infer<typeof gameShipAccess.rowType>;
type Base = ReducerCtx<InferSchema<typeof world>>;
export type WayfarerStarterContext = Omit<Base, "db"> & {
  db: Base["db"] & {
    personalStarterReceipt: {
      owner: { find(owner: Base["sender"]): Receipt | null | undefined };
      insert(row: Receipt): unknown;
    };
    gameShipAccess: {
      shipId: { find(id: string): Access | null | undefined };
      insert(row: Access): unknown;
    };
  };
};

/** No reducer registration. Must run only within normal authenticated onboarding,
 * once the game-owned read/movement/object/pilot adapters have all been wired. */
export function createWayfarerStarterAuthority(
  ctx: WayfarerStarterContext,
  name: string,
  template: WayfarerStarterTemplate = CURRENT_WAYFARER_STARTER,
) {
  return installStarter(ctx, name, template);
}

/** Trusted maintenance path preserves the account's character identity, not the old ship. */
export function installReplacementWayfarer(
  ctx: WayfarerStarterContext,
  actor: NonNullable<
    ReturnType<WayfarerStarterContext["db"]["character"]["id"]["find"]>
  >,
) {
  requireWayfarerReplacementOperator(ctx);
  const ownerContext = new Proxy(ctx, {
    get(target, key) {
      if (key === "sender") return actor.owner;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const result = installStarter(
    ownerContext,
    actor.name,
    CURRENT_WAYFARER_STARTER,
    actor,
  );
  const installed = ctx.db.character.id.find(actor.id)!;
  ctx.db.character.id.update({ ...installed, connected: actor.connected });
  return result;
}
function installStarter(
  ctx: WayfarerStarterContext,
  name: string,
  template: WayfarerStarterTemplate,
  replacement?: NonNullable<
    ReturnType<WayfarerStarterContext["db"]["character"]["id"]["find"]>
  >,
) {
  let characterAllocated = false;
  return createWayfarerStarter(
    {
      ownerId: ctx.sender.toHexString(),
      requireLiveGame: () => {
        if (!replacement) requireGame(ctx);
      },
      existingCharacters: () =>
        (replacement
          ? []
          : [...ctx.db.character.by_owner.filter(ctx.sender)]
        ).map((a) => ({
          id: a.id,
          shipId: a.shipId,
          ownerId: a.owner.toHexString(),
        })),
      receipt: () => {
        const r = ctx.db.personalStarterReceipt.owner.find(ctx.sender);
        return r ? { ...r, ownerId: r.owner.toHexString() } : undefined;
      },
      allocateUuid: () => {
        if (replacement && !characterAllocated) {
          characterAllocated = true;
          return replacement.id;
        }
        return ctx.newUuidV4().toString();
      },
      identityExists: (id) =>
        id !== replacement?.id &&
        !!(
          ctx.db.character.id.find(id) ||
          ctx.db.ship.id.find(id) ||
          ctx.db.station.id.find(id) ||
          ctx.db.inventoryItem.id.find(id) ||
          ctx.db.inventoryContainer.id.find(id) ||
          ctx.db.interactionObject.id.find(id) ||
          ctx.db.constructionInstance.id.find(id) ||
          ctx.db.constructionDeck.id.find(id) ||
          ctx.db.constructionFlightFitting.id.find(id)
        ),
      reserveBerth: () => {
        const system = ensureCanonicalSystem(ctx.db);
        return {
          systemId: system.id,
          ...reserveBerth(ctx.db, system.id),
          serverTick: ctx.timestamp.microsSinceUnixEpoch / 50_000n,
        };
      },
      insertInstance: ({ instance: p }) => {
        ctx.db.constructionInstance.insert({
          id: p.instanceId,
          owner: ctx.sender,
          workspaceId: "trusted-starter-templates",
          blueprintId: p.blueprintRevisionId,
          blueprintSha256: p.blueprintSha256,
          name: p.document.layout.name,
          revision: 1n,
          documentJson: JSON.stringify(p.document),
          idMapJson: JSON.stringify(p.mappings),
          spawnDeckId: p.spawn.deckId,
          spawnX: p.spawn.positionM[0],
          spawnY: p.spawn.positionM[1],
          createdMicros: ctx.timestamp.microsSinceUnixEpoch,
        });
        for (const deck of p.document.layout.decks) {
          const source = p.mappings.decks.find((m) => m.instanceId === deck.id);
          if (!source) throw Error("Qualified source deck mapping missing");
          ctx.db.constructionDeck.insert({
            id: deck.id,
            instanceId: p.instanceId,
            sourceDeckId: source.sourceId,
            name: deck.name,
            elevation: deck.elevation / 32,
            ceiling: deck.ceiling / 32,
          });
        }
        installDoors(ctx, p.instanceId, p.document);
      },
      installFunctionalState: (p) => {
        installQualifiedInstanceCargo(ctx, p.instance, p.functional);
        installQualifiedInstanceInteractions(ctx, p.instance, p.functional);
      },
      installDormantFlight: (p) => {
        insertQualifiedFlightPlan(ctx, p.flight);
        // Gameplay naming is separate from the preserved review document label.
        const ship = ctx.db.ship.id.find(p.flight.ship.id)!;
        ctx.db.ship.id.update({ ...ship, name: "Wayfarer" });
      },
      activateQualifiedFlight: (p) => {
        const b = ctx.db.constructionFlightBinding.shipId.find(
            p.instance.instanceId,
          ),
          i = ctx.db.constructionInstance.id.find(p.instance.instanceId);
        const station = ctx.db.station.id.find(p.flight.station.id),
          binding = ctx.db.constructionFlightStation.stationId.find(
            p.flight.station.id,
          );
        if (
          !b ||
          !i ||
          !station ||
          !binding ||
          b.lifecycle !== "installed-dormant" ||
          b.revision !== 1n ||
          station.occupantId ||
          station.operational ||
          binding.shipId !== i.id ||
          binding.deckId !== p.instance.spawn.deckId
        )
          throw Error("Complete empty dormant starter flight required");
        const definition = resolveShipFlightDefinition(
          {
            binding: () => b,
            constructionInstanceExists: () => true,
            currentInstanceRevision: () => i.revision,
            fittings: (id) =>
              ctx.db.constructionFlightFitting.by_ship.filter(id),
          },
          i.id,
        );
        if (definition.status !== "dormant")
          throw Error("Qualified starter flight definition required");
        qualifyPilotGeometry({
          instance: i,
          frame: constructionCollision(ctx, i, b.deckId),
          seatPlacedObjectId: binding.seatPlacedObjectId,
          supportHeightAt: wayfarerThresholdElevation,
        });
        ctx.db.station.id.update({ ...station, operational: true });
        ctx.db.constructionFlightBinding.shipId.update({
          ...b,
          lifecycle: "active",
          revision: b.revision + 1n,
        });
      },
      insertCharacterAndStandingLocation: (p, clean) => {
        const [x, y] = p.instance.spawn.positionM;
        const characterRow = {
          ...(replacement ?? {}),
          id: p.characterId,
          owner: ctx.sender,
          name: clean,
          shipId: p.instance.instanceId,
          localX: x,
          localY: y,
          connected: true,
          sprinting: false,
        };
        if (replacement) ctx.db.character.id.update(characterRow);
        else ctx.db.character.insert(characterRow);
        // Permanent owned location has no review-return destination. Ownership
        // policy identifies it; a future transfer must supply real departure rules.
        ctx.db.constructionLocation.insert({
          characterId: p.characterId,
          visitId: ctx.newUuidV4().toString(),
          instanceId: p.instance.instanceId,
          deckId: p.instance.spawn.deckId,
          returnShipId: "",
          returnX: 0,
          returnY: 0,
          revision: 1n,
        });
        ctx.db.input.insert({
          characterId: p.characterId,
          sequence: 0n,
          throttle: 0,
          turn: 0,
          dx: 0,
          dy: 0,
          updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
          sprint: false,
        });
      },
      insertSharedAdmission: (p) => {
        ctx.db.worldAdmission.insert({
          characterId: p.characterId,
          owner: ctx.sender,
          shipId: p.instance.instanceId,
          systemId: p.flight.motion.systemId,
          revision: 1n,
        });
      },
      insertGameAccess: (b) => {
        const { ownerId: _owner, ...row } = b;
        ctx.db.gameShipAccess.insert({ ...row, owner: ctx.sender });
      },
      issuePersonalKitOnce: (id) => {
        issueWayfarerPersonalKit(ctx, id);
      },
      insertReceipt: (r) => {
        const { ownerId: _owner, ...row } = r;
        ctx.db.personalStarterReceipt.insert({ ...row, owner: ctx.sender });
      },
    },
    name,
    template,
  );
}
