import {
  CURRENT_WAYFARER_STARTER,
  type WayfarerStarterTemplate,
} from "@sidereal/content/wayfarer-current-starter";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import {
  planWayfarerStarter,
  type WayfarerStarterPlan,
} from "@sidereal/sim/wayfarer-starter";
import type { GameShipBinding } from "@sidereal/sim/game-ship-access";

export interface StarterActor {
  id: string;
  shipId: string;
  ownerId: string;
}
export interface StarterReceipt {
  ownerId: string;
  entitlement: string;
  characterId: string;
  shipId: string;
  templateSha256: string;
}
/** Synchronous SpacetimeDB transaction adapter. All hooks are trusted server
 * implementations, never reducer inputs. A throwing hook aborts the reducer;
 * this function intentionally catches nothing after writes begin. */
export interface WayfarerStarterRepository {
  ownerId: string;
  requireLiveGame(): void;
  existingCharacters(): readonly StarterActor[];
  receipt(): StarterReceipt | undefined;
  allocateUuid(): string;
  identityExists(id: string): boolean;
  reserveBerth(): Parameters<typeof planWayfarerStarter>[0]["berth"];
  insertInstance(plan: WayfarerStarterPlan): void;
  /** Use the existing native cargo/interaction validators and qualified approach
   * points; consume the planned seeds, never issue contents from old ships. */
  installFunctionalState(plan: WayfarerStarterPlan): void;
  installDormantFlight(plan: WayfarerStarterPlan): void;
  /** Reuse full flight activation preflight, leave station unoccupied. */
  activateQualifiedFlight(plan: WayfarerStarterPlan): void;
  insertCharacterAndStandingLocation(
    plan: WayfarerStarterPlan,
    name: string,
  ): void;
  insertSharedAdmission(plan: WayfarerStarterPlan): void;
  insertGameAccess(binding: GameShipBinding): void;
  /** Calls the existing idempotent personal kit initializer, never lab storage. */
  issuePersonalKitOnce(characterId: string): void;
  insertReceipt(receipt: StarterReceipt): void;
}

/** Exactly one first-character entitlement per verified account. Existing
 * accounts return unchanged, even when their old ship lacks construction data. */
export function createWayfarerStarter(
  db: WayfarerStarterRepository,
  name: string,
  template: WayfarerStarterTemplate = WAYFARER_STARTER,
) {
  db.requireLiveGame();
  if (!db.ownerId || db.ownerId.length > 256)
    throw Error("Verified account required");
  const actors = db.existingCharacters();
  if (actors.length > 1 || actors.some((a) => a.ownerId !== db.ownerId))
    throw Error("Unambiguous owned starter character required");
  const prior = db.receipt();
  const actor = actors[0];
  if (prior) {
    if (
      prior.ownerId !== db.ownerId ||
      prior.entitlement !== WAYFARER_STARTER.entitlement ||
      !new Set<string>([
        WAYFARER_STARTER.sha256,
        CURRENT_WAYFARER_STARTER.sha256,
      ]).has(prior.templateSha256) ||
      !actor ||
      actor.id !== prior.characterId
    )
      throw Error(
        "Starter receipt requires recovery; refusing replacement or duplicate kit",
      );
    // Actor may have deliberately boarded another ship. Never move it on replay.
    return { kind: "existing" as const, actor, receipt: prior };
  }
  if (actor) return { kind: "existing" as const, actor, receipt: undefined };
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40)
    throw Error("Use a character name between 2 and 40 characters");
  const characterId = db.allocateUuid();
  if (db.identityExists(characterId))
    throw Error("Starter character identity already allocated");
  const plan = planWayfarerStarter({
    characterId,
    template,
    berth: db.reserveBerth(),
    allocateUuid: () => db.allocateUuid(),
    identityExists: (id) => db.identityExists(id),
  });
  const receipt: StarterReceipt = {
    ownerId: db.ownerId,
    entitlement: WAYFARER_STARTER.entitlement,
    characterId,
    shipId: plan.instance.instanceId,
    templateSha256: template.sha256,
  };
  db.insertInstance(plan);
  db.installFunctionalState(plan);
  db.installDormantFlight(plan);
  db.activateQualifiedFlight(plan);
  db.insertCharacterAndStandingLocation(plan, clean);
  db.insertSharedAdmission(plan);
  db.insertGameAccess({
    ownerId: db.ownerId,
    characterId,
    shipId: plan.instance.instanceId,
    instanceId: plan.instance.instanceId,
    deckId: plan.instance.spawn.deckId,
    templateSha256: template.sha256,
    instanceRevision: 1n,
    lifecycle: "active",
  });
  db.issuePersonalKitOnce(characterId);
  db.insertReceipt(receipt);
  return {
    kind: "created" as const,
    actor: {
      id: characterId,
      shipId: plan.instance.instanceId,
      ownerId: db.ownerId,
    },
    receipt,
  };
}
