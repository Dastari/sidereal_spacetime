import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ Range: class {} }));
import { Identity } from "spacetimedb";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import {
  prefabFlightInput,
  prefabFlightModel,
  PREFAB_FLIGHT_DEFINITION,
} from "@sidereal/sim/prefab-flight";
import { flightDefinitionCatalogHash } from "@sidereal/sim/flight-definition";
import { compileDirtyFlights } from "./construction-flight-compilation";
import {
  queueWayfarerFixedMainCorrection,
  type FixedMainMigrationDatabase,
} from "./wayfarer-fixed-main-migration";

function fixture(prefab = "fed.m.wayfarer") {
  const catalog = defaultPrefabComponentCatalog(),
    doc = prefabById(prefab)!;
  const model = prefabFlightModel(doc, catalog);
  const owner = Identity.fromString("a".repeat(64));
  const instance = {
    id: "ship",
    owner,
    workspaceId: "workspace",
    blueprintId: "blueprint",
    blueprintSha256: prefab,
    name: "ship",
    revision: 6n,
    documentJson: JSON.stringify(prefabConstructionDocument(doc, catalog)),
    idMapJson: "{}",
    spawnDeckId: "deck",
    spawnX: 0,
    spawnY: 0,
    createdMicros: 0n,
  };
  const binding = {
    shipId: "ship",
    instanceId: "ship",
    owner,
    deckId: "deck",
    stationId: "helm",
    instanceRevision: 6n,
    blueprintSha256: prefab,
    definitionId: PREFAB_FLIGHT_DEFINITION,
    definitionSha256: flightDefinitionCatalogHash(model.catalog),
    lifecycle: "active",
    revision: 1n,
  };
  const access = {
    shipId: "ship",
    instanceId: "ship",
    owner,
    characterId: "crew",
    deckId: "deck",
    templateSha256: prefab,
    instanceRevision: 6n,
    lifecycle: "active",
  };
  const fittings = model.fittings.map((f, i) => ({
    id: `fitting-${i}`,
    shipId: "ship",
    placedObjectId: `ship:${f.sourceId}`,
    sourceDeviceId: f.sourceId,
    definitionId: f.definitionId,
    definitionRevision: f.definitionRevision,
    kind: f.role,
    installed: true,
    powered: true,
    availability: 1,
    revision: 1n,
  }));
  const outputs = fittings
    .filter((f) => f.kind === "actuator")
    .map((f) => ({
      id: `output:${f.id}`,
      shipId: "ship",
      actuatorId: f.id,
      throttle: 0.75,
      tick: 40n,
    }));
  const receipts = new Map(),
    dirty = new Map(),
    compiled = new Map();
  const db: FixedMainMigrationDatabase = {
    constructionInstance: { id: { find: () => instance } },
    gameShipAccess: { shipId: { find: () => access } },
    constructionFlightBinding: { shipId: { find: () => binding } },
    constructionFlightFitting: { by_ship: { filter: () => fittings } },
    constructionFlightReceipt: {
      id: { find: (id) => receipts.get(id) },
      insert: (row) => receipts.set(row.id, row),
    },
    actuatorOutput: {
      by_ship: { filter: () => outputs },
      id: {
        update: (row) => {
          outputs[outputs.findIndex((o) => o.id === row.id)] = row;
        },
      },
    },
    constructionFlightDirty: {
      shipId: { find: (id) => dirty.get(id), delete: (id) => dirty.delete(id) },
      insert: (row) => dirty.set(row.shipId, row),
      count: () => BigInt(dirty.size),
      by_revision: { filter: () => dirty.values() },
    },
    constructionFlightCompiled: {
      shipId: {
        find: (id) => compiled.get(id),
        update: (row) => compiled.set(row.shipId, row),
      },
      insert: (row) => compiled.set(row.shipId, row),
    },
  };
  const input = (old = false) =>
    prefabFlightInput(
      old ? { ...model, disabledActuatorSources: undefined } : model,
      (s) => `ship:${s}`,
      {
        fittings: fittings.map(
          ({
            id,
            placedObjectId,
            definitionId,
            definitionRevision,
            installed,
            powered,
            availability,
          }) => ({
            id,
            placedObjectId,
            definitionId,
            definitionRevision,
            installed,
            powered,
            availability,
          }),
        ),
      },
    );
  return {
    db,
    instance,
    binding,
    access,
    fittings,
    outputs,
    receipts,
    dirty,
    compiled,
    input,
  };
}

