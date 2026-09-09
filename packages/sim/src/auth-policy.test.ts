import { describe, it, expect } from "vitest";
import { classifyVerifiedClaims } from "./auth-policy";
import { GAME_AUTH_POLICY as policy } from "../../content/src/auth-policy";
describe("verified identity admission", () => {
  const oidc = {
    issuer: policy.issuer,
    subject: "stable-subject",
    audience: [policy.gameAudience],
    expiresSeconds: 2000,
  };
  it("requires the exact issuer and a current game audience; dashboard is not gameplay", () => {
    expect(classifyVerifiedClaims(oidc, 1000, policy)).toMatchObject({
      kind: "oidc",
      game: true,
    });
    expect(
      classifyVerifiedClaims(
        { ...oidc, audience: [policy.dashboardAudience] },
        1000,
        policy,
      ).game,
    ).toBe(false);
    for (const bad of [
      null,
      { ...oidc, issuer: policy.issuer + "/" },
      { ...oidc, audience: ["another-game"] },
      { ...oidc, expiresSeconds: 1000 },
      { ...oidc, expiresSeconds: Infinity },
      { ...oidc, expiresSeconds: 1e30 },
      { ...oidc, subject: "" },
    ])
      expect(() => classifyVerifiedClaims(bad, 1000, policy)).toThrow();
  });
  it("permits local tokens only in the explicit development policy", () => {
    const local = {
      issuer: "localhost",
      subject: "local-account",
      audience: ["spacetimedb"],
    };
    expect(classifyVerifiedClaims(local, 1000, policy)).toMatchObject({
      kind: "development",
      game: true,
    });
    expect(() =>
      classifyVerifiedClaims(local, 1000, { ...policy, mode: "oidc-only" }),
    ).toThrow();
    expect(() =>
      classifyVerifiedClaims(
        { ...local, issuer: "http://localhost" },
        1000,
        policy,
      ),
    ).toThrow();
  });
});
