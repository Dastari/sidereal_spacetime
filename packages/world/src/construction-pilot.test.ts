import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
} from "@sidereal/sim/construction-collision";
import {
  prefabPilotPose,
  qualifyPilotGeometry,
  type PilotGeometry,
} from "@sidereal/sim/construction-pilot";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  PREFAB_DECK_ID,
  prefabConstructionDocument,
} from "@sidereal/sim/prefab-construction";
import { prefabConstructionObstacles } from "@sidereal/sim/prefab-deck-objects";
import {
  prefabFlightModel,
  prefabPlacedObjectId,
} from "@sidereal/sim/prefab-flight";
import {
  enterConstructionPilot,
  recoverConstructionPilot,
  constructionPilotCanControl,
  type PilotRepository,
  type PilotSeat,
  type PilotStation,
  type PilotReceipt,
} from "./construction-pilot";
const WREN = prefabById("fed.s.wren")!;
const catalog = defaultPrefabComponentCatalog();
const snapshot = compileConstruction(
  JSON.stringify(prefabConstructionDocument(WREN, catalog)),
);
/** The Wren's derived pilot station pose (seat and approach, ship-local metres). */
const POSE = prefabPilotPose(prefabFlightModel(WREN, catalog).station!);
const [AX, AY] = POSE.approach;
const [, SY] = POSE.position;
function fixture() {
  let n = 0,
    writes = 0,
    access = true,
    lease = true,
    power = true,
    blocked = false;
  const uuid = () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  const p = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: `trusted-prefab:fed.s.wren:r${WREN.revision}`,
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: PREFAB_DECK_ID,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: [],
    },
    uuid,
  );
  const instance = {
    id: p.instanceId,
    revision: 1n,
    blueprintSha256: p.blueprintSha256,
    documentJson: JSON.stringify(p.document),
    idMapJson: JSON.stringify(p.mappings),
    spawnDeckId: p.spawn.deckId,
    name: p.document.layout.name,
  };
  // The same frame construction-doors builds for prefab ships (walls, floors, furniture).
  const frame = resolveDeckCollision(
    compileDeckCollision(p.document.layout, p.spawn.deckId, {
      shipId: p.instanceId,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles:
        prefabConstructionObstacles(p.document as { prefab?: unknown }) ?? [],
    }),
    [],
  );
  const geometry: PilotGeometry = {
    instance,
    frame,
    seatPlacedObjectId: prefabPlacedObjectId(p.instanceId, "station"),
    supportHeightAt: () => 0.1875,
    pose: POSE,
  };
  const state = {
    actor: {
      id: "actor",
      ownerId: "owner",
      connected: true,
      shipId: p.instanceId,
      deckId: p.spawn.deckId,
      x: AX,
      y: AY,
      height: 0.1875,
      standing: true,
    },
    station: {
      id: uuid(),
      shipId: p.instanceId,
      deckId: p.spawn.deckId,
      occupantId: undefined as string | undefined,
      operational: true,
      instanceRevision: 1n,
      ...({ pose: POSE } as Pick<PilotStation, "pose">),
      revision: 1n,
    },
    seat: undefined as PilotSeat | undefined,
    receipts: new Map<string, PilotReceipt>(),
    throttle: 1,
  };
  const db: PilotRepository = {
    principalId: "owner",
    requireLiveGame: () => {},
    actor: () => state.actor,
    station: (id) => (id === state.station.id ? state.station : undefined),
    seat: (id) => (id === state.actor.id ? state.seat : undefined),
    hasCurrentAccess: () => access,
    hasInputLease: () => lease,
    hasOperationalFlight: () => power,
    geometry: () => geometry,
    nearbyActors: () =>
      blocked
        ? Array.from({ length: 25 }, (_, i) => ({
            id: "other" + i,
            x: AX + ((i % 5) - 2) * 0.375,
            y: AY + (Math.floor(i / 5) - 2) * 0.375,
          }))
        : [],
    receipt: (id) => state.receipts.get(id),
    storeReceipt: (r) => {
      state.receipts.set(r.id, r);
      writes++;
    },
    insertSeat: (s) => {
      if (state.seat) throw Error("occupied");
      state.seat = s;
      writes++;
    },
    updateSeat: (s) => {
      state.seat = s;
      writes++;
    },
    deleteSeat: () => {
      state.seat = undefined;
      writes++;
    },
    updateStation: (s) => {
      state.station = { ...s, occupantId: s.occupantId };
      writes++;
    },
    setActorPose: (_id, pose) => {
      Object.assign(state.actor, pose);
      state.actor.standing = false;
      writes++;
    },
    clearInputAndAim: () => {
      if (state.throttle) {
        state.throttle = 0;
        writes++;
      }
    },
  };
  return {
    db,
    state,
    geometry,
    args: {
      stationId: state.station.id,
      expectedStationRevision: 1n,
      operationId: "sit",
    },
    writes: () => writes,
    setAccess: (v: boolean) => (access = v),
    setLease: (v: boolean) => (lease = v),
    setPower: (v: boolean) => (power = v),
    setBlocked: (v: boolean) => (blocked = v),
  };
}
test("the derived station approach and seat are free; prefab stations have no seat collider exception", () => {
  const f = fixture(),
    q = qualifyPilotGeometry(f.geometry);
  const at = (position: readonly [number, number]) => ({
    shipId: f.state.actor.shipId,
    deckId: f.state.actor.deckId,
    position: [position[0], position[1]] as [number, number],
  });
  expect(canOccupyDeck(q.frame, at(POSE.approach), 0.3)).toBe(true);
  expect(canOccupyDeck(q.frame, at(POSE.position), 0.3)).toBe(true);
  expect(q.transition).toBe(q.frame);
  const original = f.geometry.frame.obstacles.length;
  enterConstructionPilot(f.db, f.args);
  expect(f.geometry.frame.obstacles.length).toBe(original);
});
test("entry moves through qualified transition, reserves station, clears input, retry writes nothing", () => {
  const f = fixture(),
    r = enterConstructionPilot(f.db, f.args),
    n = f.writes();
  expect(f.state.actor.y).toBe(SY);
  expect(f.state.station.occupantId).toBe("actor");
  expect(f.state.throttle).toBe(0);
  expect(enterConstructionPilot(f.db, f.args)).toEqual(r);
  expect(f.writes()).toBe(n);
  expect(constructionPilotCanControl(f.db, "actor")).toBe(true);
  expect(() =>
    enterConstructionPilot(f.db, { ...f.args, expectedStationRevision: 2n }),
  ).toThrow("payload");
});
test("wrong deck, intervening geometry, stale revision, occupied seat and absent lease reject before writes", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => (f.state.actor.deckId = "wrong"),
    (f: ReturnType<typeof fixture>) => (f.state.actor.y = AY - 3),
    (f: ReturnType<typeof fixture>) => (f.args.expectedStationRevision = 2n),
    (f: ReturnType<typeof fixture>) => (f.state.station.occupantId = "other"),
    (f: ReturnType<typeof fixture>) => f.setLease(false),
    (f: ReturnType<typeof fixture>) => f.setAccess(false),
    (f: ReturnType<typeof fixture>) => f.setPower(false),
    (f: ReturnType<typeof fixture>) => (f.state.actor.standing = false),
    (f: ReturnType<typeof fixture>) =>
      (f.geometry.supportHeightAt = () => undefined),
  ]) {
    const f = fixture();
    mutate(f);
    expect(() => enterConstructionPilot(f.db, f.args)).toThrow();
    expect(f.writes()).toBe(0);
  }
});
test("command consumption rechecks every current grant/lease/power/deck/pose condition without writes", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => f.setLease(false),
    (f: ReturnType<typeof fixture>) => f.setAccess(false),
    (f: ReturnType<typeof fixture>) => f.setPower(false),
    (f: ReturnType<typeof fixture>) => (f.state.actor.connected = false),
    (f: ReturnType<typeof fixture>) => (f.state.actor.deckId = "wrong"),
    (f: ReturnType<typeof fixture>) => (f.state.station.instanceRevision = 2n),
    (f: ReturnType<typeof fixture>) => (f.state.actor.y = SY - 1),
  ]) {
    const f = fixture();
    enterConstructionPilot(f.db, f.args);
    const n = f.writes();
    mutate(f);
    expect(constructionPilotCanControl(f.db, "actor")).toBe(false);
    expect(f.writes()).toBe(n);
  }
});
test("grant loss/disconnect exits to supported floor without requiring the lost capability", () => {
  const f = fixture();
  enterConstructionPilot(f.db, f.args);
  f.setAccess(false);
  f.state.actor.connected = false;
  f.state.throttle = 1;
  expect(recoverConstructionPilot(f.db, "actor", "disconnect")).toBe(
    "recovered",
  );
  expect(f.state.actor.y).toBe(AY);
  expect(f.state.actor.height).toBe(0.1875);
  expect(f.state.station.occupantId).toBeUndefined();
  expect(f.state.seat).toBeUndefined();
  expect(f.state.throttle).toBe(0);
  const n = f.writes();
  expect(recoverConstructionPilot(f.db, "actor", "disconnect")).toBe("absent");
  expect(f.writes()).toBe(n);
});
test("occupied exits hold unique reservation and suppress thrust; repeated pending recovery is idle", () => {
  const f = fixture();
  enterConstructionPilot(f.db, f.args);
  f.setBlocked(true);
  f.state.throttle = 1;
  expect(recoverConstructionPilot(f.db, "actor", "grant-loss")).toBe("pending");
  expect(f.state.seat?.recoveryRequested).toBe(true);
  expect(f.state.station.occupantId).toBe("actor");
  expect(constructionPilotCanControl(f.db, "actor")).toBe(false);
  const n = f.writes();
  for (let i = 0; i < 20; i++)
    expect(recoverConstructionPilot(f.db, "actor", "grant-loss")).toBe(
      "pending",
    );
  expect(f.writes()).toBe(n);
  f.setBlocked(false);
  expect(recoverConstructionPilot(f.db, "actor", "grant-loss")).toBe(
    "recovered",
  );
});
test("invalid recovery geometry holds safely; unsupported stations reject entry before writes", () => {
  const f = fixture();
  enterConstructionPilot(f.db, f.args);
  f.geometry.supportHeightAt = () => undefined;
  expect(recoverConstructionPilot(f.db, "actor", "disconnect")).toBe("pending");
  expect(f.state.seat?.recoveryReason).toBe("invalid-geometry");
  expect(constructionPilotCanControl(f.db, "actor")).toBe(false);
  expect(f.state.actor.y).toBe(SY);
  const g = fixture();
  g.geometry.pose = { position: [99, 99], approach: [99, 98.125] };
  expect(() => enterConstructionPilot(g.db, g.args)).toThrow();
  expect(g.writes()).toBe(0);
});

