import type {
  Actuator,
  FlightProfile,
  MassProperties,
} from "../../sim/src/ifcs";

/** Authored Wayfarer lab installation, version 1. IDs identify placed devices;
 * definition IDs identify reusable equipment. No runtime refit or resource network. */
export const LAB_FLIGHT_COMPUTER = {
  id: "computer-flight-01",
  definitionId: "flight-computer-lab-v1",
  installed: true,
  powered: true,
} as const;
export const LAB_FLIGHT_PROFILE: FlightProfile = {
  velocityGain: 1.5,
  headingGain: 2,
  angularGain: 4,
  maxAcceleration: 3,
  maxAngularAcceleration: 0.65,
  maxAngularSpeed: 0.65,
};
export const LAB_FLIGHT_SPEED = { forward: 30, reverse: 12 } as const;
// Provisional aggregate of hull and installed equipment, centered on authored
// ship origin. Dynamic cargo/crew/fuel mass compilation is not implemented.
export const LAB_FLIGHT_MASS: MassProperties = {
  massKg: 12000,
  centerX: 0,
  centerY: 0,
  inertiaKgM2: (12000 * (10.8 ** 2 + 22.8 ** 2)) / 12,
};
export type FlightDevice = Actuator & { definitionId: string; height: number };
export const LAB_FLIGHT_ACTUATORS: readonly FlightDevice[] = [
  ...[-3.6, 3.6, 0].map((x) => ({
    id: `drives-main-${x}`,
    definitionId: x === 0 ? "main-drive-small-v1" : "main-drive-v1",
    x,
    y: x === 0 ? -12.875 : -14,
    height: 1.375,
    rotation: 0,
    maxThrustN: x === 0 ? 8000 : 14000,
    availability: 1,
  })),
  ...[-1, 1].flatMap((side) =>
    [-6.5, 6.5].map((y) => ({
      id: `drives-maneuver-${side}-${y}`,
      definitionId: "maneuver-drive-v1",
      x: side * 6.875,
      y,
      height: 0.75,
      rotation: (side * Math.PI) / 2,
      maxThrustN: 16000,
      availability: 1,
    })),
  ),
  ...[-1, 1].map((side) => ({
    id: `drives-retro-${side}`,
    definitionId: "retro-drive-v1",
    x: side * 5.5,
    y: 8.5,
    height: 0.75,
    rotation: Math.PI,
    maxThrustN: 18000,
    availability: 1,
  })),
];
