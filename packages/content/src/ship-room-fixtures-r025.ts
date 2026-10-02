/** Finite proposal furniture; no inventory, storage, control or seat capability. */
export const REFERENCE_ROOM_FIXTURE_CATALOG_R025 = Object.freeze({
  id: "sidereal.reference-room-fixtures@r025",
  entries: Object.freeze([
    Object.freeze({
      designId: "shipyard.equipment.workshop-bank-r025",
      revision: "r025",
      texels: Object.freeze([52, 16, 32] as const),
      kind: "furniture",
      control: false,
      storage: false,
      seat: false,
      facingConvention: "operator-looks-to-back",
    } as const),
    Object.freeze({
      designId: "shipyard.equipment.medical-equipment-bank-r025",
      revision: "r025",
      texels: Object.freeze([20, 20, 32] as const),
      kind: "furniture",
      control: false,
      storage: false,
      seat: false,
      facingConvention: "access-faces-room",
    } as const),
  ] as const),
});

export function referenceRoomFixtureR025(designId: string) {
  return REFERENCE_ROOM_FIXTURE_CATALOG_R025.entries.find(
    (entry) => entry.designId === designId,
  );
}
