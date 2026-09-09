/** Small authored flight laboratory. Coordinates are real world XY meters.
 * Celestial height is visual depth below the flight plane, not a collider.
 * Each lab currently gets private body instances; shared AOI is still M1.
 */
export const LAB_BODIES = [
  {
    key: "approach-rock",
    kind: "asteroid",
    appearance: "stone",
    x: 0,
    y: 30,
    height: 0,
    radius: 2.8,
    massKg: 60000,
    seed: 31,
  },
  {
    key: "port-rock",
    kind: "asteroid",
    appearance: "stone",
    x: -23,
    y: 12,
    height: 0,
    radius: 3.4,
    massKg: 85000,
    seed: 7,
  },
  {
    key: "aft-rock",
    kind: "asteroid",
    appearance: "stone",
    x: 19,
    y: -24,
    height: 0,
    radius: 2.1,
    massKg: 24000,
    seed: 22,
  },
  {
    key: "outer-rock",
    kind: "asteroid",
    appearance: "stone",
    x: 35,
    y: 55,
    height: 0,
    radius: 4.2,
    massKg: 120000,
    seed: 43,
  },
  {
    key: "amethyst",
    kind: "planet",
    appearance: "amethyst",
    x: 38,
    y: -28,
    height: -45,
    radius: 18,
    massKg: 0,
    seed: 38,
  },
  {
    key: "pelagic",
    kind: "planet",
    appearance: "pelagic",
    x: -120,
    y: 210,
    height: -85,
    radius: 36,
    massKg: 0,
    seed: 17,
  },
  {
    key: "ivory-star",
    kind: "star",
    appearance: "cold-star",
    x: -90,
    y: 80,
    height: -150,
    radius: 13,
    massKg: 0,
    seed: 14,
  },
  // Distributed visual test destinations. These remain server-seeded private
  // lab bodies; Observe only moves the presentation camera to an admitted row.
  { key: "azure-ocean", kind: "planet", appearance: "ocean", x: -1800, y: 2400, height: -150, radius: 65, massKg: 0, seed: 73 },
  { key: "dunes-desert", kind: "planet", appearance: "desert", x: 2600, y: 1700, height: -170, radius: 72, massKg: 0, seed: 29 },
  { key: "basalt-rock", kind: "planet", appearance: "rock", x: 4200, y: -900, height: -120, radius: 48, massKg: 0, seed: 101 },
  { key: "frost-ice", kind: "planet", appearance: "ice", x: -3400, y: -2400, height: -180, radius: 70, massKg: 0, seed: 47 },
  { key: "cinder-volcanic", kind: "planet", appearance: "volcanic", x: 1700, y: -3800, height: -155, radius: 62, massKg: 0, seed: 89 },
  { key: "viridian-toxic", kind: "planet", appearance: "toxic", x: -4800, y: 1100, height: -175, radius: 68, massKg: 0, seed: 61 },
  { key: "prism-crystal", kind: "planet", appearance: "crystal", x: 5800, y: 3200, height: -140, radius: 54, massKg: 0, seed: 113 },
  { key: "companion-moon", kind: "planet", appearance: "moon", x: -2600, y: 4100, height: -110, radius: 38, massKg: 0, seed: 137 },
  { key: "ember-garden", kind: "planet", appearance: "temperate-volcanic", x: 6800, y: -4200, height: -170, radius: 74, massKg: 0, seed: 157 },
] as const;
// R006 forward envelope: centreline [-6, 8.25], nose 13.65, unchanged aft
// reach -11.4. Geometry offset does not move canonical COM or change inertia.
export const LAB_HULL = { radius: 5.4, halfLength: 7.125, longitudinalOffset: 1.125 };
export const bodyDiscoverable = (
  kind: string,
  x: number,
  y: number,
  shipX: number,
  shipY: number,
) => kind !== "asteroid" || Math.hypot(x - shipX, y - shipY) <= 400;
