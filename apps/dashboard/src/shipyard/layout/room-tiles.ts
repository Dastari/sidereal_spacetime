import type {
  FloorTile,
  LayoutDocument,
  Point,
} from "@sidereal/content/ship-layout";
import { inside } from "@sidereal/sim/layout-geometry";

/** Pick a label point inside an actual selected tile, including diagonal floor shapes. */
export function roomLabelPoint(tiles: readonly FloorTile[]): Point {
  if (!tiles.length) throw new Error("Select floor tiles to create a room.");
  const points = tiles.flatMap((tile) => tile.vertices);
  const center: Point = [
    (Math.min(...points.map(([x]) => x)) +
      Math.max(...points.map(([x]) => x))) /
      2,
    (Math.min(...points.map(([, y]) => y)) +
      Math.max(...points.map(([, y]) => y))) /
      2,
  ];
  const candidates = tiles
    .map((tile) => ({
      tile,
      point: [0, 1].map((axis) =>
        Math.round(
          tile.vertices.reduce((sum, point) => sum + point[axis], 0) /
            tile.vertices.length,
        ),
      ) as Point,
    }))
    .filter(({ tile, point }) => inside(point, tile.vertices, false));
  candidates.sort(
    (a, b) =>
      Math.hypot(a.point[0] - center[0], a.point[1] - center[1]) -
        Math.hypot(b.point[0] - center[0], b.point[1] - center[1]) ||
      a.tile.id.localeCompare(b.tile.id),
  );
  if (!candidates.length)
    throw new Error(
      "Selected floor tiles are too narrow for a room label on the placement lattice.",
    );
  return candidates[0].point;
}

export function createRoomFromTiles(
  doc: LayoutDocument,
  deckId: string,
  selected: readonly string[],
  id: string,
  name: string,
  type: string,
): LayoutDocument {
  const tiles = doc.tiles.filter(
    (tile) => tile.deckId === deckId && selected.includes(tile.id),
  );
  if (!name.trim()) throw new Error("Enter a room name.");
  return {
    ...doc,
    rooms: [
      ...doc.rooms,
      {
        id,
        deckId,
        name: name.trim(),
        type,
        seed: roomLabelPoint(tiles),
        tileIds: tiles.map((tile) => tile.id).sort(),
        boundaryIds: [],
        access: "crew",
        floorTheme: "Unassigned",
        wallTheme: "Unassigned",
      },
    ],
  };
}

/** Removing a tile shrinks its map labels; a room disappears when its last tile is removed. */
export function reconcileRoomTiles(doc: LayoutDocument): LayoutDocument {
  return {
    ...doc,
    rooms: doc.rooms.flatMap((room) => {
      if (!room.tileIds) return [room];
      const tiles = doc.tiles.filter(
        (tile) =>
          tile.deckId === room.deckId && room.tileIds!.includes(tile.id),
      );
      if (!tiles.length) return [];
      return [
        {
          ...room,
          tileIds: tiles.map((tile) => tile.id).sort(),
          seed: tiles.some((tile) => inside(room.seed, tile.vertices, false))
            ? room.seed
            : roomLabelPoint(tiles),
        },
      ];
    }),
  };
}
