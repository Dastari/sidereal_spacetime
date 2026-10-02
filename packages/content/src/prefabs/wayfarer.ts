import { face, module, polygonTiles, prefab, room, volume } from "./builders";
import { WAYFARER_GAMEPLAY_PROFILE } from "../wayfarer-authored-gameplay";

/** Owner-selected authored ship. Fine collision and sockets come from its pinned profile. */
export const FED_WAYFARER = prefab({
  id: "fed.m.wayfarer",
  name: "Wayfarer",
  description:
    "Authored Orion Crest exploration ship with a walkable furnished deck.",
  faction: "Federation",
  role: "Explorer",
  theme: "federation",
  sizeClass: "M",
  authoredGameplay: WAYFARER_GAMEPLAY_PROFILE,
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [-11, -6],
        [8, -6],
        [13, -1],
        [13, 2],
        [8, 7],
        [-11, 7],
      ]),
    ),
  ],
  rooms: [
    room("cockpit", "COCKPIT", "bridge", [5, -5, 12, 5]),
    room("hall", "HALL", "corridor", [-10, -1, 5, 2]),
    room("lounge", "LOUNGE", "lounge", [-2, -5, 2, -1]),
    room("quarters_a", "QUARTERS A", "quarters", [-6, -5, -2, -1]),
    room("quarters_b", "QUARTERS B", "quarters", [-10, -5, -6, -1]),
    room("utility", "UTILITY", "engineering", [2, 2, 5, 5]),
    room("galley", "GALLEY", "lounge", [0, 2, 2, 5]),
    room("workshop", "WORKSHOP", "engineering", [-2, 2, 0, 5]),
    room("hydro", "HYDROPONICS", "lounge", [-6, 2, -2, 5]),
    room("cargo", "CARGO", "cargo", [-10, 2, -6, 5]),
  ],
  mounts: [
    face("main-s", "ion-drive.lg", "aft", [-11, -4.5]),
    face("main-c", "ion-drive.lg", "aft", [-11, 0]),
    face("main-p", "ion-drive.lg", "aft", [-11, 4.5]),
    face("rcs-bow-s", "rcs.md", "starboard", [6.5, -6.5]),
    face("rcs-bow-p", "rcs.md", "port", [6.5, 6.5]),
    face("rcs-stern-s", "rcs.md", "starboard", [-9.5, -6.5]),
    face("rcs-stern-p", "rcs.md", "port", [-9.5, 6.5]),
    module("helm", "console.navigation.sm", [7.5, 0]),
    module("core", "computer-core.md", [3, 2.5]),
    module("reactor", "reactor.lg", [-8, 0]),
    module("fuel", "fuel-tank.lg", [-5, 0]),
    module("coolant", "coolant-pump.lg", [-3, 0]),
    module("battery", "battery.md", [0, 0]),
    module("life", "life-support.md", [2.5, 2]),
    face("rad-a", "radiator.lg", "starboard", [-7, -6]),
    face("rad-b", "radiator.lg", "port", [-7, 6]),
  ],
  armed: [],
  markings: { name: "WAYFARER", number: "WF-011", emblem: "planet" },
});
