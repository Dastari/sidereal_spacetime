import {
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_COMPILER,
  type ConstructionDocument,
} from "@sidereal/content/construction";
import {
  NATIVE_TRAVERSAL_ROOM_AUDIT_TEXT,
  NATIVE_TRAVERSAL_ROOM_DELIVERY,
  NATIVE_TRAVERSAL_ROOM_PIN,
  NATIVE_TRAVERSAL_ROOM_COLLISION,
} from "@sidereal/content/construction-traversal-room";
import { CONSTRUCTION_ROOF_PIN } from "@sidereal/content/construction-roof";
import type { NativeTraversalAudit } from "@sidereal/content/construction-traversal";
import floorKit from "@sidereal/content/construction-floor-interfaces.json";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalPolygon, stableStringify } from "./layout-geometry";
import {
  createPublishedNativeTraversalCompiler,
  type TraversalInstallation,
} from "./construction-traversal";
import type { DeckObstacle } from "./construction-collision";

const audit = JSON.parse(
  NATIVE_TRAVERSAL_ROOM_AUDIT_TEXT,
) as NativeTraversalAudit;
const floorPin = {
  id: floorKit.id,
  revision: floorKit.revision,
  sha256: bytesToHex(
    sha256(new TextEncoder().encode(stableStringify(floorKit))),
  ),
};
const same = (a: unknown, b: unknown) =>
  stableStringify(a) === stableStringify(b);
function requireRoom(value: unknown, reason: string): asserts value {
  if (!value) throw Error("Native traversal document: " + reason);
}
const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9:_./-]{1,160}$/.test(v);
const keys = (v: object, expected: string[]) =>
  same(Object.keys(v).sort(), [...expected].sort());

/** Trusted compact publication registry. Full source bytes are verified by the installer,
 * renderer and offline compiler tests; no reducer-supplied audit or qualification flag. */
export const compileNativeTraversalRoom =
  createPublishedNativeTraversalCompiler({
    delivery: NATIVE_TRAVERSAL_ROOM_DELIVERY,
    audit: new TextEncoder().encode(NATIVE_TRAVERSAL_ROOM_AUDIT_TEXT),
  });

export function createNativeTraversalRoomDocument(): ConstructionDocument {
  const layout = emptyLayout("native-traversal-review-r000-a003", "lower-deck");
  layout.name = "Native two-deck ladder review";
  layout.decks[0].name = "Lower deck";
  layout.decks.push({
    id: "upper-deck",
    name: "Upper deck",
    order: 1,
    elevation: 102,
    ceiling: 96,
    roof: false,
    holes: [{ id: "semantic-upper-shaft", seed: [96, 96] }],
  });
  for (const deck of layout.decks)
    for (const x of [0, 64, 128])
      for (const y of [0, 64, 128]) {
        if (deck.order === 1 && x === 64 && y === 64) continue;
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
    traversalRoom: {
      pin: { ...NATIVE_TRAVERSAL_ROOM_PIN },
      lowerDeckId: "lower-deck",
      upperDeckId: "upper-deck",
      linkId: "manual-ladder",
      parts: audit.parts.map((p) => ({
        id: `native-${p.id}`,
        sourcePartId: p.id,
      })),
      apertures: audit.apertures.map((p) => ({
        id: `physical-${p.id}`,
        sourceApertureId: p.id,
      })),
    },
  };
}

/** IDs can be remapped; every physical input remains the exact qualified fixture.
 * This proof does not qualify unrelated fittings, roof edits, pressure or utilities. */
