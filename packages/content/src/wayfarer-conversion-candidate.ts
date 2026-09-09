/** Explicit source snapshot for a semantic conversion candidate. Changing these
 * pins requires review; the script must never silently consume newest assets. */
export const WAYFARER_CONVERSION_PIN = {
  id: "wayfarer-semantic-candidate-r001",
  deckId: "wayfarer-main-deck",
  sources: {
    "assets/runtime/assembly/wayfarer.json":
      "1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb",
    "assets/runtime/assembly/catalog.json":
      "f92e1e487106794b188bcb4e5a3e2f0cada7047b81ddfc0ee8bd9434964063ac",
    "assets/runtime/assembly/floor-manifest.json":
      "b652b30b5ba1125798b6eaecf36e6281cced1cff8f0d7ca6fd6a95d05f720302",
    "assets/runtime/assembly/hull-manifest.json":
      "2e275052217da4b20a92ab40a9a9f098dc011557f7611b6b0c6f40f71ea22695",
    "assets/runtime/assembly/equipment-manifest.json":
      "649b0af2d73406dcea29f5954db3b88b9e910eb07ddadee10bf663fc67ee39f9",
    "assets/runtime/assembly/cargo-manifest.json":
      "3441819d90775fc83e2d165deba161ec485c308880c794fa064a10248ffe09d0",
    "assets/art-library/shipyard-floor/r002/specification.json":
      "8c051bfdebd0cef4d963cb2d21299ba5b681285b5ba15e6cc3fe97a9e6cd0e1a",
  },
  placementCount: 262,
  floorCount: 51,
  /** Conservative DESIGN clearance at the lowest installed shoulder roof origin.
   * Native roof/beam/headroom qualification remains an explicit blocking gap. */
  proposedCeilingUnits: 82,
} as const;
export type WayfarerPlacementRole =
  | "structural-floor"
  | "roof-visual"
  | "structural-wall-unqualified"
  | "interior-partition-unqualified"
  | "outer-armor-unrated"
  | "structural-or-armor-unresolved"
  | "interior-equipment"
  | "cargo-container"
  | "external-system"
  | "decoration";
export interface WayfarerConversionGap {
  code: string;
  placedIds: readonly string[];
  requirement: string;
}
