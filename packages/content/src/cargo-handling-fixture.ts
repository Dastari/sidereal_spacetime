import document from "./cargo-handling-fixture-r001.json";
/** Explicit technical fixture, not a new normal Wayfarer layout or pressure approval. */
export const CARGO_HANDLING_FIXTURE = {
  id: "cargo-handling-qualification-r001",
  sourceDeckId: "cargo-handling-deck",
  sha256: "b2b413fa0e924cd72cde266a2e72525c78bfa199d53f799751ce5b4f9eba3ea0",
  documentJson: JSON.stringify(document),
  gridDefinitionSha256:
    "7153e957c6e766d11089b00e202d735e1cb064f5895c44f52ba50edaacf9a5fb",
  grid: {
    footprint: [
      [0, 0],
      [192, 0],
      [192, 128],
      [0, 128],
    ],
    baseZ: 6,
    roofZ: 96,
    horizontalStepUnits: 32,
    snapOrigin: [0, 0],
    acceptedFamilies: ["carrier-pad-075-grid1m-r000"],
    maxLoadKg: 5000,
    bearingPatches: [
      { id: "deck-bearing", rect: [0, 0, 192, 128], maxLoadKg: 5000 },
    ],
    reservedVolumes: [],
  },
} as const;
