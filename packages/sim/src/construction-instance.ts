import {
  planWayfarerExteriorGame,
  type WayfarerExteriorDocument,
} from "./wayfarer-exterior-qualification";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";
import {
  nativeAirlockCollision,
  readNativeAirlockDocument,
} from "./construction-airlock-document";
import { compilePublishedNativeExternalAirlock } from "./construction-airlock-published";
import {
  nativeStairRoomCollision,
  remapNativeStairRoomBinding,
} from "./construction-stairs-document";
import { nativeTraversalRoomCollision } from "./construction-traversal-document";
import { nativePressureRoomCollision } from "./construction-pressure-document";
import { pinnedFamilyCollision } from "./construction-boundary-family";
import {
  CONSTRUCTION_COMPILER,
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_LIMITS,
  type ConstructionDocument,
  type ConstructionSnapshot,
} from "@sidereal/content/construction";
import type { Point } from "@sidereal/content/ship-layout";
import {
  compileConstruction,
  constructionHash,
  readConstructionDraft,
  PINNED_FLOOR_KIT,
} from "./construction-transactions";
import { compareText } from "./layout-geometry";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
  type DeckObstacle,
} from "./construction-collision";

export const CONSTRUCTION_INSTANCE_LIMITS = Object.freeze({
  allocatedIds: 8192,
  reservedIds: 16384,
  spawnCandidates: 4096,
  documentBytes: CONSTRUCTION_LIMITS.bytes,
});
export type ConstructionInstanceIdKind =
  | "instance"
  | "deck"
  | "floor"
  | "object"
  | "partition"
  | "opening"
  | "room"
  | "route-node"
  | "route"
  | "hole"
  | "traversal-link"
  | "native-part"
  | "traversal-aperture"
  | "stair-link"
  | "stair-support"
  | "stair-aperture"
  | "boundary-treatment"
  | "navigation-reservation"
  | "service-connection";
export interface ConstructionIdentityMapping {
  sourceId: string;
  instanceId: string;
}
export interface ConstructionInstanceMappings {
  decks: ConstructionIdentityMapping[];
  floors: ConstructionIdentityMapping[];
  objects: ConstructionIdentityMapping[];
  partitions: ConstructionIdentityMapping[];
  openings: ConstructionIdentityMapping[];
  rooms: ConstructionIdentityMapping[];
  routeNodes: ConstructionIdentityMapping[];
  routes: ConstructionIdentityMapping[];
  holes: ConstructionIdentityMapping[];
  /** Exact native bindings; never inferred from room names. */
  traversalLinks: ConstructionIdentityMapping[];
  nativeParts: ConstructionIdentityMapping[];
  traversalApertures: ConstructionIdentityMapping[];
  stairLinks: ConstructionIdentityMapping[];
  stairSupports: ConstructionIdentityMapping[];
  stairApertures: ConstructionIdentityMapping[];
  boundaryTreatments: ConstructionIdentityMapping[];
  navigationReservations?: ConstructionIdentityMapping[];
  serviceConnections?: ConstructionIdentityMapping[];
  cargoGrids: [];
}
export interface SpawnObjectCollisionBinding {
  sourceObjectId: string;
  definitionId: string;
  deckIds: readonly string[];
  /** Empty is an explicit approved nonblocking classification. Nonempty shapes are
   * approved ship-local metre footprints, not inferred visual AABBs. */
  obstacles: readonly { vertices: Point[] }[];
}
export interface ConstructionSpawnRequest {
  blueprintRevisionId: string;
  expectedBlueprintSha256: string;
  sourceDeckId: string;
  bodyRadiusM: number;
  bodyHeightM: number;
  perimeterHalfWidthM: number;
  partitionHalfWidthM: number;
  objectCollisionBindings: readonly SpawnObjectCollisionBinding[];
  /** Additional occupied IDs known to the authority adapter. The injected allocator
   * must also guarantee global freshness in its transaction/namespace. */
  reservedIds?: readonly string[];
}
export interface ConstructionInstancePlan {
  instanceId: string;
  blueprintRevisionId: string;
  blueprintSha256: string;
  sourceDocumentId: string;
  document: ConstructionDocument;
  mappings: ConstructionInstanceMappings;
  spawn: {
    deckId: string;
    sourceDeckId: string;
    positionM: Point;
    walkingElevationM: number;
    bodyRadiusM: number;
    bodyHeightM: number;
    candidatesChecked: number;
  };
  allocatedIds: string[];
  readiness: ConstructionSnapshot["readiness"];
}
const uuid = (value: string) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const identityKey = (value: string) =>
  uuid(value.toLowerCase()) ? value.toLowerCase() : value;
