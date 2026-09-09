import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  createNativeContactMatcher,
  NATIVE_CONTACT_PINS,
  type NativeContactAssembly,
} from "./construction-native-contacts";
const root =
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r005/final-a004/";
const bytes = {
  interfaces: readFileSync(root + "interfaces.json"),
  validation: readFileSync(root + "validation.json"),
  glb: readFileSync(root + "kit.glb"),
};
const catalog = JSON.parse(bytes.interfaces.toString());
const match = createNativeContactMatcher(bytes);
function fixture(index = 0): NativeContactAssembly {
  const f = catalog.fixtures[index];
  return {
    instanceId: "instance-a",
    deckId: "deck-a",
    deckElevationUnits: 128,
    floorTopUnits: 6,
    geometryFingerprint: "a".repeat(64),
    floorGlbSha256: NATIVE_CONTACT_PINS.floorGlb,
    boundaryInterfacesSha256: NATIVE_CONTACT_PINS.boundaryInterfaces,
    floors: f.nativeFloors.map((p: object, i: number) => ({
      ...structuredClone(p),
      id: `floor-${i}`,
    })),
    walls: f.nativeWalls.map((p: object, i: number) => ({
      ...structuredClone(p),
      id: `wall-${i}`,
    })),
    openingIds: [],
  };
}
test("all 18 physically validated fixtures match exact native insert families", () => {
  for (let i = 0; i < catalog.fixtures.length; i++) {
    const a = fixture(i),
      got = match(a);
    expect(got.fixtureId).toBe(catalog.fixtures[i].id);
    expect(got.placements).toHaveLength(a.floors.length);
    expect(got.scope).toBe("native-floor-wall-contact-only");
    expect(got).not.toHaveProperty("airtight");
    expect(got.excludedAboveFloorGasVolumeM3).toBe(0);
    for (const p of got.placements) {
      expect(p.elevationUnits).toBe(128); // Never add floorTop again.
      expect(p.scale).toEqual([1, 1, 1]);
      expect(p.solidVolumeM3).toBeGreaterThan(0);
      expect(a.floors.some((f) => f.id === p.sourceFloorId)).toBe(true);
    }
  }
});
test("rotated translated mixed T retains identity and correct contact placement", () => {
  const a = fixture(17),
    before = match(a);
  for (const p of [...a.floors, ...a.walls]) {
    p.originUnits = [320 - p.originUnits[1], -160 + p.originUnits[0]];
    p.quarterTurns = (p.quarterTurns + 1) % 4;
  }
  a.floors.reverse();
  a.walls.reverse();
  const after = match(a);
  expect(after.placements.map((p) => p.id)).toEqual(
    before.placements.map((p) => p.id),
  );
  for (const p of after.placements) {
    const old = before.placements.find((v) => v.id === p.id)!;
    expect(p.originUnits).toEqual([
      320 - old.originUnits[1],
      -160 + old.originUnits[0],
    ]);
    expect(p.quarterTurns).toBe((old.quarterTurns + 1) % 4);
  }
  expect(after.assemblyFingerprint).not.toBe(before.assemblyFingerprint);
});
test("instances/decks have independent contact IDs and input order does not change qualification", () => {
  const a = fixture(17),
    before = match(a);
  a.floors.reverse();
  a.walls.reverse();
  expect(match(a)).toEqual(before);
  a.instanceId = "instance-b";
  expect(
    match(a).placements.every(
      (p) => !before.placements.some((v) => p.id === v.id),
    ),
  ).toBe(true);
  a.instanceId = "instance-a";
  a.deckId = "deck-b";
  expect(
    match(a).placements.every(
      (p) => !before.placements.some((v) => p.id === v.id),
    ),
  ).toBe(true);
});
test("floor kind alone never certifies a changed wall mask or omitted wall", () => {
  const a = fixture(17);
  a.walls[0].originUnits[0] += 1;
  expect(() => match(a)).toThrow(/unsupported complete/);
  const b = fixture(17);
  b.walls.pop();
  expect(() => match(b)).toThrow(/unsupported complete/);
});
test("missing, duplicate, overlapping, mirrored or shifted source meshes reject", () => {
  const a = fixture();
  a.floors.push(structuredClone(a.floors[0]));
  expect(() => match(a)).toThrow(/duplicate/);
  a.floors[1].id = "other";
  expect(() => match(a)).toThrow(/duplicate native/);
  for (const mode of ["reflected", "translation", "sha", "selector"]) {
    const b = fixture();
    if (mode === "reflected")
      b.floors[0].native.sourceToNominal.reflected = true;
    if (mode === "translation")
      b.floors[0].native.sourceToNominal.translation[0] = 0.1;
    if (mode === "sha") b.floors[0].native.sha256 = "b".repeat(64);
    if (mode === "selector") b.floors[0].native.nodePrefix += "other";
    expect(() => match(b)).toThrow(/unsupported complete/);
  }
});
test("opening overlays, changed dependencies and double-added floor datums reject", () => {
  const a = fixture();
  a.openingIds = ["door"];
  expect(() => match(a)).toThrow(/door\/frame/);
  const b = fixture();
  b.boundaryInterfacesSha256 = "a".repeat(64);
  expect(() => match(b)).toThrow(/dependencies/);
  const c = fixture();
  c.floorTopUnits = 12;
  expect(() => match(c)).toThrow(/datum/);
  const d = fixture();
  d.floors[0].quarterTurns = 4;
  expect(() => match(d)).toThrow(/transform/);
});
test("all exact artifact hashes are required, even a replaced passing validation report", () => {
  for (const kind of ["interfaces", "validation", "glb"] as const) {
    const changed = { ...bytes, [kind]: new Uint8Array(bytes[kind]) };
    changed[kind][0] ^= 1;
    expect(() => createNativeContactMatcher(changed)).toThrow(
      `wrong ${kind} artifact`,
    );
  }
});
