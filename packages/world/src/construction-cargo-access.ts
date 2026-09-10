import type { CargoInventoryReader } from "./scoped-inventory";
import type { CargoCarrierReadContext } from "./construction-cargo-carriers";
import { cargoCarrierAccessPoint } from "@sidereal/sim/cargo-carrier-access";
import {
  requireSecuredCargoAssembly,
  type SecuredCargoAssembly,
} from "@sidereal/sim/cargo-carrier-assembly";
/** Derived approach only, never a stored transform or an access grant. Normal
 * non-carrier roots retain their original access rules and metadata verbatim. */
export function withCargoCarrierApproaches(
  ctx: CargoCarrierReadContext,
  reader: CargoInventoryReader,
): CargoInventoryReader {
  return {
    ...reader,
    containersForRoot: function* (root) {
      const raw = ctx.db.constructionCargoAssembly.containerId.find(root),
        p = raw && ctx.db.constructionCargoPlacement.containerId.find(root);
      const actor = p && reader.actor(),
        geometry = p && reader.geometry(p.instanceId, p.deckId);
      let point: readonly [number, number, number] | undefined;
      if (raw && p && actor && geometry) {
        const assembly = raw as SecuredCargoAssembly;
        requireSecuredCargoAssembly(assembly);
        if (
          p.instanceId !== assembly.instanceId ||
          p.deckId !== assembly.deckId ||
          p.containerId !== assembly.containerId
        )
          throw Error("Carrier access binding mismatch");
        point = cargoCarrierAccessPoint(
          assembly,
          [p.originX, p.originY, p.originZ],
          p.quarterTurns,
          geometry.frame,
          [actor.localX, actor.localY],
        );
      }
      for (const c of reader.containersForRoot(root)) {
        if (
          point &&
          c.id === root &&
          !c.parentItemId &&
          c.scope?.kind === "instance"
        ) {
          if (
            c.scope.instanceId !== p!.instanceId ||
            c.scope.deckId !== p!.deckId ||
            c.scope.placedObjectId !== raw!.placedObjectId
          )
            throw Error("Carrier root access scope mismatch");
          yield { ...c, scope: { ...c.scope, accessPointM: point } };
        } else yield c;
      }
    },
  };
}
