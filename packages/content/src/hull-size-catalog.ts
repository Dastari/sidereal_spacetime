import type { HullEnvelope } from "./layout-structure";
/** Editable authoring presets, not hull classes, cost, armor or balance statistics.
 * Bounds include the current canonical Wayfarer floor envelope [-5,5]×[-9,13]m. */
export const HULL_SIZE_CATALOG: readonly HullEnvelope[] = [
  {
    id: "wayfarer-envelope",
    revision: "authoring-1",
    name: "Wayfarer reference envelope",
    width: 320,
    length: 704,
    height: 96,
    origin: [-160, -288, 0],
  },
];
