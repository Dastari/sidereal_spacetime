import {
  TRUSTED_PREFAB_BLUEPRINT_PREFIX,
  type GameShipAccessFacts,
} from "./game-ship-access";

/** Permission to approach an owned target from EVA. This does not grant any
 * interior reads, walking, control station or inventory access before boarding. */
export function ownedShipEntryAccess(f: GameShipAccessFacts): boolean {
  const {
    actor: a,
    ship: s,
    motion: m,
    binding: b,
    instance: i,
    deck: d,
    admission: p,
  } = f;
  return !!(
    f.liveGame &&
    f.principalId &&
    a &&
    s &&
    m &&
    b &&
    i &&
    d &&
    p &&
    a.ownerId === f.principalId &&
    s.ownerId === f.principalId &&
    b.ownerId === f.principalId &&
    i.ownerId === f.principalId &&
    b.characterId === a.id &&
    p.characterId === a.id &&
    p.shipId === a.shipId &&
    p.systemId &&
    m.systemId === p.systemId &&
    m.shipId === s.id &&
    b.lifecycle === "active" &&
    s.id === b.shipId &&
    b.shipId === b.instanceId &&
    i.id === b.instanceId &&
    d.id === b.deckId &&
    d.instanceId === i.id &&
    i.revision >= 1n &&
    i.revision === b.instanceRevision &&
    i.blueprintSha256 === b.templateSha256 &&
    i.blueprintId?.startsWith(TRUSTED_PREFAB_BLUEPRINT_PREFIX)
  );
}