export function validateNativeTraversalRoomDocument(
  document: ConstructionDocument,
) {
  const r = document.traversalRoom,
    l = document.layout;
  requireRoom(
    r &&
      keys(r, [
        "pin",
        "lowerDeckId",
        "upperDeckId",
        "linkId",
        "parts",
        "apertures",
      ]) &&
      same(r.pin, NATIVE_TRAVERSAL_ROOM_PIN),
    "exact publication pin and binding required",
  );
  requireRoom(
    document.schema === CONSTRUCTION_SCHEMA &&
      document.compiler === CONSTRUCTION_COMPILER &&
      same(document.floorKit, floorPin) &&
      same(document.roofKit, CONSTRUCTION_ROOF_PIN) &&
      !document.boundaryKit &&
      !document.pressureRoom,
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
    l.tiles.length === 17 && document.floors.length === 17,
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
        : deck.holes.length === 1 && same(deck.holes[0].seed, [96, 96]),
      "exact upper floor aperture required",
    );
    const cells = new Set<string>();
    const tiles = l.tiles.filter((t) => t.deckId === deckId);
    requireRoom(
      tiles.length === (order === 0 ? 9 : 8),
      "changed deck floor coverage",
    );
    for (const t of tiles) {
      const x = Math.min(...t.vertices.map((v) => v[0])),
        y = Math.min(...t.vertices.map((v) => v[1]));
      requireRoom(
        [0, 64, 128].includes(x) &&
          [0, 64, 128].includes(y) &&
          !(order === 1 && x === 64 && y === 64) &&
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
  requireRoom(
    Array.isArray(r.parts) &&
      r.parts.length === audit.parts.length &&
      Array.isArray(r.apertures) &&
      r.apertures.length === audit.apertures.length,
    "exact native part and aperture coverage required",
  );
  requireRoom(
    r.parts.every((p) => p && keys(p, ["id", "sourcePartId"])) &&
      same(
        r.parts.map((p) => p.sourcePartId).sort(),
        audit.parts.map((p) => p.id).sort(),
      ),
    "changed native part bindings",
  );
  requireRoom(
    r.apertures.every((p) => p && keys(p, ["id", "sourceApertureId"])) &&
      same(
        r.apertures.map((p) => p.sourceApertureId).sort(),
        audit.apertures.map((p) => p.id).sort(),
      ),
    "changed physical aperture bindings",
  );
  const ids = [
    l.id,
    ...l.decks.map((d) => d.id),
    ...l.decks.flatMap((d) => d.holes.map((h) => h.id)),
    ...l.tiles.map((t) => t.id),
    r.linkId,
    ...r.parts.map((p) => p.id),
    ...r.apertures.map((p) => p.id),
  ];
  requireRoom(
    ids.every(validId) &&
      new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    "invalid or overlapping semantic/native identities",
  );
  return {
    lowerDeckId: r.lowerDeckId,
    upperDeckId: r.upperDeckId,
    linkId: r.linkId,
  };
}

/** Bind the generated audit to actual placed IDs; callers supply only server revisions. */
export function nativeTraversalRoomInstallation(
  document: ConstructionDocument,
  instanceRevision: bigint,
  linkRevision: bigint,
): TraversalInstallation {
  const ids = validateNativeTraversalRoomDocument(document),
    r = document.traversalRoom!;
  const native = JSON.parse(
    NATIVE_TRAVERSAL_ROOM_AUDIT_TEXT,
  ) as NativeTraversalAudit;
  return {
    instanceId: document.layout.id,
    linkId: ids.linkId,
    instanceRevision,
    linkRevision,
    originM: [0, 0, 0],
    quarterTurns: 0,
    lower: { deckId: ids.lowerDeckId, ...native.decks.lower },
    upper: { deckId: ids.upperDeckId, ...native.decks.upper },
    parts: native.parts.map((p) => ({
      ...p,
      id: r.parts.find((b) => b.sourcePartId === p.id)!.id,
      sourcePartId: p.id,
      sha256:
        NATIVE_TRAVERSAL_ROOM_DELIVERY.sources[
          p.sourceId as keyof typeof NATIVE_TRAVERSAL_ROOM_DELIVERY.sources
        ].sha256,
    })),
    apertures: native.apertures.map((p) => ({
      ...p,
      id: r.apertures.find((b) => b.sourceApertureId === p.id)!.id,
      sourceApertureId: p.id,
      state: "physical-opening",
    })),
    policy: { id: "manual-ladder-review-v1", metresPerSecond: 0.8 },
  };
}

/** Conservative standing-body collision from evaluated native solids. Support panels
 * are handled by exact semantic floor coverage; the upper shaft remains unsupported. */
export function nativeTraversalRoomCollision(
  document: ConstructionDocument,
  deckId: string,
): DeckObstacle[] {
  const ids = validateNativeTraversalRoomDocument(document);
  requireRoom(
    [ids.lowerDeckId, ids.upperDeckId].includes(deckId),
    "unknown collision deck",
  );
  const walkingZ =
    deckId === ids.lowerDeckId
      ? audit.decks.lower.walkingZ
      : audit.decks.upper.walkingZ;
  return NATIVE_TRAVERSAL_ROOM_COLLISION.parts
    .filter(
      (p) =>
        p.group !== "existing-panel" &&
        p.boundsM.max[2] > walkingZ + 1e-6 &&
        p.boundsM.min[2] < walkingZ + audit.body.heightM - 1e-6,
    )
    .map((p) => ({
      id: `${ids.linkId}:${p.name}`,
      definitionId: "native-traversal-r000-a003-solid",
      vertices: [
        [p.boundsM.min[0], p.boundsM.min[1]],
        [p.boundsM.max[0], p.boundsM.min[1]],
        [p.boundsM.max[0], p.boundsM.max[1]],
        [p.boundsM.min[0], p.boundsM.max[1]],
      ],
    }));
}
