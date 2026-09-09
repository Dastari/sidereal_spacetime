import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import {
  createNativeStairRoomDocument,
  validateNativeStairRoomDocument,
  nativeStairRoomInstallation,
  compileNativeStairRoom,
  nativeStairRoomCollision,
  planNativeStairRoofs,
  remapNativeStairRoomBinding,
} from "./construction-stairs-document";
import {
  createNativeStairCompiler,
  beginStairWalk,
} from "./construction-stairs";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
} from "./construction-collision";
import { compileLayout } from "./layout-compiler";
import {
  NATIVE_STAIR_ROOM_AUDIT_TEXT,
  NATIVE_STAIR_ROOM_DELIVERY,
} from "@sidereal/content/construction-stairs-room";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
test("exact dogleg document has36 floor modules,60 native placements and a physical4×4 m opening", () => {
  const d = createNativeStairRoomDocument(),
    r = d.stairRoom;
  expect(validateNativeStairRoomDocument(d)).toEqual({
    lowerDeckId: r.lowerDeckId,
    upperDeckId: r.upperDeckId,
    stairId: r.stairId,
  });
  const layout = compileLayout(d.layout);
  expect(layout.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
  expect(layout.valid).toBe(true);
  expect(d.floors).toHaveLength(36);
  const roofs = planNativeStairRoofs(d, r.lowerDeckId);
  expect(roofs).toHaveLength(16);
  expect(
    roofs.some(
      (p) =>
        [64, 128].includes(p.origin[0]) && [128, 192].includes(p.origin[1]),
    ),
  ).toBe(false);
  expect(planNativeStairRoofs(d, r.upperDeckId)).toEqual([]);
  const installed = nativeStairRoomInstallation(d, 1n, 1n),
    surface = compileNativeStairRoom(installed);
  expect(installed.parts).toHaveLength(60);
  expect(installed.apertures.map((p) => p.boundsM)).toEqual([
    { min: [2, 4, 3], max: [6, 8, 3.1875] },
    { min: [2, 4, 3.1875], max: [6, 8, 3.375] },
  ]);
  expect(surface.supports).toHaveLength(18);
  expect(surface.steps).toHaveLength(17);
  expect(surface.supports.find((p) => p.kind === "lower-landing")!.topZM).toBe(
    0.1875,
  );
  expect(surface.supports.find((p) => p.kind === "upper-landing")!.topZM).toBe(
    3.375,
  );
});

test.each([
  "pin",
  "floor",
  "roof",
  "upper-roof",
  "hole",
  "datum",
  "native-part",
  "aperture",
  "support",
  "alias",
  "mixed-kit",
  "fitting",
  "route",
  "unknown-binding",
  "duplicate-floor",
  "oversize",
] as const)(
  "changed %s cannot borrow exact native stair qualification",
  (kind) => {
    const d = createNativeStairRoomDocument(),
      r = d.stairRoom;
    if (kind === "pin") r.pin.sha256 = "0".repeat(64);
    if (kind === "floor") d.floors[0].origin[0]++;
    if (kind === "roof") d.layout.decks[0].roof = false;
    if (kind === "upper-roof") d.layout.decks[1].roof = true;
    if (kind === "hole") d.layout.decks[1].holes = [];
    if (kind === "datum") d.layout.decks[1].elevation++;
    if (kind === "native-part")
      r.parts[0].sourcePartId = r.parts[1].sourcePartId;
    if (kind === "aperture") r.apertures.pop();
    if (kind === "support")
      r.supports[0].sourceSupportId = r.supports[1].sourceSupportId;
    if (kind === "alias") r.supports[0].id = r.parts[0].id;
    if (kind === "mixed-kit") d.pressureRoom = { ...r.pin };
    if (kind === "fitting")
      d.layout.fittings.push({ id: "unqualified" } as never);
    if (kind === "route") d.layout.routes.push({ id: "unqualified" } as never);
    if (kind === "unknown-binding")
      Object.assign(r.supports[0], { positionM: [0, 0, 0] });
    if (kind === "duplicate-floor") d.floors[1] = clone(d.floors[0]);
    if (kind === "oversize") d.layout.name = "a".repeat(262144);
    expect(() => validateNativeStairRoomDocument(d)).toThrow();
    expect(() => nativeStairRoomInstallation(d, 1n, 1n)).toThrow();
    expect(() => planNativeStairRoofs(d, r.lowerDeckId)).toThrow();
  },
);

test("native source bytes and compact registry compile the identical immutable source installation", async () => {
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(NATIVE_STAIR_ROOM_DELIVERY.sources).map(
        async ([key, s]) => [key, new Uint8Array(await readFile(s.path))],
      ),
    ),
  );
  const publication = {
    delivery: NATIVE_STAIR_ROOM_DELIVERY,
    audit: new TextEncoder().encode(NATIVE_STAIR_ROOM_AUDIT_TEXT),
    sources,
  };
  const installation = nativeStairRoomInstallation(
    createNativeStairRoomDocument(),
    5n,
    7n,
  );
  expect(createNativeStairCompiler(publication)(installation)).toEqual(
    compileNativeStairRoom(installation),
  );
  const corrupted = {
    ...sources,
    "stair-kit": new Uint8Array(sources["stair-kit"]),
  };
  corrupted["stair-kit"][100] ^= 1;
  expect(() =>
    createNativeStairCompiler({ ...publication, sources: corrupted }),
  ).toThrow();
  const changed = clone(createNativeStairRoomDocument());
  const changedInstallation = nativeStairRoomInstallation(changed, 1n, 1n);
  changedInstallation.parts[0].sha256 = "0".repeat(64);
  expect(() => compileNativeStairRoom(changedInstallation)).toThrow();
});

