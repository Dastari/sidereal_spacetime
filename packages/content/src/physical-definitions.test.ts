import { describe, it, expect } from "vitest";
import historical from "./wayfarer-starter-r001.json";
import source from "./wayfarer-rebuild-r002.json";
import exterior from "./wayfarer-exterior-r005.json";
import { LAB_FLIGHT_ACTUATORS, LAB_FLIGHT_MASS } from "./flight";
import {
  WAYFARER_PHYSICAL_CATALOG,
  WAYFARER_FLIGHT_HULL,
  WAYFARER_FLIGHT_PROFILE,
  WAYFARER_FLIGHT_SPEED,
} from "./physical-definitions";
import {
  compileFlightDefinition,
  type FlightFitting,
  type CompiledFlightDefinition,
  type ActuatorDefinition,
  type ComputerDefinition,
} from "../../sim/src/flight-definition";
import {
  wayfarerFlightInput,
  wayfarerFlightParts,
  type WayfarerPhysicalVariant,
} from "./wayfarer-flight-definition";
import type { ConstructionDocument } from "./construction";
function fittings(document: typeof source): FlightFitting[] {
  return document.layout.assembly.parts.flatMap((p) => {
    const d = WAYFARER_PHYSICAL_CATALOG.definitions.find(
      (d) => d.assetId === p.assetId,
    ) as ActuatorDefinition | ComputerDefinition | undefined;
    return d && "fittingDefinitionId" in d
      ? [
          {
            id: p.id,
            placedObjectId: p.id,
            definitionId: d.fittingDefinitionId,
            definitionRevision: 1,
            installed: true,
            powered: true,
            availability: 1,
          },
        ]
      : [];
  });
}
function ready(r: CompiledFlightDefinition) {
  expect(r.status, r.status === "rejected" ? r.reason : undefined).toBe(
    "ready",
  );
  if (r.status !== "ready") throw Error(r.reason);
  return r;
}
const document = source as unknown as ConstructionDocument;
describe("Wayfarer version 1 physical source catalog", () => {
  it("compiles all 301 r002 elements with mass and inertia within the approved one percent", () => {
    const r = ready(
      compileFlightDefinition(
        wayfarerFlightInput(
          document,
          { variant: "r002" },
          { fittings: fittings(source) },
        ),
      ),
    );
    expect(r.contributions).toHaveLength(301);
    expect(new Set(r.contributions.map((c) => c.id)).size).toBe(301);
    expect(r.contributions.every((c) => c.massKg > 0)).toBe(true);
    expect(r.mass.massKg).toBeCloseTo(12000, 7);
    expect(Math.abs(r.mass.massKg / LAB_FLIGHT_MASS.massKg - 1)).toBeLessThan(
      0.01,
    );
    expect(
      Math.abs(r.mass.inertiaKgM2 / LAB_FLIGHT_MASS.inertiaKgM2 - 1),
    ).toBeLessThan(0.01);
    expect(r.mass.inertiaKgM2).toBeCloseTo(636480, 6);
    expect(r.mass.centerX).toBeCloseTo(0.012567135782623057, 10);
    expect(r.mass.centerY).toBeCloseTo(0.9158976982094873, 10);
    expect(r.hull.radius).toBe(5.4);
    expect(r.hull.halfLength).toBe(7.125);
    expect(r.hull.authoredMidpointY).toBe(1.125);
    expect(r.hull.longitudinalOffset + r.mass.centerY).toBeCloseTo(1.125);
  });
  it("reproduces all nine documented mounts, force axes, heights and thrusts from actual placements", () => {
    const r = ready(
      compileFlightDefinition(
        wayfarerFlightInput(
          document,
          { variant: "r002" },
          { fittings: fittings(source) },
        ),
      ),
    );
    expect(r.actuators).toHaveLength(9);
    for (const old of LAB_FLIGHT_ACTUATORS) {
      const a = r.actuators.find((a) => a.id === old.id)!;
      expect(a.x).toBeCloseTo(old.x, 10);
      expect(a.y).toBeCloseTo(old.y, 10);
      expect(a.height).toBe(old.height);
      expect(a.maxThrustN).toBe(old.maxThrustN);
      expect(Math.sin(a.rotation)).toBeCloseTo(Math.sin(old.rotation), 10);
      expect(Math.cos(a.rotation)).toBeCloseTo(Math.cos(old.rotation), 10);
      expect(a.nozzleX).toBe(a.x);
      expect(a.nozzleY).toBe(a.y);
    }
    expect(r.computers).toHaveLength(1);
    expect(r.computers[0].requiredPowerW).toBeGreaterThan(0);
  });
  it.each([
    ["r001", historical, 262],
    ["r002", source, 301],
    ["r005", exterior, 294],
  ] as const)(
    "covers explicitly bound historical variant %s without using its aggregate fixture",
    (variant, doc, count) => {
      const r = ready(
        compileFlightDefinition(
          wayfarerFlightInput(
            doc as unknown as ConstructionDocument,
            { variant: variant as WayfarerPhysicalVariant },
            { fittings: fittings(doc as typeof source) },
          ),
        ),
      );
      expect(r.contributions).toHaveLength(count);
      expect(r.actuators).toHaveLength(9);
      expect(r.mass.massKg).toBeGreaterThan(0);
    },
  );
  it("follows actual engine movement, mirroring and removal", () => {
    const clone = structuredClone(document),
      id = "drives-main--3.6";
    clone.layout.assembly!.parts = clone.layout.assembly!.parts.filter(
      (p) => p.id !== id,
    );
    const f = fittings(source).filter((f) => f.id !== id);
    const removed = ready(
      compileFlightDefinition(
        wayfarerFlightInput(clone, { variant: "r002" }, { fittings: f }),
      ),
    );
    expect(removed.contributions).toHaveLength(300);
    expect(removed.actuators).toHaveLength(8);
    expect(removed.mass.massKg).toBeLessThan(12000);
    const p = clone.layout.assembly!.parts.find(
      (p) => p.id === "drives-main-3.6",
    )!;
    p.position = [9, 8, 1];
    p.flipped = true;
    p.rotation = Math.PI / 2;
    const moved = ready(
      compileFlightDefinition(
        wayfarerFlightInput(clone, { variant: "r002" }, { fittings: f }),
      ),
    );
    const a = moved.actuators.find((a) => a.id === p.id)!;
    expect(a.x).toBeCloseTo(11.4375);
    expect(a.y).toBeCloseTo(8.025);
    expect(a.exhaustX).toBeCloseTo(1);
    expect(a.exhaustY).toBeCloseTo(0);
  });
  it("replaces adopted cargo shell once and then adds actual payload mass at its moved position", () => {
    const id = "room-storage-container-2.15-0.25",
      base = ready(
        compileFlightDefinition(
          wayfarerFlightInput(
            document,
            { variant: "r002" },
            { fittings: fittings(source) },
          ),
        ),
      ),
      shell = base.contributions.find((c) => c.sourceId === id)!;
    const input = wayfarerFlightInput(
      document,
      {
        variant: "r002",
        replacements: [
          {
            placedObjectId: id,
            part: {
              id,
              definitionId: "carrier-1m",
              revision: 1,
              position: [-2, -5, 0],
              rotation: 0,
              flipped: false,
            },
          },
        ],
      },
      {
        fittings: fittings(source),
        cargo: [{ containerId: "payload", massKg: 30, position: [-1.5, -4.5] }],
      },
    );
    const r = ready(compileFlightDefinition(input));
    expect(r.mass.massKg).toBeCloseTo(12000 - shell.massKg + 20 + 30, 7);
    expect(r.contributions).toHaveLength(302);
    expect(r.contributions.filter((c) => c.sourceId === id)).toHaveLength(1);
    expect(r.contributions.find((c) => c.sourceId === id)!.x).toBe(-1.5);
  });
  it("accepts source-to-instance identity substitution without changing the physical result", () => {
    const clone = structuredClone(document),
      ids: Record<string, string> = {};
    let n = 0;
    function gather(v: unknown) {
      if (Array.isArray(v)) v.forEach(gather);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (k === "id" && typeof x === "string") ids[x] = "instance-" + n++;
          gather(x);
        }
      }
    }
    gather(clone.layout);
    for (const f of clone.floors) ids[f.id] ??= "instance-" + n++;
    function replace(v: unknown): any {
      if (typeof v === "string") return ids[v] ?? v;
      if (Array.isArray(v)) return v.map(replace);
      if (v && typeof v === "object")
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, replace(x)]),
        );
      return v;
    }
    const instanced = replace(clone) as ConstructionDocument,
      fs = fittings(source).map((f) => ({
        ...f,
        id: "fitting-" + f.id,
        placedObjectId: ids[f.placedObjectId],
      })),
      r = ready(
        compileFlightDefinition(
          wayfarerFlightInput(
            instanced,
            { variant: "r002", identities: ids },
            { fittings: fs },
          ),
        ),
      );
    expect(r.mass.massKg).toBeCloseTo(12000, 7);
    expect(r.actuators).toHaveLength(9);
    expect(r.mass.inertiaKgM2).toBeCloseTo(636480, 6);
  });
  it("rejects unsupported structure and asset revisions before flight compilation", () => {
    const a = structuredClone(document);
    a.floors[0].origin[0] += 1;
    expect(() => wayfarerFlightParts(a, { variant: "r002" })).toThrow(
      "structural revision",
    );
    const b = structuredClone(document);
    b.layout.assembly!.revisions[b.layout.assembly!.parts[0].assetId] =
      "unknown";
    expect(() => wayfarerFlightParts(b, { variant: "r002" })).toThrow(
      "physical asset revision",
    );
    const c = structuredClone(document);
    c.layout.assembly!.parts[0].assetId = "unknown";
    expect(() => wayfarerFlightParts(c, { variant: "r002" })).toThrow(
      "physical asset revision",
    );
  });
  it("keeps physical definitions immutable and profile speed explicit without live fixture imports", () => {
    expect(Object.isFrozen(WAYFARER_PHYSICAL_CATALOG.definitions)).toBe(true);
    expect(
      Object.isFrozen(WAYFARER_PHYSICAL_CATALOG.definitions[0].centroid),
    ).toBe(true);
    expect(WAYFARER_FLIGHT_PROFILE.rawTurnBehavior).toBe(false);
    expect(WAYFARER_FLIGHT_SPEED).toEqual({ forward: 30, reverse: 12 });
    expect(WAYFARER_FLIGHT_HULL.id).toBe("wayfarer-r006-capsule-v1");
  });
});

