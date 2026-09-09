import { INTERIOR_PROP_PALETTE, stampInteriorProp, type WayfarerInteriorProps } from "./voxel-wayfarer-props";
import { resolveVoxelOwnership } from "./voxel-ownership";
import { detailWayfarerInterior } from "./voxel-wayfarer-interior";
import { detailWayfarerShell } from "./voxel-wayfarer-shell";
import { CABIN_PARTITIONS, CABIN_ROOMS } from "./interior";
import { VoxelVolume } from "../../sim/src/voxels";
/** Authored visual study, meters. Gameplay fittings remain a separate M2 contract.
 * A two-meter construction tile contains 32 samples across each axis (6.25 cm). */
export const VOXEL_METERS = 2 / 32;
export const VOXEL_PALETTE = [
  "#000000",
  "#344550",
  "#536b76",
  "#80939b",
  "#c5cbd0",
  "#cf824c",
  "#22343d",
  "#6fcabd",
  "#142730",
  "#89999b",
  "#637a83",
  "#d5a15b",
  "#405968",
  "#393957",
  "#b8b9cf",
  "#8e345b",
  "#dc5f8c",
  "#457d42",
  "#87bf63",
  "#f0d9b4",
  "#7a648e",
  "#292834",
  "#c7a273",
  "#edf0ec",
  "#48a4ed",
  "#939bb7",
  "#aab2c9",
  "#ced0df",
  "#464a68",
  "#5b6080",
  "#727c98",
  "#ffd7a1", // 31: warm fixture emitter, distinct from painted amber
  "#ad4561", // 32: lounge upholstery
  "#153446", // 33: instrument display well
  "#57bcec", // 34: blue instrument emitter
  "#ad65e8", // 35: purple instrument emitter
  ...INTERIOR_PROP_PALETTE,
];
export function createVoxelWayfarer(interiorProps?: WayfarerInteriorProps) {
  const layers = new Map<string, VoxelVolume>();
  const layer = (name: string) => {
    let v = layers.get(name);
    if (!v) {
      v = new VoxelVolume();
      layers.set(name, v);
    }
    return v;
  };
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    m: number,
  ) {
    const v = layer(name);
    const lo = [x - w / 2, y - d / 2, z],
      hi = [x + w / 2, y + d / 2, z + h].map((n) =>
        Math.round(n / VOXEL_METERS),
      );
    const a = lo.map((n) => Math.round(n / VOXEL_METERS));
    for (let k = a[2]; k < hi[2]; k++)
      for (let j = a[1]; j < hi[1]; j++)
        for (let i = a[0]; i < hi[0]; i++) v.set(i, j, k, m);
  }
  // Contiguous deck, shallow recessed seams, under-frame and continuous sills.
  box("deck", 0, 0, -0.375, 10, 18, 0.375, 1);
  for (let y = -8; y <= 8; y += 2)
    for (let x = -4; x <= 4; x += 2) {
      box("deck", x, y, 0, 1.9375, 1.9375, 0.125, 2);
      box("deck", x, y, 0.125, 1.6875, 1.6875, 0.0625, 10);
    }
  for (const x of [-5, 5]) {
    const upper = x < 0 ? "cutaway-port" : "cutaway-starboard";
    box("walls", x, 0, 0, 0.375, 18.5, 1, 2);
    box(upper, x, 0, 1, 0.375, 18.5, 1.5, 3);
    box(upper, x, 0, 2.5, 0.5, 18.5, 0.1875, 1);
    for (const y of [-8, -4, 0, 4, 8]) {
      box("walls", x, y, 0, 0.625, 0.25, 1, 1);
      box(upper, x, y, 1, 0.625, 0.25, 1.625, 1);
      box(upper, x - 0.03 * Math.sign(x), y, 2.125, 0.6875, 0.125, 0.125, 7);
    }
  }
  for (const y of [-9, 9]) {
    const upper = y < 0 ? "cutaway-aft" : "cutaway-bow";
    box("walls", 0, y, 0, 10, 0.375, 1, 2);
    box(upper, 0, y, 1, 10, 0.375, 1.5, 3);
    box(upper, 0, y, 2.5, 10, 0.5, 0.1875, 1);
  }
  // Control seat matches the authoritative fixture at (0,6). Clear walking area.
  box("equipment-control-seat", 0, 6, 0.1875, 1.125, 1.125, 0.25, 1);
  box("equipment-control-seat", 0, 6, 0.4375, 0.9375, 0.875, 0.125, 6);
  box("equipment-control-seat", 0, 5.55, 0.5, 1.125, 0.1875, 1, 2);
  box("equipment-control-console", 0, 7.25, 0.1875, 2, 0.75, 0.875, 1);
  box("equipment-control-console", 0, 7.25, 1.0625, 1.75, 0.625, 0.125, 6);
  box("equipment-control-console", 0, 7.25, 1.1875, 1.375, 0.3125, 0.0625, 7);
  // Recessed wall lockers and conduits do not intrude into the fixture walking lane.
  for (const x of [-4.7, 4.7])
    for (const y of [-6, -2, 2]) {
      const equipment = `equipment-locker-${x}-${y}`;
      box(equipment, x, y, 0.1875, 0.375, 1.5, 1.125, 6);
      box(equipment, x, y, 1.3125, 0.5, 1.5, 0.125, 3);
      box(equipment, x, y, 1.4375, 0.125, 0.75, 0.0625, 5);
    }
  // Relief is authored voxel material/shape detail, not a pixelation filter.
  for (const x of [-5, 5])
    for (let y = -8.75; y < 9; y += 1.5) {
      const side = Math.sign(x),
        upper = x < 0 ? "cutaway-port" : "cutaway-starboard";
      box("walls", x - side * 0.21875, y, 0.25, 0.125, 1.3125, 0.625, 14);
      box(upper, x - side * 0.21875, y, 1.125, 0.125, 1.3125, 1.125, 14);
      box(upper, x - side * 0.3125, y, 2.125, 0.125, 1, 0.1875, 13);
      box(upper, x - side * 0.375, y, 2.1875, 0.0625, 0.75, 0.0625, 7);
      for (let vent = 0; vent < 5; vent++)
        box(
          "walls",
          x - side * 0.3125,
          y - 0.375 + vent * 0.125,
          0.375,
          0.0625,
          0.0625,
          0.375,
          6,
        );
      box(upper, x - side * 0.3125, y - 0.4375, 1.3, 0.125, 0.1875, 0.5625, 3);
      for (let bolt = 0; bolt < 3; bolt++)
        box(
          upper,
          x - side * 0.375,
          y - 0.4375,
          1.375 + bolt * 0.125,
          0.0625,
          0.0625,
          0.0625,
          11,
        );
      box("armor", x + side * 0.5, y, 0.4375, 0.25, 1.3125, 0.625, 13);
      box(
        "armor",
        x + side * 0.5,
        y,
        1.125,
        0.3125,
        1.25,
        0.625,
        Math.floor(y * 2) % 3 === 0 ? 15 : 14,
      );
      box("armor", x + side * 0.6875, y, 1.25, 0.0625, 0.875, 0.125, 2);
    }
  for (const wall of CABIN_PARTITIONS) {
    box(
      "partitions",
      wall.x,
      wall.y,
      0.1875,
      wall.width,
      wall.depth,
      1.125,
      14,
    );
    box(
      "partitions",
      wall.x,
      wall.y,
      1.3125,
      wall.width + 0.125,
      wall.depth + 0.125,
      0.125,
      13,
    );
    box(
      "partitions",
      wall.x,
      wall.y,
      0.25,
      wall.width + 0.125,
      wall.depth + 0.125,
      0.125,
      13,
    );
  }
  for (const room of CABIN_ROOMS) {
    const side = Math.sign(room.x),
      fx = room.x + side * 0.6,
      equipment = "room-" + room.id;
    // Colored threshold, door jambs, technical inset wall panels.
    box(
      "deck",
      side * 1.4,
      room.y,
      0.1875,
      0.4375,
      1.1875,
      0.0625,
      room.accent,
    );
    for (const offset of [-0.625, 0.625]) {
      box(
        "partitions",
        side * 1.4,
        room.y + offset,
        0.1875,
        0.5,
        0.25,
        1.125,
        13,
      );
      box(
        "partitions",
        side * 1.4,
        room.y + offset,
        1.3125,
        0.5,
        0.25,
        0.125,
        room.accent,
      );
    }
    // Smaller staggered floor pavers give the interior a modelled, tiled surface.
    for (let x = 1.75; x < 4.625; x += 0.5)
      for (let y = room.y - 1.75; y < room.y + 2; y += 0.5) {
        const cell = (Math.round(x * 2) + Math.round(y * 2)) % 5;
        box(
          "deck",
          side * x,
          y,
          0.1875,
          0.4375,
          0.4375,
          0.0625,
          cell === 0 ? 3 : room.id === "lounge" ? 22 : 14,
        );
      }
    if (room.id === "engineering") {
      box(equipment, fx, room.y, 0.25, 1.5, 2.75, 0.25, 13);
      for (let y = room.y - 1.15; y < room.y + 1.2; y += 0.0625)
        for (let dx = -0.6; dx < 0.6; dx += 0.0625)
          for (let z = 0.625; z < 2.1; z += 0.0625) {
            const radius = Math.hypot(dx, z - 1.3);
            if (radius < 0.6) {
              const band = Math.floor((y - room.y + 1.15) * 16) % 6;
              layer(equipment).set(
                Math.round((fx + dx) / VOXEL_METERS),
                Math.round(y / VOXEL_METERS),
                Math.round(z / VOXEL_METERS),
                band < 2 ? 13 : 7,
              );
            }
          }
      for (const d of [-1, 1])
        box(equipment, fx, room.y + d * 1.15, 0.75, 1.5, 0.1875, 1, 3);
    } else if (room.id === "hydroponics") {
      for (const y of [room.y - 0.9, room.y, room.y + 0.9]) {
        const equipment = `room-hydroponics-tray-${y}`;
        if (interiorProps) {
          stampInteriorProp(layer(equipment), interiorProps.hydroponics, [fx,y,.25], VOXEL_METERS);
          continue;
        }
        box(equipment, fx, y, 0.25, 1.5, 0.625, 0.375, 14);
        box(equipment, fx, y, 0.625, 1.25, 0.5, 0.125, 6);
        for (const x of [-0.375, 0, 0.375]) {
          box(equipment, fx + x, y, 0.75, 0.125, 0.125, 0.5, 17);
          box(equipment, fx + x, y, 1, 0.375, 0.375, 0.1875, 18);
          box(equipment, fx + x, y, 1.1875, 0.1875, 0.25, 0.125, 17);
        }
      }
    } else if (room.id === "storage") {
      for (const y of [room.y - 0.85, room.y + 0.5])
        for (const z of [0.25, 1]) {
          const equipment = `room-storage-container-${y}-${z}`;
          box(equipment, fx, y, z, 1.375, 1.125, 0.6875, 11);
          box(equipment, fx, y, z + 0.6875, 1.5, 1.25, 0.0625, 13);
          for (const x of [-0.5, 0.5])
            box(equipment, fx + x, y, z + 0.0625, 0.125, 1.1875, 0.5625, 3);
          box(
            equipment,
            fx - side * 0.6875,
            y,
            z + 0.25,
            0.0625,
            0.375,
            0.1875,
            4,
          );
        }
    } else if (room.id === "crew") {
      for (const z of [0.5, 1.65]) {
        box(equipment, fx, room.y, z, 1.375, 2.5, 0.1875, 3);
        box(equipment, fx, room.y, z + 0.1875, 1.125, 2.125, 0.1875, 24);
        box(equipment, fx, room.y + 0.75, z + 0.375, 1, 0.5, 0.1875, 23);
      }
      for (const y of [room.y - 1.25, room.y + 1.25])
        box(equipment, fx + side * 0.5, y, 0.25, 0.1875, 0.1875, 2, 13);
    } else if (room.id === "medbay") {
      box(equipment, fx, room.y, 0.25, 1.25, 2.5, 0.5, 3);
      box(equipment, fx, room.y, 0.75, 1.5, 2.75, 0.1875, 23);
      box(equipment, fx, room.y, 0.9375, 1.125, 2.125, 0.1875, 24);
      box(equipment, fx, room.y + 0.875, 1.125, 1, 0.4375, 0.1875, 23);
      box(equipment, fx + side * 0.5, room.y + 1.25, 1, 0.25, 0.25, 1, 3);
      box(
        equipment,
        fx + side * 0.5,
        room.y + 1.25,
        1.75,
        0.5,
        0.1875,
        0.4375,
        7,
      );
    } else {
      box(equipment, fx, room.y, 0.25, 1.5, 2.75, 0.3125, 13);
      box(equipment, fx, room.y, 0.5625, 1.5, 2.75, 0.3125, 15);
      box(equipment, fx + side * 0.5, room.y, 0.875, 0.5, 2.75, 0.75, 15);
      for (const y of [room.y - 1.25, room.y + 1.25])
        box(equipment, fx, y, 0.75, 1.5, 0.25, 0.625, 16);
    }
  }
  // Bridge display banks and raised faceted roof inspection panels.
  for (const x of [-1.3, 1.3]) {
    const equipment = `equipment-bridge-bank-${x}`;
    box(equipment, x, 7.25, 0.25, 0.5625, 0.875, 0.75, 13);
    box(equipment, x, 7.5, 1, 0.5, 0.1875, 0.5, 7);
  }
  // Finer raised blocks on exposed hull belts; machinery panels remain readable.
  for (const side of [-1, 1])
    for (let yi = 0; yi < 64; yi++)
      for (let zi = 0; zi < 4; zi++) {
        const y = -8 + yi * 0.25,
          z = 0.3125 + zi * 0.1875,
          shade = (yi * 3 + zi * 7) % 9;
        box(
          "armor",
          side * 5.77,
          y,
          z,
          0.0625,
          0.1875,
          0.125,
          shade < 2 ? 28 : shade < 5 ? 29 : 13,
        );
      }
  detailWayfarerShell(box, layer, VOXEL_METERS);
  detailWayfarerInterior(box);
  resolveVoxelOwnership(layers);
  return layers;
}
