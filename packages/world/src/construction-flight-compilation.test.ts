import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ Range: class {} }));
import {
  compileDirtyFlights,
  markFlightDirty,
  type CompiledFlightRow,
} from "./construction-flight-compilation";
import type { FlightDefinitionInput } from "../../sim/src/flight-definition";
function fixture() {
  const rows = new Map<string, CompiledFlightRow>();
  const dirty = new Map<string, { shipId: string; revision: bigint }>();
  let writes = 0;
  const put = (row: CompiledFlightRow) => {
    writes++;
    rows.set(row.shipId, row);
  };
  const db = {
    constructionFlightCompiled: {
      shipId: { find: (id: string) => rows.get(id), update: put },
      insert: put,
    },
    constructionFlightDirty: {
      shipId: {
        find: (id: string) => dirty.get(id),
        delete: (id: string) => dirty.delete(id),
      },
      insert: (row: { shipId: string; revision: bigint }) =>
        dirty.set(row.shipId, row),
      count: () => BigInt(dirty.size),
      by_revision: {
        filter: () =>
          [...dirty.values()].sort((a, b) =>
            a.revision < b.revision
              ? -1
              : a.revision > b.revision
                ? 1
                : a.shipId.localeCompare(b.shipId),
          ),
      },
    },
  };
  const input: FlightDefinitionInput = {
    parts: [
      {
        id: "hull",
        definitionId: "hull",
        revision: 1,
        position: [0, 0, 0],
        rotation: 0,
        flipped: false,
      },
    ],
    fittings: [],
    cargo: [],
    crew: [],
    catalog: {
      id: "test",
      revision: 1,
      definitions: [
        {
          id: "hull",
          revision: 1,
          kind: "structure",
          massKg: 100,
          centroid: [0, 0],
          inertiaKgM2: 200,
        },
      ],
    },
    hull: {
      id: "capsule",
      revision: 1,
      radius: 1,
      halfLength: 2,
      center: [0, 1],
    },
  };
  return { db, rows, dirty, input, writes: () => writes };
}
test("compile queue limits work to two ships and repeated changes preserve pending age", () => {
  const f = fixture();
  for (const [id, revision] of [
    ["third", 3n],
    ["first", 1n],
    ["second", 2n],
  ] as const)
    markFlightDirty(f.db, id, revision);
  markFlightDirty(f.db, "first", 9n);
  expect(f.dirty.get("first")!.revision).toBe(1n);
  expect(compileDirtyFlights(f.db, () => f.input)).toEqual({
    attempted: 2,
    changed: 2,
    rejected: 0,
    remaining: 1,
  });
  expect([...f.rows.keys()]).toEqual(["first", "second"]);
  expect([...f.dirty.keys()]).toEqual(["third"]);
  compileDirtyFlights(f.db, () => f.input);
  expect(f.dirty.size).toBe(0);
});
test("unchanged dirty input does not rewrite a compiled row or revision", () => {
  const f = fixture();
  markFlightDirty(f.db, "ship", 1n);
  compileDirtyFlights(f.db, () => f.input);
  const first = f.rows.get("ship");
  markFlightDirty(f.db, "ship", 2n);
  compileDirtyFlights(f.db, () => f.input);
  expect(f.rows.get("ship")).toBe(first);
  expect(f.writes()).toBe(1);
});
test("invalid definitions preserve only last accepted coasting inertia and visible rejection", () => {
  const f = fixture();
  markFlightDirty(f.db, "ship", 1n);
  compileDirtyFlights(f.db, () => f.input);
  const prior = f.rows.get("ship")!;
  f.input.parts = [{ ...f.input.parts[0], revision: 2 }];
  markFlightDirty(f.db, "ship", 2n);
  compileDirtyFlights(f.db, () => f.input);
  const failed = f.rows.get("ship")!;
  expect(failed).toMatchObject({
    status: "rejected",
    massKg: 100,
    inertiaKgM2: 200,
    actuatorsJson: "[]",
    computersJson: "[]",
    hullJson: prior.hullJson,
    revision: 2n,
  });
  expect(failed.reason).toContain("missing-physical-definition:hull@2");
  markFlightDirty(f.db, "ship", 3n);
  compileDirtyFlights(f.db, () => f.input);
  expect(f.writes()).toBe(2);
  markFlightDirty(f.db, "new-invalid", 4n);
  compileDirtyFlights(f.db, () => f.input);
  expect(f.rows.get("new-invalid")).toMatchObject({
    status: "rejected",
    massKg: 0,
    inertiaKgM2: 0,
    hullJson: "null",
  });
});
