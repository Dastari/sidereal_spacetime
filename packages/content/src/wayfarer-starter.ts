import source from "./wayfarer-starter-r001.json";

/** Server content pin, never a client-supplied draft or newest-art lookup. */
export const WAYFARER_STARTER = Object.freeze({
  entitlement: "personal-wayfarer-starter-v1",
  blueprintId: "trusted-wayfarer-starter-r001",
  sourceDeckId: "wayfarer-main-deck",
  sha256: "362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340",
  // Immutable string prevents a caller mutating the imported JSON singleton.
  documentJson: JSON.stringify(source),
});
