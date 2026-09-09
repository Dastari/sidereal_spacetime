import { describe, expect, it } from "vitest";
import { sharedWorldJoinDecision } from "./shared-world-review";
const fixture = () => ({
  active: true,
  admissionReady: true,
  inConstructionReview: false,
  characters: [{ id: "actor", shipId: "own", connected: true }],
  ships: [
    { id: "unrelated", revision: 99n },
    { id: "own", revision: 7n },
  ],
  admissions: [] as {
    characterId: string;
    shipId: string;
    systemId: string;
    revision: bigint;
  }[],
});
describe("explicit shared-system review join", () => {
  it("uses the active actor's ship and current accepted revisions", () => {
    const input = fixture();
    expect(sharedWorldJoinDecision(input)).toEqual({
      kind: "join",
      args: {
        characterId: "actor",
        shipId: "own",
        expectedShipRevision: 7n,
        expectedAdmissionRevision: 0n,
      },
    });
    input.ships[1]!.revision = 8n;
    expect(sharedWorldJoinDecision(input)).toMatchObject({
      args: { expectedShipRevision: 8n },
    });
  });
  it("waits for an applied empty admission view, not merely an empty cache", () => {
    expect(
      sharedWorldJoinDecision({ ...fixture(), admissionReady: false }).kind,
    ).toBe("blocked");
    expect(sharedWorldJoinDecision({ ...fixture(), active: false }).kind).toBe(
      "blocked",
    );
  });
  it("skips matching admitted actor/ship instead of submitting a conflicting second join", () => {
    const input = fixture();
    input.admissions.push({
      characterId: "actor",
      shipId: "own",
      systemId: "accepted-system",
      revision: 3n,
    });
    expect(sharedWorldJoinDecision(input)).toEqual({
      kind: "admitted",
      admission: input.admissions[0],
    });
  });
  it("does not transfer another actor or ship implicitly", () => {
    const input = fixture();
    input.admissions.push({
      characterId: "other",
      shipId: "own",
      systemId: "system",
      revision: 3n,
    });
    expect(sharedWorldJoinDecision(input).kind).toBe("blocked");
    input.admissions[0]!.characterId = "actor";
    input.admissions[0]!.shipId = "other";
    expect(sharedWorldJoinDecision(input).kind).toBe("blocked");
  });
  it("rejects ambiguous actors, missing matching ship and native review visits", () => {
    const input = fixture();
    input.characters.push({ id: "other", shipId: "own", connected: true });
    expect(sharedWorldJoinDecision(input).kind).toBe("blocked");
    expect(
      sharedWorldJoinDecision({
        ...fixture(),
        ships: [{ id: "unrelated", revision: 1n }],
      }).kind,
    ).toBe("blocked");
    expect(
      sharedWorldJoinDecision({ ...fixture(), inConstructionReview: true })
        .kind,
    ).toBe("blocked");
  });
});
