import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
  canReadGame: (ctx: { live: boolean }) => ctx.live,
}));
import { SHIP_OPERATOR } from "./ship-operator";
import { wipePlayerShips } from "./ship-wipe";
import { onboardNewCharacter, setStarterPrefab } from "./ship-policy";
import { assignPrefabShip } from "./ship-assign";
import { FED_WREN_PIN } from "./prefab-ship-spawners";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import { ensureCanonicalSystem } from "./shared-world";
import { compileShipFlight } from "./construction-flight-compilation";
import { readConstructionFlightInput } from "./construction-flight-input";
import { PREFAB_FLIGHT_DEFINITION } from "@sidereal/sim/prefab-flight";
import { TRUSTED_PREFAB_BLUEPRINT_PREFIX } from "@sidereal/sim/game-ship-access";
import { GAME_OWNED_TEMPLATE_NAMESPACE } from "./game-ship-access-authority";
import {
  fixture,
  mapState,
  OWNER_A,
  OWNER_B,
  seeded,
  type Row,
} from "./ship-maintenance-test-fixture";

const WREN = FED_WREN_PIN.prefabId;
const REV = FED_WREN_PIN.catalogRevision;
/** Real prefab derivation, install and flight compile: generous under a loaded host. */
const HEAVY = { timeout: 60_000 };

function wiped() {
  const s = seeded();
  s.f.as(SHIP_OPERATOR);
  wipePlayerShips(s.f.ctx, {
    operationId: "wipe-apply-0001",
    dryRun: false,
    expectedShips: 2,
    expectedInstances: 3,
    expectedCharacters: 2,
  });
  return s;
}

/** Same order as the physics tick: compile the dirty ship, then resolve the definition. */
function flight(f: ReturnType<typeof fixture>, shipId: string) {
  if (f.db.constructionFlightDirty.shipId.find(shipId))
    compileShipFlight(f.db as any, shipId, (id) =>
      readConstructionFlightInput(f.ctx, id),
    );
  return resolveShipFlightDefinition(
    {
      binding: (id: string) => f.db.constructionFlightBinding.shipId.find(id),
      constructionInstanceExists: (id: string) =>
        !!f.db.constructionInstance.id.find(id),
      currentInstanceRevision: (id: string) =>
        f.db.constructionInstance.id.find(id)?.revision,
      fittings: (id: string) =>
        f.db.constructionFlightFitting.by_ship.filter(id),
      compiled: (id: string) => f.db.constructionFlightCompiled.shipId.find(id),
      dirty: (id: string) => !!f.db.constructionFlightDirty.shipId.find(id),
    } as any,
    shipId,
  );
}

