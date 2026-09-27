import {
  WAYFARER_EXTERIOR_SHA256,
  planWayfarerExteriorGame,
  qualifiedWayfarerExteriorInstanceObstacles,
} from "./wayfarer-exterior-qualification";
import {
  WAYFARER_REBUILD_SHA256,
  verifyWayfarerRebuildSource,
} from "./wayfarer-rebuild-contract";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";
import proof from "@sidereal/content/wayfarer-walking-proof.json";
import type { Point } from "@sidereal/content/ship-layout";
import type { ConstructionSnapshot } from "@sidereal/content/construction";
import {
  compileConstruction,
  constructionHash,
} from "./construction-transactions";
import type { SpawnObjectCollisionBinding } from "./construction-instance";
import { qualifiedWayfarerThresholdBinding } from "./wayfarer-threshold";
/** Immutable server-selected qualifier for one exact source snapshot. Clients
 * cannot provide alternative empty colliders or transplant these onto a refit. */
export function qualifiedWayfarerWalkingBindings(
  snapshot: ConstructionSnapshot,
  bodyRadiusM: number,
  bodyHeightM: number,
): SpawnObjectCollisionBinding[] {
  if (snapshot.sha256 === WAYFARER_EXTERIOR_SHA256) {
    if (
      constructionHash(snapshot.canonical) !== WAYFARER_EXTERIOR_SHA256 ||
      bodyRadiusM !== 0.3 ||
      bodyHeightM !== 1.8
    )
      throw Error(
        "Wayfarer exterior: exact source and actor envelope required",
      );
    return planWayfarerExteriorGame(JSON.parse(snapshot.canonical))
      .sourceObjectCollisionBindings;
  }
  if (snapshot.sha256 === WAYFARER_REBUILD_SHA256) {
    if (
      constructionHash(snapshot.canonical) !== WAYFARER_REBUILD_SHA256 ||
      bodyRadiusM !== 0.3 ||
      bodyHeightM !== 1.8
    )
      throw Error("Wayfarer rebuild: exact source and actor envelope required");
    return planWayfarerRebuildGame(JSON.parse(snapshot.canonical))
      .sourceObjectCollisionBindings;
  }
  if (
    snapshot.sha256 !== proof.documentSha256 ||
    constructionHash(snapshot.canonical) !== proof.documentSha256 ||
    compileConstruction(snapshot.canonical).sha256 !== proof.documentSha256
  )
    throw Error("Wayfarer walking proof: exact canonical source required");
  if (
    bodyRadiusM !== 0.3 ||
    !Number.isFinite(bodyHeightM) ||
    bodyHeightM <= 0 ||
    bodyHeightM > proof.standingSlabM[1] - proof.standingSlabM[0]
  )
    throw Error("Wayfarer walking proof: unsupported actor envelope");
  const threshold =
    bodyHeightM <= 1.8
      ? qualifiedWayfarerThresholdBinding(bodyHeightM, snapshot)
      : null;
  return proof.bindings.map((binding) =>
    threshold?.sourceObjectId === binding.sourceObjectId
      ? threshold
      : {
          sourceObjectId: binding.sourceObjectId,
          definitionId: "wayfarer-walk-r001-" + binding.assetId,
          deckIds: [proof.deckId],
          obstacles: binding.obstacles.map((o) => ({
            vertices: o.vertices.map(([x, y]): Point => [x, y]),
          })),
        },
  );
}

export const QUALIFIED_WAYFARER_SHA256 = proof.documentSha256;
export function isQualifiedWayfarerBlueprint(sha: string | undefined): boolean {
  return (
    sha === QUALIFIED_WAYFARER_SHA256 ||
    sha === WAYFARER_REBUILD_SHA256 ||
    sha === WAYFARER_EXTERIOR_SHA256
  );
}
/** Reconstruct the exact source through the authority's saved UUID map before
 * using its obstacle coordinates. A copied hash alone never authorizes a refit. */
