import { NATIVE_PRESSURE_ROOM_PIN } from "@sidereal/content/construction-pressure-room";
import { CONSTRUCTION_ROOF_PIN } from "@sidereal/content/construction-roof";
import {
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_COMPILER,
  type ConstructionDocument,
} from "@sidereal/content/construction";
import floorKit from "@sidereal/content/construction-floor-interfaces.json";
import { CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES } from "@sidereal/content/construction-boundary-family";
import { transformPoint, type Point } from "@sidereal/content/ship-layout";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { stableStringify, canonicalPolygon } from "./layout-geometry";
import {
  compilePublishedNativePressureRoom,
  NATIVE_PRESSURE_FLOW_POLICY,
} from "./construction-native-room-published";
import type { DeckObstacle } from "./construction-collision";

const same = (a: unknown, b: unknown) =>
  stableStringify(a) === stableStringify(b);
const requireRoom = (value: unknown, reason: string) => {
  if (!value) throw Error("Native pressure document: " + reason);
};

export function createNativePressureRoomDocument(): ConstructionDocument {
  const compiled = compilePublishedNativePressureRoom({
    instanceId: "native-pressure-review-r006",
    apertureFraction: 0,
    sealRetraction: 0,
    flowPolicy: NATIVE_PRESSURE_FLOW_POLICY,
  });
  return {
    schema: CONSTRUCTION_SCHEMA,
    compiler: CONSTRUCTION_COMPILER,
    layout: compiled.layout,
    floorKit: {
      id: floorKit.id,
      revision: floorKit.revision,
      sha256: bytesToHex(
        sha256(new TextEncoder().encode(stableStringify(floorKit))),
      ),
    },
    floors: compiled.layout.tiles.map((t) => ({
      id: t.id,
      deckId: t.deckId,
      partId: "quarter-1m",
      origin: [
        Math.min(...t.vertices.map((v) => v[0])),
        Math.min(...t.vertices.map((v) => v[1])),
        0,
      ],
      quarterTurns: 0,
      reflected: false,
    })),
    roofKit: { ...CONSTRUCTION_ROOF_PIN },
    pressureRoom: { ...NATIVE_PRESSURE_ROOM_PIN },
  };
}

/** Validate every structural input against the qualified fixture. IDs may be
 * remapped on spawn; unrelated structure, fittings, routes or damage cannot
 * borrow its proof. Room names and colors remain presentation only. */
export function validateNativePressureRoomDocument(
  document: ConstructionDocument,
) {
  requireRoom(
    same(document.pressureRoom, NATIVE_PRESSURE_ROOM_PIN),
    "exact publication pin required",
  );
  requireRoom(
    !document.boundaryKit &&
      !document.traversalRoom &&
      !document.stairRoom &&
      same(document.roofKit, CONSTRUCTION_ROOF_PIN),
    "mixed native kits",
  );
  const l = document.layout,
    deck = l.decks[0];
  requireRoom(
    l.decks.length === 1 &&
      deck.elevation === 0 &&
      deck.ceiling === 96 &&
      deck.roof &&
      !deck.holes.length &&
      l.playableDeckId === deck.id,
    "exact deck and ceiling required",
  );
  requireRoom(
    !l.fittings.length &&
      !l.routes.length &&
      !l.nodes.length &&
      !l.assembly &&
      !l.legacy,
    "unqualified installed structure or equipment",
  );
  requireRoom(
    l.tiles.length === 8 &&
      document.floors.length === 8 &&
      l.partitions.length === 1 &&
      l.openings.length === 1,
    "exact room topology required",
  );
  const cells = new Set<string>();
  for (const t of l.tiles) {
    const x = Math.min(...t.vertices.map((v) => v[0])),
      y = Math.min(...t.vertices.map((v) => v[1]));
    requireRoom(
      t.deckId === deck.id &&
        [0, 32, 64, 96].includes(x) &&
        [0, 32].includes(y) &&
        !cells.has(`${x}:${y}`),
      "changed floor location",
    );
    cells.add(`${x}:${y}`);
    requireRoom(
      same(
        canonicalPolygon(t.vertices),
        canonicalPolygon([
          [x, y],
          [x + 32, y],
          [x + 32, y + 32],
          [x, y + 32],
        ]),
      ),
      "changed floor footprint",
    );
    const p = document.floors.find((f) => f.id === t.id);
    requireRoom(
      p &&
        p.deckId === deck.id &&
        p.partId === "quarter-1m" &&
        same(p.origin, [x, y, 0]) &&
        p.quarterTurns === 0 &&
        !p.reflected,
      "changed native floor binding",
    );
  }
  const partition = l.partitions[0],
    opening = l.openings[0];
  requireRoom(
    partition.deckId === deck.id &&
      same(partition.a, [64, 0]) &&
      same(partition.b, [64, 64]) &&
      partition.seal === "design-sealed",
    "changed partition",
  );
  requireRoom(
    opening.deckId === deck.id &&
      opening.partitionId === partition.id &&
      same(opening.a, [64, 12]) &&
      same(opening.b, [64, 52]) &&
      opening.kind === "door" &&
      opening.clearance === 16 &&
      opening.sill === 0,
    "changed doorway",
  );
  return { deckId: deck.id, openingId: opening.id };
}

/** Native r004 convex structural cores, transformed from the actual accepted
 * installation. Existing hinge/frame collision covers the central opening. */
export function nativePressureRoomCollision(
  document: ConstructionDocument,
  deckId: string,
): DeckObstacle[] {
  const ids = validateNativePressureRoomDocument(document);
  requireRoom(ids.deckId === deckId, "wrong collision deck");
  const compiled = compilePublishedNativePressureRoom({
    instanceId: document.layout.id,
    ...ids,
    apertureFraction: 0,
    sealRetraction: 0,
    flowPolicy: NATIVE_PRESSURE_FLOW_POLICY,
  });
  return compiled.installation
    .filter((p) => p.source === "wall")
    .flatMap((p) => {
      const d = CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES.parts.find(
        (d) => d.native.nodePrefix === p.nodePrefix,
      );
      requireRoom(d, "missing native collision core");
      return d!.collision.convexPolygonsM.map((polygon, i) => ({
        id: `native-pressure:${p.id}:${i}`,
        definitionId: "native-boundary-r004-core",
        vertices: polygon.map((v) => {
          const q = transformPoint([v[0], v[1]], p.quarterTurns);
          return [q[0] + p.originM[0], q[1] + p.originM[1]] as Point;
        }),
      }));
    });
}
