/** Approved native Genesis visual IDs shared by authority and authoring UI.
 * Source pins remain in the reviewed native render catalog; no geometry imports. */
export const CELESTIAL_ASSETS = [
  {
    id: "yellow-main-sequence-r013",
    label: "Yellow Main Sequence Star",
    kind: "star",
    style: "star",
    seed: 3901,
  },
  {
    id: "desert-r014",
    label: "Desert",
    kind: "planet",
    style: "desert",
  },
  {
    id: "rocky-r010",
    label: "Rocky",
    kind: "planet",
    style: "rock",
  },
  {
    id: "ocean-r007",
    label: "Ocean",
    kind: "planet",
    style: "ocean",
  },
  {
    id: "temperate-r003",
    label: "Temperate",
    kind: "planet",
    style: "temperate",
  },
  {
    id: "toxic-r007",
    label: "Toxic",
    kind: "planet",
    style: "toxic",
  },
  {
    id: "crystal-r013",
    label: "Crystal",
    kind: "planet",
    style: "crystal",
  },
  {
    id: "volcanic-r023",
    label: "Volcanic",
    kind: "planet",
    style: "volcanic",
  },
  {
    id: "ice-r026",
    label: "Ice",
    kind: "planet",
    style: "ice",
  },
  {
    id: "gas-r005",
    label: "Gas",
    kind: "planet",
    style: "gas",
  },
  {
    id: "rocky-moon-r002",
    label: "Rocky Moon",
    kind: "planet",
    style: "moon",
  },
  {
    id: "rocky-moon-2-r001",
    label: "Rocky Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "desert-moon-1-r001",
    label: "Desert Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "desert-moon-2-r001",
    label: "Desert Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "gas-giant-moon-1-r005",
    label: "Gas Giant Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "gas-giant-moon-2-r001",
    label: "Gas Giant Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "gas-giant-moon-3-r005",
    label: "Gas Giant Moon 3",
    kind: "planet",
    style: "moon",
  },
  {
    id: "ocean-moon-1-r001",
    label: "Ocean Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "ocean-moon-2-r002",
    label: "Ocean Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "temperate-moon-1-r002",
    label: "Temperate Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "temperate-moon-2-r002",
    label: "Temperate Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "toxic-moon-1-r001",
    label: "Toxic Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "toxic-moon-2-r001",
    label: "Toxic Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "ice-moon-1-r002",
    label: "Ice Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "ice-moon-2-r003",
    label: "Ice Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "volcanic-moon-1-r003",
    label: "Volcanic Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "volcanic-moon-2-r006",
    label: "Volcanic Moon 2",
    kind: "planet",
    style: "moon",
  },
  {
    id: "crystal-moon-1-r010",
    label: "Crystal Moon 1",
    kind: "planet",
    style: "moon",
  },
  {
    id: "crystal-moon-2-r010",
    label: "Crystal Moon 2",
    kind: "planet",
    style: "moon",
  },
] as const;
export function celestialAsset(id: string) {
  return CELESTIAL_ASSETS.find((asset) => asset.id === id);
}
/** Fixed square catalog portraits use the native preview's .52 radian FOV.
 * Compensate its camera framing so the visible sphere reaches its metre radius. */
export function portraitRadiusFraction(id: string | undefined) {
  const asset = id ? celestialAsset(id) : undefined;
  if (!asset) return 1;
  const distance =
    asset.kind === "star"
      ? 2.3 / Math.tan(0.26)
      : asset.style === "gas"
        ? 7.5
        : 5.5;
  return 1 / (Math.sqrt(distance * distance - 1) * Math.tan(0.26));
}
