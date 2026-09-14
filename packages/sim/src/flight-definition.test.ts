import { describe, it, expect } from "vitest";
import {
  compileFlightDefinition,
  flightDefinitionHash,
  transformFlightVector,
  type FlightDefinitionInput,
  type CompiledFlightDefinition,
  type ActuatorDefinition,
} from "./flight-definition";
import { actuatorWrench } from "./ifcs";
const engine: ActuatorDefinition = {
  id: "engine",
  revision: 1,
  kind: "actuator",
  massKg: 10,
  centroid: [0, 0],
  inertiaKgM2: 2,
  fittingDefinitionId: "motor",
  maxThrustN: 100,
  forceAxis: [0, 1],
  mountOffset: [0, -0.5],
  nozzleOffset: [0, -0.75],
  nozzleHeight: 0.4,
};
function fixture(): FlightDefinitionInput {
  return {
    catalog: {
      id: "test",
      revision: 1,
      definitions: [
        {
          id: "hull",
          revision: 1,
          kind: "floor",
          massKg: 100,
          centroid: [0, 0],
          inertiaKgM2: 300,
        },
        engine,
      ],
    },
    parts: [
      {
        id: "structure",
        definitionId: "hull",
        revision: 1,
        position: [0, 0, 0],
        rotation: 0,
        flipped: false,
      },
      {
        id: "port",
        definitionId: "engine",
        revision: 1,
        position: [-2, 0, 0],
        rotation: 0,
        flipped: false,
      },
      {
        id: "starboard",
        definitionId: "engine",
        revision: 1,
        position: [2, 0, 0],
        rotation: 0,
        flipped: false,
      },
    ],
    fittings: ["port", "starboard"].map((id) => ({
      id: "fit-" + id,
      placedObjectId: id,
      definitionId: "motor",
      definitionRevision: 1,
      installed: true,
      powered: true,
      availability: 1,
    })),
    cargo: [],
    crew: [],
    hull: {
      id: "capsule",
      revision: 1,
      radius: 2,
      halfLength: 3,
      center: [0, 1],
    },
  };
}
function ready(value: CompiledFlightDefinition) {
  expect(
    value.status,
    value.status === "rejected" ? value.reason : undefined,
  ).toBe("ready");
  if (value.status !== "ready") throw Error(value.reason);
  return value;
}
describe("compileFlightDefinition", () => {
  it("counts structural parts and fitted devices exactly once on a symmetric ship", () => {
    const r = ready(compileFlightDefinition(fixture()));
    expect(r.contributions).toHaveLength(3);
    expect(r.mass).toEqual({
      massKg: 120,
      centerX: 0,
      centerY: 0,
      inertiaKgM2: 384,
    });
    expect(r.actuators).toHaveLength(2);
    expect(r.envelope.forward).toBeCloseTo(200 / 120, 10);
    expect(r.envelope.reverse).toBe(0);
  });
  it("mirrors and rotates mass centroid, force application and exhaust together", () => {
    const input = fixture();
    input.catalog = {
      ...input.catalog,
      definitions: [
        input.catalog.definitions[0],
        {
          ...engine,
          centroid: [0.25, 0.1],
          mountOffset: [0.5, -0.5],
          forceAxis: [1, 0],
        },
      ],
    };
    input.parts = input.parts
      .slice(0, 2)
      .map((p) =>
        p.id === "port"
          ? { ...p, position: [4, 5, 2], rotation: Math.PI / 2, flipped: true }
          : p,
      );
    input.fittings = input.fittings.slice(0, 1);
    const r = ready(compileFlightDefinition(input)),
      a = r.actuators[0],
      mass = r.contributions.find((m) => m.sourceId === "port")!;
    expect(mass.x).toBeCloseTo(3.9);
    expect(mass.y).toBeCloseTo(4.75);
    expect(a.x).toBeCloseTo(4.5);
    expect(a.y).toBeCloseTo(4.5);
    expect(a.nozzleX).toBeCloseTo(4.75);
    expect(a.nozzleY).toBeCloseTo(5);
    expect(a.height).toBeCloseTo(2.4);
    expect(a.exhaustX).toBeCloseTo(0);
    expect(a.exhaustY).toBeCloseTo(1);
    const w = actuatorWrench(a, r.mass);
    expect(w.fx).toBeCloseTo(0);
    expect(w.fy).toBeCloseTo(-100);
    expect(w.torque).toBeCloseTo((a.x - r.mass.centerX) * -100);
  });
  it("removal drops engine mass and actuator; missing fittings coast with retained hardware mass", () => {
    const initial = fixture(),
      removed = structuredClone(initial);
    removed.parts = removed.parts.filter((p) => p.id !== "port");
    removed.fittings = removed.fittings.filter(
      (f) => f.placedObjectId !== "port",
    );
    const r = ready(compileFlightDefinition(removed));
    expect(r.mass.massKg).toBe(110);
    expect(r.mass.centerX).toBeCloseTo(20 / 110);
    expect(r.actuators.map((a) => a.id)).toEqual(["fit-starboard"]);
    const absent = ready(compileFlightDefinition({ ...initial, fittings: [] }));
    expect(absent.mass.massKg).toBe(120);
    expect(absent.actuators).toEqual([]);
    expect(Object.values(absent.envelope)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("installed false removes the same physical element, while damage/unpowered/detached retain mass", () => {
    for (const flag of [
      { powered: false },
      { detached: true },
      { availability: 0 },
    ]) {
      const input = fixture();
      input.fittings = input.fittings.map((f) => ({ ...f, ...flag }));
      const r = ready(compileFlightDefinition(input));
      expect(r.mass.massKg).toBe(120);
      expect(r.actuators.every((a) => a.availability === 0)).toBe(true);
    }
    const input = fixture();
    input.fittings = input.fittings.map((f) => ({ ...f, installed: false }));
    const r = ready(compileFlightDefinition(input));
    expect(r.mass.massKg).toBe(100);
    expect(r.actuators).toEqual([]);
  });
  it("moving cargo and walking crew update COM/inertia without mutating authored inputs", () => {
    const input = fixture();
    input.cargo = [{ containerId: "box", massKg: 40, position: [0, 0] }];
    input.crew = [{ characterId: "person", massKg: 80, position: [1, 1] }];
    const before = JSON.stringify(input),
      r1 = ready(compileFlightDefinition(input));
    expect(JSON.stringify(input)).toBe(before);
    const moved = {
        ...input,
        cargo: [{ ...input.cargo[0], position: [-3, -4] as const }],
        crew: [{ ...input.crew[0], position: [2, 1] as const }],
      },
      r2 = ready(compileFlightDefinition(moved));
    expect(r1.mass.massKg).toBe(240);
    expect(r2.mass.centerX).toBeCloseTo(40 / 240);
    expect(r2.mass.centerY).toBeCloseTo(-80 / 240);
    expect(r2.mass.inertiaKgM2).not.toBe(r1.mass.inertiaKgM2);
    expect(r2.inputHash).not.toBe(r1.inputHash);
    expect(r2.hull.lateralOffset + r2.mass.centerX).toBe(0);
    expect(r2.hull.longitudinalOffset + r2.mass.centerY).toBe(1);
    expect(r2.hull.authoredMidpointY).toBe(1);
    expect(moved.parts).toEqual(input.parts);
  });
  it("zero supply reproduces disabled-engine wrench but retains its physical mass", () => {
    const input = fixture(),
      supplied = ready(
        compileFlightDefinition({ ...input, supply: { "fit-port": 0 } }),
      );
    expect(supplied.mass.massKg).toBe(120);
    expect(
      supplied.actuators.find((a) => a.id === "fit-port")!.availability,
    ).toBe(0);
    const damaged = ready(
      compileFlightDefinition({
        ...input,
        fittings: input.fittings.map((f) =>
          f.id === "fit-port" ? { ...f, availability: 0 } : f,
        ),
      }),
    );
    expect(supplied.actuators).toEqual(damaged.actuators);
    expect(supplied.envelope).toEqual(damaged.envelope);
  });
  it("reduces thrust proportionally with damage and supply fractions", () => {
    const input = fixture();
    input.fittings = input.fittings.map((f) => ({ ...f, availability: 0.5 }));
    const r = ready(
      compileFlightDefinition({
        ...input,
        supply: { "fit-port": 0.5, "fit-starboard": 0.5 },
      }),
    );
    expect(r.actuators.every((a) => a.availability === 0.25)).toBe(true);
    expect(r.envelope.forward).toBeCloseTo(50 / 120);
  });
  it("hashes every physical input independently of collection order", () => {
    const a = fixture(),
      b = fixture();
    b.parts = [...b.parts].reverse();
    b.fittings = [...b.fittings].reverse();
    b.catalog = {
      ...b.catalog,
      definitions: [...b.catalog.definitions].reverse(),
    };
    const r = ready(compileFlightDefinition(a)),
      s = ready(compileFlightDefinition(b));
    expect(s).toEqual(r);
    const variants = [
      {
        ...a,
        parts: a.parts.map((p) =>
          p.id === "port" ? { ...p, flipped: true } : p,
        ),
      },
      { ...a, fittings: a.fittings.map((f) => ({ ...f, powered: false })) },
      {
        ...a,
        catalog: {
          ...a.catalog,
          definitions: a.catalog.definitions.map((d) => ({
            ...d,
            massKg: d.massKg + 1,
          })),
        },
      },
      { ...a, hull: { ...a.hull, revision: 2 } },
    ];
    for (const v of variants)
      expect(ready(compileFlightDefinition(v)).inputHash).not.toBe(r.inputHash);
  });
  it.each([
    [
      "missing definition",
      (i: FlightDefinitionInput) => {
        i.parts = [
          ...i.parts,
          { ...i.parts[0], id: "unknown", definitionId: "missing" },
        ];
      },
    ],
    [
      "unknown revision",
      (i: FlightDefinitionInput) => {
        i.parts = i.parts.map((p) => ({ ...p, revision: 2 }));
      },
    ],
    [
      "nonfinite placement",
      (i: FlightDefinitionInput) => {
        i.parts = i.parts.map((p) => ({ ...p, position: [NaN, 0, 0] }));
      },
    ],
    [
      "duplicate part",
      (i: FlightDefinitionInput) => {
        i.parts = [...i.parts, i.parts[0]];
      },
    ],
    [
      "duplicate fitting",
      (i: FlightDefinitionInput) => {
        i.fittings = [...i.fittings, i.fittings[0]];
      },
    ],
    [
      "orphan fitting",
      (i: FlightDefinitionInput) => {
        i.fittings = i.fittings.map((f) => ({
          ...f,
          placedObjectId: "missing",
        }));
      },
    ],
    [
      "wrong fitting revision",
      (i: FlightDefinitionInput) => {
        i.fittings = i.fittings.map((f) => ({ ...f, definitionRevision: 2 }));
      },
    ],
    [
      "wrong fitting family",
      (i: FlightDefinitionInput) => {
        i.fittings = i.fittings.map((f) => ({ ...f, definitionId: "other" }));
      },
    ],
    [
      "out of range availability",
      (i: FlightDefinitionInput) => {
        i.fittings = i.fittings.map((f) => ({ ...f, availability: 1.1 }));
      },
    ],
    [
      "duplicate cargo",
      (i: FlightDefinitionInput) => {
        i.cargo = [
          { containerId: "x", massKg: 1, position: [0, 0] },
          { containerId: "x", massKg: 1, position: [0, 0] },
        ];
      },
    ],
    [
      "cargo identity aliases physical part",
      (i: FlightDefinitionInput) => {
        i.cargo = [{ containerId: "structure", massKg: 1, position: [0, 0] }];
      },
    ],
    [
      "crew identity aliases cargo",
      (i: FlightDefinitionInput) => {
        i.cargo = [{ containerId: "same", massKg: 1, position: [0, 0] }];
        i.crew = [{ characterId: "same", massKg: 1, position: [0, 0] }];
      },
    ],
    [
      "null cargo",
      (i: FlightDefinitionInput) => {
        i.cargo = [null as any];
      },
    ],
    [
      "duplicate crew",
      (i: FlightDefinitionInput) => {
        i.crew = [
          { characterId: "x", massKg: 1, position: [0, 0] },
          { characterId: "x", massKg: 1, position: [0, 0] },
        ];
      },
    ],
    [
      "invalid supply",
      (i: FlightDefinitionInput) => {
        i.supply = { "fit-port": NaN };
      },
    ],
    [
      "unknown supply engine",
      (i: FlightDefinitionInput) => {
        i.supply = { other: 1 };
      },
    ],
    [
      "degenerate inertia",
      (i: FlightDefinitionInput) => {
        i.parts = i.parts.slice(0, 1);
        i.fittings = [];
        i.catalog = {
          ...i.catalog,
          definitions: [{ ...i.catalog.definitions[0], inertiaKgM2: 0 }],
        };
      },
    ],
  ])("rejects %s with visible reasons and no fallback", (name, edit) => {
    const input = fixture();
    edit(input);
    const r = compileFlightDefinition(input);
    expect(r.status, name).toBe("rejected");
    if (r.status === "rejected") {
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.reasons.length).toBeGreaterThan(0);
      expect("actuators" in r).toBe(false);
    }
  });
  it("validates work caps before compilation", () => {
    const input = fixture();
    input.parts = Array(4097).fill(input.parts[0]);
    expect(compileFlightDefinition(input)).toMatchObject({
      status: "rejected",
      reason: "invalid-flight-input-budget",
    });
  });
  it("transforms without quantising arbitrary finite yaw", () => {
    const [x, y] = transformFlightVector([1, 0], 0.37, false);
    expect(x).toBe(Math.cos(0.37));
    expect(y).toBe(Math.sin(0.37));
  });
  it("hashes content canonically and rejects nonfinite hash values", () => {
    expect(flightDefinitionHash({ b: 2, a: 1 })).toBe(
      flightDefinitionHash({ a: 1, b: 2 }),
    );
    expect(() => flightDefinitionHash({ x: NaN })).toThrow();
  });
});
