/** Explicit interior membership. No result from this function is a control,
 * inventory, object-use, or refit grant. Authority adapters supply every fact. */
export interface PassengerAdmissionFacts {
  principalId: string;
  liveGame: boolean;
  nowMicros?: bigint;
  actor?: { id: string; ownerId: string; shipId: string; connected: boolean };
  grant?: {
    id: string;
    ownerId: string;
    granteeId: string;
    granteeOwnerId: string;
    shipId: string;
    deckId: string;
    instanceRevision: bigint;
    revision: bigint;
    expiresMicros: bigint;
  };
  visit?: {
    characterId: string;
    ownerId: string;
    shipId: string;
    deckId: string;
    grantId: string;
    grantRevision: bigint;
    visitId: string;
    admissionRevision: bigint;
    recoveryReason: string;
  };
  instance?: {
    id: string;
    ownerId: string;
    revision: bigint;
    blueprintSha256: string;
  };
  ship?: { id: string; ownerId: string };
  binding?: {
    shipId: string;
    instanceId: string;
    ownerId: string;
    deckId: string;
    instanceRevision: bigint;
    blueprintSha256: string;
    lifecycle: string;
  };
  location?: {
    characterId: string;
    instanceId: string;
    deckId: string;
    visitId: string;
  };
  admission?: {
    characterId: string;
    ownerId: string;
    shipId: string;
    systemId: string;
    revision: bigint;
  };
  motion?: { shipId: string; systemId: string };
  deck?: { id: string; instanceId: string };
}
export function passengerAdmission(f: PassengerAdmissionFacts) {
  const {
    actor: a,
    grant: g,
    visit: v,
    instance: i,
    ship: s,
    binding: b,
    location: l,
    admission: m,
    motion,
    deck: d,
  } = f;
  const accepted = !!(
    f.principalId &&
    f.liveGame &&
    a?.connected &&
    g &&
    v &&
    i &&
    s &&
    b &&
    l &&
    m &&
    motion &&
    d &&
    a.ownerId === f.principalId &&
    g.granteeOwnerId === f.principalId &&
    v.ownerId === f.principalId &&
    m.ownerId === f.principalId &&
    g.granteeId === a.id &&
    v.characterId === a.id &&
    l.characterId === a.id &&
    m.characterId === a.id &&
    g.ownerId !== f.principalId &&
    s.ownerId === g.ownerId &&
    i.ownerId === g.ownerId &&
    b.ownerId === g.ownerId &&
    g.id === v.grantId &&
    g.revision === v.grantRevision &&
    !v.recoveryReason &&
    (f.nowMicros === undefined || g.expiresMicros > f.nowMicros) &&
    a.shipId === g.shipId &&
    v.shipId === g.shipId &&
    i.id === g.shipId &&
    s.id === g.shipId &&
    b.shipId === g.shipId &&
    b.instanceId === g.shipId &&
    l.instanceId === g.shipId &&
    m.shipId === g.shipId &&
    motion.shipId === g.shipId &&
    g.deckId === v.deckId &&
    l.deckId === g.deckId &&
    b.deckId === g.deckId &&
    d.id === g.deckId &&
    d.instanceId === g.shipId &&
    g.instanceRevision === i.revision &&
    b.instanceRevision === i.revision &&
    b.blueprintSha256 === i.blueprintSha256 &&
    b.lifecycle === "active" &&
    v.visitId === l.visitId &&
    v.admissionRevision === m.revision &&
    !!m.systemId &&
    m.systemId === motion.systemId
  );
  return {
    readInterior: accepted,
    walkDeck: accepted,
    useObjects: false as const,
    pilotWithoutStation: false as const,
    refit: false as const,
  };
}
