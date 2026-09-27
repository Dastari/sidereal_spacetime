import { WAYFARER_V1_NOZZLES } from "./wayfarer-nozzles";
import type { VoxelVolume } from "../../sim/src/voxels";

type Box = (
  name: string,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  material: number,
) => void;

/** Studless construction shell. Fixed cabin pressure core and collision fixture stay
 * inside ±5 / ±9m. The taper and service machinery are exterior construction. */
export function detailWayfarerShell(
  box: Box,
  layer: (name: string) => VoxelVolume,
  pitch: number,
) {
  const cell = (
    name: string,
    x: number,
    y: number,
    z: number,
    material: number,
  ) =>
    layer(name).set(
      Math.round(x / pitch),
      Math.round(y / pitch),
      Math.round(z / pitch),
      material,
    );
  // Chamfered chine, continuous cabin roof backing, and long pointed command bow.
  // The canopy is opaque blue enamel pending the independent optical voxel lane.
  for (let y = -9.5; y < 13.5; y += pitch) {
    const half = y <= 9.25 ? 5.75 : Math.max(1.25, 5.75 - (y - 9.25) * 1.06);
    if (y < -9.25 || y >= 9.25) {
      box("armor", 0, y, -0.25, half * 2, pitch, 0.5, 13);
      box("armor", 0, y, 0.25, half * 2 - 0.25, pitch, 0.3125, 14);
      for (const side of [-1, 1]) {
        box("armor", side * (half - 0.1875), y, 0.5, 0.375, pitch, 0.8125, 13);
        box(
          "armor",
          side * (half - 0.3125),
          y,
          1.3125,
          0.375,
          pitch,
          0.3125,
          27,
        );
      }
    } else {
      for (const side of [-1, 1]) {
        box("armor", side * 5.375, y, -0.25, 0.75, pitch, 1.25, 13);
        box("armor", side * 5.3125, y, 1, 0.625, pitch, 1.5, 28);
        box("armor", side * 5.25, y, 2.5, 0.625, pitch, 0.1875, 27);
      }
    }
    const roofHalf = y <= 9.25 ? 5.25 : half - 0.25;
    const roofZ = y <= 8 ? 2.6875 : 2.6875 - (y - 8) * 0.21875;
    box("roof", 0, y, roofZ, roofHalf * 2, pitch, 0.1875, 13);
    // Wide canopy panes are framed with independently stepped brick mullions.
    if (y > 7.75) {
      for (const side of [-1, 1]) {
        box(
          "roof",
          (side * roofHalf) / 2,
          y,
          roofZ + 0.1875,
          roofHalf - 0.375,
          pitch,
          0.0625,
          12,
        );
        box("roof", side * roofHalf, y, roofZ + 0.125, 0.25, pitch, 0.25, 27);
        if (Math.floor((y - 8) * 2) % 5 === 0)
          box(
            "roof",
            (side * roofHalf) / 2,
            y,
            roofZ + 0.25,
            roofHalf - 0.25,
            pitch,
            0.125,
            13,
          );
      }
      box("roof", 0, y, roofZ + 0.1875, 0.25, pitch, 0.1875, 14);
    }
  }
  // Roof is many flush, interlocking construction courses, with small service bays.
  for (let yi = 0; yi < 33; yi++) {
    const y = -8.75 + yi * 0.5;
    for (let xi = 0; xi < 10; xi++) {
      const x = -4.5 + xi;
      const shade = (xi * 3 + Math.floor(yi / 3)) % 7;
      box(
        "roof",
        x,
        y,
        2.875,
        0.9375,
        0.4375,
        0.125,
        shade === 0 ? 25 : shade < 4 ? 14 : 27,
      );
    }
  }
  for (const side of [-1, 1]) {
    // Low roof rails break at articulated rib couplings; no studs on top surfaces.
    for (let y = -8.5; y < 7.75; y += 1.5) {
      box("roof", side * 4.75, y, 3, 0.375, 1.4375, 0.125, 13);
      box("roof", side * 4.75, y + 0.625, 3.0625, 0.5, 0.1875, 0.1875, 27);
    }
    for (let bay = 0; bay < 4; bay++) {
      const y = -7.25 + bay * 3.75;
      // Raised chamfered panel: dark frame, smaller pale shoulder, inset wine cover.
      box("roof", side * 2.875, y, 3, 2.375, 2.5625, 0.125, 13);
      box("roof", side * 2.875, y, 3.125, 2.125, 2.3125, 0.125, 27);
      box(
        "roof",
        side * 2.875,
        y + 0.3125,
        3.25,
        1.875,
        1.375,
        0.125,
        bay % 3 === 0 ? 15 : 14,
      );
      box("roof", side * 2.875, y - 0.6875, 3.25, 1.625, 0.5625, 0.0625, 6);
      for (let fin = 0; fin < 8; fin++)
        box(
          "roof",
          side * 2.875 - 0.6875 + fin * 0.1875,
          y - 0.6875,
          3.3125,
          0.0625,
          0.5,
          0.125,
          28,
        );
      for (const x of [-0.75, 0.75]) {
        box(
          "roof",
          side * 2.875 + x,
          y + 0.5625,
          3.375,
          0.1875,
          0.5,
          0.0625,
          13,
        );
        box(
          "roof",
          side * 2.875 + x,
          y + 0.75,
          3.4375,
          0.0625,
          0.125,
          0.0625,
          22,
        );
      }
    }
    // Side service bays: pressure-backed vents, conduits and staggered pale bricks.
    for (let bay = 0; bay < 9; bay++) {
      const y = -8 + bay * 2;
      box("armor", side * 5.625, y, 0.25, 0.25, 1.875, 1.9375, 13);
      box(
        "armor",
        side * 5.8125,
        y,
        0.5625,
        0.1875,
        1.5,
        1.1875,
        bay % 3 === 1 ? 15 : 14,
      );
      box("armor", side * 5.9375, y, 1.0625, 0.125, 1.125, 0.375, 28);
      for (let vent = 0; vent < 6; vent++)
        box(
          "armor",
          side * 6,
          y - 0.4375 + vent * 0.1875,
          1.125,
          0.0625,
          0.0625,
          0.25,
          6,
        );
      for (const end of [-1, 1]) {
        box(
          "armor",
          side * 5.8125,
          y + end * 0.8125,
          0.375,
          0.25,
          0.1875,
          1.75,
          27,
        );
        box(
          "armor",
          side * 5.9375,
          y + end * 0.8125,
          0.8125,
          0.125,
          0.125,
          0.3125,
          13,
        );
        box(
          "armor",
          side * 6,
          y + end * 0.8125,
          0.9375,
          0.0625,
          0.0625,
          0.0625,
          22,
        );
      }
      box(
        "armor",
        side * 5.9375,
        y + 0.4375,
        1.6875,
        0.0625,
        0.5,
        0.125,
        bay % 3 === 1 ? 16 : 7,
      );
      box("armor", side * 5.9375, y - 0.4375, 0.6875, 0.0625, 0.3125, 0.125, 5);
      for (let brick = 0; brick < 5; brick++) {
        box(
          "armor",
          side * 5.625,
          y - 0.75 + brick * 0.375,
          2.25,
          0.375,
          0.3125,
          0.25,
          brick % 3 === 0 ? 25 : 27,
        );
        box(
          "armor",
          side * 5.625,
          y - 0.75 + brick * 0.375,
          0.0625,
          0.375,
          0.3125,
          0.1875,
          26,
        );
      }
    }
    // Reference-selected service motifs; no new faction or functional fittings.
    for (const y of [-6, 2, 6]) {
      box("armor", side * 6.03125, y - 0.625, 0.75, 0.125, 0.3125, 1.125, 28);
      box("armor", side * 6.09375, y - 0.625, 0.875, 0.0625, 0.1875, 0.875, 27);
      box("armor", side * 6.15625, y - 0.625, 1, 0.0625, 0.0625, 0.5625, 31);
      for (const z of [0.875, 1.625])
        box("armor", side * 6.15625, y - 0.625, z, 0.0625, 0.125, 0.0625, 3);
    }
    // One contrasting repair hatch and compact violet service telltale.
    box("armor", side * 6.03125, -4, 0.625, 0.125, 0.6875, 0.625, 15);
    box("armor", side * 6.09375, -4, 0.875, 0.0625, 0.3125, 0.125, 28);
    box("armor", side * 6.125, -4, 1.0625, 0.0625, 0.1875, 0.0625, 35);
    // Forward cheek outriggers integrate into the tapered hull, clear of cabin.
    for (let y = 9.25; y < 12.875; y += pitch) {
      const x = 5.75 - (y - 9.25) * 1.06;
      box("armor", side * (x + 0.0625), y, 0.75, 0.3125, pitch, 0.4375, 14);
      if (Math.floor(y * 4) % 7 < 3)
        box("armor", side * (x + 0.25), y, 0.875, 0.125, pitch, 0.125, 27);
    }
  }
  // Flight target: broad dark service plates, framed radiator slots and edge status.
  for (const side of [-1, 1])
    for (const y of [-5.5, 1.5]) {
      box("roof", side * 2.25, y, 3.125, 2.8125, 3.1875, 0.125, 28);
      box("roof", side * 2.25, y, 3.25, 2.625, 3, 0.0625, 13);
      for (const end of [-1, 1]) {
        box(
          "roof",
          side * 2.25,
          y + end * 1.5625,
          3.25,
          2.375,
          0.125,
          0.125,
          27,
        );
        box(
          "roof",
          side * 3.625,
          y + end * 0.75,
          3.3125,
          0.125,
          0.625,
          0.0625,
          7,
        );
      }
      box("roof", side * 2.25, y - 0.875, 3.3125, 1.75, 0.6875, 0.0625, 6);
      for (let x = -0.75; x <= 0.75; x += 0.1875)
        box(
          "roof",
          side * 2.25 + x,
          y - 0.875,
          3.375,
          0.0625,
          0.5625,
          0.0625,
          25,
        );
      for (const x of [-1.125, 1.125])
        for (const dy of [-1.25, 1.25])
          box("roof", side * 2.25 + x, y + dy, 3.3125, 0.125, 0.125, 0.0625, 3);
    }
  // Central roof utility trench: low radiators, cross-pipes and asymmetric service boxes.
  box("roof", 0, -1, 3, 1.375, 15, 0.125, 28);
  for (let y = -7.75; y < 6; y += 0.375) {
    box("roof", 0, y, 3.125, 1.125, 0.125, 0.125, 13);
    box("roof", -0.4375, y, 3.25, 0.125, 0.25, 0.0625, 5);
  }
  for (const y of [-5.5, 1.25, 6]) {
    box("roof", 0.75, y, 3, 0.625, 1, 0.3125, 15);
    box("roof", 0.75, y, 3.3125, 0.5, 0.75, 0.0625, 14);
    box("markings", 0.75, y + 0.3125, 3.375, 0.25, 0.0625, 0.0625, 5);
  }
  // Hollow bells, continuous machinery bodies and purpose-built raised mounting
  // collars. Three sizes read as a propulsion cluster; nothing crosses the cabin.
  for (const nozzle of WAYFARER_V1_NOZZLES.filter((n) =>
    n.id.startsWith("drives-main"),
  )) {
    const { x, y: rear, height: centerZ } = nozzle;
    const scale = nozzle.definitionId === "main-drive-small-v1" ? 0.7 : 1;
    const name = `drives-main-${x}`;
    for (let y = rear; y < -9.375; y += pitch) {
      const t = y - rear;
      const bell = t < 1.5 * scale;
      const radius = bell
        ? scale * (1.25 - (t / (1.5 * scale)) * 0.53)
        : scale * (1.0625 + (Math.floor(t * 8) % 11 < 2 ? 0.125 : 0));
      for (let dx = -1.5 * scale; dx <= 1.5 * scale; dx += pitch)
        for (let dz = -1.5 * scale; dz <= 1.5 * scale; dz += pitch) {
          const r = Math.hypot(dx, dz);
          if (r > radius || (bell && r < radius - 0.1875)) continue;
          const angle = Math.atan2(dz, dx);
          const rib = Math.abs(Math.sin(angle * 6)) < 0.23;
          const band = Math.floor(t * 8) % 11;
          const material = bell
            ? t < 0.1875
              ? 25
              : rib
                ? 28
                : 6
            : band < 2
              ? 13
              : rib
                ? 27
                : 14;
          cell(name, x + dx, y, centerZ + dz, material);
        }
    }
    // Recessed powered throat is behind the physical bell, never a solid cyan cap at exit.
    const throatY = rear + 1.5 * scale;
    for (let dx = -0.625 * scale; dx <= 0.625 * scale; dx += pitch)
      for (let dz = -0.625 * scale; dz <= 0.625 * scale; dz += pitch)
        if (Math.hypot(dx, dz) < 0.625 * scale)
          cell(
            name,
            x + dx,
            throatY,
            centerZ + dz,
            Math.abs(dx) < 0.125 || Math.abs(dz) < 0.125 ? 13 : 7,
          );
    box(name, x, -9.625, 0.1875, 1.125 * scale, 1.125, 1.75, 13);
    for (const side of [-1, 1]) {
      box(
        name,
        x + side * 0.8125 * scale,
        -10.875,
        1,
        0.375 * scale,
        2.125,
        1.0625,
        15,
      );
      box(
        name,
        x + side * 0.8125 * scale,
        -10.875,
        2.0625,
        0.3125 * scale,
        1.875,
        0.125,
        27,
      );
      box(
        name,
        x + side * 0.4375 * scale,
        -10.875,
        2.375 * scale,
        0.125,
        2.125,
        0.125,
        5,
      );
    }
    box(name, x, -10.875, 2.4375 * scale, 0.75 * scale, 1.5625, 0.25, 13);
    for (let y = -11.5; y < -10.125; y += 0.1875)
      box(name, x, y, 2.6875 * scale, 0.625 * scale, 0.0625, 0.125, 27);
  }
  // Compact side thrusters mounted beyond the armored wall, with visible open mouths.
  for (const nozzle of WAYFARER_V1_NOZZLES.filter((n) =>
    n.id.startsWith("drives-maneuver"),
  )) {
    const { y, height } = nozzle,
      side = Math.sign(nozzle.x);
    const name = `drives-maneuver-${side}-${y}`;
    box(name, nozzle.x - side * 0.8125, y, height - 0.5, 0.5, 1, 0.9375, 13);
    box(
      name,
      nozzle.x - side * 0.5,
      y,
      height - 0.4375,
      0.5,
      0.875,
      0.8125,
      27,
    );
    for (
      let x = Math.abs(nozzle.x) - 0.5;
      x < Math.abs(nozzle.x) + 0.125;
      x += pitch
    )
      for (let dy = -0.5; dy <= 0.5; dy += pitch)
        for (let dz = -0.5; dz <= 0.5; dz += pitch) {
          const r = Math.hypot(dy, dz);
          if (r < 0.375 && r > 0.1875)
            cell(
              name,
              side * x,
              y + dy,
              height + dz,
              x > Math.abs(nozzle.x) - 0.0625 ? 25 : 6,
            );
        }
  }
  // Forward-facing retro mouths match authoritative IFCS mounts (exhaust +Y).
  for (const nozzle of WAYFARER_V1_NOZZLES.filter((n) =>
    n.id.startsWith("drives-retro"),
  )) {
    const { x, height } = nozzle,
      name = `drives-retro-${Math.sign(x)}`;
    box(name, x, nozzle.y - 0.625, height - 0.4375, 0.875, 0.75, 0.875, 13);
    for (let y = nozzle.y - 0.375; y < nozzle.y + 0.0625; y += pitch)
      for (let dx = -0.4375; dx <= 0.4375; dx += pitch)
        for (let dz = -0.4375; dz <= 0.4375; dz += pitch) {
          const radius = Math.hypot(dx, dz);
          if (radius <= 0.4375 && radius >= 0.25)
            cell(name, x + dx, y, height + dz, y >= nozzle.y - 0.0625 ? 27 : 6);
          else if (y === nozzle.y - 0.375 && radius < 0.25)
            cell(name, x + dx, y, height + dz, 7);
        }
  }
}