test("pilot consumption uses the actual input-control lease validator and clears an expired session", async () => {
  const { Identity } = await import("spacetimedb");
  const { consumeInputControl } = await import("./input-control");
  const owner = Identity.fromString("1".repeat(64));
  let expires = 1000n,
    lease: unknown = {
      characterId: "actor",
      owner,
      connectionId: "socket",
      sequence: 1n,
    };
  let input = {
    characterId: "actor",
    sequence: 1n,
    throttle: 1,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
    updatedMicros: 1n,
  };
  const ctx: any = {
    sender: owner,
    connectionId: null,
    timestamp: { microsSinceUnixEpoch: 100n },
    db: {
      character: {
        id: {
          find: () => ({
            id: "actor",
            owner,
            connected: true,
            sprinting: false,
          }),
          update: () => {},
        },
      },
      inputControl: {
        characterId: {
          find: () => lease,
          delete: () => {
            lease = undefined;
          },
        },
      },
      input: {
        characterId: {
          find: () => input,
          update: (r: typeof input) => {
            input = r;
          },
        },
      },
      connectionPresence: { connectionId: { find: () => ({ owner }) } },
      authSession: {
        connectionId: {
          find: () => ({ owner, game: true, expiresMicros: expires }),
        },
      },
      retiredIdentity: { source: { find: () => undefined } },
    },
  };
  const f = fixture();
  f.db.hasInputLease = () => consumeInputControl(ctx, "actor");
  enterConstructionPilot(f.db, f.args);
  expect(constructionPilotCanControl(f.db, "actor")).toBe(true);
  expires = 99n;
  expect(constructionPilotCanControl(f.db, "actor")).toBe(false);
  expect(lease).toBeUndefined();
  expect(input.throttle).toBe(0);
});

test("a changed actor location is never teleported by a stale pilot recovery", () => {
  const f = fixture();
  enterConstructionPilot(f.db, f.args);
  f.state.actor.shipId = "another-ship";
  f.state.actor.y = 99;
  expect(recoverConstructionPilot(f.db, "actor", "disconnect")).toBe("pending");
  expect(f.state.actor.y).toBe(99);
  expect(f.state.actor.shipId).toBe("another-ship");
  expect(f.state.seat?.recoveryReason).toBe("detached-location");
});