const sourceId = (value: string) =>
  typeof value === "string" && /^[a-zA-Z0-9:_./-]{1,160}$/.test(value);
const sha = (value: string) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Construction instance: ${message}`);
}
const ordered = <T extends { id: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => compareText(a.id, b.id));

function* candidates(polygons: readonly Point[][]): Generator<Point> {
  for (const polygon of polygons) {
    yield [
      polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
      polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length,
    ];
    // Fan triangle incentres are useful for sloped/triangular native floor shapes.
    for (let i = 1; i + 1 < polygon.length; i++) {
      const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
      const wa = Math.hypot(b[0] - c[0], b[1] - c[1]),
        wb = Math.hypot(a[0] - c[0], a[1] - c[1]),
        wc = Math.hypot(a[0] - b[0], a[1] - b[1]),
        sum = wa + wb + wc;
      if (sum > 0)
        yield [
          (a[0] * wa + b[0] * wb + c[0] * wc) / sum,
          (a[1] * wa + b[1] * wb + c[1] * wc) / sum,
        ];
    }
    const minX = Math.min(...polygon.map((p) => p[0])),
      maxX = Math.max(...polygon.map((p) => p[0]));
    const minY = Math.min(...polygon.map((p) => p[1])),
      maxY = Math.max(...polygon.map((p) => p[1]));
    for (const fx of [0.25, 0.5, 0.75])
      for (const fy of [0.25, 0.5, 0.75])
        yield [minX + (maxX - minX) * fx, minY + (maxY - minY) * fy];
  }
}

/** Validate source geometry before allocating IDs. The allocator is injected so a world adapter
 * uses server UUID creation inside its own atomic transaction; browser RNG is irrelevant.
 * This returns a plan, not a live spawn, control grant, inventory or database mutation.
 */
export function planConstructionInstance(
  snapshot: ConstructionSnapshot,
  request: ConstructionSpawnRequest,
  allocateId: (kind: ConstructionInstanceIdKind, sourceId: string) => string,
): ConstructionInstancePlan {
  assert(
    snapshot.schema === CONSTRUCTION_SCHEMA &&
      snapshot.compiler === CONSTRUCTION_COMPILER &&
      typeof snapshot.canonical === "string",
    "Unsupported snapshot contract",
  );
  assert(
    new TextEncoder().encode(snapshot.canonical).length <=
      CONSTRUCTION_LIMITS.bytes,
    "Snapshot exceeds byte budget",
  );
  assert(
    sourceId(request.blueprintRevisionId) &&
      sha(request.expectedBlueprintSha256) &&
      sha(snapshot.sha256),
    "Invalid blueprint revision/hash",
  );
  assert(
    snapshot.sha256 === request.expectedBlueprintSha256 &&
      constructionHash(snapshot.canonical) === request.expectedBlueprintSha256,
    "Exact blueprint SHA mismatch",
  );
  // Revalidate the canonical publication rather than trusting caller readiness flags.
  const verified = compileConstruction(snapshot.canonical);
  assert(
    verified.canonical === snapshot.canonical &&
      verified.sha256 === snapshot.sha256,
    "Snapshot is not canonical compiled content",
  );
  const source = JSON.parse(verified.canonical) as ConstructionDocument;
  const sourceDeck = source.layout.decks.find(
    (d) => d.id === request.sourceDeckId,
  );
  assert(sourceDeck, "Unknown source spawn deck");
  assert(
    Number.isFinite(request.bodyRadiusM) &&
      request.bodyRadiusM > 0 &&
      request.bodyRadiusM <= 4,
    "Invalid spawn body radius",
  );
  assert(
    Number.isFinite(request.bodyHeightM) &&
      request.bodyHeightM > 0 &&
      request.bodyHeightM <= 16,
    "Invalid spawn standing height",
  );
  assert(
    request.bodyHeightM <=
      (sourceDeck.ceiling - PINNED_FLOOR_KIT.datums.floorTop) / 32,
    "Selected deck has insufficient standing clearance above native floor top",
  );
  assert(
    !(
      source.traversalRoom ||
      source.stairRoom ||
      source.airlockRoom ||
      source.wayfarerRebuild ||
      source.wayfarerExterior
    ) ||
      (request.bodyRadiusM === 0.3 && request.bodyHeightM === 1.8),
    "Native traversal fixture requires its qualified standing body",
  );
  const objects = [
    ...source.layout.fittings,
    ...(source.layout.assembly?.parts ?? []),
  ];
  const objectIds = new Set(objects.map((o) => o.id)),
    deckIds = new Set(source.layout.decks.map((d) => d.id));
  assert(
    request.objectCollisionBindings.length === objects.length,
    "Every object requires explicit collision coverage before safe spawn",
  );
  const coverage = new Set<string>(),
    obstacles: DeckObstacle[] =
      source.wayfarerRebuild || source.wayfarerExterior
        ? (source.wayfarerExterior
            ? planWayfarerExteriorGame(source as WayfarerExteriorDocument)
            : planWayfarerRebuildGame(source)
          ).sourceObstacles.filter((o) => o.id.startsWith("rebuild-"))
        : source.stairRoom
            ? nativeStairRoomCollision(source, request.sourceDeckId)
            : source.traversalRoom
              ? nativeTraversalRoomCollision(source, request.sourceDeckId)
              : source.pressureRoom
                ? nativePressureRoomCollision(source, request.sourceDeckId)
                : source.boundaryKit?.revision === "r004"
                  ? pinnedFamilyCollision(source.layout, request.sourceDeckId)
                  : [];
  for (const [i, binding] of [...request.objectCollisionBindings]
    .sort((a, b) => compareText(a.sourceObjectId, b.sourceObjectId))
    .entries()) {
    assert(
      objectIds.has(binding.sourceObjectId) &&
        !coverage.has(binding.sourceObjectId),
      "Unknown/duplicate object collision binding",
    );
    coverage.add(binding.sourceObjectId);
    assert(
      sourceId(binding.definitionId) &&
        binding.definitionId.length <= 128 &&
        binding.deckIds.length > 0 &&
        binding.deckIds.length <= deckIds.size &&
        new Set(binding.deckIds).size === binding.deckIds.length &&
        binding.deckIds.every((d) => deckIds.has(d)),
      "Invalid object collision definition/decks",
    );
    const fitting = source.layout.fittings.find(
      (f) => f.id === binding.sourceObjectId,
    );
    assert(
      !fitting || binding.deckIds.includes(fitting.deckId),
      "Fitting collision omits its actual deck",
    );
    assert(
      binding.obstacles.length <= 32,
      "Object collision shape budget exceeded",
    );
    if (binding.deckIds.includes(request.sourceDeckId))
      for (const [j, obstacle] of binding.obstacles.entries())
        obstacles.push({
          id: `object-${i}-${j}`,
          definitionId: binding.definitionId,
          vertices: obstacle.vertices,
        });
  }
  const collision = source.airlockRoom
    ? nativeAirlockCollision(
        readNativeAirlockDocument(verified.canonical),
        compilePublishedNativeExternalAirlock(source.layout.id),
        [],
      )
    : resolveDeckCollision(
        compileDeckCollision(source.layout, request.sourceDeckId, {
          shipId: "construction-spawn-validation",
          perimeterHalfWidthM: request.perimeterHalfWidthM,
          partitionHalfWidthM: request.partitionHalfWidthM,
          obstacles,
        }),
        [],
      );
  let positionM: Point | undefined,
    candidatesChecked = 0;
  const seenCandidates = new Set<string>();
  for (const candidate of candidates(collision.floors)) {
    const key = candidate.join(",");
    if (seenCandidates.has(key)) continue;
    seenCandidates.add(key);
    if (candidatesChecked >= CONSTRUCTION_INSTANCE_LIMITS.spawnCandidates)
      break;
    candidatesChecked++;
    if (
      canOccupyDeck(
        collision,
        {
          shipId: collision.shipId,
          deckId: collision.deckId,
          position: candidate,
        },
        request.bodyRadiusM,
      )
    ) {
      positionM = candidate;
      break;
    }
  }
  assert(
    positionM,
    "No safe spawn within bounded floor candidates; adjust approved geometry or spawn adapter, never clamp/teleport",
  );
  const layout = source.layout;
  const entities = [
    layout.decks,
    layout.tiles,
    layout.fittings,
    layout.assembly?.parts ?? [],
    layout.partitions,
    layout.openings,
    layout.rooms,
    layout.nodes,
    layout.routes,
    layout.serviceConnections ?? [],
    layout.decks.flatMap((d) => d.holes),
    layout.structure?.schema === "sidereal.layout-structure.v2"
      ? layout.structure.boundaryTreatments
      : [],
    ...(source.wayfarerRebuild || source.wayfarerExterior
      ? [
          layout.structure?.schema === "sidereal.layout-structure.v2"
            ? layout.structure.navigationReservations
            : [],
        ]
      : []),
    source.airlockRoom?.parts ?? [],
    source.stairRoom
      ? [
          { id: source.stairRoom.stairId },
          ...source.stairRoom.parts,
          ...source.stairRoom.supports,
          ...source.stairRoom.apertures,
        ]
      : [],
    source.traversalRoom
      ? [
          { id: source.traversalRoom.linkId },
          ...source.traversalRoom.parts,
          ...source.traversalRoom.apertures,
        ]
      : [],
  ].flat();
  // readLayout currently enforces this across all domains; keep an explicit guard
  // here because this plan deliberately uses one source-ID lookup for references.
  assert(
    new Set(entities.map((entity) => entity.id)).size === entities.length,
    "Ambiguous cross-domain source identity",
  );
  assert(
    entities.length + 1 <= CONSTRUCTION_INSTANCE_LIMITS.allocatedIds,
    "Instance identity allocation budget exceeded",
  );
  assert(
    (request.reservedIds?.length ?? 0) <=
      CONSTRUCTION_INSTANCE_LIMITS.reservedIds,
    "Reserved identity budget exceeded",
  );
  assert(
    (request.reservedIds ?? []).every(sourceId),
    "Invalid reserved identity",
  );
  const prohibited = new Set(
    [
      layout.id,
      request.blueprintRevisionId,
      ...entities.map((e) => e.id),
      ...(request.reservedIds ?? []),
    ].map(identityKey),
  );
  const allocatedIds: string[] = [],
    used = new Set<string>();
  const allocate = (kind: ConstructionInstanceIdKind, original: string) => {
    const id = allocateId(kind, original);
    assert(
      uuid(id) && !used.has(id) && !prohibited.has(id),
      "Allocator returned malformed, duplicate, occupied or blueprint entity ID",
    );
    used.add(id);
    allocatedIds.push(id);
    return id;
  };
  const instanceId = allocate("instance", layout.id);
  const map = (
    kind: ConstructionInstanceIdKind,
    items: readonly { id: string }[],
  ) =>
    ordered(items).map((item) => ({
      sourceId: item.id,
      instanceId: allocate(kind, item.id),
    }));
  const mappings: ConstructionInstanceMappings = {
    decks: map("deck", layout.decks),
    floors: map("floor", layout.tiles),
    objects: map("object", objects),
    partitions: map("partition", layout.partitions),
    openings: map("opening", layout.openings),
    rooms: map("room", layout.rooms),
    routeNodes: map("route-node", layout.nodes),
    routes: map("route", layout.routes),
    ...(layout.serviceConnections
      ? {
          serviceConnections: map(
            "service-connection",
            layout.serviceConnections,
          ),
        }
      : {}),
    holes: map(
      "hole",
      layout.decks.flatMap((d) => d.holes),
    ),
    traversalLinks: map(
      "traversal-link",
      source.traversalRoom ? [{ id: source.traversalRoom.linkId }] : [],
    ),
    nativeParts: map(
      "native-part",
      source.traversalRoom?.parts ??
        source.stairRoom?.parts ??
        source.airlockRoom?.parts ??
        [],
    ),
    traversalApertures: map(
      "traversal-aperture",
      source.traversalRoom?.apertures ?? [],
    ),
    stairLinks: map(
      "stair-link",
      source.stairRoom ? [{ id: source.stairRoom.stairId }] : [],
    ),
    stairSupports: map("stair-support", source.stairRoom?.supports ?? []),
    stairApertures: map("stair-aperture", source.stairRoom?.apertures ?? []),
    boundaryTreatments: map(
      "boundary-treatment",
      layout.structure?.schema === "sidereal.layout-structure.v2"
        ? layout.structure.boundaryTreatments
        : [],
    ),
    ...(source.wayfarerRebuild || source.wayfarerExterior
      ? {
          navigationReservations: map(
            "navigation-reservation",
            layout.structure?.schema === "sidereal.layout-structure.v2"
              ? layout.structure.navigationReservations
              : [],
          ),
        }
      : {}),
    cargoGrids: [],
  };
  const all = new Map(
    Object.values(mappings)
      .flat()
      .map((entry) => [entry.sourceId, entry.instanceId]),
  );
  const mapped = (id: string) => {
    const value = all.get(id);
    assert(value, `Missing source entity mapping ${id}`);
    return value;
  };
  const spawned = JSON.parse(verified.canonical) as ConstructionDocument,
    actual = spawned.layout;
  actual.id = instanceId;
  actual.source = {
    blueprintId: request.blueprintRevisionId,
    blueprintRevision: snapshot.sha256,
  };
  actual.playableDeckId = mapped(request.sourceDeckId);
  for (const deck of actual.decks) {
    deck.id = mapped(deck.id);
    for (const hole of deck.holes) hole.id = mapped(hole.id);
  }
  for (const entries of [
    actual.tiles,
    actual.fittings,
    actual.partitions,
    actual.openings,
    actual.rooms,
    actual.nodes,
    actual.routes,
  ])
    for (const entity of entries) {
      entity.id = mapped(entity.id);
      entity.deckId = mapped(entity.deckId);
    }
  for (const opening of actual.openings)
    opening.partitionId = mapped(opening.partitionId);
  for (const room of actual.rooms) {
    room.boundaryIds = room.boundaryIds.map(mapped);
    if (room.tileIds) room.tileIds = room.tileIds.map(mapped);
  }
  for (const route of actual.routes) {
    route.from = mapped(route.from);
    route.to = mapped(route.to);
  }
  for (const connection of actual.serviceConnections ?? []) {
    connection.id = mapped(connection.id);
    connection.fromDeviceId = mapped(connection.fromDeviceId);
    connection.toDeviceId = mapped(connection.toDeviceId);
  }
  for (const part of actual.assembly?.parts ?? []) part.id = mapped(part.id);
  for (const floor of spawned.floors) {
    floor.id = mapped(floor.id);
    floor.deckId = mapped(floor.deckId);
  }
  if (actual.structure?.schema === "sidereal.layout-structure.v2") {
    const structure = actual.structure;
    assert(
      (!structure.navigationReservations.length ||
        !!spawned.wayfarerRebuild ||
        !!spawned.wayfarerExterior) &&
        !structure.armor.length &&
        !Object.keys(structure.wallFaces).length,
      "Unsupported structural attachments require explicit identity adapters",
    );
    for (const reservation of structure.navigationReservations) {
      reservation.id = mapped(reservation.id);
      reservation.deckId = mapped(reservation.deckId);
    }
    structure.tileStyles = Object.fromEntries(
      Object.entries(structure.tileStyles).map(([id, style]) => [
        mapped(id),
        style,
      ]),
    );
    for (const profile of structure.deckProfiles)
      profile.deckId = mapped(profile.deckId);
    for (const treatment of structure.boundaryTreatments) {
      const oldDeck = treatment.deckId;
      treatment.id = mapped(treatment.id);
      treatment.deckId = mapped(oldDeck);
      if (treatment.source === "partition")
        treatment.sourceAnchorId = mapped(treatment.sourceAnchorId);
      else {
        const prefix = oldDeck + ":";
        assert(
          treatment.sourceAnchorId.startsWith(prefix),
          "Invalid perimeter treatment lineage",
        );
        treatment.sourceAnchorId =
          treatment.deckId +
          ":" +
          treatment.sourceAnchorId.slice(prefix.length);
      }
    }
  }
  if (spawned.airlockRoom) {
    const a = spawned.airlockRoom;
    a.deckId = mapped(a.deckId);
    a.innerDoorId = mapped(a.innerDoorId);
    a.outerDoorId = mapped(a.outerDoorId);
    for (const p of a.parts) p.id = mapped(p.id);
    a.roofTileIds = a.roofTileIds.map(mapped);
    a.exteriorTileIds = a.exteriorTileIds.map(mapped);
  }
  if (spawned.stairRoom)
    spawned.stairRoom = remapNativeStairRoomBinding(spawned.stairRoom, all);
  if (spawned.traversalRoom) {
    const r = spawned.traversalRoom;
    r.lowerDeckId = mapped(r.lowerDeckId);
    r.upperDeckId = mapped(r.upperDeckId);
    r.linkId = mapped(r.linkId);
    for (const part of r.parts) part.id = mapped(part.id);
    for (const aperture of r.apertures) aperture.id = mapped(aperture.id);
  }
  if (spawned.wayfarerRebuild) {
    spawned.wayfarerRebuild.identities = Object.fromEntries(
      Object.keys(spawned.wayfarerRebuild.identities).map((id) => [
        id,
        id === layout.id ? instanceId : mapped(id),
      ]),
    );
  }
  if (spawned.wayfarerExterior) {
    spawned.wayfarerExterior.identities = Object.fromEntries(
      Object.keys(spawned.wayfarerExterior.identities).map((id) => [
        id,
        id === layout.id ? instanceId : mapped(id),
      ]),
    );
  }
  const prefab = (spawned as ConstructionDocument & { prefab?: Record<string, unknown> }).prefab;
  if (prefab) {
    // Same identity-substitution contract as wayfarerRebuild/wayfarerExterior.
    const identities: Record<string, string> = { [layout.id]: instanceId };
    for (const [sourceId, id] of all) identities[sourceId] = id;
    prefab.identities = identities;
  }
  // UUID expansion can push a valid source over the parser budget. Validate the
  // exact remapped representation before the world adapter inserts any instance rows.
  const instanceJson = JSON.stringify(spawned);
  assert(
    new TextEncoder().encode(instanceJson).length <=
      CONSTRUCTION_INSTANCE_LIMITS.documentBytes,
    "Remapped instance exceeds construction document byte budget",
  );
  readConstructionDraft(instanceJson);
  if (actual.structure?.schema === "sidereal.layout-structure.v2")
    compileConstruction(instanceJson);
  return {
    instanceId,
    blueprintRevisionId: request.blueprintRevisionId,
    blueprintSha256: verified.sha256,
    sourceDocumentId: layout.id,
    document: spawned,
    mappings,
    allocatedIds,
    readiness: { ...verified.readiness },
    spawn: {
      deckId: mapped(request.sourceDeckId),
      sourceDeckId: request.sourceDeckId,
      positionM,
      walkingElevationM:
        (sourceDeck.elevation + PINNED_FLOOR_KIT.datums.floorTop) / 32,
      bodyRadiusM: request.bodyRadiusM,
      bodyHeightM: request.bodyHeightM,
      candidatesChecked,
    },
  };
}
