import { expect, test } from "vitest";
import {
  createNativePressureRoomDocument,
  validateNativePressureRoomDocument,
  nativePressureRoomCollision,
} from "./construction-pressure-document";
import { compileConstruction } from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import {
  compilePublishedNativePressureRoom,
  NATIVE_PRESSURE_FLOW_POLICY,
} from "./construction-native-room-published";

test("qualified pressure template spawns disjoint instances without changing physical placement or volume", () => {
  const document = createNativePressureRoomDocument(),
    snapshot = compileConstruction(JSON.stringify(document));
  let n = 0;
  const spawn = () =>
    planConstructionInstance(
      snapshot,
      {
        blueprintRevisionId: "qualified-room",
        expectedBlueprintSha256: snapshot.sha256,
        sourceDeckId: document.layout.decks[0].id,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0.0625,
        objectCollisionBindings: [],
      },
      () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`,
    );
  const a = spawn(),
    b = spawn();
  expect(compileConstruction(JSON.stringify(a.document))).toBeDefined();
  expect(a.allocatedIds.some((id) => b.allocatedIds.includes(id))).toBe(false);
  const native = (p: typeof a) =>
    compilePublishedNativePressureRoom({
      instanceId: p.instanceId,
      ...validateNativePressureRoomDocument(p.document),
      apertureFraction: 0,
      sealRetraction: 0,
      flowPolicy: NATIVE_PRESSURE_FLOW_POLICY,
    });
  const first = native(a),
    second = native(b);
  expect(first.installation).toHaveLength(44);
  expect(
    first.installation.some((p) =>
      second.installation.some((q) => q.id === p.id),
    ),
  ).toBe(false);
  const va = first.topology.compartments
      .map((c) => c.volumeM3)
      .sort((a, b) => a - b),
    vb = second.topology.compartments
      .map((c) => c.volumeM3)
      .sort((a, b) => a - b);
  va.forEach((volume, i) => expect(volume).toBeCloseTo(vb[i], 12));
  expect(
    nativePressureRoomCollision(a.document, a.spawn.deckId).length,
  ).toBeGreaterThan(12);
});

test.each(["roof", "floor", "opening", "fitting", "pin", "deck"] as const)(
  "changed %s cannot inherit the native enclosure qualification",
  (kind) => {
    const d = createNativePressureRoomDocument();
    if (kind === "roof") d.layout.decks[0].roof = false;
    if (kind === "floor") d.layout.tiles[0].vertices[0][0] += 1;
    if (kind === "opening") d.layout.openings[0].a[1] += 1;
    if (kind === "fitting")
      d.layout.fittings.push({ id: "unqualified" } as never);
    if (kind === "pin") d.pressureRoom!.sha256 = "0".repeat(64);
    if (kind === "deck") d.layout.decks[0].elevation = 128;
    expect(() => compileConstruction(JSON.stringify(d))).toThrow();
  },
);