import { planConstructionInstance } from "../../sim/src/construction-instance";
import { compileConstruction } from "../../sim/src/construction-transactions";
import { qualifiedWayfarerWalkingBindings } from "../../sim/src/wayfarer-walking-bindings";
it.each([
  ["r001", historical, 262],
  ["r002", source, 301],
  ["r005", exterior, 294],
] as const)(
  "reads actual authoritative spawned %s identity maps and prefixed structural anchors",
  (variant, doc, count) => {
    const snapshot = compileConstruction(JSON.stringify(doc));
    let counter = 0;
    const plan = planConstructionInstance(
      snapshot,
      {
        blueprintRevisionId: "physical-test",
        expectedBlueprintSha256: snapshot.sha256,
        sourceDeckId: doc.layout.playableDeckId,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        objectCollisionBindings: qualifiedWayfarerWalkingBindings(
          snapshot,
          0.3,
          1.8,
        ),
      },
      () =>
        `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`,
    );
    const identities = Object.fromEntries(
      Object.values(plan.mappings)
        .flat()
        .map((m) => [m.sourceId, m.instanceId]),
    );
    const actualFittings = fittings(doc as typeof source).map((f) => ({
      ...f,
      id: "fit-" + f.id,
      placedObjectId: identities[f.placedObjectId],
    }));
    const result = ready(
      compileFlightDefinition(
        wayfarerFlightInput(
          plan.document,
          { variant, identities },
          { fittings: actualFittings },
        ),
      ),
    );
    expect(result.contributions).toHaveLength(count);
    expect(result.actuators).toHaveLength(9);
    if (variant === "r002") expect(result.mass.massKg).toBeCloseTo(12000, 7);
  },
);
it("adds a real preserved fuel attachment shell and liquid payload once", () => {
  const r = ready(
    compileFlightDefinition(
      wayfarerFlightInput(
        document,
        {
          variant: "r002",
          attachments: [
            {
              id: "fuel-attachment",
              definitionId: "physical:part-81d226967abf2efefc20",
              revision: 1,
              position: [-3, 7, 0.1875],
              rotation: 0,
              flipped: false,
            },
          ],
        },
        {
          fittings: fittings(source),
          cargo: [
            { containerId: "fuel-container", massKg: 40, position: [-3, 7] },
          ],
        },
      ),
    ),
  );
  expect(r.mass.massKg).toBeCloseTo(12052, 7);
  expect(r.contributions).toHaveLength(303);
  expect(
    r.contributions.find((c) => c.sourceId === "fuel-attachment")!.massKg,
  ).toBe(12);
});
