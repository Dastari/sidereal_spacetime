import { emptyLayout, stampTile, type Point } from "./ship-layout";

/** A concrete, compiler-valid native doorway integration fixture. This document
 * is not a construction publication or a grant of pressure/door authority. */
export function createDoorway250ReviewLayout() {
  const doc = emptyLayout("doorway250-review", "doorway250-main");
  const deckId = doc.playableDeckId;
  doc.name = "Native doorway review";
  doc.decks[0].ceiling = 102;
  doc.decks[0].name = "Doorway test deck";
  const locations: Point[] = [
    [0, 0],
    [64, 0],
    [128, 0],
    [0, 64],
    [64, 64],
    [128, 64],
  ];
  doc.tiles = locations.map((origin, i) =>
    stampTile("doorway250-floor-" + i, deckId, "rectangle", origin),
  );
  const partitionId = "doorway250-bulkhead";
  doc.partitions = [
    {
      id: partitionId,
      deckId,
      a: [0, 64],
      b: [192, 64],
      seal: "design-sealed",
    },
  ];
  doc.openings = [
    {
      id: "doorway250-opening",
      deckId,
      partitionId,
      kind: "door",
      a: [76, 64],
      b: [116, 64],
      clearance: 32,
      sill: 0,
      setback: 12,
    },
  ];
  doc.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "doorway250-review-envelope",
      name: "Doorway review envelope",
      revision: "r001",
      width: 192,
      length: 128,
      height: 112,
      origin: [0, 0, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId,
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    boundaryTreatments: [
      {
        id: "doorway250-west-reservation",
        deckId,
        source: "partition",
        sourceAnchorId: partitionId,
        a: [0, 64],
        b: [76, 64],
        treatment: "auto",
        reservationSide: "center",
      },
      {
        id: "doorway250-east-reservation",
        deckId,
        source: "partition",
        sourceAnchorId: partitionId,
        a: [116, 64],
        b: [192, 64],
        treatment: "auto",
        reservationSide: "center",
      },
    ],
  };
  doc.rooms = [
    {
      id: "doorway250-south",
      deckId,
      name: "South bay",
      type: "utility",
      seed: [96, 32],
      tileIds: doc.tiles.slice(0, 3).map((t) => t.id),
      boundaryIds: [],
      access: "crew",
      floorTheme: "pale",
      wallTheme: "pale",
    },
    {
      id: "doorway250-north",
      deckId,
      name: "North bay",
      type: "utility",
      seed: [96, 96],
      tileIds: doc.tiles.slice(3).map((t) => t.id),
      boundaryIds: [],
      access: "crew",
      floorTheme: "pale",
      wallTheme: "pale",
    },
  ];
  return doc;
}
