import {
  planWayfarerExteriorGame,
  verifyQualifiedWayfarerExterior,
  type WayfarerExteriorDocument,
} from "./wayfarer-exterior-qualification";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";
import { verifyWayfarerRebuildSource } from "./wayfarer-rebuild-contract";
import { CONSTRUCTION_INSET_VISUAL_PIN } from "@sidereal/content/construction-inset-visuals";
import { planPinnedInsetBoundaries } from "./construction-inset-boundaries";
import { readNativeAirlockDocument } from "./construction-airlock-document";
import { validateNativeStairRoomDocument } from "./construction-stairs-document";
import { validateNativeTraversalRoomDocument } from "./construction-traversal-document";
import { validateNativePressureRoomDocument } from "./construction-pressure-document";
import { CONSTRUCTION_BOUNDARY_FAMILY_PIN } from "@sidereal/content/construction-boundary-family";
import { planPinnedBoundaryFamily } from "./construction-boundary-family";
import { CONSTRUCTION_BOUNDARY_PIN } from "@sidereal/content/construction-boundary";
import { planNativeBoundaries } from "./construction-boundaries";
import { CONSTRUCTION_ROOF_PIN } from "@sidereal/content/construction-roof";
import { planNativeRoofs } from "./construction-roofs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_COMPILER,
  CONSTRUCTION_LIMITS as L,
  type ConstructionDocument,
  type ConstructionGrant,
  type ConstructionCapability,
  type ConstructionReceipt,
  type ConstructionSnapshot,
} from "@sidereal/content/construction";
import floorKitJson from "@sidereal/content/construction-floor-interfaces.json";
import type { TilesetInterface } from "@sidereal/content/tileset-interfaces";
import { readLayout } from "./layout-validation";
import { compileLayout } from "./layout-compiler";
import {
  canonicalPolygon,
  stableStringify,
  compareText,
} from "./layout-geometry";
import { fitTileset } from "./tileset-fit";
export const PINNED_FLOOR_KIT = floorKitJson as unknown as TilesetInterface;
export const constructionHash = (text: string | Uint8Array) =>
  bytesToHex(
    sha256(typeof text === "string" ? new TextEncoder().encode(text) : text),
  );
