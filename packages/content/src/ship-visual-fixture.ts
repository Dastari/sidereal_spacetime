/** Review-only construction catalogue. Never registered as a player ship or authoritative blueprint. */
import {
  prefab,
  volume,
  polygonTiles,
  edge,
  door,
  room,
} from "./prefabs/builders";
import { withBow } from "./bow-profiles";
import type { ShipPrefabDocumentV1 } from "./ship-prefab";

const base = prefab({
  id: "review.family.federation",
  name: "Joined reference family",
  description:
    "Adjacent 2m bays, L/T/end, door/window, slope/partial floor and bow/engine junctions.",
  faction: "Federation",
  role: "Review fixture",
  theme: "federation",
  sizeClass: "S",
  volumes: [
    volume(
      "chassis",
      "hull",
      "deck",
      polygonTiles([
        [0, 0],
        [6, 0],
        [8, 2],
        [8, 4],
        [6, 6],
        [0, 6],
      ]).map((t) => (t.x >= 6 ? withBow(t, (t.x - 5) as 1 | 2) : t)),
    ),
    volume(
      "saddle",
      "plate",
      "wing",
      polygonTiles([
        [0, -2],
        [2, -2],
        [4, 0],
        [0, 0],
      ]),
    ),
  ],
  rooms: [
    room("south", "SOUTH", "corridor", [2, 0, 6, 1]),
    room("bay-a", "BAY A", "corridor", [2, 1, 4, 4]),
    room("bay-b", "BAY B", "corridor", [4, 1, 6, 4]),
    room("bridge", "BRIDGE", "bridge", [6, 0, 8, 6]),
  ],
  edges: [
    edge("bay-a", [2, 1], [4, 1], "wall.full"),
    edge("bay-b", [4, 1], [6, 1], "wall.full"),
    edge("junction-l", [2, 1], [2, 3], "wall.full"),
    edge("junction-t", [4, 1], [4, 3], "wall.full"),
    edge("window", [2, 4], [4, 4], "wall.glazed"),
    door("door", [4, 4], [6, 4]),
  ],
  mounts: [
    {
      id: "main",
      component: "thrust-block.sm",
      attach: "face",
      at: [0, 3],
      normal: "aft",
    },
    {
      id: "rcs",
      component: "rcs.md",
      attach: "face",
      at: [1, -2],
      normal: "starboard",
    },
  ],
  fixtures: [
    {
      id: "locker",
      design: "shipyard.equipment.wall-locker",
      at: [1, 4.5],
      facing: "port",
    },
  ],
  markings: { name: "FAMILY", number: "R001", emblem: "planet" },
  skylights: [],
});
export const SHIP_VISUAL_FIXTURES: ShipPrefabDocumentV1[] = [
  "federation",
  "riftjack",
  "aurelian",
].map((theme) => ({
  ...structuredClone(base),
  id: `review.family.${theme}`,
  theme: theme as ShipPrefabDocumentV1["theme"],
}));
/** A cut crosses the adjacent bay boundary at global x=4m; repair means compiling without removal. */
export function familyReviewCut(): Set<string> {
  const removed = new Set<string>();
  for (let x = 60; x < 69; x++)
    for (let y = 14; y < 19; y++)
      for (let z = 8; z < 25; z++) removed.add(`${x},${y},${z}`);
  return removed;
}
