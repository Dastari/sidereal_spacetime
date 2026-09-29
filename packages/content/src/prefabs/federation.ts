import { withBow } from "../bow-profiles";
/** Federation (Orion Crest line): warm white, navy and crimson; tidy symmetric hulls. */
import {
  airlockController,
  airlockLogic,
  armed,
  button,
  door,
  doorActuator,
  edge,
  face,
  fixture,
  module,
  opening,
  polygonTiles,
  prefab,
  room,
  skylight,
  top,
  volume,
} from "./builders";

/** Starter candidate: two-person courier with a sloped bow and swept wings. */
export const FED_WREN = prefab({
  id: "fed.s.wren",
  name: "Wren",
  description:
    "Orion Crest light courier. Sloped bow, swept wings, one airlock and a snug four-room deck. Starter candidate.",
  faction: "Federation",
  role: "Courier",
  theme: "federation",
  sizeClass: "S",
  // Revision 4 (2026-09-28): the hull grows 1 m in length and 1 m in beam (12 x 7) so every module
  // and furniture piece fits at catalog scale outside the door and pilot approaches. The engine
  // room keeps its 3 m depth with the reactor in its port half, the hold is 5 m long (crate clear
  // of both doors) and the quarters are 3 m deep (bunk clear of its door).
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 0],
        [10, 0],
        [12, 2],
        [12, 5],
        [10, 7],
        [0, 7],
      ]).map((t) => (t.x >= 9 ? withBow(t, (t.x - 8) as 1 | 2 | 3) : t)),
      { spine: true, logo: true },
    ),
    volume(
      "wing-s",
      "plate",
      "wing",
      polygonTiles([
        [0, -2],
        [3, -2],
        [5, 0],
        [0, 0],
      ]),
    ),
    volume(
      "wing-p",
      "plate",
      "wing",
      polygonTiles([
        [0, 7],
        [5, 7],
        [3, 9],
        [0, 9],
      ]),
    ),
  ],
  rooms: [
    room("engine", "ENGINE", "engineering", [0, 0, 3, 7]),
    room("hall", "HALL", "corridor", [3, 2, 8, 4]),
    room("bunks", "BUNKS", "quarters", [3, 4, 8, 7]),
    room("hold", "HOLD", "cargo", [3, 0, 8, 2]),
    room("bridge", "BRIDGE", "bridge", [8, 0, 12, 7]),
  ],
  edges: [
    door("d-engine", [3, 2], [3, 4], "door.sliding"),
    door("d-bunks", [5, 4], [7, 4]),
    // Revision 7 (2026-09-29, same-plane EVA): the hold is the airlock chamber, so its hall door
    // is a sealed airlock door driven by the airlock controller.
    door("d-hold", [5, 2], [7, 2], "door.airlock"),
    door("d-bridge", [8, 2], [8, 4], "door.sliding"),
    edge("g-bridge-s", [8, 0], [8, 2], "wall.glazed"),
    edge("g-bridge-p", [8, 4], [8, 7], "wall.glazed"),
    // Pressure glass is the inset roof face of the bow tiles; the outer shoulder edges are armour.
  ],
  // Revision 4 (2026-09-28): the bigger hull (21.6 t) keeps r3's acceleration with four small
  // thrust blocks (24 kN each, as on the Federation heavy's pods) fed by a medium fuel tank, and the
  // RCS clusters move to the wing-tip faces for yaw authority. Revision 3 flew four small ion
  // drives on the 11 x 6 m hull. Proposed balance, not owner-approved.
  // Revision 5 (2026-09-29, owner: weapons and sensors on the roof, snappy starters): the side
  // cannons and the bare roof autocannon move onto roof mount tiles (a turret ring with the
  // autocannon, a fixed forward mount with two more linked small autocannons) and Wren gains its basic roof sensor
  // dish on a small fixed mount. Engines stay aft; catalog revision 3 gives the thrust blocks
  // reversers and the RCS clusters real braking and yaw authority.
  // Revision 6 (2026-09-29, FLIGHT-IFCS; owner: "The side thrusters need to be mounted in a better
  // location", turning must come from real thrusters): four quad RCS blocks (catalogue revision 4)
  // at the nose and stern corners, so every translation and yaw has a pure (couple-free) nozzle set
  // and the fly-by-wire IFCS earns its turn rate from RCS torque. To stay within the 12 S-class
  // hardpoints (the airlock is a hull door, not a hardpoint) the drives go from four to three small
  // thrust blocks on the centreline; the RCS aft nozzles more than replace the fourth drive.
  mounts: [
    face("main-s", "thrust-block.sm", "aft", [0, 2.5]),
    face("main-c", "thrust-block.sm", "aft", [0, 3.5]),
    face("main-p", "thrust-block.sm", "aft", [0, 4.5]),
    face("rcs-bow-s", "rcs.md", "starboard", [9.5, 0]),
    face("rcs-bow-p", "rcs.md", "port", [9.5, 7]),
    face("rcs-stern-s", "rcs.md", "starboard", [0.5, -2]),
    face("rcs-stern-p", "rcs.md", "port", [0.5, 9]),
    opening("airlock", "airlock.exterior.md", "starboard", [6, 0]),
    top("rad-a", "radiator.md", [0.5, 1]),
    top("rad-b", "radiator.md", [0.5, 4]),
    module("helm", "console.navigation.sm", [9, 3], "fore"),
    module("core", "computer-core.sm", [8, 0.5], "port"),
    module("reactor", "reactor.md", [0, 4], "starboard"),
    module("life", "life-support.sm", [2, 0], "port"),
    module("fuel", "fuel-tank.md", [0, 0], "port"),
    module("bunk", "crew-bunk.sm", [3.5, 5.5], "starboard"),
    // r6 (S4-1 catalogue rules): a coolant pump so the radiators can reject heat, and a small
    // ballistic magazine feeding the roof autocannons. Interior modules; no hardpoints.
    module("coolant", "coolant-pump.md", [2, 1], "port"),
    module("ammo", "magazine.ballistic.sm", [7, 6], "port"),
  ],
  armed: [
    armed("turret", "turret", "MD", [4.5, 2.5], "fore", "autocannon.sm"),
    armed("guns", "fixed", "MD", [7, 2.5], "fore", "autocannon.sm", 2),
    armed("sensor", "fixed", "SM", [3, 3], "fore", "sensor-dish.sm"),
  ],
  skylights: [],
  markings: { name: "WREN", number: "OC-11", emblem: "planet" },
  // Revision 7 (2026-09-29, owner: "a proper button object on the wall inside and outside (with
  // proximity E) ... wired to a proper logic system"): the hold is the airlock chamber between the
  // hall door (inner) and the starboard hatch (outer). Buttons beside the hatch inside and outside
  // cycle it (a spacewalker can seal the ship behind them and call the lock back); a hall button
  // beside the hold door opens the inner side, so the crew is never locked out of the hold. One 3 s
  // stage simulates (de)pressurisation. Wiki `Systems/Ship Logic`.
  logic: (() => {
    const inside = button("btn-lock-in", [7.5, 0], "port");
    const outside = button("btn-lock-out", [7.5, 0], "starboard");
    const hall = button("btn-hall", [7.5, 2], "port");
    return {
      devices: [
        airlockController("lock", 3),
        doorActuator("door-inner", "d-hold"),
        doorActuator("door-outer", "airlock"),
        inside,
        outside,
        hall,
      ],
      links: airlockLogic("lock", "door-inner", "door-outer", [
        [inside, "cycle"],
        [outside, "cycle"],
        [hall, "open_inner"],
      ]),
    };
  })(),
  // Revision 8 (2026-09-29, owner: "Maybe create another crate if it will fit? Or make the locker
  // a storage item I can interact with and add the items there."): a dedicated EVA suit locker in
  // the airlock chamber, backed onto the hall wall beside the inside airlock button and opening
  // toward it, so a crew member suits up and cycles the lock from one spot. It is a normal wall
  // locker storage socket (`hold/shipyard.equipment.wall-locker`), clear of both airlock door
  // approaches and the button's standing zone. New Wrens are issued with the EVA suit in it.
  fixtures: [
    fixture(
      "suit-locker",
      "shipyard.equipment.wall-locker",
      [6.95, 1.2],
      "starboard",
    ),
  ],
});

