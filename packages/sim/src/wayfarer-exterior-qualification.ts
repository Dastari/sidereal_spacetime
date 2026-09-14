import { withDefaultDevicePower } from "@sidereal/content/device-services";
import type { ConstructionDocument } from "@sidereal/content/construction";
import type { PartCatalog, PartPlacement } from "@sidereal/content/assembly";
import { upgradeWayfarerHullLayout } from "@sidereal/content/upgrade-wayfarer-hull-layout";
import nativeProof from "@sidereal/content/wayfarer-hull-r005-proof.json";
import {
  WAYFARER_REBUILD_SOURCE,
  WAYFARER_REBUILD_SHA256,
} from "./wayfarer-rebuild-contract";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";
import { stableStringify } from "./layout-geometry";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(stableStringify(value))));
export interface WayfarerExteriorBinding {
  revision: "r005";
  baseSourceSha256: string;
  nativeProofSha256: string;
  identities: Record<string, string>;
}
export type WayfarerExteriorDocument = Omit<
  ConstructionDocument,
  "wayfarerRebuild"
> & { wayfarerExterior: WayfarerExteriorBinding };
export const WAYFARER_EXTERIOR_NATIVE_PROOF_SHA256 = hash(nativeProof);
export const WAYFARER_EXTERIOR_SHA256 =
  "02bee325b9eca36084352ed4f662f9f90cdc2a889494d7d30f8a4fc54bfd57f1";
/** Owner requested removal of the complete legacy aft chine/filler belt while
 * retaining the independent main engines, maneuvering thrusters and cockpit. */
export const WAYFARER_EXTERIOR_REMOVED_FILLER_IDS = Object.freeze([
  "superstructure--3--5",
  "superstructure--2--5",
  "superstructure--1--5",
  "superstructure-0--5",
  "superstructure-1--5",
  "superstructure-2--5",
  "superstructure-3--5",
]);
const removedFillerIds = new Set<string>(WAYFARER_EXTERIOR_REMOVED_FILLER_IDS);
const QUALIFIED_EXTERIOR_CATALOG: PartCatalog = {
  schema: "sidereal.part-catalog.v1",
  assets: nativeProof.parts.map((p) => ({
    id: p.assetId,
    label: p.assetId,
    category: "superstructure",
    nodes: [],
    bounds: p.bounds,
    visual: {
      url: `/assets/assembly/native/side-hull-r005/${p.assetId}/model.glb`,
      sha256: p.sha256,
      designId: "shipyard.hull.side-armor",
      revision: 5,
      bounds: p.bounds,
      damagePreview: "unsupported",
    },
  })),
};
function demand(value: unknown, reason: string): asserts value {
  if (!value) throw Error("Wayfarer exterior: " + reason);
}
function worldBounds(
  part: PartPlacement,
  bounds: { min: number[]; max: number[] },
) {
  const points: number[][] = [];
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const localX = part.flipped ? -x : x;
        points.push([
          part.position[0] +
            Math.cos(part.rotation) * localX -
            Math.sin(part.rotation) * y,
          part.position[1] +
            Math.sin(part.rotation) * localX +
            Math.cos(part.rotation) * y,
          part.position[2] + z,
        ]);
      }
  return {
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))),
  };
}
/** Pure exact-source adapter. Does not admit generic edited ships, confer pressure
 * or flight ratings, mutate live ships, or relabel new geometry with the r002 hash. */
