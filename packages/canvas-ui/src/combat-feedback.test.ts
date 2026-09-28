import { describe, expect, it } from "vitest";
import { hitText } from "./combat-feedback";

const hit = {
  shotSequence: 3n,
  damage: 12,
  kind: "object",
  label: "Computer core",
  targetState: "damaged",
  targetHp: 31.5,
  targetMaxHp: 80,
};

describe("combat hit feedback", () => {
  it("shows the owner the damage, the component and its live hp", () => {
    expect(hitText(hit)).toBe("-12  Computer core · Damaged 32/80");
  });
  it("shows only the damage dealt when the state is not disclosed", () => {
    expect(
      hitText({ ...hit, targetState: "", targetHp: 0, targetMaxHp: 0 }),
    ).toBe("-12  Computer core");
  });
  it("reports armour that absorbed the shot and a downed crewmate", () => {
    expect(
      hitText({
        ...hit,
        damage: 0,
        targetState: "pristine",
        targetHp: 650,
        targetMaxHp: 650,
        label: "Fusion reactor",
      }),
    ).toBe("No damage  Fusion reactor · Pristine 650/650");
    expect(
      hitText({
        ...hit,
        kind: "character",
        label: "Crewmate",
        targetState: "downed",
        targetMaxHp: 0,
        damage: 10,
      }),
    ).toBe("-10  Crewmate down");
  });
});
