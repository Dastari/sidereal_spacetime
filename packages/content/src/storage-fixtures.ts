/** Floor-standing 2×2 cargo layout; original height-encoded IDs remain stable.
 * Existing placed cargo IDs. Limits retain the development inventory fixture;
 * they are not approved physical payload ratings from the cargo art collection. */
export const LAB_STORAGE_FIXTURES = [
  {
    placementId: "room-storage-container-2.15-0.25",
    name: "Storage supply crate",
    x: -4.0625,
    y: 2.0625,
  },
  {
    placementId: "room-storage-container-2.15-1",
    name: "Upper storage crate A",
    x: -3.3125,
    y: 2.0625,
  },
  {
    placementId: "room-storage-container-3.5-0.25",
    name: "Storage crate B",
    x: -4.0625,
    y: 3.4375,
  },
  {
    placementId: "room-storage-container-3.5-1",
    name: "Upper storage crate B",
    x: -3.3125,
    y: 3.4375,
  },
].map((fixture) => ({
  ...fixture,
  approachX: -2.25,
  approachY: fixture.y,
  width: 14,
  height: 14,
  maxMassKg: 500,
}));
