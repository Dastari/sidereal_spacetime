import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import {
  WAYFARER_ACCESS_SOURCE,
  WAYFARER_ACCESS_PHYSICAL,
  wayfarerAccessObjects,
} from "@sidereal/content/wayfarer-access-profile";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabWalkFrame, prefabWalkRoute } from "./prefab-construction";
import { canOccupyDeck, sweepDeckCircle } from "./construction-collision";
import { prefabFlightModel } from "./prefab-flight";
import { prefabPilotPose, canApproachPilot } from "./construction-pilot";
import { prefabBedSeats, qualifyPrefabBed } from "./prefab-seats";
import { prefabCargoSockets } from "./prefab-cargo-sockets";
import { reachablePanel, shipLogicModel } from "./ship-logic-model";

const doc = WAYFARER_ACCESS_SOURCE;
const catalog = defaultPrefabComponentCatalog();
const frame = prefabWalkFrame(doc, catalog);
const pose = prefabPilotPose(prefabFlightModel(doc, catalog).station!);
const radius = 0.3;
const step = 0.1;
// Exact native sliding-leaf housing labels, separated by retained frame rails.
// They are not occupied rooms and must never contain usable interaction targets.
const housingLabels = new Set(["cargo_service", "utility_service"]);
// The native descriptor adds installed sweep envelopes to the generic door pack.
const sourceEnvelopes: {
  id: string;
  sweepBounds: { min: number[]; max: number[]; clearanceM: number };
}[] = JSON.parse(
  readFileSync(
    new URL(
      "../../../assets/runtime/wayfarer-access/r002/doors.json",
      import.meta.url,
    ),
    "utf8",
  ),
).variants;
type Point = [number, number];
const loc = (p: readonly [number, number]) => ({
  shipId: frame.shipId,
  deckId: frame.deckId,
  position: [...p] as Point,
});
const swept = (a: Point, b: Point) => {
  const result = sweepDeckCircle(
    frame,
    loc(a),
    [b[0] - a[0], b[1] - a[1]],
    radius,
  );
  return (
    Math.hypot(result.position[0] - b[0], result.position[1] - b[1]) < 1e-6
  );
};
const visited: Point[] = [];
const reachable = (p: Point) =>
  canOccupyDeck(frame, loc(p), radius) &&
  visited.some(
    (q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= step && swept(q, p),
  );

describe("active native Wayfarer profile2 capsule connectivity", () => {
  beforeAll(() => {
    const xs = frame.floors.flat().map((p) => p[0]);
    const ys = frame.floors.flat().map((p) => p[1]);
    const x0 = Math.min(...xs),
      y0 = Math.min(...ys);
    const nx = Math.ceil((Math.max(...xs) - x0) / step) + 1;
    const ny = Math.ceil((Math.max(...ys) - y0) / step) + 1;
    const at = (i: number): Point => [
      x0 + (i % nx) * step,
      y0 + Math.floor(i / nx) * step,
    ];
    const free = new Map<number, boolean>();
    const isFree = (i: number) => {
      if (!free.has(i)) free.set(i, canOccupyDeck(frame, loc(at(i)), radius));
      return free.get(i)!;
    };
    const seed =
      Math.round((pose.approach[1] - y0) / step) * nx +
      Math.round((pose.approach[0] - x0) / step);
    expect(isFree(seed)).toBe(true);
    expect(swept([...pose.approach], at(seed))).toBe(true);
    const seen = new Set([seed]);
    const queue = [seed];
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i],
        gx = n % nx;
      for (const j of [
        gx > 0 ? n - 1 : -1,
        gx < nx - 1 ? n + 1 : -1,
        n - nx,
        n + nx,
      ]) {
        if (j < 0 || j >= nx * ny || seen.has(j) || !isFree(j)) continue;
        // Adjacent free endpoints alone can jump through a thin source wall.
        if (swept(at(n), at(j))) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    visited.push(...[...seen].map(at));
  }, 60_000);

  it("qualifies the exact registered source with actual collision cuts, not original visual envelopes", () => {
    expect(PREFAB_SHIPS.find((p) => p.id === doc.id)).toBe(doc);
    expect(doc.authoredGameplay?.revision).toBe(2);
    expect(
      frame.obstacles.some(
        (o) => o.id === "prefab-socket:PART_x-6.25_near_0:0",
      ),
    ).toBe(true);
    expect(
      frame.obstacles.some((o) => o.id === "prefab-socket:PART_x-6.25_near_0"),
    ).toBe(false);
  });

  it("connects every room label that has supported standing space to the pilot approach", () => {
    const disconnected: string[] = [];
    for (const room of doc.rooms) {
      if (housingLabels.has(room.id)) continue;
      const inside = (p: Point) => {
        const x = p[1],
          y = -p[0];
        return (
          x > room.rect[0] &&
          x < room.rect[2] &&
          y > room.rect[1] &&
          y < room.rect[3]
        );
      };
      if (visited.some(inside)) continue;
      // Room labels neither grant floor support nor stand in for real routes.
      // Require connectivity whenever an actual 0.6m body can stand in the label.
      let standing = false;
      for (
        let x = room.rect[0] + step / 2;
        x < room.rect[2] && !standing;
        x += step
      )
        for (let y = room.rect[1] + step / 2; y < room.rect[3]; y += step)
          if (canOccupyDeck(frame, loc([-y, x]), radius)) {
            standing = true;
            break;
          }
      if (standing) disconnected.push(room.id);
    }
    expect(disconnected).toEqual([]);
  });

  it("keeps usable storage, berths and controls out of sealed native leaf housings", () => {
    const housings = doc.rooms.filter((room) => housingLabels.has(room.id));
    expect(housings.map((room) => room.id).sort()).toEqual([
      "cargo_service",
      "utility_service",
    ]);
    const targets = [
      ...prefabCargoSockets(doc, 0, catalog).map((socket) => ({
        id: socket.key,
        at: socket.centreM,
      })),
      ...prefabCargoSockets(doc, 0, catalog).flatMap((socket) =>
        socket.approachesM
          .filter((at) => canOccupyDeck(frame, loc(at), radius))
          .map((at, i) => ({
            id: `${socket.key}:qualified-approach:${i}`,
            at,
          })),
      ),
      ...prefabBedSeats(doc, catalog).map((bed) => ({
        id: bed.placementId,
        at: [bed.seatX, bed.seatY],
      })),
      ...shipLogicModel(doc, catalog)!
        .panels.filter((panel) => panel.side === "interior")
        .map((panel) => ({ id: panel.deviceId, at: panel.front })),
      { id: "pilot", at: pose.position },
    ];
    for (const room of housings)
      for (const target of targets) {
        const x = target.at[1],
          y = -target.at[0];
        expect(
          x > room.rect[0] &&
            x < room.rect[2] &&
            y > room.rect[1] &&
            y < room.rect[3],
          `${room.id}: ${target.id}`,
        ).toBe(false);
      }
    expect(
      frame.obstacles.some((obstacle) =>
        obstacle.id.startsWith("prefab-access-frame:cargo:inner:"),
      ),
    ).toBe(true);
    expect(
      WAYFARER_ACCESS_PHYSICAL.frameBlockers["cargo.4m"].some((part) =>
        part.id.includes("frame-pocket-1-front"),
      ),
    ).toBe(true);
  });

  it("keeps corrected furnishings clear of the exact frozen full-stroke leaf envelopes", () => {
    const objects = wayfarerAccessObjects(WAYFARER_GAMEPLAY_OBJECTS).filter(
      (object) =>
        [
          "Cargo_crate_white_blue",
          "Hydroponics_hydro_locker",
          "Hydroponics_cabinet_dark",
        ].includes(object.object),
    );
    expect(objects).toHaveLength(3);
    for (const module of [
      { id: "cargo", center: -7 },
      { id: "personnel", center: 3 },
    ])
      for (const [side, y, sign] of [
        ["inner", 3, -1],
        ["outer", 7, 1],
      ] as const) {
        const variant = sourceEnvelopes.find(
          (v) =>
            v.id ===
            (module.id === "cargo"
              ? "cargo.4m"
              : side === "inner"
                ? "personnel.reverse"
                : "personnel"),
        )!;
        const sweep = variant.sweepBounds;
        const xs = [sweep.min[0], sweep.max[0]].map(
          (x) => module.center + sign * x,
        );
        const ys = [sweep.min[1], sweep.max[1]].map((dy) => y + sign * dy);
        for (const object of objects) {
          const intersects =
            object.min[0] < Math.max(...xs) + sweep.clearanceM &&
            object.max[0] > Math.min(...xs) - sweep.clearanceM &&
            object.min[1] < Math.max(...ys) + sweep.clearanceM &&
            object.max[1] > Math.min(...ys) - sweep.clearanceM &&
            object.min[2] < 0.1875 + sweep.max[2] &&
            object.max[2] > 0.1875 + sweep.min[2];
          expect(intersects, `${module.id}-${side}: ${object.object}`).toBe(
            false,
          );
        }
      }
  });

  it("connects both chambers, all interior controls, both beds, all eight storage sockets and the pilot", () => {
    expect(canApproachPilot(frame, ...pose.approach, pose)).toBe(true);
    expect(swept([...pose.approach], [...pose.position])).toBe(true);
    for (const p of shipLogicModel(doc, catalog)!.panels.filter(
      (p) => p.side === "interior",
    )) {
      expect(reachable(p.front), p.deviceId).toBe(true);
      expect(
        reachablePanel({ panels: [p] }, p.front, "interior")?.deviceId,
      ).toBe(p.deviceId);
    }
    const beds = prefabBedSeats(doc, catalog);
    expect(beds).toHaveLength(2);
    for (const bed of beds) {
      expect(qualifyPrefabBed(frame, bed), bed.placementId).toBe(true);
      expect(reachable([bed.approachX, bed.approachY]), bed.placementId).toBe(
        true,
      );
    }
    const storage = prefabCargoSockets(doc, 0, catalog);
    expect(storage).toHaveLength(8);
    for (const socket of storage) {
      const approach = socket.approachesM.find(reachable);
      expect(approach, socket.key).toBeDefined();
      const route = prefabWalkRoute(doc, catalog, pose.approach, approach!);
      expect(route.at(-1), socket.key).toEqual(approach);
      let from = [...pose.approach] as Point;
      for (const to of route) {
        expect(swept(from, to), socket.key).toBe(true);
        from = to;
      }
    }
    for (const name of ["personnel_chamber", "cargo_chamber"]) {
      const room = doc.rooms.find((r) => r.id === name)!;
      expect(
        visited.some(
          (p) =>
            p[1] > room.rect[0] &&
            p[1] < room.rect[2] &&
            -p[0] > room.rect[1] &&
            -p[0] < room.rect[3],
        ),
        name,
      ).toBe(true);
    }
    // Static source qualification leaves inner passages open. Accepted closed
    // controller state, suit validation and EVA handoff are rehearsed on the wire.
  }, 60_000);
});
