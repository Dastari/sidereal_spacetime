import { describe, expect, it, vi } from "vitest";
vi.mock("spacetimedb/server", async () => {
  const { t } = await import("spacetimedb");
  return { t, SenderError: class extends Error {} };
});
import { joinSharedSystem } from "./shared-world";
import { fixture, owner, other } from "./shared-world-test-fixture";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import { spatialCell } from "@sidereal/sim/spatial-cells";
import { UNPUBLISHED_EXTERIOR_ID } from "@sidereal/sim/ship-exterior";
import {
  publishedShipExterior,
  SHIP_CONTACT_CANDIDATE_BUDGET,
  visibleActuatorExhaust,
  visibleShipDescriptions,
  visibleShipMotion,
  type SharedViewContext,
} from "./shared-world-views";

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

function setup() {
  const f = fixture();
  f.db.constructionPassengerVisit = { characterId: { find: () => undefined } };
  f.db.gameShipAccess = {
    rows: new Map<string, any>(),
    shipId: {
      find(this: void, id: string) {
        return f.db.gameShipAccess.rows.get(id);
      },
    },
  };
  joinSharedSystem(f.ctx(), f.args());
  joinSharedSystem(f.ctx(2, other), f.args(2));
  const view = (sender = owner): SharedViewContext & { db: any } => ({
    db: f.db,
    sender,
  });
  const place = (shipId: string, x: number, y: number) => {
    const c = spatialCell({ x, y });
    const row = {
      shipId,
      systemId: SHARED_SYSTEM_SEED.systemId,
      cellX: BigInt(c.cellX),
      cellY: BigInt(c.cellY),
      x,
      y,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      serverTick: 1n,
    };
    if (f.db.shipWorldMotion.shipId.find(shipId))
      f.db.shipWorldMotion.shipId.update(row);
    else f.db.shipWorldMotion.insert(row);
  };
  return { ...f, view, place };
}

/** A game-owned prefab ship whose private instance holds an interior (rooms, modules, cargo). */
function installPrefab(
  f: ReturnType<typeof setup>,
  shipId: string,
  blueprintId = "trusted-prefab:fed.s.wren:r6",
) {
  f.db.gameShipAccess.rows.set(shipId, {
    shipId,
    instanceId: shipId,
    owner: other,
    characterId: "actor2",
    deckId: "deck-secret-1",
    templateSha256: "b".repeat(64),
    instanceRevision: 3n,
    lifecycle: "active",
  });
  f.db.constructionInstance.insert({
    id: shipId,
    owner: other,
    workspaceId: "game-owned",
    blueprintId,
    blueprintSha256: "b".repeat(64),
    name: "Private hull name",
    revision: 3n,
    documentJson: json({
      rooms: [{ id: "room-armory-secret", label: "Armory" }],
      containers: ["container-7f1c-secret"],
      items: ["item-4be2-secret"],
    }),
    idMapJson: json({ "fitting-9a0d-secret": "x" }),
    spawnDeckId: "deck-secret-1",
    spawnX: 1,
    spawnY: 2,
    createdMicros: 1n,
  });
}

describe("ship contacts: no count cliff (hard rule 5)", () => {
  it("200 ships in the nine cells: the observer still sees its own ship and every ship in range", () => {
    const f = setup();
    f.place("ship1", 0, 0);
    f.place("ship2", 30, 0);
    const inRange: string[] = [];
    for (let i = 0; i < 200; i++) {
      const id = `crowd-${String(i).padStart(3, "0")}`;
      // Half inside the 400 m disc, half in the corner cells beyond it.
      const inside = i % 2 === 0;
      const a = (i / 200) * 2 * Math.PI;
      const r = inside ? 50 + (i % 7) * 40 : 560;
      f.place(id, Math.cos(a) * r, Math.sin(a) * r);
      if (inside) inRange.push(id);
    }
    const seen = visibleShipMotion(f.view()).map((s) => s.shipId);
    expect(seen).toContain("ship1");
    expect(seen).toContain("ship2");
    for (const id of inRange) expect(seen).toContain(id);
    expect(seen).toHaveLength(inRange.length + 2);
    // Symmetric for the other observer at the same point.
    const theirs = visibleShipMotion(f.view(other)).map((s) => s.shipId);
    expect(theirs).toContain("ship1");
    expect(theirs).toHaveLength(inRange.length + 2);
  });

  it("past the work bound it degrades to the nearest cells and never returns nothing", () => {
    const f = setup();
    f.place("ship1", 200, 200);
    f.place("ship2", 210, 200);
    // More candidates than the bound, all in a far neighbouring cell (beyond the radius).
    for (let i = 0; i <= SHIP_CONTACT_CANDIDATE_BUDGET; i++)
      f.place(`far-${i}`, 790, 790 - (i % 300) * 1e-3);
    const seen = visibleShipMotion(f.view()).map((s) => s.shipId);
    expect(seen).toEqual(["ship1", "ship2"]);
  });
});