FED_WREN.revision = 8;

/** Medium: the prototype Wayfarer-class corvette, re-cut on the 1 m grammar. */
export const FED_CREST = prefab({
  id: "fed.m.crest",
  name: "Orion Crest",
  description:
    "Federation corvette: eleven rooms around a central spine, glazed bridge and lounge, twin large ion drives.",
  faction: "Federation",
  role: "Corvette",
  theme: "federation",
  sizeClass: "M",
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 0],
        [20, 0],
        [24, 4],
        [24, 6],
        [20, 10],
        [0, 10],
      ]),
      { spine: true },
    ),
    volume(
      "plate-p",
      "plate",
      "wing",
      polygonTiles([
        [4, 10],
        [12, 10],
        [9, 13],
        [4, 13],
      ]),
    ),
    volume(
      "plate-s",
      "plate",
      "wing",
      polygonTiles([
        [4, -3],
        [9, -3],
        [12, 0],
        [4, 0],
      ]),
    ),
  ],
  rooms: [
    room("eng", "ENGINEERING", "engineering", [0, 0, 4, 10]),
    room("med", "MEDBAY", "medbay", [4, 0, 9, 4]),
    room("shop", "WORKSHOP", "workshop", [9, 0, 13, 4]),
    room("cargo", "CARGO", "cargo", [13, 0, 17, 4]),
    room("lock", "AIRLOCK", "airlock", [17, 0, 20, 4]),
    room("hall", "CORRIDOR", "corridor", [4, 4, 20, 6]),
    room("q1", "QUARTERS", "quarters", [4, 6, 8, 10]),
    room("q2", "QUARTERS", "quarters", [8, 6, 12, 10]),
    room("lounge", "LOUNGE", "lounge", [12, 6, 17, 10]),
    room("galley", "GALLEY", "galley", [17, 6, 20, 10]),
    room("bridge", "BRIDGE", "bridge", [20, 0, 24, 10]),
  ],
  edges: [
    door("d-eng", [4, 4], [4, 6], "door.sliding"),
    door("d-med", [6, 4], [8, 4]),
    door("d-shop", [10, 4], [12, 4], "door.sliding"),
    door("d-cargo", [14, 4], [16, 4]),
    door("d-lock", [17, 4], [19, 4], "door.airlock"),
    door("d-q1", [5, 6], [7, 6]),
    door("d-q2", [9, 6], [11, 6]),
    door("d-lounge", [13, 6], [15, 6], "door.sliding"),
    door("d-galley", [17, 6], [19, 6]),
    door("d-bridge", [20, 4], [20, 6], "door.forcefield"),
    edge("g-lounge-a", [12, 6], [13, 6], "wall.glazed"),
    edge("g-lounge-b", [15, 6], [17, 6], "wall.glazed"),
    edge("g-bridge-s", [20, 0], [20, 4], "wall.glazed"),
    edge("g-bridge-p", [20, 6], [20, 10], "wall.glazed"),
    edge("h-eng", [4, 0], [4, 4], "wall.half"),
    edge("canopy-bow", [20, 0], [20, 10], "canopy"),
  ],
  mounts: [
    face("main-s", "ion-drive.lg", "aft", [0, 1.5]),
    face("main-p", "ion-drive.lg", "aft", [0, 8.5]),
    face("main-c", "ion-drive.md", "aft", [0, 5]),
    face("rcs-p", "rcs.sm", "aft", [4, 11.5]),
    face("rcs-s", "rcs.sm", "aft", [4, -1.5]),
    face("rcs-bow-p", "rcs.md", "port", [19.5, 10]),
    face("rcs-bow-s", "rcs.md", "starboard", [19.5, 0]),
    opening("lock", "airlock.exterior.md", "starboard", [18, 0]),
    opening("cargo-door", "cargo-door.2m", "starboard", [15, 0]),
    top("rad-lg", "radiator.lg", [1, 1]),
    top("rad-a", "radiator.md", [9, 7]),
    top("rad-b", "radiator.md", [9, 1]),
    module("helm", "console.navigation.sm", [22, 4.5], "fore"),
    module("command", "console.command.sm", [21, 2], "fore"),
    module("sensors", "console.sensor.sm", [21, 7], "fore"),
    module("core", "computer-core.md", [20, 1], "port"),
    module("reactor", "reactor.lg", [0, 3], "fore"),
    module("life", "life-support.md", [2, 0.5], "fore"),
    module("bunk-1", "crew-bunk.sm", [4.5, 8.5], "starboard"),
    module("bunk-2", "crew-bunk.sm", [8.5, 8.5], "starboard"),
  ],
  skylights: [skylight("sky", [20, 4], [3, 2])],
  armed: [
    armed("turret", "turret", "LG", [5, 1], "fore", "autocannon.md"),
    armed("laser", "fixed", "MD", [13, 7], "fore", "laser-cannon.md"),
    armed("pd", "turret", "MD", [17, 2], "fore", "point-defense.sm"),
    armed("sensor", "fixed", "MD", [1, 7], "fore", "sensor-dish.md"),
  ],
  markings: { name: "ORION CREST", number: "OC-01", emblem: "planet" },
});