export function createQualifiedWayfarerExterior(
  catalog: PartCatalog = QUALIFIED_EXTERIOR_CATALOG,
) {
  const base = clone(WAYFARER_REBUILD_SOURCE);
  const layout = upgradeWayfarerHullLayout(base.layout, catalog);
  const { wayfarerRebuild, ...unchanged } = base;
  demand(wayfarerRebuild, "base qualification required");
  demand(
    layout.assembly!.parts.filter((p) => removedFillerIds.has(p.id)).length ===
      7,
    "exact legacy filler belt required",
  );
  layout.assembly!.parts = layout.assembly!.parts.filter(
    (p) => !removedFillerIds.has(p.id),
  );
  const remainingAssets = new Set(
    layout.assembly!.parts.flatMap((p) => [
      p.assetId,
      ...(p.fittingProxy ? [p.fittingProxy.assetId] : []),
    ]),
  );
  for (const part of base.layout.assembly!.parts.filter((p) =>
    removedFillerIds.has(p.id),
  ))
    if (!remainingAssets.has(part.assetId))
      delete layout.assembly!.revisions[part.assetId];
  const poweredLayout = withDefaultDevicePower(layout, catalog);
  poweredLayout.nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  poweredLayout.routes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  poweredLayout.serviceConnections?.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const identities = {
    ...wayfarerRebuild.identities,
    ...Object.fromEntries(
      [
        ...poweredLayout.nodes,
        ...poweredLayout.routes,
        ...(poweredLayout.serviceConnections ?? []),
      ].map((entry) => [entry.id, entry.id]),
    ),
  };
  for (const id of WAYFARER_EXTERIOR_REMOVED_FILLER_IDS) delete identities[id];
  const document: WayfarerExteriorDocument = {
    ...unchanged,
    layout: poweredLayout,
    wayfarerExterior: {
      revision: "r005",
      baseSourceSha256: WAYFARER_REBUILD_SHA256,
      nativeProofSha256: WAYFARER_EXTERIOR_NATIVE_PROOF_SHA256,
      identities,
    },
  };
  const originalParts = base.layout.assembly!.parts;
  const changed = layout.assembly!.parts.filter(
    (p) =>
      stableStringify(p) !==
      stableStringify(originalParts.find((o) => o.id === p.id)),
  );
  demand(
    changed.length === 18 &&
      layout.assembly!.parts.length === originalParts.length - 7,
    "exact eighteen hull replacements and seven filler removals required",
  );
  demand(
    base.layout.tiles.every((t) =>
      t.vertices.every((p) => p[0] >= -160 && p[0] <= 160),
    ),
    "floor must remain within ±5 m",
  );
  const bounds = changed.map((part) => {
    const proof = nativeProof.parts.find((p) => p.assetId === part.assetId);
    const old = originalParts.find((p) => p.id === part.id);
    const asset = catalog.assets.find((a) => a.id === part.assetId);
    demand(
      proof &&
        old?.assetId === proof.previousAssetId &&
        asset?.visual?.sha256 === proof.sha256,
      "exact authored native replacement required",
    );
    demand(
      stableStringify(asset.bounds) === stableStringify(proof.bounds),
      "catalog bounds differ from native evidence",
    );
    const world = worldBounds(part, proof.bounds);
    demand(
      world.min[0] >= 5 || world.max[0] <= -5,
      "hull intrudes into supported floor interior",
    );
    demand(
      world.min[2] === 0.1875 && world.max[2] === 3.1875,
      "approved floor top and three metre wall required",
    );
    return {
      placedObjectId: part.id,
      assetId: part.assetId,
      sha256: proof.sha256,
      worldBounds: world,
    };
  });
  const restored = clone(layout);
  restored.assembly!.parts = originalParts;
  restored.assembly!.revisions = base.layout.assembly!.revisions;
  demand(
    stableStringify(restored) === stableStringify(base.layout),
    "non-hull layout changed",
  );
  // The base game validates its exact unchanged native floor/wall/door and device
  // interfaces. Only the replaced exterior entries obtain new, explicit proofs.
  const baseGame = planWayfarerRebuildGame(base);
  const changedIds = new Set(changed.map((p) => p.id));
  demand(
    baseGame.sourceObjectCollisionBindings
      .filter((b) => changedIds.has(b.sourceObjectId))
      .every((b) => b.obstacles.length === 0),
    "base exterior classification changed",
  );
  const removedBindings = baseGame.sourceObjectCollisionBindings.filter((b) =>
    removedFillerIds.has(b.sourceObjectId),
  );
  demand(
    removedBindings.length === 7 &&
      removedBindings.every((b) => b.obstacles.length === 0),
    "legacy filler removal changes collision coverage",
  );
  const sourceObjectCollisionBindings = baseGame.sourceObjectCollisionBindings
    .filter((binding) => !removedFillerIds.has(binding.sourceObjectId))
    .map((binding) =>
      changedIds.has(binding.sourceObjectId)
        ? {
            ...binding,
            definitionId:
              "wayfarer-exterior-r005-" +
              changed.find((p) => p.id === binding.sourceObjectId)!.assetId,
            obstacles: [],
          }
        : clone(binding),
    );
  const canonical = stableStringify(document),
    sourceSha256 = hash(document);
  demand(
    sourceSha256 !== WAYFARER_REBUILD_SHA256,
    "new geometry requires a distinct source pin",
  );
  return {
    document,
    canonical,
    sourceSha256,
    baseSourceSha256: WAYFARER_REBUILD_SHA256,
    nativeProofSha256: WAYFARER_EXTERIOR_NATIVE_PROOF_SHA256,
    bounds,
    removedLegacyHullIds: [...WAYFARER_EXTERIOR_REMOVED_FILLER_IDS],
    sourceObjectCollisionBindings,
    sourceObstacles: baseGame.sourceObstacles,
    sourceFrame: baseGame.sourceFrame,
    nativeVisualRequests: baseGame.nativeVisualRequests,
    access: baseGame.access,
    readiness: {
      exactSource: true,
      exteriorDoesNotIntrude: true,
      unchangedWalkingInterfaces: true,
      gameAcceptance: false,
      pressure: false,
      flightRatingsChanged: false,
    },
  };
}
/** Restores only the exact bounded, bijective identity domain; every native
 * placement and unchanged interface is then checked against the pinned source. */
