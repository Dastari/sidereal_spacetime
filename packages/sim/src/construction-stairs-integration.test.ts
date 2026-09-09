import { expect, test } from "vitest";
import {
  createNativeStairRoomDocument,
  nativeStairRoomInstallation,
  compileNativeStairRoom,
} from "./construction-stairs-document";
import {
  compileConstruction,
  readConstructionDraft,
} from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import { planNativeRoofs } from "./construction-roofs";

test("published stair documents spawn both decks with separate native identities and actual apertures", () => {
  const d = createNativeStairRoomDocument(),
    snapshot = compileConstruction(JSON.stringify(d));
  let n = 0;
  const spawn = (sourceDeckId: string) =>
    planConstructionInstance(
      snapshot,
      {
        blueprintRevisionId: "native-stair-review",
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
  const a = spawn(d.stairRoom.lowerDeckId),
    b = spawn(d.stairRoom.upperDeckId);
  expect(a.allocatedIds.some((id) => b.allocatedIds.includes(id))).toBe(false);
  for (const p of [a, b]) {
    const r = p.document.stairRoom!;
    expect(p.spawn.deckId).toBe(p === a ? r.lowerDeckId : r.upperDeckId);
    expect(p.spawn.walkingElevationM).toBe(p === a ? 0.1875 : 3.375);
    expect(p.mappings.nativeParts).toHaveLength(60);
    expect(p.mappings.stairSupports).toHaveLength(18);
    expect(p.mappings.stairLinks).toHaveLength(1);
    expect(r.parts.map((x) => x.sourcePartId).sort()).toEqual(
      d.stairRoom.parts.map((x) => x.sourcePartId).sort(),
    );
    const roofs = planNativeRoofs(p.document, r.lowerDeckId);
    expect(roofs).toHaveLength(16);
    expect(
      roofs.some(
        (x) =>
          [64, 128].includes(x.origin[0]) && [128, 192].includes(x.origin[1]),
      ),
    ).toBe(false);
    const installation = nativeStairRoomInstallation(p.document, 1n, 1n);
    expect(() => compileNativeStairRoom(installation)).not.toThrow();
    const reload = JSON.parse(
      compileConstruction(JSON.stringify(p.document)).canonical,
    );
    expect(nativeStairRoomInstallation(reload, 1n, 1n)).toEqual(installation);
  }
  expect(snapshot.readiness.pressure).toBe(false);
  expect(snapshot.readiness.flight).toBe(false);
});

test("stair source bindings canonicalize but forged layout and mixed fixture proofs fail at parsing", () => {
  const a = createNativeStairRoomDocument(),
    b = createNativeStairRoomDocument();
  for (const list of [
    b.stairRoom.parts,
    b.stairRoom.supports,
    b.stairRoom.apertures,
  ])
    list.reverse();
  expect(readConstructionDraft(JSON.stringify(a))).toEqual(
    readConstructionDraft(JSON.stringify(b)),
  );
  b.floors[0].origin[0]++;
  expect(() => readConstructionDraft(JSON.stringify(b))).toThrow();
  const mixed = createNativeStairRoomDocument();
  mixed.pressureRoom = { ...mixed.stairRoom.pin };
  expect(() => readConstructionDraft(JSON.stringify(mixed))).toThrow();
});
