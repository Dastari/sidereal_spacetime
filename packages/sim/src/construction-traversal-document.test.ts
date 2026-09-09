import { expect, test } from "vitest";
import {
  createNativeTraversalRoomDocument,
  validateNativeTraversalRoomDocument,
  nativeTraversalRoomInstallation,
  nativeTraversalRoomCollision,
  compileNativeTraversalRoom,
} from "./construction-traversal-document";
import {
  compileConstruction,
  readConstructionDraft,
} from "./construction-transactions";
import { planNativeRoofs } from "./construction-roofs";
import { planConstructionInstance } from "./construction-instance";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
  sweepDeckCircle,
} from "./construction-collision";

test("exact native two-deck document keeps actual upper floor and lower roof apertures open", () => {
  const d = createNativeTraversalRoomDocument(),
    r = d.traversalRoom!;
  const compiled = compileConstruction(JSON.stringify(d));
  expect(compiled.readiness.pressure).toBe(false);
  expect(compiled.readiness.services).toBe(false);
  const lowerRoof = planNativeRoofs(d, r.lowerDeckId);
  expect(lowerRoof).toHaveLength(8);
  expect(lowerRoof.some((p) => p.origin[0] === 64 && p.origin[1] === 64)).toBe(
    false,
  );
  expect(planNativeRoofs(d, r.upperDeckId)).toEqual([]);
  const installed = nativeTraversalRoomInstallation(d, 1n, 1n),
    link = compileNativeTraversalRoom(installed);
  expect(installed.parts).toHaveLength(28);
  expect(installed.apertures).toHaveLength(2);
  expect(link.lower.walkingZ).toBe(0.1875);
  expect(link.upper.walkingZ).toBe(3.375);
  expect(installed.parts.filter((p) => p.sourceId === "roof")).toHaveLength(8);
  expect(link.pathM).toEqual([
    [3, 1.25, 0.1875],
    [3, 2.5, 0.1875],
    [3, 2.5, 3.375],
    [3, 1.25, 3.375],
  ]);
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
  "alias",
  "mixed-kit",
  "fitting",
  "route",
  "unknown-binding",
] as const)("changed %s cannot borrow the native traversal proof", (kind) => {
  const d = createNativeTraversalRoomDocument(),
    r = d.traversalRoom!;
  if (kind === "pin") r.pin.sha256 = "0".repeat(64);
  if (kind === "floor") d.floors[0].origin[0]++;
  if (kind === "roof") d.layout.decks[0].roof = false;
  if (kind === "upper-roof") d.layout.decks[1].roof = true;
  if (kind === "hole") d.layout.decks[1].holes = [];
  if (kind === "datum") d.layout.decks[1].elevation++;
  if (kind === "native-part") r.parts[0].sourcePartId = r.parts[1].sourcePartId;
  if (kind === "aperture") r.apertures.pop();
  if (kind === "alias") r.parts[0].id = d.layout.tiles[0].id;
  if (kind === "mixed-kit") d.pressureRoom = { ...r.pin };
  if (kind === "fitting")
    d.layout.fittings.push({ id: "unqualified" } as never);
  if (kind === "route") d.layout.routes.push({ id: "unqualified" } as never);
  if (kind === "unknown-binding")
    Object.assign(r.parts[0], { positionM: [0, 0, 0] });
  expect(() => validateNativeTraversalRoomDocument(d)).toThrow();
  expect(() => compileConstruction(JSON.stringify(d))).toThrow();
  expect(() => planNativeRoofs(d, r.lowerDeckId)).toThrow();
});

test("native binding order canonicalizes without changing the accepted installation", () => {
  const a = createNativeTraversalRoomDocument(),
    b = JSON.parse(JSON.stringify(a));
  b.traversalRoom.parts.reverse();
  b.traversalRoom.apertures.reverse();
  b.layout.decks.reverse();
  b.floors.reverse();
  expect(readConstructionDraft(JSON.stringify(b))).toEqual(
    readConstructionDraft(JSON.stringify(a)),
  );
  expect(
    compileNativeTraversalRoom(nativeTraversalRoomInstallation(a, 1n, 1n))
      .proofHash,
  ).toBe(
    compileNativeTraversalRoom(nativeTraversalRoomInstallation(b, 1n, 1n))
      .proofHash,
  );
});