export function qualifiedWayfarerInstanceObstacles(
  instance: {
    id: string;
    blueprintSha256: string;
    documentJson: string;
    idMapJson: string;
  },
  deckId: string,
) {
  if (instance.blueprintSha256 === WAYFARER_EXTERIOR_SHA256)
    return qualifiedWayfarerExteriorInstanceObstacles(instance, deckId);
  if (instance.blueprintSha256 === WAYFARER_REBUILD_SHA256) {
    if (
      instance.documentJson.length > 262144 ||
      instance.idMapJson.length > 1048576
    )
      throw Error("Wayfarer rebuild: instance budget exceeded");
    const document = JSON.parse(instance.documentJson);
    const verified = verifyWayfarerRebuildSource(document);
    if (
      document.layout.id !== instance.id ||
      document.layout.source?.blueprintRevision !== WAYFARER_REBUILD_SHA256 ||
      deckId !== verified.identities[verified.source.layout.playableDeckId!]
    )
      throw Error("Wayfarer rebuild: instance source/deck mismatch");
    const mappings = JSON.parse(instance.idMapJson);
    const all: { sourceId: string; instanceId: string }[] = Object.values(
      mappings,
    ).flat() as any;
    if (
      all.length !== Object.keys(verified.identities).length - 1 ||
      new Set(all.map((e) => e.sourceId)).size !== all.length ||
      new Set(all.map((e) => e.instanceId)).size !== all.length ||
      all.some(
        (e) =>
          !e ||
          verified.identities[e.sourceId] !== e.instanceId ||
          e.sourceId === verified.source.layout.id,
      )
    )
      throw Error("Wayfarer rebuild: invalid saved identity map");
    for (const [domain, items] of Object.entries({
      decks: verified.source.layout.decks,
      floors: verified.source.layout.tiles,
      objects: verified.source.layout.assembly!.parts,
      partitions: verified.source.layout.partitions,
      openings: verified.source.layout.openings,
      rooms: verified.source.layout.rooms,
    })) {
      const rows = mappings[domain];
      if (
        !Array.isArray(rows) ||
        rows.length !== items.length ||
        items.some(
          (item) =>
            !rows.some(
              (e) =>
                e.sourceId === item.id &&
                e.instanceId === verified.identities[item.id],
            ),
        )
      )
        throw Error("Wayfarer rebuild: invalid identity domain " + domain);
    }
    return planWayfarerRebuildGame(document).instanceObstacles;
  }
  if (instance.blueprintSha256 !== proof.documentSha256) return [];
  const document = JSON.parse(instance.documentJson),
    mappings = JSON.parse(instance.idMapJson) as Record<
      string,
      { sourceId: string; instanceId: string }[]
    >;
  const entries = Object.values(mappings).flat(),
    reverse = new Map(entries.map((e) => [e.instanceId, e.sourceId]));
  if (
    reverse.size !== entries.length ||
    new Set(entries.map((e) => e.sourceId)).size !== entries.length ||
    mappings.decks?.length !== 1 ||
    mappings.floors?.length !== 51 ||
    mappings.objects?.length !== 211 ||
    document.layout.id !== instance.id ||
    document.layout.source?.blueprintRevision !== proof.documentSha256 ||
    reverse.get(deckId) !== proof.deckId
  )
    throw Error("Wayfarer walking proof: invalid instance mapping");
  const restore = (value: unknown): unknown =>
    typeof value === "string"
      ? (reverse.get(value) ?? value)
      : Array.isArray(value)
        ? value.map(restore)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, restore(v)]),
            )
          : value;
  const original = restore(document) as typeof document;
  original.layout.id = "wayfarer-semantic-candidate-r001";
  original.layout.source = null;
  const snapshot = compileConstruction(JSON.stringify(original));
  const bindings = qualifiedWayfarerWalkingBindings(snapshot, 0.3, 1.8);
  const forward = new Map(entries.map((e) => [e.sourceId, e.instanceId]));
  return bindings.flatMap((b) =>
    b.obstacles.map((o, i) => ({
      id: `${forward.get(b.sourceObjectId)}:${i}`,
      definitionId: b.definitionId,
      vertices: o.vertices,
    })),
  );
}
