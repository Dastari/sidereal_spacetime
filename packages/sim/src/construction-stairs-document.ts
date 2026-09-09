import {
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_COMPILER,
  CONSTRUCTION_LIMITS,
  type ConstructionDocument,
} from "@sidereal/content/construction";
import {
  NATIVE_STAIR_ROOM_AUDIT_TEXT,
  NATIVE_STAIR_ROOM_DELIVERY,
  NATIVE_STAIR_ROOM_PIN,
} from "@sidereal/content/construction-stairs-room";
import {
  CONSTRUCTION_ROOF_PIN,
  type ConstructionRoofPlacement,
} from "@sidereal/content/construction-roof";
import type {
  NativeStairAudit,
  StairInstallation,
} from "@sidereal/content/construction-stairs";
import floorKit from "@sidereal/content/construction-floor-interfaces.json";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalPolygon, stableStringify } from "./layout-geometry";
import { createPublishedNativeStairCompiler } from "./construction-stairs";
import type { DeckObstacle } from "./construction-collision";

import type { NativeStairRoomBinding } from "@sidereal/content/construction";
export type { NativeStairRoomBinding } from "@sidereal/content/construction";
export type NativeStairRoomDocument = ConstructionDocument & {
  stairRoom: NativeStairRoomBinding;
};
const audit = JSON.parse(NATIVE_STAIR_ROOM_AUDIT_TEXT) as NativeStairAudit;
const floorPin = {
  id: floorKit.id,
  revision: floorKit.revision,
  sha256: bytesToHex(
    sha256(new TextEncoder().encode(stableStringify(floorKit))),
  ),
};
const same = (a: unknown, b: unknown) =>
  stableStringify(a) === stableStringify(b);
function requireRoom(v: unknown, reason: string): asserts v {
  if (!v) throw Error("Native stair document: " + reason);
}
const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9:_./-]{1,128}$/.test(v);
const keys = (v: object, expected: string[]) =>
  same(Object.keys(v).sort(), [...expected].sort());
const absentUpper = (x: number, y: number) =>
  [64, 128].includes(x) && [128, 192].includes(y);

/** Trusted compact registry built from the exact hash-verified native source. */
export const compileNativeStairRoom = createPublishedNativeStairCompiler({
  delivery: NATIVE_STAIR_ROOM_DELIVERY,
  audit: new TextEncoder().encode(NATIVE_STAIR_ROOM_AUDIT_TEXT),
});

export function createNativeStairRoomDocument(): NativeStairRoomDocument {
  const layout = emptyLayout("native-stair-review-r000-a003", "lower-deck");
  layout.name = "Native two-deck dogleg stair review";
  layout.decks[0].name = "Lower deck";
  layout.decks.push({
    id: "upper-deck",
    name: "Upper deck",
    order: 1,
    elevation: 102,
    ceiling: 96,
    roof: false,
    holes: [{ id: "semantic-upper-stairwell", seed: [128, 192] }],
  });
  for (const deck of layout.decks)
    for (const x of [0, 64, 128, 192])
      for (const y of [0, 64, 128, 192, 256]) {
        if (deck.order === 1 && absentUpper(x, y)) continue;
        layout.tiles.push(
          stampTile(`semantic-${deck.id}-${x}-${y}`, deck.id, "rectangle", [
            x,
            y,
          ]),
        );
      }
  return {
    schema: CONSTRUCTION_SCHEMA,
    compiler: CONSTRUCTION_COMPILER,
    layout,
    floorKit: { ...floorPin },
    roofKit: { ...CONSTRUCTION_ROOF_PIN },
    floors: layout.tiles.map((t) => ({
      id: t.id,
      deckId: t.deckId,
      partId: "square-2m",
      origin: [
        Math.min(...t.vertices.map((v) => v[0])),
        Math.min(...t.vertices.map((v) => v[1])),
        t.deckId === "lower-deck" ? 0 : 102,
      ],
      quarterTurns: 0,
      reflected: false,
    })),
    stairRoom: {
      pin: { ...NATIVE_STAIR_ROOM_PIN },
      lowerDeckId: "lower-deck",
      upperDeckId: "upper-deck",
      stairId: "dogleg-stair",
      parts: audit.parts.map((p) => ({
        id: `native-${p.id}`,
        sourcePartId: p.id,
      })),
      apertures: audit.apertures.map((p) => ({
        id: `physical-${p.id}`,
        sourceApertureId: p.id,
      })),
      supports: audit.supports.map((p) => ({
        id: `support-${p.id}`,
        sourceSupportId: p.id,
      })),
    },
  };
}

