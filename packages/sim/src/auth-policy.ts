export type AuthPolicy = {
  mode: "hybrid-development" | "oidc-only";
  issuer: string;
  gameAudience: string;
  dashboardAudience: string;
  developmentIssuer: string;
  developmentAudience: string;
};
export type VerifiedClaims = {
  issuer: string;
  subject: string;
  audience: readonly string[];
  expiresSeconds?: number;
};
export function classifyVerifiedClaims(
  claims: VerifiedClaims | null,
  nowSeconds: number,
  policy: AuthPolicy,
) {
  if (!claims?.subject || !Number.isFinite(nowSeconds))
    throw new Error("Verified authentication required");
  if (
    policy.mode === "hybrid-development" &&
    claims.issuer === policy.developmentIssuer &&
    claims.audience.includes(policy.developmentAudience)
  )
    return {
      kind: "development" as const,
      game: true,
      expiresSeconds: undefined,
    };
  if (claims.issuer !== policy.issuer)
    throw new Error("Authentication issuer rejected");
  if (
    !Number.isSafeInteger(claims.expiresSeconds) ||
    claims.expiresSeconds! > 18446744073709 ||
    claims.expiresSeconds! <= nowSeconds
  )
    throw new Error("Authentication expired");
  if (claims.audience.includes(policy.gameAudience))
    return {
      kind: "oidc" as const,
      game: true,
      expiresSeconds: claims.expiresSeconds,
    };
  if (claims.audience.includes(policy.dashboardAudience))
    return {
      kind: "oidc" as const,
      game: false,
      expiresSeconds: claims.expiresSeconds,
    };
  throw new Error("Authentication audience rejected");
}
