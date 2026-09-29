import { expect, test } from "vitest";
import { mergeCrewAppearance, resolveCrewAppearance } from "./appearance";

test("legacy defaults are adult and neutral, while uniform changes preserve explicit personal choices", () => {
  expect(resolveCrewAppearance({})).toMatchObject({
    eyes: "#754c2b",
    expression: "neutral",
    faceDetail: "none",
    facialHair: "none",
    faceAge: "adult",
  });
  const personal = {
    bodyType: "female",
    hairStyle: "bob",
    skin: "#764e3b",
    hair: "#ff2497",
    eyes: "#29d9ef",
    expression: "determined",
    faceDetail: "scar",
    facialHair: "goatee",
    faceAge: "mature",
  } as const;
  const next = mergeCrewAppearance(
    { ...personal, outfit: "engineer", armor: "heavy", weapon: "rifle" },
    { outfit: "medic" },
  );
  expect(next).toMatchObject({ ...personal, outfit: "medic", weapon: "rifle" });
  expect(next.armor).toBeUndefined();
  expect(resolveCrewAppearance(next).armor).toBe("medical");
  expect(
    mergeCrewAppearance(next, {
      outfit: "captain",
      eyes: "#ff0000",
      facialHair: "none",
    }),
  ).toMatchObject({ ...personal, eyes: "#ff0000", facialHair: "none" });
  // Presets can still supply features until the character explicitly chooses them.
  expect(
    mergeCrewAppearance({ outfit: "engineer" }, { outfit: "scientist" }).hair,
  ).toBeUndefined();
});
