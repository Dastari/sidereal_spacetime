import { describe, expect, it } from "vitest";
import { constructionPresentation } from "./construction-presentation";

const visit = {
  characterId: "actor",
  visitId: "visit",
  instanceId: "room",
  deckId: "lower",
};
const instance = { id: "room", name: "Room", documentJson: "private document" };
const stair = {
  ...visit,
  sourceDeckId: "lower",
  phase: "stopped",
  x: 3,
  y: 4,
  z: 1,
};
const egress = {
  ...visit,
  stairId: "stairs",
  lowerDeckId: "lower",
  upperDeckId: "upper",
  sourceDeckId: "lower",
  adapterId: "adapter",
  adapterRevision: "revision",
  auditSha256: "audit",
  proofHash: "proof",
};

describe("construction presentation admission", () => {
  it("selects the current actor rather than the first subscribed visit", () => {
    const result = constructionPresentation(
      "actor",
      [{ ...visit, characterId: "other", instanceId: "foreign" }, visit],
      [instance],
      [stair],
      [egress],
    );
    expect(result.construction?.instanceId).toBe("room");
    expect(result.acceptedStair?.z).toBe(1);
    expect(result.egress).toBeUndefined();
  });

  it("replaces revoked private geometry only with the matching minimum egress projection", () => {
    const admitted = constructionPresentation(
      "actor",
      [visit],
      [instance],
      [stair],
      [egress],
    );
    const revoked = constructionPresentation(
      "actor",
      [visit],
      [],
      [stair],
      [egress],
    );
    expect(admitted.construction?.documentJson).toBe("private document");
    expect(revoked.construction).toBeUndefined();
    expect(revoked.egress).toEqual(egress);
    expect(revoked.active).toBe(true);
    expect(JSON.stringify(revoked)).not.toContain("private document");
  });

  it("ignores stale visits and foreign actor geometry after re-entry", () => {
    const result = constructionPresentation(
      "actor",
      [{ ...visit, visitId: "new-visit" }],
      [],
      [stair],
      [egress, { ...egress, characterId: "other", visitId: "new-visit" }],
    );
    expect(result.acceptedStair).toBeNull();
    expect(result.egress).toBeUndefined();
    expect(result.active).toBe(true);
  });

  it("drops all construction state after leaving or losing the actor", () => {
    for (const actor of [undefined, "actor"]) {
      const result = constructionPresentation(
        actor,
        [],
        [instance],
        [stair],
        [egress],
      );
      expect(result.active).toBe(false);
      expect(result.construction).toBeUndefined();
      expect(result.acceptedStair).toBeNull();
      expect(result.egress).toBeUndefined();
    }
  });
});
