import { PILOT_LAYOUT } from "./pilot-layout";
/** The laboratory's authored room/collision fixture. Not the future live assembly compiler. */
export type FixtureBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
};
export const CABIN_ROOMS = [
  { id: "engineering", name: "ENGINEERING", x: -3.1, y: -6, accent: 7 },
  { id: "hydroponics", name: "HYDROPONICS", x: -3.1, y: -1.5, accent: 17 },
  { id: "storage", name: "STORAGE", x: -3.1, y: 3, accent: 11 },
  { id: "crew", name: "CREW", x: 3.1, y: -6, accent: 14 },
  { id: "medbay", name: "MEDBAY", x: 3.1, y: -1.5, accent: 4 },
  { id: "lounge", name: "LOUNGE", x: 3.1, y: 3, accent: 15 },
] as const;
export const CABIN_PARTITIONS: FixtureBox[] = CABIN_ROOMS.flatMap((room) => {
  const x = Math.sign(room.x) * 1.4;
  return [-1, 1].map((side) => ({
    id: room.id + "-door-" + side,
    x,
    y: room.y + side * 1.4,
    width: 0.25,
    depth: 1.55,
  }));
});
for (const x of [-3.2, 3.2])
  for (const y of [-3.75, 0.75, 5.25])
    CABIN_PARTITIONS.push({
      id: `partition-${x}-${y}`,
      x,
      y,
      width: 3.6,
      depth: 0.25,
    });
// Approved R006 rear bridge panels and doorway jambs, combined without a
// phantom centre blocker. Clear opening is 1.25 m before crew-radius expansion.
for (const side of [-1, 1]) CABIN_PARTITIONS.push({
  id: `bridge-rear-${side}`, x: side * 1.625, y: 8.8125, width: 2, depth: .375,
});
export const CABIN_FURNITURE: FixtureBox[] = CABIN_ROOMS.map((room) => ({
  id: room.id + "-furnishing",
  x: room.x + Math.sign(room.x) * 0.6,
  y: room.y,
  width: 1.5,
  depth: 2.8,
}));
export const CABIN_COLLIDERS: readonly FixtureBox[] = [
  ...CABIN_PARTITIONS,
  ...CABIN_FURNITURE,
  { id: "bridge-console", x: PILOT_LAYOUT.console.x, y: PILOT_LAYOUT.console.y, width: 2, depth: 0.75 },
];
