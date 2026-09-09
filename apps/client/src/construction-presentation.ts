import type { NativeStairEgressGeometry } from "@sidereal/render/native-stair-scene";
interface Visit {
  characterId: string;
  visitId: string;
  instanceId: string;
  deckId: string;
  standingElevationM?: number;
}
interface Instance {
  id: string;
  name: string;
  documentJson: string;
}
interface Stair {
  characterId: string;
  instanceId: string;
  visitId: string;
  sourceDeckId: string;
  phase: string;
  x: number;
  y: number;
  z: number;
}
/** Read only the current actor's accepted visit. Revoked full documents are never
 * cached as a substitute for the server's minimum safe-egress projection. */
export function constructionPresentation(
  actorId: string | undefined,
  visits: readonly Visit[],
  instances: readonly Instance[],
  stairs: readonly Stair[],
  egresses: readonly NativeStairEgressGeometry[],
) {
  const visit = actorId
    ? visits.find((v) => v.characterId === actorId)
    : undefined;
  const matches = (v: {
    characterId: string;
    instanceId: string;
    visitId: string;
  }) =>
    !!visit &&
    v.characterId === actorId &&
    v.instanceId === visit.instanceId &&
    v.visitId === visit.visitId;
  const instance = visit
    ? instances.find((i) => i.id === visit.instanceId)
    : undefined;
  const stair = stairs.find(matches);
  const egress = !instance && stair ? egresses.find(matches) : undefined;
  return {
    visit,
    instance,
    stair,
    egress,
    active: !!visit,
    construction:
      instance && visit
        ? {
            instanceId: instance.id,
            documentJson: instance.documentJson,
            deckId: visit.deckId,
            visitId: visit.visitId,
          }
        : undefined,
    acceptedStair: stair ? { ...stair, kind: "stair" as const } : null,
  };
}
