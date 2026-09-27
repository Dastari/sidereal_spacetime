interface GroundScene {
  active: boolean;
  visit?: { instanceId: string; deckId: string };
  instance?: { id: string };
  acceptedStair?: unknown;
}

/** Display only server-projected drops belonging to the currently accepted
 * scene. Subscription deltas can arrive before the corresponding visit/document
 * update; never reuse those rows on another ship, deck or safe-egress scene.
 * This filter grants no inventory access or world position authority. */
export function groundItemsForScene<
  T extends { instanceId?: string; deckId?: string },
>(items: readonly T[], scene: GroundScene): T[] {
  if (!scene.active)
    return items.filter((item) => !item.instanceId && !item.deckId);
  const { visit, instance } = scene;
  if (
    !visit ||
    !instance ||
    instance.id !== visit.instanceId ||
    scene.acceptedStair
  )
    return [];
  return items.filter(
    (item) =>
      item.instanceId === visit.instanceId && item.deckId === visit.deckId,
  );
}
