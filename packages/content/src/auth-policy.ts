/** Explicit local review policy. OIDC-only production is a separate validated release. */
export const GAME_AUTH_POLICY = {
  mode: "hybrid-development" as "hybrid-development" | "oidc-only",
  issuer: "https://auth.dastari.net/realms/dastari",
  gameAudience: "sidereal-game",
  dashboardAudience: "sidereal-dashboard",
  developmentIssuer: "localhost",
  developmentAudience: "spacetimedb",
} as const;
