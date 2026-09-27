import { WAYFARER_REBUILD_SHA256 } from "./wayfarer-rebuild-contract";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
/** Blueprint id prefix of trusted developer prefab ships installed by server code only
 * (never a player publication): `trusted-prefab:<prefab id>@<revision>`. */
export const TRUSTED_PREFAB_BLUEPRINT_PREFIX = "trusted-prefab:";

/** Private gameplay relationship created by the trusted starter transaction.
 * It is not an authoring grant, seating reservation or remote control grant. */
export interface GameShipBinding {
  shipId: string;
  instanceId: string;
  deckId: string;
  ownerId: string;
  characterId: string;
  templateSha256: string;
  instanceRevision: bigint;
  lifecycle: "active" | "suspended";
}
export interface GameShipAccessFacts {
  principalId: string;
  liveGame: boolean;
  actor?: { id: string; ownerId: string; shipId: string };
  binding?: GameShipBinding;
  ship?: { id: string; ownerId: string };
  motion?: { shipId: string; systemId: string };
  instance?: {
    id: string;
    ownerId: string;
    revision: bigint;
    blueprintSha256: string;
    /** Trusted prefab installs set `trusted-prefab:<id>@<rev>`; absent for older callers. */
    blueprintId?: string;
  };
  deck?: { id: string; instanceId: string };
  location?: { characterId: string; instanceId: string; deckId: string };
  admission?: { characterId: string; shipId: string; systemId: string };
}
/** Fail closed unless all current authoritative relations agree. Caller still
 * checks object reach/LOS, traversal conflicts, resources and revisions. */
export function gameShipAccess(f: GameShipAccessFacts) {
  const {
    actor: a,
    ship: s,
    motion: motion,
    binding: b,
    instance: i,
    deck: d,
    location: l,
    admission: m,
  } = f;
  const allowed = !!(
    f.liveGame &&
    f.principalId &&
    a &&
    b &&
    i &&
    d &&
    l &&
    m &&
    s &&
    motion &&
    s.id === b.shipId &&
    s.ownerId === f.principalId &&
    motion.shipId === s.id &&
    motion.systemId === m.systemId &&
    a.ownerId === f.principalId &&
    b.ownerId === f.principalId &&
    i.ownerId === f.principalId &&
    b.characterId === a.id &&
    l.characterId === a.id &&
    m.characterId === a.id &&
    b.lifecycle === "active" &&
    b.shipId === b.instanceId &&
    a.shipId === b.shipId &&
    i.id === b.instanceId &&
    l.instanceId === i.id &&
    m.shipId === b.shipId &&
    !!m.systemId &&
    d.id === b.deckId &&
    d.instanceId === i.id &&
    l.deckId === d.id &&
    i.revision === b.instanceRevision &&
    i.blueprintSha256 === b.templateSha256 &&
    ((b.templateSha256 === WAYFARER_STARTER.sha256 && i.revision === 1n) ||
      (b.templateSha256 === WAYFARER_REBUILD_SHA256 &&
        (i.revision === 1n || i.revision === 2n)) ||
      // Unrefitted trusted prefab ship. The workspace check in the world adapter is the trust
      // anchor; the prefab document itself is re-derived on every admission.
      (!!i.blueprintId?.startsWith(TRUSTED_PREFAB_BLUEPRINT_PREFIX) &&
        i.revision === 1n))
  );
  return {
    readInterior: allowed,
    walkDeck: allowed,
    useObjects: allowed,
    // Even the owner needs an occupied qualified station + live input lease.
    pilotWithoutStation: false as const,
    authorBlueprints: false as const,
    refit: false as const,
  };
}
