import type { ConstructionDocument } from "@sidereal/content/construction";
import { stampTile, type Point } from "@sidereal/content/ship-layout";
import {
  compileConstruction,
  constructionHash,
  readConstructionDraft,
} from "./construction-transactions";
import {
  qualifiedWayfarerWalkingBindings,
  QUALIFIED_WAYFARER_SHA256,
} from "./wayfarer-walking-bindings";
import type { SpawnObjectCollisionBinding } from "./construction-instance";

/** Offline trusted candidate only. Runtime must register this exact result and its
 * accepted moving-door projection together; there is no client collider input. */
export const WAYFARER_AIRLOCK_CANDIDATE_PINS = {
  mapping: "7b6be86b42e904def098f1a70a36bff08c18773e3efbc9337667af6da3f86e2e",
  walking: "d576415689b561bff0964fe2d99006b8dda18827030438f3993d6612a6d71c56",
  motion: "c1aa90c8523ada60ee99ac6bc4b8a1004f2642aee820464078627532a7948869",
} as const;
type Input = Record<keyof typeof WAYFARER_AIRLOCK_CANDIDATE_PINS, string> & {
  original: string;
};
interface Replacement {
  sourcePlacedId: string;
  candidatePartId: string;
  nativeVisual: { path: string; sha256: string; nodePrefix: string };
  placement: {
    position: [number, number, number];
    rotation: number;
    flipped: boolean;
  };
  layer: string;
}
interface AttachedPart {
  id: string;
  source: string;
  sourcePartIndex: number;
  sha256: string;
  nodePrefix: string;
  originM: [number, number, number];
  quarterTurns: number;
}
interface Mapping {
  replacements: Replacement[];
  additions: Replacement[];
  attachedNativeParts: AttachedPart[];
}
interface WalkingRow {
  sourcePlacedId: string;
  obstacles: { vertices: Point[] }[];
  dynamicDoorPart: boolean;
  role: string;
}
export function createWayfarerAirlockCandidate(input: Input) {
  for (const key of Object.keys(
    WAYFARER_AIRLOCK_CANDIDATE_PINS,
  ) as (keyof typeof WAYFARER_AIRLOCK_CANDIDATE_PINS)[])
    if (constructionHash(input[key]) !== WAYFARER_AIRLOCK_CANDIDATE_PINS[key])
      throw Error("Wayfarer airlock: altered qualified " + key);
  const original = compileConstruction(input.original);
  if (original.sha256 !== QUALIFIED_WAYFARER_SHA256)
    throw Error("Wayfarer airlock: exact original template required");
  const document = JSON.parse(original.canonical) as ConstructionDocument;
  const mapping = JSON.parse(input.mapping) as Mapping;
  const walking = JSON.parse(input.walking) as { rows: WalkingRow[] };
  const assembly = document.layout.assembly;
  if (!assembly || document.layout.decks.length !== 1)
    throw Error("Wayfarer airlock: exact single-deck source required");
  const deckId = document.layout.playableDeckId;
  document.layout.id = "wayfarer-native-airlock-candidate-r001";
  document.layout.name = "Wayfarer · native external airlock candidate";
  const nativeVisuals: {
    id: string;
    sourcePartIndex?: number;
    assetId: string;
    sha256: string;
    nodePrefix: string;
    path?: string;
    source?: string;
    layer: string;
    position: [number, number, number];
    rotation: number;
    flipped: boolean;
  }[] = [];
  for (const p of [...mapping.replacements, ...mapping.additions]) {
    const assetId = "inlet-r000-a003-" + p.candidatePartId;
    const existing = assembly.parts.find((v) => v.id === p.sourcePlacedId);
    if (existing) existing.assetId = assetId;
    else
      assembly.parts.push({
        id: p.sourcePlacedId,
        assetId,
        ...p.placement,
        removedCells: [],
      });
    assembly.revisions[assetId] = p.nativeVisual.sha256;
    nativeVisuals.push({
      id: p.sourcePlacedId,
      assetId,
      ...p.nativeVisual,
      ...p.placement,
      layer: p.layer,
    });
  }
  const roofIds: string[] = [],
    exteriorFloorIds: string[] = [];
  for (const p of mapping.attachedNativeParts) {
    const assetId =
      "native-airlock-r000-" +
      p.source +
      "-" +
      constructionHash(p.nodePrefix).slice(0, 16);
    if (p.source === "floor") {
      const x = Math.round(p.originM[0] * 32),
        y = Math.round(p.originM[1] * 32);
      const tile = stampTile(p.id, deckId, "rectangle", [x, y]);
      tile.vertices = [
        [x, y],
        [x + 32, y],
        [x + 32, y + 32],
        [x, y + 32],
      ];
      tile.material = "native-floor-r002";
      document.layout.tiles.push(tile);
      document.floors.push({
        id: p.id,
        deckId,
        partId: "quarter-1m",
        origin: [x, y, 0],
        quarterTurns: 0,
        reflected: false,
      });
      if (p.originM[0] >= 11) exteriorFloorIds.push(p.id);
    } else {
      assembly.parts.push({
        id: p.id,
        assetId,
        position: p.originM,
        rotation: (p.quarterTurns * Math.PI) / 2,
        flipped: false,
        removedCells: [],
      });
      assembly.revisions[assetId] = p.sha256;
      if (p.source === "roof") roofIds.push(p.id);
    }
    nativeVisuals.push({
      id: p.id,
      sourcePartIndex: p.sourcePartIndex,
      assetId,
      sha256: p.sha256,
      nodePrefix: p.nodePrefix,
      source: p.source,
      layer:
        p.source === "roof"
          ? "roof"
          : p.source === "floor"
            ? "semantic-floor"
            : "structure",
      position: p.originM,
      rotation: (p.quarterTurns * Math.PI) / 2,
      flipped: false,
    });
  }
  for (const [side, x] of [
    ["inner", 7],
    ["outer", 11],
  ] as const) {
    const partitionId = "attached-airlock-" + side + "-partition";
    document.layout.partitions.push({
      id: partitionId,
      deckId,
      a: [x * 32, -160],
      b: [x * 32, -96],
      seal: "design-sealed",
    });
    document.layout.openings.push({
      id: "attached-airlock-" + side + "-door",
      deckId,
      partitionId,
      a: [x * 32, -148],
      b: [x * 32, -108],
      kind: "door",
      clearance: 16,
      sill: 0,
    });
  }
  // Standard compiler validates actual joined floor topology. No pressureRoom /
  // airlockRoom flag is borrowed from the independent70-part fixture.
  const snapshot = compileConstruction(JSON.stringify(document));
  const replaced = new Set(mapping.replacements.map((v) => v.sourcePlacedId));
  const bindings: SpawnObjectCollisionBinding[] =
    qualifiedWayfarerWalkingBindings(original, 0.3, 1.8).filter(
      (v) => !replaced.has(v.sourceObjectId),
    );
  for (const row of walking.rows) {
    if (row.role === "floor") continue; // Exact pinned semantic quarter-floor interface.
    bindings.push({
      sourceObjectId: row.sourcePlacedId,
      definitionId: "native-airlock-a003-body-slab",
      deckIds: [deckId],
      obstacles: row.obstacles,
    });
  }
  if (
    bindings.length !== 266 ||
    assembly.parts.length !== 266 ||
    document.floors.length !== 67
  )
    throw Error("Wayfarer airlock: source coverage mismatch");
  const parsed = readConstructionDraft(snapshot.canonical);
  return {
    snapshot,
    document: JSON.parse(parsed.canonical) as ConstructionDocument,
    bindings,
    nativeVisuals,
    roofIds: [...roofIds, "candidate-wayfarer-airlock-inlet-stepped-roof"],
    exteriorFloorIds,
    dynamicDoorPartIds: walking.rows
      .filter((v) => v.dynamicDoorPart)
      .map((v) => v.sourcePlacedId),
    pressureNeighbor: {
      kind: "unqualified-open-ship-side" as const,
      installablePressurizedNeighbor: false as const,
      initialGas: "vacuum-only independent candidate" as const,
    },
    registered: false as const,
  };
}
