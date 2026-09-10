export type CharacterPresentationStatus =
  "loading" | "ready" | "error" | "disposed";
/** Asset parsing alone is not a personalized frame: the selected equipment and
 * the first fully shaded frame must belong to the current appearance request. */
export function characterPresentationStatus(input: {
  status: CharacterPresentationStatus;
  frameReady: boolean;
  pending: number;
  equipmentRequested: boolean;
  equipmentReady: boolean;
  equipmentFailed: boolean;
}): CharacterPresentationStatus {
  if (input.status !== "ready") return input.status;
  if (input.equipmentFailed) return "error";
  if (
    !input.frameReady ||
    input.pending > 0 ||
    (input.equipmentRequested && !input.equipmentReady)
  )
    return "loading";
  return "ready";
}
