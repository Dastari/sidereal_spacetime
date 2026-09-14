import { expect, test } from "vitest";
import { Identity } from "spacetimedb";
import {
  studyDamageStages,
  studyPressureModel,
} from "@sidereal/sim/construction-panel-damage-study";
import {
  initializeAtmosphere,
  replaceAtmosphereModel,
  stepAtmosphere,
  ownAtmospheres,
  type AtmosphereRow,
  type AtmosphereTable,
} from "./construction-atmosphere";

/** Adapter integration only: no registered damage reducer, permissions, native
 * approval or new live installation is supplied by these fixtures. */
function fixture(kind: "hull" | "interior") {
  const owner = Identity.fromString("1".repeat(64));
  const rows = new Map<string, AtmosphereRow>();
  const table: AtmosphereTable = {
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
      filter: function* (who) {
        for (const row of rows.values()) if (row.owner.isEqual(who)) yield row;
      },
    },
  };
  const stages = studyDamageStages(kind);
  const accepted = (stage: number) => ({
    structure: studyPressureModel(kind, stages[stage].state),
    proofHash: "a".repeat(64),
  });
  const allocation = {
    kind: "allocated" as const,
    allocationId: "explicit-test-gas",
    gas: [
      { compartmentId: "volume:a", moles: 100 },
      ...(kind === "interior" ? [{ compartmentId: "volume:b", moles: 0 }] : []),
    ],
  };
  initializeAtmosphere(
    table,
    { id: "test", owner },
    accepted(0),
    allocation,
    0n,
  );
  return { table, rows, owner, accepted, allocation };
}
for (const kind of ["hull", "interior"] as const)
  test(`${kind} layered damage uses existing persistent atmosphere accounting without refill`, () => {
    const f = fixture(kind);
    for (const stage of [1, 2]) {
      const row = f.table.id.find("test")!;
      replaceAtmosphereModel(
        f.table,
        "test",
        row.revision,
        f.accepted(stage),
        "reject-removal",
      );
      stepAtmosphere(f.table, BigInt(stage), 1);
      const current = f.table.id.find("test")!;
      expect(current.ventedMoles).toBe(0);
      expect(JSON.parse(current.gasJson)[0].moles).toBe(100);
    }
    const before = f.table.id.find("test")!;
    const breached = replaceAtmosphereModel(
      f.table,
      "test",
      before.revision,
      f.accepted(3),
      "reject-removal",
    ).row;
    expect(breached.sourceMoles).toBe(100);
    expect(breached.gasJson).toBe(before.gasJson); // Opening never teleports/equalizes gas.
    expect(() =>
      replaceAtmosphereModel(
        f.table,
        "test",
        before.revision,
        f.accepted(3),
        "reject-removal",
      ),
    ).toThrow("revision conflict");
    stepAtmosphere(f.table, 3n, 1);
    const firstTick = f.table.id.find("test")!;
    stepAtmosphere(f.table, 3n, 1);
    expect(f.table.id.find("test")).toEqual(firstTick);
    for (let tick = 4n; tick <= 12n; tick++) stepAtmosphere(f.table, tick, 1);
    const final = f.table.id.find("test")!,
      projection = ownAtmospheres(f.table, f.owner)[0];
    const gas = JSON.parse(final.gasJson) as { moles: number }[];
    expect(
      gas.reduce((sum, g) => sum + g.moles, 0) +
        final.ventedMoles +
        final.removedMoles,
    ).toBeCloseTo(final.sourceMoles, 10);
    expect(final.removedMoles).toBe(0);
    if (kind === "interior") {
      expect(final.ventedMoles).toBe(0);
      expect(projection.compartments[1].pressurePa).toBeGreaterThan(0);
      expect(projection.compartments[0].pressurePa).toBeGreaterThan(
        projection.compartments[1].pressurePa,
      );
    } else expect(final.ventedMoles).toBeGreaterThan(0);
    // Reconnect/reinitialization cannot replace damaged topology or replenish its gas.
    expect(() =>
      initializeAtmosphere(
        f.table,
        { id: "test", owner: f.owner },
        f.accepted(0),
        f.allocation,
        13n,
      ),
    ).toThrow("conflicts");
    expect(f.table.id.find("test")).toEqual(final);
  });
