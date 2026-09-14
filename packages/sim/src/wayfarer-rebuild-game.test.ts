import { expect, it } from "vitest";
import type { ConstructionDocument } from "@sidereal/content/construction";
import { WAYFARER_REBUILD_SOURCE } from "./wayfarer-rebuild-contract";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";
import { canOccupyDeck } from "./construction-collision";
const copy = () => structuredClone(WAYFARER_REBUILD_SOURCE);
function instance(prefix = "10000000"): ConstructionDocument {
  const d = copy(),
    deck = d.layout.decks[0].id;
  const map = new Map(
    Object.keys(d.wayfarerRebuild!.identities).map((k, i) => [
      k,
      `${prefix}-0000-4000-8000-${String(i).padStart(12, "0")}`,
    ]),
  );
  const remapString = (v: string) =>
    map.get(v) ??
    (v.startsWith(deck + ":") ? map.get(deck) + v.slice(deck.length) : v);
  const remap = (v: unknown): unknown =>
    typeof v === "string"
      ? remapString(v)
      : Array.isArray(v)
        ? v.map(remap)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [remapString(k), remap(x)]),
            )
          : v;
  const result = remap(d) as ConstructionDocument;
  result.wayfarerRebuild = {
    ...d.wayfarerRebuild!,
    identities: Object.fromEntries(map),
  };
  result.layout.name = "Owner's Wayfarer";
  return result;
}
it("admits actual native deliveries and composes complete source collision with the bow exclusions", () => {
  const p = planWayfarerRebuildGame(copy());
  expect(p.nativeVisualRequests.filter((r) => r.role === "wall")).toHaveLength(
    126,
  );
  expect(p.sourceObjectCollisionBindings).toHaveLength(81);
  expect(
    p.sourceObjectCollisionBindings.flatMap((b) => b.obstacles),
  ).toHaveLength(41);
  expect(p.sourceObstacles).toHaveLength(169);
  expect(new Set(p.sourceObstacles.map((o) => o.id)).size).toBe(169);
  expect(p.access.approaches).toHaveLength(9);
  expect(p.readiness).toEqual({
    staticWalking: true,
    pressure: false,
    strength: false,
    flight: false,
    gameAcceptance: false,
  });
  expect(
    canOccupyDeck(
      p.sourceFrame,
      {
        shipId: p.sourceFrame.shipId,
        deckId: p.sourceFrame.deckId,
        position: [1.5, 11.5],
      },
      0.3,
    ),
  ).toBe(false);
  expect(
    p.nativeVisualRequests.some(
      (r) => r.key === "wayfarer-rebuild-r001/internal-span-0.125-q4",
    ),
  ).toBe(true);
});
it("new spawn and UUID-remapped installation retain collision geometry with distinct stable identities", () => {
  const source = planWayfarerRebuildGame(copy(), { shipId: "spawn-ship" });
  const doc = instance(),
    p = planWayfarerRebuildGame(doc, { shipId: "existing-ship" });
  expect(p.instanceFrame.shipId).toBe("existing-ship");
  expect(p.instanceFrame.deckId).toBe(doc.layout.playableDeckId);
  expect(p.instanceObstacles.map((o) => o.vertices)).toEqual(
    source.instanceObstacles.map((o) => o.vertices),
  );
  expect(new Set(p.instanceObstacles.map((o) => o.id)).size).toBe(169);
  expect(new Set(p.nativeVisualRequests.map((o) => o.id)).size).toBe(
    p.nativeVisualRequests.length,
  );
  expect(
    p.instanceObjectCollisionBindings.every((b) =>
      Object.values(doc.wayfarerRebuild!.identities).includes(b.sourceObjectId),
    ),
  ).toBe(true);
  for (const a of p.access.approaches)
    expect(
      canOccupyDeck(
        p.instanceFrame,
        {
          shipId: p.instanceFrame.shipId,
          deckId: p.instanceFrame.deckId,
          position: a.position,
        },
        0.3,
      ),
      a.id,
    ).toBe(true);
  const again = planWayfarerRebuildGame(doc, { shipId: "existing-ship" });
  expect(again.nativeVisualRequests).toEqual(p.nativeVisualRequests);
  const second = planWayfarerRebuildGame(instance("20000000"));
  expect(
    second.nativeVisualRequests.every(
      (r) => !p.nativeVisualRequests.some((q) => q.id === r.id),
    ),
  ).toBe(true);
});
it("keeps the low cockpit and vestibule roofs while placing the U riser at baked origin", () => {
  const p = planWayfarerRebuildGame(copy());
  expect(p.mainRoofBindings).toHaveLength(42);
  expect(
    p.mainRoofBindings.every(
      (r) =>
        !r.sourceFloorId.startsWith("pilot-") &&
        !["floor--1-4", "floor-1-4"].includes(r.sourceFloorId),
    ),
  ).toBe(true);
  expect(p.mainRoofBindings.every((r) => r.originM[2] === 3.1875)).toBe(true);
  const risers = p.nativeVisualRequests.filter(
    (r) => r.key === "wayfarer-rebuild-r001/cockpit-roof-step",
  );
  expect(risers).toHaveLength(1);
  expect(risers[0]).toMatchObject({
    originM: [0, 0, 0],
    quarterTurns: 0,
    role: "roof",
  });
});
it("fails before admission for stale asset pins, geometry changes and nonbijective instance mappings", () => {
  for (const edit of [
    (d: ConstructionDocument) => {
      d.wayfarerRebuild!.nativeVisualsSha256 = "0".repeat(64);
    },
    (d: ConstructionDocument) => {
      d.layout.assembly!.parts[0].position[0] += 0.03125;
    },
    (d: ConstructionDocument) => {
      d.layout.openings[0].a[1] += 4;
    },
    (d: ConstructionDocument) => {
      const keys = Object.keys(d.wayfarerRebuild!.identities);
      d.wayfarerRebuild!.identities[keys[1]] =
        d.wayfarerRebuild!.identities[keys[0]];
    },
  ]) {
    const d = copy();
    edit(d);
    expect(() => planWayfarerRebuildGame(d)).toThrow();
  }
});
