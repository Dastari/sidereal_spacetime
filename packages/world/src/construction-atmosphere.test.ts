import { expect, test } from "vitest";
import { Identity } from "spacetimedb";
import type { PressureStructure } from "@sidereal/sim/construction-topology";
import {
  initializeAtmosphere,
  stepAtmosphere,
  replaceAtmosphereModel,
  ownAtmospheres,
  type AtmosphereRow,
  type AtmosphereTable,
} from "./construction-atmosphere";

const owner = Identity.fromString("1".repeat(64)),
  other = Identity.fromString("2".repeat(64));
function table(initial: AtmosphereRow[] = []): AtmosphereTable {
  const rows = new Map(initial.map((r) => [r.id, r]));
  return {
    iter: () => rows.values(),
    insert: (r) => {
      if (rows.has(r.id)) throw Error("duplicate");
      rows.set(r.id, r);
    },
    id: {
      find: (id) => rows.get(id),
      update: (r) => {
        if (!rows.has(r.id)) throw Error("missing");
        rows.set(r.id, r);
      },
    },
    by_owner: {
      filter: function* (principal) {
        for (const row of rows.values())
          if (row.owner.isEqual(principal)) yield row;
      },
    },
  };
}
function accepted(vent = false) {
  const structure: PressureStructure = {
    cells: [
      { id: "a", deckId: "lower", volumeM3: 1, faces: ["door"] },
      { id: "b", deckId: "lower", volumeM3: 1, faces: ["door", "outside"] },
    ],
    boundaries: [
      {
        id: "door",
        a: { cellId: "a", faceId: "door" },
        b: { cellId: "b", faceId: "door" },
        kind: "flow",
        conductanceMolesPerSecondPa: 0.001,
        sourceDefinitionId: "explicit-test-flow",
      },
      vent
        ? {
            id: "outside",
            a: { cellId: "b", faceId: "outside" },
            b: null,
            kind: "flow",
            conductanceMolesPerSecondPa: 0.0001,
            sourceDefinitionId: "explicit-test-vent",
          }
        : {
            id: "outside",
            a: { cellId: "b", faceId: "outside" },
            b: null,
            kind: "sealed",
            pressureDefinitionId: "explicit-test-seal",
          },
    ],
  };
  return { structure, proofHash: "a".repeat(64) };
}
const charge = {
  kind: "allocated" as const,
  allocationId: "test-reservoir-transfer",
  gas: [
    { compartmentId: "volume:a", moles: 100 },
    { compartmentId: "volume:b", moles: 0 },
  ],
};
const gas = (row: AtmosphereRow) =>
  JSON.parse(row.gasJson) as { compartmentId: string; moles: number }[];
const total = (row: AtmosphereRow) =>
  gas(row).reduce((n, g) => n + g.moles, 0) +
  row.ventedMoles +
  row.removedMoles;

test("initialization and repeated ticks cannot charge gas twice; default instance starts in vacuum", () => {
  const t = table(),
    m = accepted();
  initializeAtmosphere(t, { id: "one", owner }, m, charge, 0n);
  stepAtmosphere(t, 1n, 0.05);
  const stepped = t.id.find("one")!;
  expect(gas(stepped)[1].moles).toBeGreaterThan(0);
  expect(gas(stepped)[1].moles).toBeLessThan(50);
  expect(total(stepped)).toBeCloseTo(100, 10);
  expect(initializeAtmosphere(t, { id: "one", owner }, m, charge, 2n)).toEqual(
    stepped,
  );
  stepAtmosphere(t, 1n, 1);
  expect(t.id.find("one")).toEqual(stepped);
  expect(() =>
    initializeAtmosphere(t, { id: "one", owner: other }, m, charge, 2n),
  ).toThrow(/conflicts/);
  expect(() =>
    initializeAtmosphere(
      t,
      { id: "one", owner },
      m,
      { ...charge, allocationId: "new-charge" },
      2n,
    ),
  ).toThrow(/conflicts/);
  initializeAtmosphere(t, { id: "vacuum", owner }, m, { kind: "vacuum" }, 2n);
  stepAtmosphere(t, 3n, 1);
  expect(total(t.id.find("vacuum")!)).toBe(0);
});

