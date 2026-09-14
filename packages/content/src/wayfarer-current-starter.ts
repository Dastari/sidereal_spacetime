import source from "./wayfarer-rebuild-r002.json";
import { WAYFARER_STARTER } from "./wayfarer-starter";

/** Current onboarding choice. The old immutable template remains migration history. */
export const CURRENT_WAYFARER_STARTER = Object.freeze({
  entitlement: WAYFARER_STARTER.entitlement,
  blueprintId: "trusted-wayfarer-rebuild-r002",
  sourceDeckId: "wayfarer-main-deck",
  sha256: "56e485c9a9d49b5aa0c5e44a47f88916296896717df386b7240baf408e28ae44",
  documentJson: JSON.stringify(source),
});
export type WayfarerStarterTemplate =
  typeof WAYFARER_STARTER | typeof CURRENT_WAYFARER_STARTER;
