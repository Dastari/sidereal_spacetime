import { CABIN_PARTITIONS, CABIN_ROOMS } from "./interior";
type Box = (
  name: string,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  m: number,
) => void;

/** Secondary solids, always within existing furniture or thin wall footprints.
 * Broad designed panels replace random micro-bricks. All dimensions are metres. */
export function detailWayfarerInterior(box: Box) {
  for (const room of CABIN_ROOMS) {
    const side = Math.sign(room.x),
      fx = room.x + side * 0.6,
      name = `room-${room.id}`;
    const upper = side < 0 ? "cutaway-port" : "cutaway-starboard";
    // Two stepped wall bays per room. Lamp/sample insert sits in the upper recess.
    for (const dy of [-1.125, 1.125]) {
      const y = room.y + dy;
      box(upper, side * 4.71875, y, 1.0625, 0.1875, 1.625, 1.3125, 13);
      box(upper, side * 4.625, y, 1.125, 0.0625, 1.5, 1.1875, 27);
      box(upper, side * 4.5625, y, 1.1875, 0.0625, 1.3125, 0.875, 14);
      box(upper, side * 4.5, y - 0.375, 1.375, 0.0625, 0.375, 0.5, 28);
      box(upper, side * 4.4375, y - 0.375, 1.5, 0.0625, 0.25, 0.3125, 33);
      box(upper, side * 4.40625, y - 0.375, 1.5625, 0.0625, 0.125, 0.125, 34);
      for (const edge of [-0.625, 0.625]) {
        box(upper, side * 4.4375, y + edge, 1.25, 0.0625, 0.125, 0.0625, 3);
        box(upper, side * 4.4375, y + edge, 1.9375, 0.0625, 0.125, 0.0625, 3);
      }
      box("walls", side * 4.6875, y, 0.3125, 0.125, 1.625, 0.25, 28);
      box("walls", side * 4.59375, y, 0.375, 0.0625, 1.375, 0.0625, 25);
    }
    // Door kicklights are recessed and alternate with dark corridor spans.
    for (const dy of [-0.875, 0.875]) {
      box(
        "partitions",
        side * 1.25,
        room.y + dy,
        0.4375,
        0.125,
        0.375,
        0.3125,
        28,
      );
      box(
        "partitions",
        side * 1.15625,
        room.y + dy,
        0.5,
        0.0625,
        0.1875,
        0.125,
        31,
      );
    }
    // Grate bridges have dark slots backed by solid walkable decking.
    box("deck", 0, room.y, 0.1875, 1.625, 0.8125, 0.0625, 28);
    for (let y = -0.3125; y <= 0.3125; y += 0.125)
      box("deck", 0, room.y + y, 0.25, 1.375, 0.0625, 0.0625, 25);
    for (const x of [-0.9375, 0.9375])
      box("deck", x, room.y, 0.1875, 0.0625, 0.6875, 0.0625, 11);
    if (room.id === "crew" || room.id === "medbay") {
      for (const z of room.id === "crew" ? [0.5, 1.65] : [0.75]) {
        box(name, fx, room.y - 1.1875, z + 0.125, 1.375, 0.1875, 0.3125, 27);
        box(name, fx, room.y - 1.3125, z + 0.1875, 0.6875, 0.0625, 0.125, 28);
        box(name, fx, room.y - 1.34375, z + 0.21875, 0.375, 0.0625, 0.0625, 34);
        // Fabric folds are restrained relief on the existing blue mattress.
        for (const y of [-0.5, -0.3125, -0.125])
          box(name, fx, room.y + y, z + 0.375, 1, 0.0625, 0.0625, 24);
        box(name, fx, room.y - 0.75, z - 0.1875, 1.125, 0.5625, 0.1875, 14);
        box(
          name,
          fx - side * 0.5625,
          room.y - 0.75,
          z - 0.125,
          0.0625,
          0.25,
          0.0625,
          28,
        );
      }
    } else if (room.id === "lounge") {
      // Separate padded cushions and back segments; no continuous pink cuboid.
      for (const y of [-0.875, 0, 0.875]) {
        box(
          name,
          fx - side * 0.15625,
          room.y + y,
          0.875,
          1.0625,
          0.8125,
          0.125,
          32,
        );
        box(
          name,
          fx + side * 0.1875,
          room.y + y,
          1.0625,
          0.1875,
          0.75,
          0.4375,
          32,
        );
        box(
          name,
          fx - side * 0.625,
          room.y + y,
          0.6875,
          0.0625,
          0.75,
          0.0625,
          32,
        );
      }
      for (const y of [-1.25, 1.25])
        box(
          name,
          fx - side * 0.5625,
          room.y + y,
          0.25,
          0.1875,
          0.1875,
          0.3125,
          3,
        );
    } else if (room.id === "storage") {
      for (const y of [room.y - 0.85, room.y + 0.5])
        for (const z of [0.25, 1]) {
          box(
            `room-storage-container-${y}-${z}`,
            fx,
            y - 0.59375,
            z + 0.125,
            0.8125,
            0.0625,
            0.375,
            28,
          );
          box(
            `room-storage-container-${y}-${z}`,
            fx,
            y - 0.65625,
            z + 0.25,
            0.3125,
            0.0625,
            0.125,
            11,
          );
        }
    }
  }
  // Partition service panels stay low so the authored cutaway remains readable.
  for (const wall of CABIN_PARTITIONS) {
    if (wall.width < 1) continue;
    for (const side of [-1, 1])
      for (const dx of [-1.125, 0, 1.125]) {
        box(
          "partitions",
          wall.x + dx,
          wall.y + side * 0.15625,
          0.5,
          0.9375,
          0.0625,
          0.625,
          27,
        );
        box(
          "partitions",
          wall.x + dx,
          wall.y + side * 0.21875,
          0.5625,
          0.75,
          0.0625,
          0.4375,
          14,
        );
        box(
          "partitions",
          wall.x + dx + 0.25,
          wall.y + side * 0.25,
          0.625,
          0.1875,
          0.0625,
          0.0625,
          28,
        );
      }
  }
  // Layered command station display bank within its existing two-metre footprint.
  const console = "equipment-control-console";
  for (const x of [-0.625, 0, 0.625]) {
    box(console, x, 7.5, 1.1875, 0.5625, 0.1875, 0.625, 27);
    box(console, x, 7.375, 1.25, 0.4375, 0.0625, 0.5, 28);
    box(console, x, 7.3125, 1.3125, 0.3125, 0.0625, 0.375, 33);
    for (const z of [1.375, 1.5, 1.625])
      box(console, x - 0.0625, 7.28125, z, 0.1875, 0.0625, 0.0625, 34);
    box(console, x, 7.125, 1.1875, 0.4375, 0.1875, 0.0625, 28);
    for (const dx of [-0.125, 0, 0.125])
      box(
        console,
        x + dx,
        7.0625,
        1.25,
        0.0625,
        0.0625,
        0.0625,
        dx === 0 ? 31 : 25,
      );
  }
}
