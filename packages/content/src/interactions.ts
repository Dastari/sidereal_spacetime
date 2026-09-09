/** Approved placed-object identities from shipyard-equipment/publication.json.
 * This fixture metadata is separate from external agents' model assets. */
export const LAB_INTERACTIONS = [
  {
    placementId: "room-lounge",
    assetId: "part-73df516feb786d73fc5e",
    name: "Lounge sofa",
    kind: "seat",
    x: 3.6875,
    y: 3,
    approachX: 2.25,
    approachY: 3,
    seatX: 3.3,
    seatY: 3,
  },
  ...[
    ["room-hydroponics-tray--2.4", -2.375],
    ["room-hydroponics-tray--1.5", -1.5],
    ["room-hydroponics-tray--0.6", -0.625],
  ].map(([placementId, y]) => ({
    placementId: String(placementId),
    assetId: "part-acbbef7209c4ef100693",
    name: "Hydroponics grow light",
    kind: "light",
    x: -3.6875,
    y: Number(y),
    approachX: -2.4,
    approachY: Number(y),
    seatX: 0,
    seatY: 0,
  })),
] as const;
