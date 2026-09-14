import {
  isQualifiedWayfarerBlueprint,
  qualifiedWayfarerInstanceObstacles,
} from "@sidereal/sim/wayfarer-walking-bindings";
import { wayfarerThresholdElevation } from "@sidereal/sim/wayfarer-threshold";

interface Instance {
  id: string;
  blueprintSha256: string;
  documentJson: string;
  idMapJson: string;
}
interface AcceptedStandingScope {
  actor: { id: string; shipId: string; localX: number; localY: number };
  location: { characterId: string; instanceId: string; deckId: string };
  instance: Instance;
  deck: { id: string; instanceId: string; elevation: number };
}

/** Only immutable proof results are cached. Each hit compares the exact saved
 * document and UUID map, so a refit cannot inherit the former support proof.
 * This bounded cache is an optimization, never persisted authority state. */
export function createConstructionStandingSupport() {
  const verified = new Map<string, Instance>();
  return (scope: AcceptedStandingScope): number => {
    const { actor, location, instance, deck } = scope;
    if (
      location.characterId !== actor.id ||
      actor.shipId !== instance.id ||
      location.instanceId !== instance.id ||
      location.deckId !== deck.id ||
      deck.instanceId !== instance.id ||
      ![actor.localX, actor.localY, deck.elevation].every(Number.isFinite)
    )
      throw Error(
        "Standing support: matching accepted actor/visit/deck required",
      );
    if (!isQualifiedWayfarerBlueprint(instance.blueprintSha256))
      return deck.elevation + 6 / 32;
    // The exact pinned Wayfarer has one deck at the zero origin. This also
    // catches a divergent authoritative deck row instead of mixing datums.
    if (deck.elevation !== 0)
      throw Error("Standing support: qualified deck datum changed");
    const key = instance.id + ":" + deck.id;
    const prior = verified.get(key);
    if (
      !prior ||
      prior.documentJson !== instance.documentJson ||
      prior.idMapJson !== instance.idMapJson ||
      prior.blueprintSha256 !== instance.blueprintSha256
    ) {
      qualifiedWayfarerInstanceObstacles(instance, deck.id);
      if (verified.size >= 32) verified.clear();
      verified.set(key, { ...instance });
    }
    return wayfarerThresholdElevation(actor.localX, actor.localY);
  };
}
