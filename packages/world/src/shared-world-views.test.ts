import { describe, expect, it, vi } from "vitest";
vi.mock("spacetimedb/server", async () => {
  const { t } = await import("spacetimedb");
  return { t, SenderError: class extends Error {} };
});
import { joinSharedSystem } from "./shared-world";
import { fixture, owner, other } from "./shared-world-test-fixture";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import { spatialCell } from "@sidereal/sim/spatial-cells";
import {
  visibleShipMotion,
  visibleShipDescriptions,
  visibleBodyMotion,
  visibleBodyDescriptions,
  ownWorldAdmission,
  visibleShipMotionProjection,
  visibleShipDescriptionProjection,
  visibleBodyDescriptionProjection,
  visibleBodyMotionProjection,
  ownWorldAdmissionProjection,
  type SharedViewContext,
} from "./shared-world-views";
function setup() {
  const f = fixture();
  joinSharedSystem(f.ctx(), f.args());
  joinSharedSystem(f.ctx(2, other), f.args(2));
  const view = (sender = owner): SharedViewContext => ({ db: f.db, sender });
  return { ...f, view };
}
function move(
  f: ReturnType<typeof setup>,
  shipId: string,
  x: number,
  y: number,
  systemId: string = SHARED_SYSTEM_SEED.systemId,
) {
  const c = spatialCell({ x, y });
  f.db.shipWorldMotion.shipId.update({
    ...f.db.shipWorldMotion.shipId.find(shipId),
    systemId,
    x,
    y,
    cellX: BigInt(c.cellX),
    cellY: BigInt(c.cellY),
  });
}
describe("authorized shared spatial projections", () => {
  it("both accounts observe the same canonical body and both exterior ship identities", () => {
    const f = setup();
    expect(visibleShipMotion(f.view()).map((s) => s.shipId)).toEqual([
      "ship1",
      "ship2",
    ]);
    expect(visibleShipMotion(f.view(other)).map((s) => s.shipId)).toEqual([
      "ship1",
      "ship2",
    ]);
    expect(visibleBodyDescriptions(f.view()).map((b) => b.bodyId)).toEqual(
      visibleBodyDescriptions(f.view(other)).map((b) => b.bodyId),
    );
    expect(ownWorldAdmission(f.view())[0]).toMatchObject({
      characterId: "actor1",
      shipId: "ship1",
    });
  });
  it("uses nine indexed cells plus exact server radius at negative boundaries", () => {
    const f = setup();
    move(f, "ship1", -0.1, -0.1);
    move(f, "ship2", 399.9, -0.1);
    f.db.shipWorldMotion.queries.length = 0;
    expect(visibleShipMotion(f.view()).map((s) => s.shipId)).toEqual([
      "ship1",
      "ship2",
    ]);
    expect(f.db.shipWorldMotion.queries).toHaveLength(9);
    expect(
      f.db.shipWorldMotion.queries.every((q: any) => q.index === "by_cell"),
    ).toBe(true);
    expect(
      f.db.shipWorldMotion.queries.some(
        (q: any) => q.key[1] === -2n && q.key[2] === -2n,
      ),
    ).toBe(true);
    move(f, "ship2", 400, -0.1);
    expect(visibleShipMotion(f.view()).map((s) => s.shipId)).toEqual(["ship1"]);
    move(f, "ship2", 300, 300);
    expect(visibleShipMotion(f.view()).map((s) => s.shipId)).toEqual(["ship1"]);
  });
  it("does not expose owner, inventory, private aliases, internal layout or physical ratings", () => {
    const f = setup();
    const descriptions = visibleShipDescriptions(f.view(), () => ({
      publishedExteriorAssetId: "test-approved-exterior",
      appearanceRevision: 1n,
    }));
    expect(Object.keys(descriptions[0]).sort()).toEqual([
      "appearanceRevision",
      "displayName",
      "publishedExteriorAssetId",
      "shipId",
    ]);
    expect(Object.keys(visibleBodyDescriptions(f.view())[0]).sort()).toEqual([
      "appearance",
      "bodyId",
      "height",
      "kind",
      "radius",
      "seed",
    ]);
    expect(Object.keys(visibleShipMotion(f.view())[0]).sort()).toEqual([
      "cellX",
      "cellY",
      "heading",
      "omega",
      "serverTick",
      "shipId",
      "systemId",
      "vx",
      "vy",
      "x",
      "y",
    ]);
    expect(
      JSON.stringify(descriptions, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).not.toContain(owner.toHexString());
    expect(visibleShipDescriptions(f.view(), () => undefined)).toEqual([]);
  });
  it("charted planets stay system-visible while remote moving rocks are withheld", () => {
    const f = setup();
    move(f, "ship1", 100000, 100000);
    const bodies = visibleBodyDescriptions(f.view());
    expect(bodies.every((b) => b.kind !== "asteroid")).toBe(true);
    expect(bodies).toHaveLength(SHARED_SYSTEM_SEED.bodies.filter(b=>b.kind!=="asteroid").length);
    expect(visibleBodyMotion(f.view()).map((b) => b.bodyId)).toEqual(
      bodies.map((b) => b.bodyId),
    );
  });
  it("rejects foreign systems and removes results after admission or game-session revocation", () => {
    const f = setup();
    move(f, "ship2", 10, 0, "foreign");
    expect(visibleShipMotion(f.view()).map((s) => s.shipId)).toEqual(["ship1"]);
    f.db.worldAdmission.characterId.delete("actor1");
    expect(visibleBodyDescriptions(f.view())).toEqual([]);
    expect(visibleShipMotion(f.view())).toEqual([]);
    f.db.authSession.connectionId.delete("c2");
    expect(visibleShipMotion(f.view(other))).toEqual([]);
  });
  it("construction review, retired identity or ambiguous character selection reveals no contacts", () => {
    const f = setup();
    f.db.constructionLocation.insert({
      characterId: "actor1",
      instanceId: "private-room",
    });
    expect(visibleShipMotion(f.view())).toEqual([]);
    f.db.constructionLocation.rows.clear();
    f.db.retiredIdentity.insert({ source: owner });
    expect(visibleShipMotion(f.view())).toEqual([]);
    f.db.retiredIdentity.rows.clear();
    f.db.worldAdmission.insert({
      ...f.db.worldAdmission.characterId.find("actor1"),
      characterId: "actor-extra",
    });
    expect(visibleShipMotion(f.view())).toEqual([]);
  });
  it("every projection has exactly one real-SDK primary key", () => {
    for (const [projection, id] of [
      [visibleShipMotionProjection, "shipId"],
      [visibleShipDescriptionProjection, "shipId"],
      [visibleBodyMotionProjection, "bodyId"],
      [visibleBodyDescriptionProjection, "bodyId"],
      [ownWorldAdmissionProjection, "characterId"],
    ] as const) {
      expect(
        Object.entries(projection.row)
          .filter(([, column]) => column.columnMetadata.isPrimaryKey === true)
          .map(([name]) => name),
      ).toEqual([id]);
    }
  });
});