/** Exact fixture proof, not a general stair placement or author-declared physics rating. */
export function validateNativeStairRoomDocument(
  document: ConstructionDocument,
) {
  requireRoom(
    new TextEncoder().encode(JSON.stringify(document)).length <=
      CONSTRUCTION_LIMITS.bytes,
    "document byte cap",
  );
  const r = document.stairRoom,
    l = document.layout;
  requireRoom(
    r &&
      keys(r, [
        "pin",
        "lowerDeckId",
        "upperDeckId",
        "stairId",
        "parts",
        "apertures",
        "supports",
      ]) &&
      same(r.pin, NATIVE_STAIR_ROOM_PIN),
    "exact publication pin and binding required",
  );
  requireRoom(
    document.schema === CONSTRUCTION_SCHEMA &&
      document.compiler === CONSTRUCTION_COMPILER &&
      same(document.floorKit, floorPin) &&
      same(document.roofKit, CONSTRUCTION_ROOF_PIN) &&
      !document.boundaryKit &&
      !document.pressureRoom &&
      !document.traversalRoom,
    "mixed or changed native kits",
  );
  requireRoom(
    l.decks.length === 2 &&
      r.lowerDeckId !== r.upperDeckId &&
      [r.lowerDeckId, r.upperDeckId].includes(l.playableDeckId),
    "exact two deck binding required",
  );
  requireRoom(
    l.kind === "ship" &&
      same(
        l.dependencies,
        emptyLayout("reference", "reference-deck").dependencies,
      ),
    "unqualified layout dependency",
  );
  requireRoom(
    !l.partitions.length &&
      !l.openings.length &&
      !l.rooms.length &&
      !l.fittings.length &&
      !l.routes.length &&
      !l.nodes.length &&
      !l.assembly &&
      !l.legacy,
    "unqualified topology, structure or equipment",
  );
  requireRoom(
    l.tiles.length === 36 && document.floors.length === 36,
    "exact native floor coverage required",
  );
  for (const [deckId, order, elevation, roof] of [
    [r.lowerDeckId, 0, 0, true],
    [r.upperDeckId, 1, 102, false],
  ] as const) {
    const deck = l.decks.find((d) => d.id === deckId);
    requireRoom(
      deck &&
        deck.order === order &&
        deck.elevation === elevation &&
        deck.ceiling === 96 &&
        deck.roof === roof,
      "changed deck datums or roof",
    );
    requireRoom(
      order === 0
        ? deck.holes.length === 0
        : deck.holes.length === 1 && same(deck.holes[0].seed, [128, 192]),
      "exact upper floor aperture required",
    );
    const cells = new Set<string>(),
      tiles = l.tiles.filter((t) => t.deckId === deckId);
    requireRoom(
      tiles.length === (order === 0 ? 20 : 16),
      "changed deck floor coverage",
    );
    for (const t of tiles) {
      const x = Math.min(...t.vertices.map((v) => v[0])),
        y = Math.min(...t.vertices.map((v) => v[1]));
      requireRoom(
        [0, 64, 128, 192].includes(x) &&
          [0, 64, 128, 192, 256].includes(y) &&
          !(order === 1 && absentUpper(x, y)) &&
          !cells.has(`${x}:${y}`),
        "changed floor location or covered aperture",
      );
      cells.add(`${x}:${y}`);
      requireRoom(
        t.shape === "rectangle" &&
          same(
            canonicalPolygon(t.vertices),
            canonicalPolygon([
              [x, y],
              [x + 64, y],
              [x + 64, y + 64],
              [x, y + 64],
            ]),
          ),
        "changed floor footprint",
      );
      const p = document.floors.find((f) => f.id === t.id);
      requireRoom(
        p &&
          p.deckId === deckId &&
          p.partId === "square-2m" &&
          same(p.origin, [x, y, elevation]) &&
          p.quarterTurns === 0 &&
          !p.reflected,
        "changed native floor placement",
      );
    }
  }
  for (const [bindings, originals, sourceKey] of [
    [r.parts, audit.parts, "sourcePartId"],
    [r.apertures, audit.apertures, "sourceApertureId"],
    [r.supports, audit.supports, "sourceSupportId"],
  ] as const) {
    requireRoom(
      Array.isArray(bindings) &&
        bindings.length === originals.length &&
        bindings.every((p) => p && keys(p, ["id", sourceKey])),
      "exact native bindings required",
    );
    requireRoom(
      same(
        bindings
          .map((p) => (p as unknown as Record<string, string>)[sourceKey])
          .sort(),
        originals.map((p) => p.id).sort(),
      ),
      "changed native source bindings",
    );
  }
  const ids = [
    l.id,
    ...l.decks.map((d) => d.id),
    ...l.decks.flatMap((d) => d.holes.map((h) => h.id)),
    ...l.tiles.map((t) => t.id),
    r.stairId,
    ...r.parts.map((p) => p.id),
    ...r.apertures.map((p) => p.id),
    ...r.supports.map((p) => p.id),
  ];
  requireRoom(
    ids.every(validId) &&
      new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    "invalid or overlapping semantic/native identities",
  );
  // Separate floor mapping IDs intentionally equal semantic tile IDs, with exact coverage.
  requireRoom(
    new Set(document.floors.map((f) => f.id)).size === document.floors.length,
    "duplicate floor binding",
  );
  return {
    lowerDeckId: r.lowerDeckId,
    upperDeckId: r.upperDeckId,
    stairId: r.stairId,
  };
}

