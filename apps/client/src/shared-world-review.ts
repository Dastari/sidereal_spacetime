/** UI decision only; the reducer rechecks ownership, revisions and native visits. */
export function sharedWorldJoinDecision(input: {
  active: boolean;
  admissionReady: boolean;
  inConstructionReview: boolean;
  characters: readonly { id: string; shipId: string; connected: boolean }[];
  ships: readonly { id: string; revision: bigint }[];
  admissions: readonly {
    characterId: string;
    shipId: string;
    systemId: string;
    revision: bigint;
  }[];
}) {
  const blocked = (reason: string) => ({ kind: "blocked" as const, reason });
  if (!input.active || !input.admissionReady)
    return blocked("Waiting for shared-world admission…");
  if (input.inConstructionReview)
    return blocked("Return from construction review first.");
  const actors = input.characters.filter((row) => row.connected);
  if (actors.length !== 1)
    return blocked("A single active character is required.");
  const actor = actors[0]!;
  const ships = input.ships.filter((row) => row.id === actor.shipId);
  if (ships.length !== 1)
    return blocked("The active character’s ship is not available.");
  if (input.admissions.length > 1)
    return blocked("Multiple admissions require explicit character selection.");
  const admission = input.admissions[0];
  if (admission) {
    if (admission.characterId === actor.id && admission.shipId === actor.shipId)
      return { kind: "admitted" as const, admission };
    return blocked(
      "Existing admission belongs to another character or ship; explicit transfer is required.",
    );
  }
  return {
    kind: "join" as const,
    args: {
      characterId: actor.id,
      shipId: actor.shipId,
      expectedShipRevision: ships[0]!.revision,
      expectedAdmissionRevision: 0n,
    },
  };
}
