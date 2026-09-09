import { expect, test } from "vitest";
import {
  createWayfarerStarter,
  type WayfarerStarterRepository,
  type StarterActor,
  type StarterReceipt,
} from "./wayfarer-starter";
function fixture() {
  let n = 1,
    writes: string[] = [],
    actors: StarterActor[] = [],
    receipt: StarterReceipt | undefined;
  const db: WayfarerStarterRepository = {
    ownerId: "owner",
    requireLiveGame() {},
    existingCharacters: () => actors,
    receipt: () => receipt,
    allocateUuid: () =>
      `22222222-2222-4222-8222-${(n++).toString(16).padStart(12, "0")}`,
    identityExists: () => false,
    reserveBerth: () => ({ systemId: "shared", x: 50, y: 0, serverTick: 1n }),
    insertInstance: () => {
      writes.push("instance");
    },
    installFunctionalState: (p) => {
      expect(p.functional.containers.every((c) => !c.contents.length)).toBe(
        true,
      );
      writes.push("functional");
    },
    installDormantFlight: (p) => {
      expect(p.flight.station.occupantId).toBeUndefined();
      writes.push("flight");
    },
    activateQualifiedFlight: () => {
      writes.push("activation");
    },
    insertCharacterAndStandingLocation: (p) => {
      actors = [
        { id: p.characterId, shipId: p.instance.instanceId, ownerId: "owner" },
      ];
      writes.push("character");
    },
    insertSharedAdmission: () => {
      writes.push("admission");
    },
    insertGameAccess: () => {
      writes.push("game-access");
    },
    issuePersonalKitOnce: () => {
      writes.push("personal-kit");
    },
    insertReceipt: (r) => {
      receipt = r;
      writes.push("receipt");
    },
  };
  return {
    db,
    writes: () => writes,
    actors: () => actors,
    replaceActors: (a: StarterActor[]) => {
      actors = a;
    },
    receipt: () => receipt,
    transaction: (f: () => unknown) => {
      const backup = { writes: [...writes], actors: [...actors], receipt };
      try {
        return f();
      } catch (e) {
        ({ writes, actors, receipt } = backup);
        throw e;
      }
    },
  };
}
test("fresh account gets one complete transaction and retry never moves it or reissues kit", () => {
  const f = fixture(),
    result = createWayfarerStarter(f.db, " Captain ");
  expect(result.kind).toBe("created");
  expect(f.writes()).toEqual([
    "instance",
    "functional",
    "flight",
    "activation",
    "character",
    "admission",
    "game-access",
    "personal-kit",
    "receipt",
  ]);
  f.actors()[0].shipId = "later-boarded-ship";
  f.db.allocateUuid = () => {
    throw Error("Replay allocated");
  };
  expect(createWayfarerStarter(f.db, "Another name").actor.shipId).toBe(
    "later-boarded-ship",
  );
  expect(f.writes()).toHaveLength(9);
});
test("existing legacy accounts never allocate, refit or issue a second starter", () => {
  const f = fixture();
  f.replaceActors([
    { id: "old-character", shipId: "old-ship", ownerId: "owner" },
  ]);
  f.db.reserveBerth = () => {
    throw Error("Existing account reserved berth");
  };
  expect(createWayfarerStarter(f.db, "").actor.id).toBe("old-character");
  expect(f.writes()).toEqual([]);
});
test("missing actor after issued entitlement fails recovery rather than duplicating resources", () => {
  const f = fixture();
  createWayfarerStarter(f.db, "Captain");
  f.replaceActors([]);
  expect(() => createWayfarerStarter(f.db, "Captain")).toThrow(/recovery/);
  expect(f.writes()).toHaveLength(9);
});
test("expired identity, ambiguous owner and full berth produce no writes", () => {
  const f = fixture();
  f.db.requireLiveGame = () => {
    throw Error("Expired");
  };
  expect(() => createWayfarerStarter(f.db, "Captain")).toThrow(/Expired/);
  f.db.requireLiveGame = () => {};
  f.replaceActors([{ id: "foreign", ownerId: "foreign", shipId: "x" }]);
  expect(() => createWayfarerStarter(f.db, "Captain")).toThrow(/owned/);
  f.replaceActors([]);
  f.db.reserveBerth = () => {
    throw Error("Full");
  };
  expect(() => createWayfarerStarter(f.db, "Captain")).toThrow(/Full/);
  expect(f.writes()).toEqual([]);
});
test("late write errors propagate so the enclosing transaction rolls back the whole starter", () => {
  const f = fixture();
  f.db.insertReceipt = () => {
    throw Error("Storage failure");
  };
  expect(() =>
    f.transaction(() => createWayfarerStarter(f.db, "Captain")),
  ).toThrow(/Storage failure/);
  expect(f.writes()).toEqual([]);
  expect(f.actors()).toEqual([]);
  expect(f.receipt()).toBeUndefined();
});