export function verifyQualifiedWayfarerExterior(
  document: WayfarerExteriorDocument,
  catalog: PartCatalog = QUALIFIED_EXTERIOR_CATALOG,
) {
  const candidate = createQualifiedWayfarerExterior(catalog);
  demand(
    candidate.sourceSha256 === WAYFARER_EXTERIOR_SHA256,
    "compiled exterior source pin changed",
  );

  const binding = document.wayfarerExterior;
  const expected = candidate.document.wayfarerExterior;
  demand(
    binding &&
      binding.revision === expected.revision &&
      binding.baseSourceSha256 === expected.baseSourceSha256 &&
      binding.nativeProofSha256 === expected.nativeProofSha256 &&
      Object.keys(binding).sort().join(",") ===
        Object.keys(expected).sort().join(","),
    "exact exterior binding required",
  );
  const ids = binding.identities;
  demand(
    ids &&
      typeof ids === "object" &&
      !Array.isArray(ids) &&
      Object.keys(ids).sort().join("\n") ===
        Object.keys(expected.identities).sort().join("\n"),
    "exact identity domain required",
  );
  const values = Object.values(ids);
  demand(
    new Set(values).size === values.length &&
      values.every(
        (v) =>
          typeof v === "string" &&
          v.length > 0 &&
          v.length <= 256 &&
          !/[\u0000-\u001f]/.test(v),
      ),
    "unique bounded identities required",
  );
  demand(
    ids[candidate.document.layout.id] === document.layout.id,
    "instance identity mismatch",
  );
  const reverse = new Map(Object.entries(ids).map(([from, to]) => [to, from]));
  const sourceDeckId = candidate.document.layout.decks[0].id;
  const instanceDeckId = ids[sourceDeckId];
  const restoreString = (value: string) =>
    reverse.get(value) ??
    (value.startsWith(instanceDeckId + ":")
      ? sourceDeckId + value.slice(instanceDeckId.length)
      : value);
  const restore = (value: unknown): any =>
    typeof value === "string"
      ? restoreString(value)
      : Array.isArray(value)
        ? value.map(restore)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([key, v]) => [
                restoreString(key),
                restore(v),
              ]),
            )
          : value;
  const restored = restore(document) as WayfarerExteriorDocument;
  restored.layout.name = candidate.document.layout.name;
  restored.layout.source = candidate.document.layout.source;
  demand(
    stableStringify(restored) === candidate.canonical,
    "exact r005 exterior source required",
  );
  return { ...candidate, identities: ids };
}

/** Exact base projection is used only for unchanged walls, doors, roofs, support
 * and gameplay fittings, after the replacement exterior has independently passed
 * its own source/bounds proof. No actual new geometry receives the old hash. */
