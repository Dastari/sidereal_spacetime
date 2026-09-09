import { expect, it } from "vitest";
import { onboardingCopy } from "./onboarding-copy";
it("describes real provider persistence and shared entry without lab/private identity claims", () => {
  const copy = onboardingCopy("oidc");
  expect(copy.identity).toContain("Dastari account");
  expect(copy.description).toContain("shared system");
  expect(copy.action).toBe("Enter universe");
  expect(JSON.stringify(copy)).not.toMatch(
    /laboratory|private ship|development identity/i,
  );
});
it("limits the development caveat to a real development connection", () => {
  expect(onboardingCopy("development").identity).toContain(
    "Development identity",
  );
  expect(onboardingCopy().identity).not.toContain("Development");
  expect(onboardingCopy("development").description).toContain("shared system");
});