export function nativeStairRoomInstallation(
  document: ConstructionDocument,
  instanceRevision: bigint,
  stairRevision: bigint,
): StairInstallation {
  const ids = validateNativeStairRoomDocument(document),
    r = document.stairRoom!;
  return {
    instanceId: document.layout.id,
    stairId: ids.stairId,
    instanceRevision,
    stairRevision,
    originM: [0, 0, 0],
    quarterTurns: 0,
    lowerDeckId: ids.lowerDeckId,
    upperDeckId: ids.upperDeckId,
    parts: audit.parts.map((p) => ({
      ...p,
      id: r.parts.find((b) => b.sourcePartId === p.id)!.id,
      sourcePartId: p.id,
      sha256:
        NATIVE_STAIR_ROOM_DELIVERY.sources[
          p.sourceId as keyof typeof NATIVE_STAIR_ROOM_DELIVERY.sources
        ].sha256,
    })),
    apertures: audit.apertures.map((p) => ({
      ...p,
      id: r.apertures.find((b) => b.sourceApertureId === p.id)!.id,
      sourceApertureId: p.id,
      state: "physical-opening",
    })),
    supports: r.supports.map((p) => ({ ...p })),
    policy: { id: "manual-native-stair-review-v1", walkMps: 1, verticalMps: 2 },
  };
}

/** Exact matching lower ceiling placements. The root roof planner must call this
 * for stair fixtures, otherwise its generic floor-to-roof pairing covers the hole. */
export function planNativeStairRoofs(
  document: ConstructionDocument,
  deckId: string,
): ConstructionRoofPlacement[] {
  const ids = validateNativeStairRoomDocument(document);
  requireRoom(
    [ids.lowerDeckId, ids.upperDeckId].includes(deckId),
    "unknown roof deck",
  );
  if (deckId === ids.upperDeckId) return [];
  return document.floors
    .filter(
      (f) => f.deckId === deckId && !absentUpper(f.origin[0], f.origin[1]),
    )
    .map((f) => ({
      key: "roof:" + f.id,
      floorId: f.id,
      partId: f.partId,
      origin: [f.origin[0], f.origin[1], 96],
      quarterTurns: 0,
    }));
}

/** Ordinary deck walking uses native solids, not a fake ramp. Stair-mode movement
 * uses the compiler's full 3D support/solid proof and must intercept the landing. */
export function nativeStairRoomCollision(
  document: ConstructionDocument,
  deckId: string,
): DeckObstacle[] {
  const ids = validateNativeStairRoomDocument(document);
  requireRoom(
    [ids.lowerDeckId, ids.upperDeckId].includes(deckId),
    "unknown collision deck",
  );
  const walkingZ =
    deckId === ids.lowerDeckId
      ? audit.decks.lower.walkingZ
      : audit.decks.upper.walkingZ;
  return audit.solids
    .filter(
      (p) =>
        p.boundsM.max[2] > walkingZ + 1e-6 &&
        p.boundsM.min[2] < walkingZ + audit.body.heightM - 1e-6,
    )
    .map((p) => ({
      id: `${document.stairRoom!.parts.find((b) => b.sourcePartId === p.partId)!.id}:${p.id}`,
      definitionId: "native-stair-r000-a003-solid",
      vertices: [
        [p.boundsM.min[0], p.boundsM.min[1]],
        [p.boundsM.max[0], p.boundsM.min[1]],
        [p.boundsM.max[0], p.boundsM.max[1]],
        [p.boundsM.min[0], p.boundsM.max[1]],
      ],
    }));
}

/** Apply only authoritative spawn allocations; immutable native source identities
 * never change. Caller remaps layout/floor identities through its existing planner. */
export function remapNativeStairRoomBinding(
  binding: NativeStairRoomBinding,
  ids: ReadonlyMap<string, string>,
): NativeStairRoomBinding {
  const get = (id: string) => {
    const value = ids.get(id);
    requireRoom(validId(value), "missing spawn identity mapping");
    return value;
  };
  return {
    pin: { ...binding.pin },
    lowerDeckId: get(binding.lowerDeckId),
    upperDeckId: get(binding.upperDeckId),
    stairId: get(binding.stairId),
    parts: binding.parts.map((p) => ({ ...p, id: get(p.id) })),
    apertures: binding.apertures.map((p) => ({ ...p, id: get(p.id) })),
    supports: binding.supports.map((p) => ({ ...p, id: get(p.id) })),
  };
}