export function planWayfarerExteriorGame(
  document: WayfarerExteriorDocument,
  options: { shipId?: string } = {},
) {
  const verified = verifyQualifiedWayfarerExterior(document);
  const identities = verified.identities;
  const sourceDeckId = WAYFARER_REBUILD_SOURCE.layout.decks[0].id;
  const mapString = (value: string) =>
    identities[value] ??
    (value.startsWith(sourceDeckId + ":")
      ? identities[sourceDeckId] + value.slice(sourceDeckId.length)
      : value);
  const remap = (value: unknown): any =>
    typeof value === "string"
      ? mapString(value)
      : Array.isArray(value)
        ? value.map(remap)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([key, v]) => [
                mapString(key),
                remap(v),
              ]),
            )
          : value;
  const base = remap(WAYFARER_REBUILD_SOURCE) as ConstructionDocument;
  base.layout.name = document.layout.name;
  base.layout.source = document.layout.source;
  base.wayfarerRebuild!.identities = Object.fromEntries(
    Object.keys(WAYFARER_REBUILD_SOURCE.wayfarerRebuild!.identities).map(
      (id) => [id, identities[id] ?? id],
    ),
  );
  const baseGame = planWayfarerRebuildGame(base, options);
  demand(
    baseGame.instanceObstacles.every(
      (obstacle) =>
        !WAYFARER_EXTERIOR_REMOVED_FILLER_IDS.some(
          (id) => obstacle.id === id || obstacle.id.startsWith(id + ":"),
        ),
    ),
    "removed filler obstacle remains",
  );
  return {
    ...baseGame,
    sourceSha256: verified.sourceSha256,
    identities,
    sourceObjectCollisionBindings: verified.sourceObjectCollisionBindings,
    instanceObjectCollisionBindings: verified.sourceObjectCollisionBindings.map(
      (b) => ({
        ...b,
        sourceObjectId: identities[b.sourceObjectId],
        deckIds: b.deckIds.map((id) => identities[id]),
      }),
    ),
    exteriorBounds: verified.bounds,
    exteriorNativeProofSha256: verified.nativeProofSha256,
  };
}

export function qualifiedWayfarerExteriorInstanceObstacles(
  instance: {
    id: string;
    blueprintSha256: string;
    documentJson: string;
    idMapJson: string;
  },
  deckId: string,
) {
  demand(
    instance.blueprintSha256 === WAYFARER_EXTERIOR_SHA256 &&
      instance.documentJson.length <= 262144 &&
      instance.idMapJson.length <= 1048576,
    "exact bounded exterior instance required",
  );
  const document = JSON.parse(
    instance.documentJson,
  ) as WayfarerExteriorDocument;
  const verified = verifyQualifiedWayfarerExterior(document);
  demand(
    document.layout.id === instance.id &&
      document.layout.source?.blueprintRevision === WAYFARER_EXTERIOR_SHA256 &&
      deckId === verified.identities[verified.document.layout.playableDeckId!],
    "instance source/deck mismatch",
  );
  const mappings = JSON.parse(instance.idMapJson) as Record<
    string,
    { sourceId: string; instanceId: string }[]
  >;
  demand(
    mappings &&
      typeof mappings === "object" &&
      !Array.isArray(mappings) &&
      Object.values(mappings).every(Array.isArray),
    "identity map required",
  );
  const entries = Object.values(mappings).flat();
  demand(
    entries.length === Object.keys(verified.identities).length - 1 &&
      new Set(entries.map((e) => e.sourceId)).size === entries.length &&
      new Set(entries.map((e) => e.instanceId)).size === entries.length &&
      entries.every(
        (e) =>
          verified.identities[e.sourceId] === e.instanceId &&
          e.sourceId !== verified.document.layout.id,
      ),
    "exact saved identity map required",
  );
  for (const [domain, items] of Object.entries({
    decks: verified.document.layout.decks,
    floors: verified.document.layout.tiles,
    objects: verified.document.layout.assembly!.parts,
    partitions: verified.document.layout.partitions,
    openings: verified.document.layout.openings,
    rooms: verified.document.layout.rooms,
    serviceConnections: verified.document.layout.serviceConnections ?? [],
  })) {
    const rows = mappings[domain];
    demand(
      Array.isArray(rows) &&
        rows.length === items.length &&
        items.every((item) =>
          rows.some(
            (row) =>
              row.sourceId === item.id &&
              row.instanceId === verified.identities[item.id],
          ),
        ),
      "identity domain differs: " + domain,
    );
  }
  return planWayfarerExteriorGame(document).instanceObstacles;
}
