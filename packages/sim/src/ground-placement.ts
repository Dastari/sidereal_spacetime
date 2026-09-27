/** Private storage-binding payload. Item UUIDs and deck IDs are not parsed by
 * delimiter: older identifiers may themselves contain punctuation. */
export type GroundPlacement =
  | { version: 1; itemId: string }
  | {
      version: 2;
      itemId: string;
      instanceId: string;
      deckId: string;
      elevationM: number;
    };
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 160;
export function readGroundPlacement(
  value: string,
): GroundPlacement | undefined {
  if (!value.startsWith("ground:")) return;
  if (!value.startsWith("ground:v2:")) {
    const itemId = value.slice(7);
    return id(itemId) ? { version: 1, itemId } : undefined;
  }
  if (value.length > 1024) return;
  try {
    const p = JSON.parse(value.slice(10));
    if (
      p &&
      p.version === 2 &&
      id(p.itemId) &&
      id(p.instanceId) &&
      id(p.deckId) &&
      typeof p.elevationM === "number" &&
      Number.isFinite(p.elevationM) &&
      Math.abs(p.elevationM) <= 512
    )
      return {
        version: 2,
        itemId: p.itemId,
        instanceId: p.instanceId,
        deckId: p.deckId,
        elevationM: p.elevationM,
      };
  } catch {
    /* A malformed private binding never becomes legacy access. */
  }
}
export function writeGroundPlacement(value: GroundPlacement): string {
  return value.version === 1
    ? "ground:" + value.itemId
    : "ground:v2:" + JSON.stringify(value);
}
export function retargetGroundPlacement(value: string, itemId: string): string {
  const placement = readGroundPlacement(value);
  if (!placement || !id(itemId))
    throw new Error("Ground placement identity is invalid");
  return writeGroundPlacement({ ...placement, itemId });
}