test("two spawned fixtures remap every native link, aperture and part UUID and preserve it on reload", () => {
  const d = createNativeTraversalRoomDocument(),
    snapshot = compileConstruction(JSON.stringify(d));
  let n = 0;
  const spawn = (sourceDeckId: string) =>
    planConstructionInstance(
      snapshot,
      {
        blueprintRevisionId: "native-two-deck",
        expectedBlueprintSha256: snapshot.sha256,
        sourceDeckId,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        objectCollisionBindings: [],
      },
      () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`,
    );
  const a = spawn(d.traversalRoom!.lowerDeckId),
    b = spawn(d.traversalRoom!.upperDeckId);
  expect(a.allocatedIds.some((id) => b.allocatedIds.includes(id))).toBe(false);
  expect(a.mappings.nativeParts).toHaveLength(28);
  expect(a.mappings.traversalLinks).toHaveLength(1);
  expect(a.mappings.traversalApertures).toHaveLength(2);
  for (const plan of [a, b]) {
    const r = plan.document.traversalRoom!;
    expect(plan.spawn.deckId).toBe(plan === a ? r.lowerDeckId : r.upperDeckId);
    expect(
      plan.mappings.nativeParts.every((m) =>
        r.parts.some((p) => p.id === m.instanceId),
      ),
    ).toBe(true);
    expect(r.parts.map((p) => p.sourcePartId).sort()).toEqual(
      d.traversalRoom!.parts.map((p) => p.sourcePartId).sort(),
    );
    const installed = nativeTraversalRoomInstallation(plan.document, 1n, 1n),
      compiled = compileNativeTraversalRoom(installed);
    const reloaded = JSON.parse(
      compileConstruction(JSON.stringify(plan.document)).canonical,
    );
    expect(nativeTraversalRoomInstallation(reloaded, 1n, 1n)).toEqual(
      installed,
    );
    expect(
      compileNativeTraversalRoom(
        nativeTraversalRoomInstallation(reloaded, 1n, 1n),
      ).proofHash,
    ).toBe(compiled.proofHash);
  }
});

test("ordinary upper walking cannot enter the shaft; both qualified landings remain occupiable", () => {
  const d = createNativeTraversalRoomDocument(),
    r = d.traversalRoom!;
  for (const deckId of [r.lowerDeckId, r.upperDeckId]) {
    const obstacles = nativeTraversalRoomCollision(d, deckId),
      frame = resolveDeckCollision(
        compileDeckCollision(d.layout, deckId, {
          shipId: d.layout.id,
          perimeterHalfWidthM: 0,
          partitionHalfWidthM: 0,
          obstacles,
        }),
        [],
      );
    const location = {
      shipId: d.layout.id,
      deckId,
      position: [3, 1.25] as [number, number],
    };
    expect(canOccupyDeck(frame, location, 0.3)).toBe(true);
    if (deckId === r.upperDeckId) {
      expect(
        canOccupyDeck(frame, { ...location, position: [3, 2.5] }, 0.3),
      ).toBe(false);
      const moved = sweepDeckCircle(frame, location, [0, 2], 0.3);
      expect(moved.position[1]).toBeLessThanOrEqual(1.7);
    }
  }
  expect(() => nativeTraversalRoomCollision(d, "other-deck")).toThrow();
});

test("unqualified actor body rejects before any instance identities are allocated", () => {
  const d = createNativeTraversalRoomDocument(),
    snapshot = compileConstruction(JSON.stringify(d));
  let allocations = 0;
  expect(() =>
    planConstructionInstance(
      snapshot,
      {
        blueprintRevisionId: "native-two-deck",
        expectedBlueprintSha256: snapshot.sha256,
        sourceDeckId: d.traversalRoom!.lowerDeckId,
        bodyRadiusM: 0.4,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        objectCollisionBindings: [],
      },
      () => {
        allocations++;
        return "00000000-0000-4000-8000-000000000001";
      },
    ),
  ).toThrow(/qualified standing body/);
  expect(allocations).toBe(0);
});