test("binding reorder preserves proof and two server-allocation maps retain independent support identities", () => {
  const source = createNativeStairRoomDocument();
  const shuffled = clone(source);
  shuffled.stairRoom.parts.reverse();
  shuffled.stairRoom.apertures.reverse();
  shuffled.stairRoom.supports.reverse();
  shuffled.floors.reverse();
  expect(
    compileNativeStairRoom(nativeStairRoomInstallation(shuffled, 1n, 1n))
      .proofHash,
  ).toBe(
    compileNativeStairRoom(nativeStairRoomInstallation(source, 1n, 1n))
      .proofHash,
  );
  const spawn = (prefix: string) => {
    const d = clone(source),
      r = d.stairRoom;
    const sourceIds = [
      d.layout.id,
      ...d.layout.decks.map((p) => p.id),
      ...d.layout.decks.flatMap((p) => p.holes.map((h) => h.id)),
      ...d.layout.tiles.map((p) => p.id),
      r.stairId,
      ...r.parts.map((p) => p.id),
      ...r.apertures.map((p) => p.id),
      ...r.supports.map((p) => p.id),
    ];
    const map = new Map(sourceIds.map((id, i) => [id, `${prefix}-${i}`]));
    d.stairRoom = remapNativeStairRoomBinding(r, map);
    d.layout.id = map.get(d.layout.id)!;
    d.layout.playableDeckId = map.get(d.layout.playableDeckId)!;
    d.layout.decks.forEach((p) => {
      p.id = map.get(p.id)!;
      p.holes.forEach((h) => {
        h.id = map.get(h.id)!;
      });
    });
    d.layout.tiles.forEach((p) => {
      p.id = map.get(p.id)!;
      p.deckId = map.get(p.deckId)!;
    });
    d.floors.forEach((p) => {
      p.id = map.get(p.id)!;
      p.deckId = map.get(p.deckId)!;
    });
    validateNativeStairRoomDocument(d);
    return {
      document: d,
      map,
      compiled: compileNativeStairRoom(nativeStairRoomInstallation(d, 1n, 1n)),
    };
  };
  const a = spawn("instance-a"),
    b = spawn("instance-b");
  expect(
    [...a.map.values()].some((id) => [...b.map.values()].includes(id)),
  ).toBe(false);
  expect(
    a.compiled.supports.some((s) =>
      b.compiled.supports.some((t) => t.id === s.id),
    ),
  ).toBe(false);
  expect(a.document.stairRoom.parts.map((p) => p.sourcePartId)).toEqual(
    source.stairRoom.parts.map((p) => p.sourcePartId),
  );
  expect(
    compileNativeStairRoom(
      nativeStairRoomInstallation(clone(a.document), 1n, 1n),
    ),
  ).toEqual(a.compiled);
  expect(() =>
    remapNativeStairRoomBinding(source.stairRoom, new Map()),
  ).toThrow();
});

test("native deck collision permits both real landings and blocks the open upper shaft", () => {
  const d = createNativeStairRoomDocument(),
    r = d.stairRoom;
  for (const [deckId, position] of [
    [r.lowerDeckId, [3, 2.9]],
    [r.upperDeckId, [5, 2.9]],
  ] as const) {
    const obstacles = nativeStairRoomCollision(d, deckId);
    const frame = resolveDeckCollision(
      compileDeckCollision(d.layout, deckId, {
        shipId: d.layout.id,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        obstacles,
      }),
      [],
    );
    expect(
      canOccupyDeck(
        frame,
        { shipId: d.layout.id, deckId, position: [...position] },
        0.3,
      ),
    ).toBe(true);
    if (deckId === r.upperDeckId)
      expect(
        canOccupyDeck(
          frame,
          { shipId: d.layout.id, deckId, position: [4, 6] },
          0.3,
        ),
      ).toBe(false);
    expect(() =>
      beginStairWalk(
        compileNativeStairRoom(nativeStairRoomInstallation(d, 1n, 1n)),
        {
          walkId: "walk",
          actorId: "actor",
          visitId: "visit",
          instanceId: d.layout.id,
          deckId,
          positionM: [...position, deckId === r.lowerDeckId ? 0.1875 : 3.375],
          inputSequence: 1n,
          admitted: true,
          connected: true,
          standing: true,
        },
        0n,
      ),
    ).not.toThrow();
  }
  expect(() => nativeStairRoomCollision(d, "unknown")).toThrow();
});