// Revision 2 (2026-09-29): weapons and sensors on roof mount tiles, engines only aft/side.
// Revision 3 (2026-09-29, FLIGHT-IFCS; owner: "The side cannons on the ships need to go"): the
// port/starboard-boresight fixed roof guns (broadside side cannons) are removed, and two bow quad RCS
// blocks join the stern pair: with RCS only at the stern the IFCS had no pure yaw couple.
FED_CREST.revision = 3;

/** Large: side-pod frigate with a long spine, XL drives and heavy turrets. */
export const FED_BASTION = prefab({
  id: "fed.l.bastion",
  name: "Bastion",
  description:
    "Orion Crest frigate: armoured side pods, railguns, missile racks and a shielded command deck.",
  faction: "Federation",
  role: "Frigate",
  theme: "federation",
  sizeClass: "L",
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 0],
        [30, 0],
        [36, 3],
        [36, 9],
        [30, 12],
        [0, 12],
      ]),
      { spine: true },
    ),
    volume(
      "pod-s",
      "hull",
      "pod",
      polygonTiles([
        [6, -4],
        [21, -4],
        [25, 0],
        [6, 0],
      ]),
      { logo: false },
    ),
    volume(
      "pod-p",
      "hull",
      "pod",
      polygonTiles([
        [6, 12],
        [25, 12],
        [21, 16],
        [6, 16],
      ]),
      { logo: false },
    ),
    volume(
      "fin-s",
      "plate",
      "wing",
      polygonTiles([
        [26, -2],
        [28, -2],
        [30, 0],
        [26, 0],
      ]),
    ),
    volume(
      "fin-p",
      "plate",
      "wing",
      polygonTiles([
        [26, 12],
        [30, 12],
        [28, 14],
        [26, 14],
      ]),
    ),
  ],
  rooms: [
    room("eng", "ENGINEERING", "engineering", [0, 0, 6, 12]),
    room("hall", "CORRIDOR", "corridor", [6, 5, 30, 7]),
    room("magazine", "ARMORY", "armory", [6, 0, 11, 5]),
    room("cargo", "CARGO", "cargo", [11, 0, 17, 5]),
    room("med", "MEDBAY", "medbay", [17, 0, 21, 5]),
    room("lock", "AIRLOCK", "airlock", [21, 0, 25, 5]),
    room("shop", "WORKSHOP", "workshop", [25, 0, 30, 5]),
    room("q1", "QUARTERS", "quarters", [6, 7, 10, 12]),
    room("q2", "QUARTERS", "quarters", [10, 7, 14, 12]),
    room("q3", "QUARTERS", "quarters", [14, 7, 18, 12]),
    room("hydro", "HYDROPONICS", "hydro", [18, 7, 21, 12]),
    room("galley", "GALLEY", "galley", [21, 7, 25, 12]),
    room("lounge", "LOUNGE", "lounge", [25, 7, 30, 12]),
    room("bridge", "BRIDGE", "bridge", [30, 0, 36, 12]),
  ],
  edges: [
    door("d-eng", [6, 5], [6, 7], "door.blast"),
    door("d-mag", [8, 5], [10, 5], "door.blast"),
    door("d-cargo", [13, 5], [15, 5]),
    door("d-med", [18, 5], [20, 5], "door.sliding"),
    door("d-lock", [22, 5], [24, 5], "door.airlock"),
    door("d-shop", [27, 5], [29, 5]),
    door("d-q1", [7, 7], [9, 7]),
    door("d-q2", [11, 7], [13, 7]),
    door("d-q3", [15, 7], [17, 7]),
    door("d-hydro", [18, 7], [20, 7], "door.sliding"),
    door("d-galley", [22, 7], [24, 7]),
    door("d-lounge", [26, 7], [28, 7], "door.sliding"),
    door("d-bridge", [30, 5], [30, 7], "door.forcefield"),
    edge("g-bridge-s", [30, 0], [30, 5], "wall.glazed"),
    edge("g-bridge-p", [30, 7], [30, 12], "wall.glazed"),
    edge("g-lounge", [28, 7], [30, 7], "wall.glazed"),
    edge("h-galley", [25, 7], [25, 12], "wall.half"),
  ],
  mounts: [
    face("rcs-bow-p", "rcs.sm", "port", [27.5, 14]),
    face("rcs-bow-s", "rcs.sm", "starboard", [27.5, -2]),
    face("rcs-stern-p", "rcs.sm", "port", [0.5, 12]),
    face("rcs-stern-s", "rcs.sm", "starboard", [0.5, 0]),
    face("xl-s", "ion-drive.xl", "aft", [0, 2]),
    face("xl-p", "ion-drive.xl", "aft", [0, 10]),
    face("md-c", "ion-drive.lg", "aft", [0, 6]),
    face("pod-s-drive", "thrust-block.md", "aft", [6, -2]),
    face("pod-p-drive", "thrust-block.md", "aft", [6, 14]),
    opening("lock", "airlock.exterior.md", "starboard", [23, 0]),
    top("shield", "shield-emitter.md", [16, 1]),
    top("tractor", "tractor-projector.md", [34, 5]),
    top("rad-1", "radiator.lg", [8, 1]),
    top("rad-2", "radiator.lg", [8, 8]),
    top("rad-3", "radiator.md", [19, 9]),
    top("rad-4", "radiator.md", [23, 9]),
    top("rad-pod-s", "radiator.lg", [8, -4]),
    top("rad-pod-p", "radiator.lg", [8, 13]),
    module("helm", "console.navigation.sm", [34, 5.5], "fore"),
    module("command", "console.command.sm", [32, 5.5], "fore"),
    module("fire", "console.fire-control.sm", [32, 2], "fore"),
    module("sensor", "console.sensor.sm", [32, 9], "fore"),
    module("core", "computer-core.lg", [30.5, 3], "port"),
    module("reactor", "reactor.lg", [0, 1], "fore"),
    module("reactor-2", "reactor.md", [0.5, 7.5], "fore"),
    module("life", "life-support.lg", [4, 1], "fore"),
    module("shieldgen", "shield-generator.md", [4, 8], "fore"),
    module("mag", "magazine.missile.lg", [6.5, 0.5], "port"),
    module("bunk-1", "crew-bunk.sm", [6.5, 10.5], "starboard"),
    module("bunk-2", "crew-bunk.sm", [10.5, 10.5], "starboard"),
    module("bunk-3", "crew-bunk.sm", [14.5, 10.5], "starboard"),
  ],
  skylights: [skylight("sky", [31, 5], [3, 2])],
  armed: [
    armed("rail-s", "fixed", "LG", [4, 1], "fore", "railgun.lg"),
    armed("rail-p", "fixed", "LG", [4, 8], "fore", "railgun.lg"),
    armed("missiles-s", "fixed", "MD", [31, 2], "fore", "missile-pod.md"),
    armed("missiles-p", "fixed", "MD", [31, 8], "fore", "missile-pod.md"),
    armed("flak", "turret", "LG", [12, -3], "fore", "flak-cannon.md"),
    armed("pd", "turret", "LG", [12, 13], "fore", "point-defense.md"),
    armed("dish", "fixed", "MD", [18, 13], "fore", "sensor-dish.md"),
    armed("beacon", "fixed", "SM", [21, 2], "fore", "relay-beacon.sm"),
  ],
  markings: { name: "BASTION", number: "OC-77", emblem: "planet" },
});