export const FLOOR_KIT_HASH = constructionHash(
  stableStringify(PINNED_FLOOR_KIT),
);
const record = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9:_./-]{1,160}$/.test(v);
export function requireConstructionGrant(
  grants: readonly ConstructionGrant[],
  principal: string,
  workspaceId: string,
  capability: ConstructionCapability,
  nowMicros: bigint,
): void {
  if (
    !id(workspaceId) ||
    grants.length > L.grants ||
    !grants.some(
      (g) =>
        g.principal === principal &&
        g.workspaceId === workspaceId &&
        g.capability === capability &&
        !g.revoked &&
        (g.expiresMicros === null || g.expiresMicros > nowMicros),
    )
  )
    throw Error("Explicit active construction grant required");
}
/** Permission must be checked before this helper, even for a replay. No owner bypass. */
export function constructionOperation(
  operationId: string,
  request: unknown,
  receipt: ConstructionReceipt | undefined,
  expectedRevision: bigint,
  currentRevision: bigint,
): { request: string; replay: ConstructionReceipt | null } {
  if (!id(operationId) || operationId.length > 80)
    throw Error("Invalid construction operation ID");
  const canonical = stableStringify(request);
  if (new TextEncoder().encode(canonical).length > L.bytes + 4096)
    throw Error("Construction request exceeds budget");
  if (receipt) {
    if (receipt.request !== canonical)
      throw Error("Operation ID reused with different request");
    return { request: canonical, replay: receipt };
  }
  if (expectedRevision < 0n || expectedRevision !== currentRevision)
    throw Error("Construction revision conflict");
  return { request: canonical, replay: null };
}
/** Pure server/client shared compiler. Input admission precedes any quadratic fit work. */
export function readConstructionDraft(raw: string): {
  canonical: string;
  sha256: string;
} {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > L.bytes)
    throw Error("Construction document exceeds budget");
  const input: unknown = JSON.parse(raw);
  if (
    !record(input) ||
    input.schema !== CONSTRUCTION_SCHEMA ||
    input.compiler !== CONSTRUCTION_COMPILER ||
    Object.keys(input).some(
      (k) =>
        ![
          "schema",
          "compiler",
          "layout",
          "floorKit",
          "floors",
          "boundaryKit",
          "roofKit",
          "pressureRoom",
          "traversalRoom",
          "stairRoom",
          "airlockRoom",
          "wayfarerRebuild",
          "wayfarerExterior",
        ].includes(k),
    )
  )
    throw Error("Unsupported construction contract");
  const layout = readLayout(input.layout);
  if (
    layout.tiles.length > L.floors ||
    layout.decks.length > L.decks ||
    layout.fittings.length + (layout.assembly?.parts.length ?? 0) > L.parts
  )
    throw Error("Construction compiler budget exceeded");
  if (layout.legacy) throw Error("Resolve legacy records before publishing");
  if (
    !record(input.floorKit) ||
    input.floorKit.id !== PINNED_FLOOR_KIT.id ||
    input.floorKit.revision !== PINNED_FLOOR_KIT.revision ||
    input.floorKit.sha256 !== FLOOR_KIT_HASH
  )
    throw Error("Pinned floor interface revision mismatch");
  if (!Array.isArray(input.floors) || input.floors.length > L.floors)
    throw Error("Native floor binding budget exceeded");
  if (
    input.boundaryKit !== undefined &&
    (!record(input.boundaryKit) ||
      (stableStringify(input.boundaryKit) !==
        stableStringify(CONSTRUCTION_BOUNDARY_PIN) &&
        stableStringify(input.boundaryKit) !==
          stableStringify(CONSTRUCTION_BOUNDARY_FAMILY_PIN) &&
        stableStringify(input.boundaryKit) !==
          stableStringify(CONSTRUCTION_INSET_VISUAL_PIN)))
  )
    throw Error("Pinned boundary interface revision mismatch");
  if (
    input.roofKit !== undefined &&
    (!record(input.roofKit) ||
      stableStringify(input.roofKit) !== stableStringify(CONSTRUCTION_ROOF_PIN))
  )
    throw Error("Pinned roof interface revision mismatch");
  const floorIds = new Set<string>();
  for (const p of input.floors) {
    if (
      !record(p) ||
      !id(p.id) ||
      floorIds.has(p.id) ||
      !id(p.partId) ||
      !id(p.deckId) ||
      !Array.isArray(p.origin) ||
      p.origin.length !== 3 ||
      !p.origin.every((v: unknown) => Number.isSafeInteger(v)) ||
      ![0, 1, 2, 3].includes(p.quarterTurns) ||
      typeof p.reflected !== "boolean" ||
      Object.keys(p).some(
        (k) =>
          ![
            "id",
            "partId",
            "deckId",
            "origin",
            "quarterTurns",
            "reflected",
          ].includes(k),
      )
    )
      throw Error("Invalid native floor placement");
    floorIds.add(p.id);
  }
  // JSON.parse above already owns this data; SpacetimeDB has no structuredClone global.
  const normalized = input as unknown as ConstructionDocument;
  if (input.airlockRoom !== undefined) {
    readNativeAirlockDocument(JSON.stringify(normalized));
    normalized.airlockRoom!.parts.sort(
      (a, b) => a.sourcePartIndex - b.sourcePartIndex,
    );
    normalized.airlockRoom!.roofTileIds.sort(compareText);
    normalized.airlockRoom!.exteriorTileIds.sort(compareText);
  }
  if (input.stairRoom !== undefined) {
    validateNativeStairRoomDocument(normalized);
    for (const bindings of [
      normalized.stairRoom!.parts,
      normalized.stairRoom!.apertures,
      normalized.stairRoom!.supports,
    ])
      bindings.sort((a, b) => compareText(a.id, b.id));
  }
  if (input.traversalRoom !== undefined) {
    validateNativeTraversalRoomDocument(normalized);
    normalized.traversalRoom!.parts.sort((a, b) => compareText(a.id, b.id));
    normalized.traversalRoom!.apertures.sort((a, b) => compareText(a.id, b.id));
  }
  for (const key of [
    "decks",
    "tiles",
    "partitions",
    "openings",
    "rooms",
    "fittings",
    "routes",
    "nodes",
  ] as const)
    normalized.layout[key].sort((a, b) => compareText(a.id, b.id));
  normalized.layout.tiles.forEach(
    (t) => (t.vertices = canonicalPolygon(t.vertices)),
  );
  normalized.layout.dependencies.sort(
    (a, b) => compareText(a.id, b.id) || compareText(a.revision, b.revision),
  );
  normalized.floors.sort((a, b) => compareText(a.id, b.id));
  normalized.layout.serviceConnections?.sort((a, b) => compareText(a.id, b.id));
  if (normalized.wayfarerRebuild) verifyWayfarerRebuildSource(normalized);
  if (normalized.wayfarerExterior)
    verifyQualifiedWayfarerExterior(normalized as WayfarerExteriorDocument);
  const canonical = stableStringify(normalized);
  return { canonical, sha256: constructionHash(canonical) };
}
export function compileConstruction(raw: string): ConstructionSnapshot {
  const snapshot = readConstructionDraft(raw),
    input = JSON.parse(snapshot.canonical) as ConstructionDocument,
    layout = input.layout;
  const inset = input.boundaryKit?.id === CONSTRUCTION_INSET_VISUAL_PIN.id;
  if (
    layout.structure?.schema === "sidereal.layout-structure.v2" &&
    !inset &&
    !input.wayfarerRebuild &&
    !input.wayfarerExterior
  )
    throw Error(
      "Boundary-treatment native installation adapters are not yet qualified",
    );
  if (!input.floors.length || input.floors.length !== layout.tiles.length)
    throw Error("Every semantic floor requires one native interface binding");
  const decks = new Map(layout.decks.map((d) => [d.id, d])),
    tiles = new Map(layout.tiles.map((t) => [t.id, t]));
  for (const p of input.floors) {
    const deck = decks.get(p.deckId),
      tile = tiles.get(p.id);
    if (
      !deck ||
      !tile ||
      tile.deckId !== p.deckId ||
      p.origin[2] !== deck.elevation
    )
      throw Error("Floor binding deck/datum mismatch");
  }
  const fit = fitTileset(
    PINNED_FLOOR_KIT,
    input.floors as ConstructionDocument["floors"],
  );
  if (!fit.valid) throw Error(fit.issues.map((i) => i.code).join(", "));
  for (const p of fit.placements)
    if (
      stableStringify(canonicalPolygon(p.footprint)) !==
      stableStringify(canonicalPolygon(tiles.get(p.id)!.vertices))
    )
      throw Error("Semantic floor differs from native nominal interface");
  for (const floor of input.floors) {
    const selected = layout.structure?.tileStyles[floor.id]?.model;
    const nominal = PINNED_FLOOR_KIT.parts.find(
      (part) => part.id === floor.partId,
    );
    if (
      selected &&
      (!nominal ||
        nominal.native.assetId !== selected.assetId ||
        nominal.native.revision !== selected.revision)
    )
      throw Error(
        "Native floor placement differs from its explicit model selection",
      );
  }
  const compiled = compileLayout(layout);
  if (!compiled.valid)
    throw Error(
      compiled.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.code)
        .join(", "),
    );
  if (input.stairRoom) validateNativeStairRoomDocument(input);
  if (input.pressureRoom) validateNativePressureRoomDocument(input);
  if (input.traversalRoom) validateNativeTraversalRoomDocument(input);
  if (input.wayfarerExterior)
    planWayfarerExteriorGame(input as WayfarerExteriorDocument);
  else if (input.wayfarerRebuild) planWayfarerRebuildGame(input);
  else if (inset)
    for (const deck of layout.decks) planPinnedInsetBoundaries(input, deck.id);
  else if (input.boundaryKit?.revision === "r004")
    for (const deck of layout.decks) planPinnedBoundaryFamily(layout, deck.id);
  else if (input.boundaryKit)
    for (const deck of layout.decks)
      planNativeBoundaries(layout, deck.id, {
        floorTopUnits: PINNED_FLOOR_KIT.datums.floorTop,
      });
  if (input.roofKit)
    for (const deck of layout.decks) planNativeRoofs(input, deck.id);
  // Local authoring remains recoverable; publication cannot pretend unvalidated fittings/routes are playable.
  // These stay in the immutable document, but readiness remains false until their separate adapters pass.
  return {
    schema: CONSTRUCTION_SCHEMA,
    compiler: CONSTRUCTION_COMPILER,
    ...snapshot,
    readiness: {
      geometry: true,
      nativeFloors: true,
      pressure: false,
      services: false,
      nativeDamage: false,
      flight: false,
    },
  };
}
