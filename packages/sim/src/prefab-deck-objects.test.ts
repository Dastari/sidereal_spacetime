import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  deckApproachZones,
  deriveInterior,
  planRectsOverlap,
} from "@sidereal/content/ship-prefab";
import {
  planRectToShip,
  prefabConstructionObstacles,
  prefabDeckBlockers,
  prefabDeckObstacles,
  prefabShipObjects,
  shipToPlanMetres,
} from "./prefab-deck-objects";
import {
  PREFAB_DECK_ID,
  prefabConstructionDocument,
  prefabToShipMetres,
  prefabWalkFrame,
} from "./prefab-construction";
import {
  canOccupyDeck,
  sweepDeckCircle,
  withoutPenetratedObstacles,
} from "./construction-collision";
import { prefabFlightModel } from "./prefab-flight";
import { prefabPilotPose } from "./construction-pilot";

const catalog = defaultPrefabComponentCatalog();
const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;

describe("prefab deck objects", () => {
  it("derives Wren's modules, furniture, exterior parts and doors with stable ids", () => {
    const objects = prefabShipObjects(wren, catalog);
    const byId = new Map(objects.map((o) => [o.id, o]));
    for (const id of [
      "mount:reactor",
      "mount:bunk",
      "mount:life",
      "mount:core",
      "mount:helm",
      "mount:main-s",
      "mount:turret",
      "door:d-bridge",
    ])
      expect(byId.has(id), id).toBe(true);
    // Placed-object id and reusable catalog id stay separate.
    expect(byId.get("mount:reactor")!.componentId).toBe("reactor.md");
    // Interior modules block walking; the pilot console is the seat and exterior parts never block.
    expect(byId.get("mount:reactor")!.blocks).toBe(true);
    expect(byId.get("mount:bunk")!.blocks).toBe(true);
    expect(byId.get("mount:helm")!.blocks).toBe(false);
    expect(byId.get("mount:helm")!.station).toBe("pilot");
    expect(byId.get("mount:main-s")!.blocks).toBe(false);
    expect(byId.get("door:d-bridge")!.blocks).toBe(false);
    // Room furniture from the grammar sockets (locker in the bunk room, a crate in the hold).
    const furniture = objects.filter((o) => o.kind === "furniture");
    expect(furniture.map((o) => o.designId).sort()).toEqual([
      "cargo.standard.medium",
      "shipyard.equipment.wall-locker",
    ]);
    expect(furniture.every((o) => o.blocks)).toBe(true);
  });

  it("uses the catalog envelope, rotated and centred on the mount anchor", () => {
    const o = prefabShipObjects(wren, catalog);
    const reactor = o.find((x) => x.id === "mount:reactor")!;
    // reactor.md: 2.8 m square envelope, 2.6 m tall, centred in its 3x3 cell hardpoint at [0,1.5].
    expect(reactor.min).toEqual([0.1, 1.6, 0.1875]);
    expect(reactor.max).toEqual([2.9, 4.4, 2.7875]);
    // crew-bunk.sm (2 x 1 m) turned to face starboard: long side along plan X.
    const bunk = o.find((x) => x.id === "mount:bunk")!;
    expect([bunk.max[0] - bunk.min[0], bunk.max[1] - bunk.min[1]]).toEqual([
      2, 1,
    ]);
    // A main drive on the aft face extends aft of the hull (plan x < 0).
    const drive = o.find((x) => x.id === "mount:main-s")!;
    expect(drive.max[0]).toBeCloseTo(0, 6);
    expect(drive.min[0]).toBeLessThan(-4);
  });

  it("converts plan rectangles to counter-clockwise ship-local polygons and back", () => {
    const poly = planRectToShip(wren, [0.1, 1.6, 2.9, 4.4]);
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const [a, b] = [poly[i], poly[(i + 1) % 4]];
      area += a[0] * b[1] - b[0] * a[1];
    }
    expect(area / 2).toBeCloseTo(2.8 * 2.8, 9);
    const toShip = prefabToShipMetres(wren);
    const back = shipToPlanMetres(wren);
    expect(back(toShip([2.5, 1.25]))).toEqual([2.5, 1.25]);
  });

  it("obstacles are admitted through the construction document binding", () => {
    const doc = prefabConstructionDocument(wren, catalog);
    const obstacles = prefabConstructionObstacles(doc)!;
    expect(obstacles).toEqual(prefabDeckObstacles(wren, catalog));
    expect(obstacles.map((o) => o.definitionId)).toContain("crew-bunk.sm");
    expect(prefabConstructionObstacles({})).toBeUndefined();
  });

  it("a body cannot walk into Wren's bunk, and one standing inside furniture can walk out", () => {
    const frame = prefabWalkFrame(wren, catalog);
    const toShip = prefabToShipMetres(wren);
    const loc = (p: [number, number]) => ({
      shipId: frame.shipId,
      deckId: frame.deckId,
      position: p,
    });
    // Stand in the bunk room's walkway (plan y 4.35, clear of the bunk front at 4.7) and walk
    // port, straight into the bunk.
    const start = toShip([4.5, 4.35]);
    expect(canOccupyDeck(frame, loc(start), 0.3)).toBe(true);
    const into = sweepDeckCircle(frame, loc(start), [-1, 0], 0.3);
    const plan = shipToPlanMetres(wren)(into.position);
    expect(plan[1]).toBeLessThan(4.7 - 0.3 + 1e-6);
    expect(into.contacts.some((c) => c.includes("prefab-mount:bunk"))).toBe(
      true,
    );
    // Recovery: a body inside the bunk (collision added after it lay there) may leave it.
    const inside = toShip([4.5, 5.0]);
    expect(canOccupyDeck(frame, loc(inside), 0.3)).toBe(false);
    const released = withoutPenetratedObstacles(frame, inside, 0.3);
    expect(canOccupyDeck(released, loc(inside), 0.3)).toBe(true);
    expect(released.obstacles.map((o) => o.id)).not.toContain(
      "prefab-mount:bunk",
    );
    // ...but the reactor is still solid in the released frame.
    expect(released.obstacles.map((o) => o.id)).toContain(
      "prefab-mount:reactor",
    );
  });

  for (const prefab of PREFAB_SHIPS)
    it(`${prefab.id}: furniture never seals a door or the pilot approach, and every room is reachable`, () => {
      const interior = deriveInterior(prefab, 0, catalog);
      const cells = new Set(
        interior.floors.map((f) => `${f.cell[0]},${f.cell[1]}`),
      );
      const zones = deckApproachZones(
        interior.doors,
        interior.station?.at ?? null,
        (x, y) => cells.has(`${Math.floor(x)},${Math.floor(y)}`),
      );
      for (const b of prefabDeckBlockers(prefab, catalog))
        for (const z of zones)
          expect(
            planRectsOverlap(b.rect, z.rect),
            `${b.objectId} ${z.id}`,
          ).toBe(false);
      for (const s of interior.sockets)
        if (!s.control)
          for (const z of zones)
            expect(
              planRectsOverlap(z.rect, [
                s.at[0],
                s.at[1],
                s.at[0] + s.size[0],
                s.at[1] + s.size[1],
              ]),
            ).toBe(false);
      const model = prefabFlightModel(prefab, catalog);
      if (!model.station) return;
      const pose = prefabPilotPose(model.station);
      const frame = prefabWalkFrame(prefab, catalog);
      const loc = (p: readonly [number, number]) => ({
        shipId: frame.shipId,
        deckId: frame.deckId,
        position: [p[0], p[1]] as [number, number],
      });
      expect(canOccupyDeck(frame, loc(pose.approach), 0.3)).toBe(true);
      // Flood the standing positions (0.05 m lattice) from the pilot approach: every room that has
      // any standing space must be reachable, so no door or corridor is sealed by furniture.
      const xs = frame.floors.flat().map((p) => p[0]);
      const ys = frame.floors.flat().map((p) => p[1]);
      const step = 0.05;
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const nx = Math.ceil((Math.max(...xs) - x0) / step) + 1;
      const ny = Math.ceil((Math.max(...ys) - y0) / step) + 1;
      const at = (i: number): [number, number] => [
        x0 + (i % nx) * step,
        y0 + Math.floor(i / nx) * step,
      ];
      const free = new Map<number, boolean>();
      const isFree = (i: number) => {
        let f = free.get(i);
        if (f === undefined)
          free.set(i, (f = canOccupyDeck(frame, loc(at(i)), 0.3)));
        return f;
      };
      const seed =
        Math.round((pose.approach[1] - y0) / step) * nx +
        Math.round((pose.approach[0] - x0) / step);
      const seen = new Set<number>();
      const queue = [seed];
      for (let dy = -4; dy <= 4 && !isFree(queue[0]); dy++)
        for (let dx = -4; dx <= 4; dx++)
          if (isFree(seed + dy * nx + dx)) {
            queue[0] = seed + dy * nx + dx;
            break;
          }
      expect(isFree(queue[0])).toBe(true);
      seen.add(queue[0]);
      while (queue.length) {
        const i = queue.pop()!;
        const gx = i % nx;
        for (const j of [
          gx > 0 ? i - 1 : -1,
          gx < nx - 1 ? i + 1 : -1,
          i - nx,
          i + nx,
        ])
          if (j >= 0 && j < nx * ny && !seen.has(j) && isFree(j)) {
            seen.add(j);
            queue.push(j);
          }
      }
      const toPlan = shipToPlanMetres(prefab);
      const reachedRooms = new Set<string>();
      for (const i of seen) {
        const [px, py] = toPlan(at(i));
        const f = interior.floors.find(
          (c) => c.cell[0] === Math.floor(px) && c.cell[1] === Math.floor(py),
        );
        if (f) reachedRooms.add(f.room);
      }
      const toShip = prefabToShipMetres(prefab);
      for (const room of prefab.rooms) {
        const standing = interior.floors
          .filter((f) => f.room === room.id && !f.partial)
          .some((f) =>
            [0.25, 0.5, 0.75].some((u) =>
              [0.25, 0.5, 0.75].some((v) =>
                canOccupyDeck(
                  frame,
                  loc(toShip([f.cell[0] + u, f.cell[1] + v])),
                  0.3,
                ),
              ),
            ),
          );
        if (standing) expect(reachedRooms.has(room.id), room.id).toBe(true);
      }
    }, 120_000);
});

describe("prefab deck objects in the source document", () => {
  it("keeps the construction document (and its pins) independent of furniture", () => {
    const doc = prefabConstructionDocument(wren, catalog);
    expect(doc.layout.fittings).toEqual([]);
    expect(doc.layout.decks.map((d) => d.id)).toEqual([PREFAB_DECK_ID]);
  });
});
