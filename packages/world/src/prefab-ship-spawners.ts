/**
 * Registered prefab ship spawners for the live authority (SHIPS-PREFABS).
 *
 * Only `fed.s.wren` is registered: the owner picked it as the starter for their account.
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
import { installPrefabShip } from "./prefab-ship-authority";
import {
  REGISTERED_PREFAB_PINS,
  type PinnedPrefabShip,
} from "./prefab-ship-pins";

export { FED_WREN_PIN, REGISTERED_PREFAB_PINS } from "./prefab-ship-pins";

function registerPinned(pin: PinnedPrefabShip) {
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
      const result = installPrefabShip(ctx, actor, {
        prefabId: pin.prefabId,
        pose: request.pose,
      });
      const instance = ctx.db.constructionInstance.id.find(result.shipId);
      const binding = ctx.db.constructionFlightBinding.shipId.find(
        result.shipId,
      );
      if (instance?.blueprintSha256 !== pin.blueprintSha256)
        throw new SenderError(`${pin.prefabId} blueprint drifted from its pin`);
      if (
        binding?.definitionId !== PREFAB_FLIGHT_DEFINITION ||
        binding.definitionSha256 !== pin.flightDefinitionSha256
      )
        throw new SenderError(
          `${pin.prefabId} flight definition drifted from its pin`,
        );
      return result;
    },
  });
}

for (const pin of REGISTERED_PREFAB_PINS) registerPinned(pin);
