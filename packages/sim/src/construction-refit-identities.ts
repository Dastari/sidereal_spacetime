import type { ConstructionDocument } from "@sidereal/content/construction";
import {
  CONSTRUCTION_INSTANCE_LIMITS,
  type ConstructionInstanceMappings,
  type ConstructionInstanceIdKind,
  type ConstructionIdentityMapping,
} from "./construction-instance";
import { readConstructionDraft } from "./construction-transactions";

export interface ConstructionRefitMappings extends ConstructionInstanceMappings {
  navigationReservations: ConstructionIdentityMapping[];
  armor: ConstructionIdentityMapping[];
}
export interface ConstructionRefitIdentityRequest {
  instanceId: string;
  currentRevision: bigint;
  expectedRevision: bigint;
  sourceCanonical: string;
  expectedSourceSha256: string;
  sourceBlueprintRevisionId: string;
  currentInstanceDocumentJson: string;
  candidateCanonical: string;
  expectedCandidateSha256: string;
  blueprintRevisionId: string;
  existingMappings: ConstructionInstanceMappings | ConstructionRefitMappings;
  /** Authority must enumerate all runtime fitting/item/container owners here. */
  protectedObjectIds: readonly string[];
  /** Explicitly audited structural assembly removals only. */
  removableObjectIds: readonly string[];
  reservedIds?: readonly string[];
}
type Kind = ConstructionInstanceIdKind | "navigation-reservation" | "armor";
type Domain = Exclude<keyof ConstructionRefitMappings, "serviceConnections">;
const domains: [Domain, Kind][] = [
  ["decks", "deck"],
  ["floors", "floor"],
  ["objects", "object"],
  ["partitions", "partition"],
  ["openings", "opening"],
  ["rooms", "room"],
  ["routeNodes", "route-node"],
  ["routes", "route"],
  ["holes", "hole"],
  ["traversalLinks", "traversal-link"],
  ["nativeParts", "native-part"],
  ["traversalApertures", "traversal-aperture"],
  ["stairLinks", "stair-link"],
  ["stairSupports", "stair-support"],
  ["stairApertures", "stair-aperture"],
  ["boundaryTreatments", "boundary-treatment"],
  ["navigationReservations", "navigation-reservation"],
  ["armor", "armor"],
  ["cargoGrids", "object"],
];
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Construction refit identities: ${message}`);
}
const uuid = (s: string) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    s,
  );
const normalized = (s: string) => (uuid(s.toLowerCase()) ? s.toLowerCase() : s);
function entities(doc: ConstructionDocument): Record<Domain, { id: string }[]> {
  check(
    !doc.airlockRoom &&
      !doc.stairRoom &&
      !doc.traversalRoom &&
      !doc.pressureRoom,
    "Native room adapters need a separate conservation qualification",
  );
  check(
    !doc.wayfarerExterior && !doc.layout.serviceConnections?.length,
    "Logical device circuits need a separate refit conservation qualification",
  );
  const l = doc.layout,
    v2 =
      l.structure?.schema === "sidereal.layout-structure.v2"
        ? l.structure
        : undefined;
  return {
    decks: l.decks,
    floors: l.tiles,
    objects: [...l.fittings, ...(l.assembly?.parts ?? [])],
    partitions: l.partitions,
    openings: l.openings,
    rooms: l.rooms,
    routeNodes: l.nodes,
    routes: l.routes,
    holes: l.decks.flatMap((d) => d.holes),
    traversalLinks: [],
    nativeParts: [],
    traversalApertures: [],
    stairLinks: [],
    stairSupports: [],
    stairApertures: [],
    boundaryTreatments: v2?.boundaryTreatments ?? [],
    navigationReservations: v2?.navigationReservations ?? [],
    armor: l.structure?.armor ?? [],
    cargoGrids: [],
  };
}
export function constructionRefitSourceIdentities(
  doc: ConstructionDocument,
): string[] {
  return Object.values(entities(doc))
    .flat()
    .map((e) => e.id)
    .sort();
}
function remap(
  doc: ConstructionDocument,
  mappings: ConstructionRefitMappings,
  instanceId: string,
  blueprintId: string,
  hash: string,
): ConstructionDocument {
  const d = JSON.parse(JSON.stringify(doc)) as ConstructionDocument,
    l = d.layout;
  const ids = new Map(
    Object.values(mappings)
      .flat()
      .map((m) => [m.sourceId, m.instanceId]),
  );
  const mapped = (id: string) => {
    const value = ids.get(id);
    check(value, `Missing identity reference ${id}`);
    return value;
  };
  const anchor = (id: string) => {
    if (ids.has(id)) return mapped(id);
    const deck = doc.layout.decks.find((deck) => id.startsWith(deck.id + ":"));
    check(deck, `Unknown boundary anchor ${id}`);
    return mapped(deck.id) + id.slice(deck.id.length);
  };
  l.id = instanceId;
  l.source = { blueprintId, blueprintRevision: hash };
  l.playableDeckId = mapped(l.playableDeckId);
  for (const deck of l.decks) {
    deck.id = mapped(deck.id);
    for (const hole of deck.holes) hole.id = mapped(hole.id);
  }
  for (const entries of [
    l.tiles,
    l.fittings,
    l.partitions,
    l.openings,
    l.rooms,
    l.nodes,
    l.routes,
  ])
    for (const entity of entries) {
      entity.id = mapped(entity.id);
      entity.deckId = mapped(entity.deckId);
    }
  for (const o of l.openings) o.partitionId = mapped(o.partitionId);
  for (const r of l.rooms) r.boundaryIds = r.boundaryIds.map(anchor);
  for (const r of l.routes) {
    r.from = mapped(r.from);
    r.to = mapped(r.to);
  }
  for (const p of l.assembly?.parts ?? []) p.id = mapped(p.id);
  for (const f of d.floors) {
    f.id = mapped(f.id);
    f.deckId = mapped(f.deckId);
  }
  const s = l.structure;
  if (s) {
    s.tileStyles = Object.fromEntries(
      Object.entries(s.tileStyles).map(([id, v]) => [mapped(id), v]),
    );
    s.wallFaces = Object.fromEntries(
      Object.entries(s.wallFaces).map(([id, v]) => [anchor(id), v]),
    );
    for (const a of s.armor) {
      a.id = mapped(a.id);
      a.deckId = mapped(a.deckId);
      a.boundaryId = anchor(a.boundaryId);
    }
    if (s.schema === "sidereal.layout-structure.v2") {
      for (const p of s.deckProfiles) p.deckId = mapped(p.deckId);
      for (const r of s.navigationReservations) {
        r.id = mapped(r.id);
        r.deckId = mapped(r.deckId);
      }
      for (const t of s.boundaryTreatments) {
        t.id = mapped(t.id);
        t.deckId = mapped(t.deckId);
        t.sourceAnchorId = anchor(t.sourceAnchorId);
        // A native identity can be an exact placed-part binding or an immutable asset ID.
        // Never replace substrings in immutable names/hashes/revisions.
        if (t.native && ids.has(t.native.id)) t.native.id = mapped(t.native.id);
      }
    }
  }
  const qualified = d as ConstructionDocument & {
    wayfarerRebuild?: { identities: Record<string, string> };
  };
  if (qualified.wayfarerRebuild)
    qualified.wayfarerRebuild.identities = Object.fromEntries(
      Object.entries(qualified.wayfarerRebuild.identities).map(
        ([sourceId, placedId]) => [
          sourceId,
          placedId === doc.layout.id ? instanceId : mapped(placedId),
        ],
      ),
    );
  readConstructionDraft(JSON.stringify(d));
  return d;
}

/** Identity proposal only. Does not qualify collision, flight, pressure or authorize a refit.
 * The authority adapter must atomically recheck live revisions and operation receipts. */
export function planConstructionRefitIdentities(
  request: ConstructionRefitIdentityRequest,
  allocateId: (kind: Kind, sourceId: string) => string,
) {
  check(uuid(request.instanceId), "Invalid instance UUID");
  check(
    typeof request.currentRevision === "bigint" &&
      request.currentRevision >= 0n &&
      request.currentRevision === request.expectedRevision,
    "Revision conflict",
  );
  check(
    request.sourceBlueprintRevisionId.length > 0 &&
      request.blueprintRevisionId.length > 0,
    "Missing blueprint revision identity",
  );
  const sourceProof = readConstructionDraft(request.sourceCanonical),
    candidateProof = readConstructionDraft(request.candidateCanonical);
  check(
    sourceProof.canonical === request.sourceCanonical &&
      sourceProof.sha256 === request.expectedSourceSha256,
    "Source proof mismatch",
  );
  check(
    candidateProof.canonical === request.candidateCanonical &&
      candidateProof.sha256 === request.expectedCandidateSha256,
    "Candidate proof mismatch",
  );
  check(
    sourceProof.sha256 !== candidateProof.sha256,
    "Candidate is already the source revision",
  );
  const source = JSON.parse(sourceProof.canonical) as ConstructionDocument,
    candidate = JSON.parse(candidateProof.canonical) as ConstructionDocument;
  const old = entities(source),
    next = entities(candidate);
  const oldMappings = {} as ConstructionRefitMappings;
  check(
    Object.keys(request.existingMappings).every((k) =>
      domains.some(([d]) => d === k),
    ),
    "Unknown mapping domain",
  );
  const sourceIds = new Set<string>(),
    occupied = new Set<string>([request.instanceId]);
  for (const [domain] of domains) {
    const entries =
      request.existingMappings[domain as keyof ConstructionInstanceMappings] ??
      [];
    check(
      Array.isArray(entries) && entries.length === old[domain].length,
      `Incomplete ${domain} mapping`,
    );
    const expected = new Set(old[domain].map((e) => e.id));
    for (const entry of entries) {
      check(
        Object.keys(entry).length === 2 &&
          expected.delete(entry.sourceId) &&
          !sourceIds.has(entry.sourceId),
        "Ambiguous source mapping",
      );
      check(
        uuid(entry.instanceId) && !occupied.has(entry.instanceId),
        "Duplicate or malformed instance mapping",
      );
      sourceIds.add(entry.sourceId);
      occupied.add(entry.instanceId);
    }
    oldMappings[domain] = entries.map((e) => ({ ...e })) as never;
  }
  const actual = readConstructionDraft(request.currentInstanceDocumentJson);
  const reconstructed = readConstructionDraft(
    JSON.stringify(
      remap(
        source,
        oldMappings,
        request.instanceId,
        request.sourceBlueprintRevisionId,
        sourceProof.sha256,
      ),
    ),
  );
  check(
    actual.canonical === reconstructed.canonical,
    "Live instance does not match exact source mapping proof",
  );
  const nextIds = Object.values(next)
    .flat()
    .map((e) => e.id);
  check(
    new Set(nextIds).size === nextIds.length &&
      nextIds.length <= CONSTRUCTION_INSTANCE_LIMITS.allocatedIds,
    "Ambiguous or over-budget candidate identities",
  );
  check(
    (request.reservedIds?.length ?? 0) <=
      CONSTRUCTION_INSTANCE_LIMITS.reservedIds,
    "Reserved identity budget exceeded",
  );
  for (const id of request.reservedIds ?? []) {
    check(
      typeof id === "string" && id.length <= 160,
      "Invalid reserved identity",
    );
    occupied.add(normalized(id));
  }
  for (const id of [
    ...sourceIds,
    ...nextIds,
    source.layout.id,
    candidate.layout.id,
    request.blueprintRevisionId,
    request.sourceBlueprintRevisionId,
  ])
    occupied.add(normalized(id));
  const oldObjects = new Set(oldMappings.objects.map((e) => e.instanceId));
  for (const list of [request.protectedObjectIds, request.removableObjectIds])
    check(
      list.length <= oldObjects.size &&
        new Set(list).size === list.length &&
        list.every((id) => oldObjects.has(id)),
      "Unknown or duplicate object conservation identity",
    );
  const protectedIds = new Set(request.protectedObjectIds),
    removableIds = new Set(request.removableObjectIds);
  for (const fitting of source.layout.fittings)
    protectedIds.add(
      oldMappings.objects.find((m) => m.sourceId === fitting.id)!.instanceId,
    );
  check(
    [...protectedIds].every((id) => !removableIds.has(id)),
    "Protected object marked removable",
  );
  const removed: { domain: Domain; sourceId: string; instanceId: string }[] =
    [];
  for (const [domain] of domains)
    for (const entry of oldMappings[domain])
      if (!next[domain].some((e) => e.id === entry.sourceId)) {
        check(
          !nextIds.includes(entry.sourceId),
          "Identity changed semantic domain",
        );
        check(
          domain !== "decks" && domain !== "floors",
          "Existing deck/floor removal requires separate migration",
        );
        check(
          domain !== "objects" ||
            (removableIds.has(entry.instanceId) &&
              !protectedIds.has(entry.instanceId)),
          "Object removal lacks structural conservation approval",
        );
        removed.push({ domain, ...entry });
      }
  const allocatedIds: string[] = [],
    mappings = {} as ConstructionRefitMappings;
  for (const [domain, kind] of domains)
    mappings[domain] = [...next[domain]]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((entity) => {
        const retained = oldMappings[domain].find(
          (m) => m.sourceId === entity.id,
        );
        if (retained) return { ...retained };
        const id = allocateId(kind, entity.id);
        check(
          uuid(id) && !occupied.has(id),
          "Allocator returned malformed, duplicate or occupied UUID",
        );
        occupied.add(id);
        allocatedIds.push(id);
        return { sourceId: entity.id, instanceId: id };
      }) as never;
  const document = remap(
    candidate,
    mappings,
    request.instanceId,
    request.blueprintRevisionId,
    candidateProof.sha256,
  );
  return {
    instanceId: request.instanceId,
    expectedRevision: request.expectedRevision,
    nextRevision: request.expectedRevision + 1n,
    sourceSha256: sourceProof.sha256,
    candidateSha256: candidateProof.sha256,
    document,
    mappings,
    allocatedIds,
    removed,
    qualificationRequired: true as const,
  };
}
