/**
 * Pinned interaction definitions (roadmap X-3b, wiki `Systems/Content Definitions`). Interaction
 * objects pin `interaction:<kind>@<revision>`; reach and the verbs offered come from the pinned
 * revision. No pin row: revision 1, the seed (`INTERACTION_SEED`), which equals the rules in
 * code. New objects pin the current revision. Behaviour of each verb stays in code.
 */
import type { InferSchema, ReducerCtx, ViewCtx } from "spacetimedb/server";
import type world from "./index";
import { INTERACTION_SEED } from "@sidereal/content/content-definition-seed";
import type { InteractionRules } from "@sidereal/sim/interactions";

type Context = ReducerCtx<InferSchema<typeof world>>;
type Db = Pick<ViewCtx<InferSchema<typeof world>>, "db">["db"];

function rulesOf(
  payload: Record<string, unknown> | undefined,
): InteractionRules | undefined {
  if (!payload) return undefined;
  return {
    reachM: Number(payload.reachM),
    verbs: (payload.verbs as { id: string }[]).map((v) => v.id),
  };
}
/** Reach and verbs of an interaction object (its pin, or the seed). */
export function interactionRules(
  db: Db,
  objectId: string,
  kind: string,
): InteractionRules | undefined {
  const pin = db.interactionObjectPin.objectId.find(objectId);
  const revision = pin && pin.definitionId === kind ? pin.revision : 1n;
  const row = db.contentDefinition.definitionRef.find(
    `interaction:${kind}@${revision}`,
  );
  if (row) return rulesOf(JSON.parse(row.payloadJson));
  return revision === 1n ? rulesOf(INTERACTION_SEED[kind]) : undefined;
}
/** Pin a newly created interaction object to the kind's current revision (1 when unpublished). */
export function pinNewInteractionObject(
  ctx: Context,
  objectId: string,
  kind: string,
) {
  const head = ctx.db.contentDefinitionHead.definitionKey.find(
    `interaction:${kind}`,
  );
  const revision =
    head && head.latestRevision > 0n && head.currentRevision > 0n
      ? head.currentRevision
      : 1n;
  ctx.db.interactionObjectPin.insert({
    objectId,
    definitionId: kind,
    revision,
    pinnedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