test("serialized persistent gas resumes without replay, reset or cross-instance exchange", () => {
  const t = table(),
    m = accepted(true);
  initializeAtmosphere(t, { id: "one", owner }, m, charge, 0n);
  initializeAtmosphere(
    t,
    { id: "two", owner: other },
    m,
    { kind: "vacuum" },
    0n,
  );
  for (let i = 1; i <= 10; i++) stepAtmosphere(t, BigInt(i), 0.05);
  const before = t.id.find("one")!;
  expect(before.ventedMoles).toBeGreaterThan(0);
  expect(total(before)).toBeCloseTo(before.sourceMoles, 9);
  const encoded = JSON.stringify(
    [...t.iter()].map((r) => ({
      ...r,
      owner: r.owner.toHexString(),
      revision: String(r.revision),
      lastTick: String(r.lastTick),
    })),
  );
  const restored = table(
    JSON.parse(encoded).map((r: any) => ({
      ...r,
      owner: Identity.fromString(r.owner),
      revision: BigInt(r.revision),
      lastTick: BigInt(r.lastTick),
    })),
  );
  initializeAtmosphere(restored, { id: "one", owner }, m, charge, 10n);
  expect(restored.id.find("one")!.gasJson).toBe(before.gasJson);
  stepAtmosphere(restored, 10n, 1);
  expect(restored.id.find("one")!.gasJson).toBe(before.gasJson);
  stepAtmosphere(restored, 11n, 0.05);
  expect(total(restored.id.find("one")!)).toBeCloseTo(100, 9);
  expect(total(restored.id.find("two")!)).toBe(0);
  expect(ownAtmospheres(restored, owner).map((r) => r.instanceId)).toEqual([
    "one",
  ]);
  expect(ownAtmospheres(restored, other).map((r) => r.instanceId)).toEqual([
    "two",
  ]);
  expect(Object.keys(ownAtmospheres(restored, owner)[0])).not.toContain(
    "structureJson",
  );
});

test("model edits preserve gas; removing a charged cell requires explicit accounting", () => {
  const t = table();
  initializeAtmosphere(t, { id: "one", owner }, accepted(), charge, 0n);
  stepAtmosphere(t, 1n, 0.1);
  const before = t.id.find("one")!;
  const next = {
    proofHash: "b".repeat(64),
    structure: {
      cells: [{ id: "a", deckId: "lower", volumeM3: 0.5, faces: ["door"] }],
      boundaries: [
        {
          id: "end",
          a: { cellId: "a", faceId: "door" },
          b: null,
          kind: "sealed" as const,
          pressureDefinitionId: "explicit-test-seal",
        },
      ],
    },
  };
  expect(() =>
    replaceAtmosphereModel(t, "one", before.revision - 1n, next, "capture"),
  ).toThrow(/revision/);
  expect(() =>
    replaceAtmosphereModel(t, "one", before.revision, next, "reject-removal"),
  ).toThrow(/disposition/);
  expect(t.id.find("one")).toEqual(before);
  const result = replaceAtmosphereModel(
    t,
    "one",
    before.revision,
    next,
    "capture",
  );
  expect(result.capturedMoles).toBeCloseTo(gas(before)[1].moles, 10);
  expect(total(result.row)).toBeCloseTo(100, 10);
  expect(ownAtmospheres(t, owner)[0].compartments[0].volumeM3).toBe(0.5);
});

test("admitted work and numerical validation reject before mutating rows", () => {
  const t = table(),
    m = accepted();
  expect(() =>
    initializeAtmosphere(
      t,
      { id: "bad", owner },
      { ...m, proofHash: "client-says-valid" },
      charge,
      0n,
    ),
  ).toThrow(/hash/);
  expect(() =>
    initializeAtmosphere(
      t,
      { id: "bad", owner },
      m,
      {
        ...charge,
        gas: [
          { compartmentId: "volume:a", moles: NaN },
          { compartmentId: "volume:b", moles: 0 },
        ],
      },
      0n,
    ),
  ).toThrow(/amount/);
  expect([...t.iter()]).toHaveLength(0);
  for (let i = 0; i < 32; i++)
    initializeAtmosphere(
      t,
      { id: String(i), owner },
      m,
      { kind: "vacuum" },
      0n,
    );
  expect(() =>
    initializeAtmosphere(
      t,
      { id: "overflow", owner },
      m,
      { kind: "vacuum" },
      0n,
    ),
  ).toThrow(/budget/);
  const before = [...t.iter()];
  expect(() => stepAtmosphere(t, 1n, NaN)).toThrow(/timestep/);
  expect([...t.iter()]).toEqual(before);
});

test("invalid clocks and removal dispositions cannot alter persistent gas", () => {
  const t = table(),
    m = accepted();
  expect(() =>
    initializeAtmosphere(t, { id: "one", owner }, m, charge, -1n),
  ).toThrow(/tick/);
  expect([...t.iter()]).toHaveLength(0);
  initializeAtmosphere(t, { id: "one", owner }, m, charge, 0n);
  const old = t.id.find("one");
  expect(() => stepAtmosphere(t, -1n, 0.05)).toThrow(/tick/);
  expect(() => stepAtmosphere(t, 1n << 64n, 0.05)).toThrow(/tick/);
  expect(() =>
    replaceAtmosphereModel(t, "one", 1n, m, "discard" as never),
  ).toThrow(/disposition/);
  expect(t.id.find("one")).toEqual(old);
});

test("persistent resource accounting cannot hide nonfinite or unaccounted gas", () => {
  for (const corrupt of [
    { sourceMoles: NaN },
    { ventedMoles: Infinity },
    { removedMoles: -1 },
    { sourceMoles: 101 },
  ]) {
    const t = table();
    const row = initializeAtmosphere(
      t,
      { id: "one", owner },
      accepted(),
      charge,
      0n,
    );
    t.id.update({ ...row, ...corrupt });
    const before = t.id.find("one");
    expect(() => stepAtmosphere(t, 1n, 0.05)).toThrow(/accounting/);
    expect(t.id.find("one")).toEqual(before);
  }
});