// Revision 2 (2026-09-29): weapons and sensors on roof mount tiles, engines only aft/side.
// Revision 3 (2026-09-29, FLIGHT-IFCS; owner: "The side cannons on the ships need to go"): the
// port/starboard-boresight fixed roof guns (broadside side cannons) are removed.
FED_BASTION.revision = 3;

/**
 * Art-calibration ship: the approved reference silhouette (3d-rpg-after / top-down-after) as a
 * prefab. Capsule body with straight parallel sides, a three-facet bow over a glazed bridge,
 * and three stern drives. Named Meridian so it is not confused with the retired Wayfarer assets.
 */
export const FED_MERIDIAN = prefab({
  id: "fed.m.meridian",
  name: "Meridian",
  description:
    "Wayfarer-class reference corvette: capsule hull, faceted glazed bow, three stern drives. Art calibration ship.",
  faction: "Federation",
  role: "Corvette",
  theme: "federation",
  sizeClass: "M",
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 0],
        [22, 0],
        [26, 2],
        [27, 4],
        [27, 8],
        [26, 10],
        [22, 12],
        [0, 12],
      ]),
      { spine: true },
    ),
  ],
  rooms: [
    room("eng", "ENGINEERING", "engineering", [0, 0, 4, 12]),
    room("med", "MEDBAY", "medbay", [4, 0, 9, 5]),
    room("shop", "WORKSHOP", "workshop", [9, 0, 13, 5]),
    room("cargo", "CARGO", "cargo", [13, 0, 18, 5]),
    room("lock", "AIRLOCK", "airlock", [18, 0, 22, 5]),
    room("hall", "CORRIDOR", "corridor", [4, 5, 22, 7]),
    room("q1", "QUARTERS", "quarters", [4, 7, 8, 12]),
    room("q2", "QUARTERS", "quarters", [8, 7, 12, 12]),
    room("lounge", "LOUNGE", "lounge", [12, 7, 17, 12]),
    room("galley", "GALLEY", "galley", [17, 7, 22, 12]),
    room("bridge", "BRIDGE", "bridge", [22, 0, 27, 12]),
  ],
  edges: [
    door("d-eng", [4, 5], [4, 7], "door.sliding"),
    door("d-med", [6, 5], [8, 5]),
    door("d-shop", [10, 5], [12, 5], "door.sliding"),
    door("d-cargo", [15, 5], [17, 5]),
    door("d-lock", [19, 5], [21, 5], "door.airlock"),
    door("d-q1", [5, 7], [7, 7]),
    door("d-q2", [9, 7], [11, 7]),
    door("d-lounge", [13, 7], [15, 7], "door.sliding"),
    door("d-galley", [18, 7], [20, 7]),
    door("d-bridge", [22, 5], [22, 7], "door.forcefield"),
    edge("g-lounge", [15, 7], [17, 7], "wall.glazed"),
    edge("g-bridge-s", [22, 0], [22, 5], "wall.glazed"),
    edge("g-bridge-p", [22, 7], [22, 12], "wall.glazed"),
  ],
  mounts: [
    face("rcs-bow-p", "rcs.sm", "port", [21.5, 12]),
    face("rcs-bow-s", "rcs.sm", "starboard", [21.5, 0]),
    face("rcs-stern-p", "rcs.sm", "port", [0.5, 12]),
    face("rcs-stern-s", "rcs.sm", "starboard", [0.5, 0]),
    face("main-s", "ion-drive.lg", "aft", [0, 2]),
    face("main-p", "ion-drive.lg", "aft", [0, 10]),
    face("main-c", "ion-drive.lg", "aft", [0, 6]),
    opening("lock", "airlock.exterior.md", "starboard", [20, 0]),
    opening("cargo-door", "cargo-door.2m", "starboard", [16, 0]),
    top("rad-lg", "radiator.lg", [1, 1]),
    top("rad-a", "radiator.md", [9, 8]),
    top("rad-b", "radiator.lg", [9, 1]),
    module("helm", "console.navigation.sm", [25, 5.5], "fore"),
    module("command", "console.command.sm", [23, 3], "fore"),
    module("sensors", "console.sensor.sm", [23, 8], "fore"),
    module("core", "computer-core.md", [23, 5.5], "port"),
    module("reactor", "reactor.lg", [0, 4], "fore"),
    module("life", "life-support.md", [1, 0], "fore"),
    module("bunk-1", "crew-bunk.sm", [4.5, 10.5], "starboard"),
    module("bunk-2", "crew-bunk.sm", [8.5, 10.5], "starboard"),
  ],
  skylights: [skylight("sky", [23, 4], [3, 3])],
  armed: [
    armed("turret", "turret", "LG", [5, 1], "fore", "autocannon.md"),
    armed("laser", "fixed", "MD", [13, 8], "fore", "laser-cannon.md"),
    armed("pd", "turret", "MD", [19, 2], "fore", "point-defense.sm"),
    armed("sensor", "fixed", "MD", [1, 8], "fore", "sensor-dish.md"),
  ],
  markings: { name: "MERIDIAN", number: "OC-24", emblem: "planet" },
});

// Revision 2 (2026-09-29): weapons and sensors on roof mount tiles, engines only aft/side.
FED_MERIDIAN.revision = 2;