test(
  "operator assigns fed.s.wren at a berth: complete, owned, active, boarded ship",
  HEAVY,
  () => {
    const { f, a, b, personalA } = wiped();
    const map = mapState(f);
    const args = {
      operationId: "assign-wren-01",
      characterId: a.actor.id,
      prefabId: WREN,
      expectedCatalogRevision: REV,
      spawnPoseJson: JSON.stringify({ kind: "berth" }),
      expectedCharacterShipId: "",
      allowLegacy: false,
    };
    expect(() =>
      assignPrefabShip(f.ctx, {
        ...args,
        expectedCatalogRevision: "ship-components-v1@0",
      }),
    ).toThrow("catalog revision");
    assignPrefabShip(f.ctx, args);
    const actor = f.db.character.id.find(a.actor.id);
    const shipId = actor.shipId;
    expect(shipId).toMatch(/^[0-9a-f-]{36}$/);
    expect(actor.name).toBe("Alpha");
    const ship = f.db.ship.id.find(shipId);
    expect(ship.name).toBe("Wren");
    expect(ship.owner.toHexString()).toBe(OWNER_A);
    const instance = f.db.constructionInstance.id.find(shipId);
    expect(instance).toMatchObject({
      workspaceId: GAME_OWNED_TEMPLATE_NAMESPACE,
      blueprintSha256: FED_WREN_PIN.blueprintSha256,
      blueprintId: `${TRUSTED_PREFAB_BLUEPRINT_PREFIX}fed.s.wren:r1`,
      revision: 1n,
      name: "Wren",
    });
    expect(instance.documentJson.length).toBeLessThan(1_048_576);
    const binding = f.db.constructionFlightBinding.shipId.find(shipId);
    expect(binding).toMatchObject({
      definitionId: PREFAB_FLIGHT_DEFINITION,
      definitionSha256: FED_WREN_PIN.flightDefinitionSha256,
      lifecycle: "active",
    });
    const station = f.db.station.shipId.find(shipId);
    expect(station).toMatchObject({ operational: true });
    expect(station.occupantId).toBeFalsy();
    const location = f.db.constructionLocation.characterId.find(a.actor.id);
    expect(location).toMatchObject({
      instanceId: shipId,
      deckId: instance.spawnDeckId,
    });
    expect(f.db.gameShipAccess.shipId.find(shipId)).toMatchObject({
      characterId: a.actor.id,
      lifecycle: "active",
      templateSha256: FED_WREN_PIN.blueprintSha256,
    });
    expect(f.db.worldAdmission.characterId.find(a.actor.id)).toMatchObject({
      shipId,
    });
    // Compiled flight is ready with thrust and an installed, powered computer.
    expect(f.db.constructionFlightCompiled.shipId.find(shipId)).toBeTruthy();
    const def = flight(f, shipId);
    expect([def.status, def.reason]).toEqual(["ready", ""]);
    if (def.status !== "ready") throw Error(def.reason);
    expect(def.actuators.length).toBeGreaterThan(0);
    expect(def.computer).toMatchObject({ installed: true, powered: true });
    expect(def.mass.massKg).toBeGreaterThan(0);
    // Personal kit follows the character; nothing else changed; map untouched.
    expect(
      f.db.inventoryItem.rows
        .filter((r: Row) => r.characterId === a.actor.id)
        .map((r: Row) => r.id)
        .sort(),
    ).toEqual(personalA);
    expect(f.db.character.id.find(b.actor.id).shipId).toBe("");
    expect(mapState(f)).toBe(map);
    const ledger = JSON.parse(
      f.db.shipOperatorOperation.operationId.find("assign-wren-01").summaryJson,
    );
    expect(ledger).toMatchObject({
      prefabId: WREN,
      catalogRevision: REV,
      blueprintSha256: FED_WREN_PIN.blueprintSha256,
      legacy: false,
      shipName: "Wren",
    });
    // Idempotent replay, then refusal of a second ship.
    const after = f.snapshot();
    assignPrefabShip(f.ctx, args);
    expect(f.snapshot()).toBe(after);
    expect(() =>
      assignPrefabShip(f.ctx, {
        ...args,
        operationId: "assign-wren-02",
        expectedCharacterShipId: shipId,
      }),
    ).toThrow("already has a ship");
  },
);

test(
  "fed.s.wren honours an explicit pose in an existing system and refuses unknown systems",
  HEAVY,
  () => {
    const { f, b } = wiped();
    const systemId = f.db.worldSystem.rows[0].id;
    const base = {
      characterId: b.actor.id,
      prefabId: WREN,
      expectedCatalogRevision: REV,
      expectedCharacterShipId: "",
      allowLegacy: false,
    };
    expect(() =>
      assignPrefabShip(f.ctx, {
        ...base,
        operationId: "assign-wren-bad",
        spawnPoseJson: JSON.stringify({
          kind: "at",
          systemId: "no-such-system",
          x: 5000,
          y: 0,
          heading: 0,
        }),
      }),
    ).toThrow("Unknown spawn system");
    const pose = { kind: "at", systemId, x: 5000, y: -2500, heading: 1.25 };
    assignPrefabShip(f.ctx, {
      ...base,
      operationId: "assign-wren-at",
      spawnPoseJson: JSON.stringify(pose),
    });
    const shipId = f.db.character.id.find(b.actor.id).shipId;
    expect(f.db.shipWorldMotion.shipId.find(shipId)).toMatchObject({
      systemId,
      x: 5000,
      y: -2500,
      heading: 1.25,
    });
    expect(f.db.ship.id.find(shipId)).toMatchObject({
      name: "Wren",
      heading: 1.25,
    });
    expect(flight(f, shipId).status).toBe("ready");
  },
);

test(
  "fed.s.wren can be the configured starter prefab for new characters",
  HEAVY,
  () => {
    const f = fixture();
    // A live database already holds the canonical system; boarding refuses map writes.
    ensureCanonicalSystem(f.db as any);
    f.as(SHIP_OPERATOR);
    setStarterPrefab(f.ctx, {
      operationId: "policy-wren-01",
      prefabId: WREN,
      expectedCatalogRevision: REV,
      allowLegacy: false,
    });
    f.as(OWNER_B);
    const id = onboardNewCharacter(f.ctx, "Rook");
    const actor = f.db.character.id.find(id);
    expect(f.db.ship.id.find(actor.shipId)).toMatchObject({ name: "Wren" });
    expect(f.db.gameShipAccess.shipId.find(actor.shipId)).toMatchObject({
      characterId: id,
      lifecycle: "active",
    });
    expect(flight(f, actor.shipId).status).toBe("ready");
  },
);