test("one transactional correction clears only reverse outputs and recompiles without refitting hardware", () => {
  const f = fixture();
  f.dirty.set("ship", { shipId: "ship", revision: 1n });
  compileDirtyFlights(f.db, () => f.input(true));
  const old = f.compiled.get("ship");
  const untouched = structuredClone({
    instance: f.instance,
    binding: f.binding,
    access: f.access,
    fittings: f.fittings,
  });
  const beforeOutputs = f.outputs.map((o) => ({ ...o }));
  expect(queueWayfarerFixedMainCorrection(f.db, "ship", 20n)).toBe(true);
  expect(f.receipts.size).toBe(1);
  expect(f.dirty.get("ship").revision).toBe(20n);
  for (const [i, output] of f.outputs.entries()) {
    const reverse = f.fittings
      .find((x) => x.id === output.actuatorId)!
      .sourceDeviceId.endsWith("#reverser");
    expect(output).toEqual({
      ...beforeOutputs[i],
      ...(reverse ? { throttle: 0 } : {}),
    });
  }
  expect({
    instance: f.instance,
    binding: f.binding,
    access: f.access,
    fittings: f.fittings,
  }).toEqual(untouched);
  expect(queueWayfarerFixedMainCorrection(f.db, "ship", 21n)).toBe(false);
  expect(f.dirty.get("ship").revision).toBe(20n);
  expect(compileDirtyFlights(f.db, () => f.input())).toMatchObject({
    attempted: 1,
    changed: 1,
    rejected: 0,
  });
  const current = f.compiled.get("ship");
  expect(current.inputHash).not.toBe(old.inputHash);
  expect(current.definitionHash).toBe(old.definitionHash);
  expect(current.massKg).toBe(old.massKg);
  const actuators = JSON.parse(current.actuatorsJson);
  expect(
    actuators
      .filter((a: { placedObjectId: string }) =>
        a.placedObjectId.endsWith("#reverser"),
      )
      .map((a: { availability: number }) => a.availability),
  ).toEqual([0, 0, 0]);
  // Persisted receipts survive a fresh database adapter/process; no in-memory migration flag.
  expect(queueWayfarerFixedMainCorrection({ ...f.db }, "ship", 22n)).toBe(
    false,
  );
  expect(f.dirty.size).toBe(0);
});

test("correction rejects legacy ships and mismatched owner/revision/catalogue admission", () => {
  const legacy = fixture("fed.s.wren");
  expect(queueWayfarerFixedMainCorrection(legacy.db, "ship", 1n)).toBe(false);
  expect(legacy.dirty.size).toBe(0);
  const changes = [
    (f: ReturnType<typeof fixture>) => {
      f.access.lifecycle = "suspended";
    },
    (f: ReturnType<typeof fixture>) => {
      f.binding.instanceRevision++;
    },
    (f: ReturnType<typeof fixture>) => {
      f.binding.definitionSha256 = "bad";
    },
    (f: ReturnType<typeof fixture>) => {
      f.access.owner = Identity.fromString("b".repeat(64));
    },
    (f: ReturnType<typeof fixture>) => {
      f.instance.documentJson = "invalid";
      f.instance.blueprintSha256 += "bad";
      f.binding.blueprintSha256 = f.instance.blueprintSha256;
      f.access.templateSha256 = f.instance.blueprintSha256;
    },
  ];
  for (const change of changes) {
    const f = fixture();
    change(f);
    expect(queueWayfarerFixedMainCorrection(f.db, "ship", 1n)).toBe(false);
    expect(f.receipts.size).toBe(0);
    expect(f.dirty.size).toBe(0);
    expect(f.outputs.every((o) => o.throttle === 0.75)).toBe(true);
  }
});
