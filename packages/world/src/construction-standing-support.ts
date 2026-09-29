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

/** Standing height on an accepted deck: the native floor top above the deck
 * datum. Every current ship stands on flat native floor plates. */
export function createConstructionStandingSupport() {
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
    return deck.elevation + 6 / 32;
  };
}