describe("published exteriors (hard rule 6: exterior only)", () => {
  it("names a trusted prefab hull by its blueprint pin only", () => {
    const f = setup();
    installPrefab(f, "ship2");
    expect(publishedShipExterior(f.db, "ship2")).toEqual({
      publishedExteriorAssetId: "prefab:fed.s.wren",
      appearanceRevision: 6n,
    });
    // Not a trusted prefab (or no game access): unpublished, drawn as a marker.
    expect(publishedShipExterior(f.db, "ship1")).toEqual({
      publishedExteriorAssetId: UNPUBLISHED_EXTERIOR_ID,
      appearanceRevision: 0n,
    });
    installPrefab(f, "player-design", "workspace-blueprint:abc:r1");
    expect(publishedShipExterior(f.db, "player-design")).toMatchObject({
      publishedExteriorAssetId: UNPUBLISHED_EXTERIOR_ID,
    });
  });

  it("a non-occupant's ship views carry the exterior pose and hull id, and no interior row or column", () => {
    const f = setup();
    f.place("ship1", 0, 0);
    f.place("ship2", 50, 0);
    installPrefab(f, "ship2");
    const view = f.view(owner);
    const motion = visibleShipMotion(view).find((m) => m.shipId === "ship2")!;
    expect(motion).toMatchObject({ x: 50, y: 0 });
    const descriptions = visibleShipDescriptions(view, (id) =>
      publishedShipExterior(f.db, id),
    );
    const theirs = descriptions.find((d) => d.shipId === "ship2")!;
    expect(theirs).toEqual({
      shipId: "ship2",
      publishedExteriorAssetId: "prefab:fed.s.wren",
      appearanceRevision: 6n,
      displayName: expect.any(String),
    });
    const wire = json([...visibleShipMotion(view), ...descriptions]);
    for (const secret of [
      "room-armory-secret",
      "Armory",
      "container-7f1c-secret",
      "item-4be2-secret",
      "fitting-9a0d-secret",
      "deck-secret-1",
      "b".repeat(64),
      "Private hull name",
      "actor2",
      other.toHexString(),
      owner.toHexString(),
    ])
      expect(wire).not.toContain(secret);
  });
});

describe("remote thruster exhaust (exterior-only, coarse)", () => {
  function exhaustSetup() {
    const f = setup();
    const table = (primary: string) => {
      const rows = new Map<string, any>();
      return { rows, [primary]: { find: (id: string) => rows.get(id) } };
    };
    f.db.constructionFlightCompiled = table("shipId");
    f.db.constructionFlightDirty = table("shipId");
    f.place("ship1", 0, 0);
    f.place("ship2", 50, 0);
    f.db.constructionFlightCompiled.rows.set("ship2", {
      shipId: "ship2",
      status: "ready",
      actuatorsJson: json([
        // Prefab placed objects are `<shipId>:<blueprint source id>`.
        { id: "fit-7c1e-private", placedObjectId: "ship2:mount-main-c" },
        {
          id: "fit-91aa-private",
          placedObjectId: "ship2:mount-rcs-bow-s#fore",
        },
        { id: "fit-0b3d-private", placedObjectId: "ship2:mount-main-p" },
        {
          id: "fit-55f0-private",
          placedObjectId: "6b9c2f3e-1d4a-4c1b-9f00-0123456789ab",
        },
        { id: "fit-a1b2-private", placedObjectId: "ship9:mount-main-c" },
      ]),
    });
    const output = (id: string, throttle: number) =>
      f.db.actuatorOutput.insert({
        id: `ship2:${id}`,
        shipId: "ship2",
        actuatorId: id,
        throttle,
        tick: 1n,
      });
    output("fit-7c1e-private", 0.73);
    output("fit-91aa-private", 0.2);
    output("fit-0b3d-private", 0);
    output("fit-55f0-private", 1);
    return f;
  }

  it("shows firing prefab thrusters of perceived ships only, keyed by blueprint mount", () => {
    const f = exhaustSetup();
    const rows = visibleActuatorExhaust(f.view());
    expect(rows).toEqual([
      {
        key: "ship2/mount-main-c",
        shipId: "ship2",
        sourceId: "mount-main-c",
        throttle: 0.75,
      },
      {
        key: "ship2/mount-rcs-bow-s#fore",
        shipId: "ship2",
        sourceId: "mount-rcs-bow-s#fore",
        throttle: 0.1875,
      },
    ]);
    // No fitting UUID, idle jet or non-blueprint source.
    const wire = json(rows);
    for (const secret of ["fit-", "6b9c2f3e", "mount-main-p"])
      expect(wire).not.toContain(secret);
  });

  it("withholds ships out of perception range and ships with dirty flight", () => {
    const f = exhaustSetup();
    f.place("ship2", 500, 0);
    expect(visibleActuatorExhaust(f.view())).toEqual([]);
    f.place("ship2", 50, 0);
    f.db.constructionFlightDirty.rows.set("ship2", { shipId: "ship2" });
    expect(visibleActuatorExhaust(f.view())).toEqual([]);
  });
});
