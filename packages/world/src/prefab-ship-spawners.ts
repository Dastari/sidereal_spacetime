/**
 * Registered prefab ship spawners for the live authority (SHIPS-PREFABS).
 *
 * Wren remains the starter; authored Wayfarer and the six provisional fleet designs are pinned separately.
 * The other prefabs in `@sidereal/content/prefabs` stay unregistered until each is
 * separately chosen, pinned and smoke-tested.
 *
 * Pins are constants so module load does no derivation. `spawn` checks the live catalog
 * revision first, installs the ship, then compares the installed blueprint and flight
 * definition hashes with the pins; any drift throws, which rolls the whole reducer back.
 * `prefab-ship-spawners.test.ts` asserts the pins equal the current derivation.
 */
import { SenderError } from "spacetimedb/server";
import { registerPrefabShipSpawner } from "./ship-assign";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { PREFAB_FLIGHT_DEFINITION } from "@sidereal/sim/prefab-flight";
import { CREW_WARDROBE_KITS } from "@sidereal/content/crew-wardrobe";
import {
  installPrefabShip,
  trustedPrefabTemplateFor,
} from "./prefab-ship-authority";
import {
  issueSocketStock,
  issueEmptySocketStorage,
} from "./ship-cargo-operator";
import { prefabById } from "@sidereal/content/prefabs";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import {
  currentComponentCatalog,
  effectivePrefabPin,
} from "./component-catalog";
import {
  REGISTERED_PREFAB_PINS,
  type PinnedPrefabShip,
} from "./prefab-ship-pins";

export { FED_WREN_PIN, REGISTERED_PREFAB_PINS } from "./prefab-ship-pins";

export function registerPinnedPrefab(pin: PinnedPrefabShip) {
  registerPrefabShipSpawner({
    prefabId: pin.prefabId,
    catalogRevision: pin.catalogRevision,
    blueprintSha256: pin.blueprintSha256,
    legacy: false,
    description: pin.description,
    // The ship takes the prefab name ("Wren"). The assign/starter callers pass the
    // character's name in `request.name`; a ship is not named after its pilot.
    spawn(ctx, actor, request) {
      const catalog = defaultPrefabComponentCatalog().revision;
      if (catalog !== pin.catalogRevision)
        throw new SenderError(
          `${pin.prefabId} pinned catalog ${pin.catalogRevision} but the module has ${catalog}`,
        );
      // X-3b: new ships pin the current component catalogue (the code catalogue with published
      // registry revisions applied). With nothing published this is the pin itself.
      const current = currentComponentCatalog(ctx);
      const effective = effectivePrefabPin(pin, current);
      const prefab = prefabById(pin.prefabId);
      if (!prefab) throw new SenderError(`Unknown prefab ${pin.prefabId}`);
      const result = installPrefabShip(
        ctx,
        actor,
        { prefabId: pin.prefabId, pose: request.pose },
        current.revision === pin.catalogRevision
          ? { boardActor: request.boardActor }
          : {
              template: trustedPrefabTemplateFor(prefab, current),
              boardActor: request.boardActor,
            },
      );
      const instance = ctx.db.constructionInstance.id.find(result.shipId);
      const binding = ctx.db.constructionFlightBinding.shipId.find(
        result.shipId,
      );
      if (instance?.blueprintSha256 !== effective.blueprintSha256)
        throw new SenderError(`${pin.prefabId} blueprint drifted from its pin`);
      if (
        binding?.definitionId !== PREFAB_FLIGHT_DEFINITION ||
        binding.definitionSha256 !== effective.flightDefinitionSha256
      )
        throw new SenderError(
          `${pin.prefabId} flight definition drifted from its pin`,
        );
      // Issue stock (e.g. the EVA suit in a new Wren's suit locker), in the same transaction.
      for (const stock of pin.issueStock ?? []) {
        const kit = CREW_WARDROBE_KITS[stock.kit];
        if (!kit)
          throw new SenderError(
            `${pin.prefabId} issue kit ${stock.kit} unknown`,
          );
        issueSocketStock(
          ctx,
          result.shipId,
          stock.socketKey,
          stock.containerName,
          JSON.stringify(kit),
        );
      }
      if (pin.issueEmptyStorage)
        for (const socket of prefabCargoSockets(prefab, 0, current))
          issueEmptySocketStorage(
            ctx,
            result.shipId,
            socket.key,
            "Storage crate",
          );
      return result;
    },
  });
}

for (const pin of REGISTERED_PREFAB_PINS) registerPinnedPrefab(pin);
