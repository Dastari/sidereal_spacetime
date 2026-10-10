import { describe, expect, it } from "vitest";
import { FEDERATION_FLEET } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabOrigin, deriveInterior } from "@sidereal/content/ship-prefab";
import { prefabLayout, PREFAB_DECK_ID } from "./prefab-construction";
import { prefabDeckObstacles } from "./prefab-deck-objects";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
  sweepDeckCircle,
} from "./construction-collision";
import { shipLogicModel, reachablePanel } from "./ship-logic-model";
import { prefabBedSeats, qualifyPrefabBed } from "./prefab-seats";
const catalog = defaultPrefabComponentCatalog();
describe("furnished fleet capsule circulation with exact native access pockets", () => {
  for (const doc of FEDERATION_FLEET)
    it(`${doc.id} reaches every room, control and usable berth`, () => {
      const base = compileDeckCollision(
        prefabLayout(doc, catalog),
        PREFAB_DECK_ID,
        {
          shipId: doc.id,
          perimeterHalfWidthM: 0,
          partitionHalfWidthM: 0,
          obstacles: prefabDeckObstacles(doc, catalog),
        },
      );
      const frame = resolveDeckCollision(
        base,
        base.openings.map((o) => ({ openingId: o.id, passable: true })),
      );
      const [ox, oy] = prefabOrigin(doc);
      const ship = (x: number, y: number): [number, number] => [
        -(y - oy),
        x - ox,
      ];
      const loc = (p: [number, number]) => ({
        shipId: doc.id,
        deckId: PREFAB_DECK_ID,
        position: p,
      });
      const walk = new Map<string, [number, number]>();
      for (const f of deriveInterior(doc, 0, catalog).floors)
        for (let dx = 0.125; dx < 1; dx += 0.25)
          for (let dy = 0.125; dy < 1; dy += 0.25) {
            const x = f.cell[0] + dx,
              y = f.cell[1] + dy,
              p = ship(x, y);
            if (canOccupyDeck(frame, loc(p), 0.3))
              walk.set(
                `${Math.round(x * 4 - 0.5)},${Math.round(y * 4 - 0.5)}`,
                p,
              );
          }
      const hall = doc.rooms.find((r) => r.id === "hall")!;
      const target = ship(
        (hall.rect[0] + hall.rect[2]) / 2,
        (hall.rect[1] + hall.rect[3]) / 2,
      );
      const seed = [...walk].sort(
        (a, b) =>
          Math.hypot(a[1][0] - target[0], a[1][1] - target[1]) -
          Math.hypot(b[1][0] - target[0], b[1][1] - target[1]),
      )[0][0];
      const seen = new Set<string>();
      const queue = [seed];
      seen.add(queue[0]);
      for (let i = 0; i < queue.length; i++) {
        const key = queue[i],
          p = walk.get(key)!;
        const [x, y] = key.split(",").map(Number);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const k = `${x + dx},${y + dy}`,
            q = walk.get(k);
          if (!q || seen.has(k)) continue;
          const r = sweepDeckCircle(
            frame,
            loc(p),
            [q[0] - p[0], q[1] - p[1]],
            0.3,
          );
          if (Math.hypot(r.position[0] - q[0], r.position[1] - q[1]) < 1e-5) {
            seen.add(k);
            queue.push(k);
          }
        }
      }
      const visited = [...seen].map((k) => walk.get(k)!);
      const unreachableRooms = doc.rooms
        .filter(
          (r) =>
            !visited.some((p) => {
              const x = p[1] + ox,
                y = oy - p[0];
              return (
                x > r.rect[0] && x < r.rect[2] && y > r.rect[1] && y < r.rect[3]
              );
            }),
        )
        .map((r) => r.id);
      const inaccessiblePanels = shipLogicModel(doc, catalog)!
        .panels.filter(
          (p) =>
            p.side === "interior" &&
            !visited.some(
              (q) =>
                reachablePanel({ panels: [p] }, q, "interior")?.deviceId ===
                p.deviceId,
            ),
        )
        .map((p) => p.deviceId);
      expect(unreachableRooms).toEqual([]);
      expect(inaccessiblePanels).toEqual([]);
      for (const bed of prefabBedSeats(doc, catalog)) {
        expect(qualifyPrefabBed(frame, bed), bed.placementId).toBe(true);
        expect(
          visited.some(
            (p) => Math.hypot(p[0] - bed.approachX, p[1] - bed.approachY) < 0.4,
          ),
          bed.placementId,
        ).toBe(true);
      }
      const model = shipLogicModel(doc, catalog)!;
      for (const door of model.doors) {
        const p = door.exterior
          ? ([
              door.center[0] - door.normal[0] * 0.8,
              door.center[1] - door.normal[1] * 0.8,
            ] as [number, number])
          : door.center;
        expect(canOccupyDeck(frame, loc(p), 0.3), door.doorId).toBe(true);
        expect(
          visited.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.4),
          door.doorId,
        ).toBe(true);
      }
    }, 30000);
});
