import { canReachOnDeck } from "@sidereal/sim/construction-collision";
import { interactionLineOfSight } from "@sidereal/sim/interactions";
import { CABIN_PARTITIONS } from "@sidereal/content/interior";
import {
  readGroundPlacement,
  writeGroundPlacement,
} from "@sidereal/sim/ground-placement";
import {
  isQualifiedWayfarerBlueprint,
  qualifiedWayfarerInstanceObstacles,
} from "@sidereal/sim/wayfarer-walking-bindings";
import { readCargo } from "./scoped-inventory-authority";
import { resolveCargoAccess } from "./scoped-inventory";
import type { access } from "./inventory";
type Context = Parameters<typeof access>[0];
type Actor = { id: string; shipId: string; localX: number; localY: number };
type Container = {
  id: string;
  shipId: string;
  parentItemId: string;
  carried: boolean;
  localX: number;
  localY: number;
};

/** One request-scoped adapter shared by discovery, nested container access and
 * ground mutations. Native failure never falls back to the historical lab. */
export function createGroundAccess(ctx: Context, actor: Actor, nowMicros = 0n) {
  function native() {
    const visit = ctx.db.constructionLocation?.characterId.find(actor.id);
    const instance = ctx.db.constructionInstance?.id.find(actor.shipId);
    const knownNative =
      !!visit ||
      !!instance ||
      !!ctx.db.gameShipAccess?.shipId.find(actor.shipId);
    if (!knownNative) return { kind: "legacy" as const };
    try {
      const reader = readCargo(ctx, nowMicros),
        scope = resolveCargoAccess(reader);
      if ("ok" in scope) throw new Error(scope.error.message);
      if (ctx.db.constructionPilotSeat.characterId.find(actor.id))
        throw new Error("Stand up before using ground items");
      const geometry = reader.geometry(scope.instanceId, scope.deckId);
      if (!geometry?.supportHeightAt)
        throw new Error("Native ground support unavailable");
      return { kind: "native" as const, scope, geometry, instance };
    } catch (error) {
      return {
        kind: "unavailable" as const,
        reason:
          error instanceof Error
            ? error.message
            : "Native ground access unavailable",
      };
    }
  }
  let cached: ReturnType<typeof native> | undefined;
  const current = () => (cached ??= native());
  let historical: boolean | undefined;
  function historicalWayfarer(
    mode: Extract<ReturnType<typeof native>, { kind: "native" }>,
  ) {
    if (historical !== undefined) return historical;
    historical = false;
    const { instance, scope } = mode;
    if (
      !instance ||
      !isQualifiedWayfarerBlueprint(instance.blueprintSha256) ||
      instance.id !== scope.instanceId
    )
      return false;
    try {
      const decks = JSON.parse(instance.documentJson).layout.decks;
      const deck = ctx.db.constructionDeck.id.find(scope.deckId);
      if (
        decks.length === 1 &&
        decks[0].id === scope.deckId &&
        decks[0].elevation === 0 &&
        deck?.instanceId === instance.id &&
        deck.elevation === 0
      ) {
        // Only historical wrappers need the immutable source+UUID proof. New
        // wrappers already carry an explicit instance/deck/support qualification.
        qualifiedWayfarerInstanceObstacles(instance, scope.deckId);
        historical = true;
      }
    } catch {
      /* An altered or ambiguous historical source stays inaccessible. */
    }
    return historical;
  }
  function position(
    container: Container,
    binding: { placementId: string },
    maximumDistanceM: number,
  ) {
    const placement = readGroundPlacement(binding.placementId);
    if (
      !placement ||
      container.shipId !== actor.shipId ||
      container.parentItemId ||
      container.carried
    )
      return;
    const item = ctx.db.inventoryItem.id.find(placement.itemId);
    if (
      !item ||
      item.characterId !== actor.id ||
      item.containerId !== container.id ||
      item.equipmentSlot
    )
      return;
    const mode = current();
    if (mode.kind === "unavailable") return;
    if (mode.kind === "legacy") {
      if (
        placement.version !== 1 ||
        Math.hypot(
          container.localX - actor.localX,
          container.localY - actor.localY,
        ) > maximumDistanceM ||
        !interactionLineOfSight(
          actor.localX,
          actor.localY,
          container.localX,
          container.localY,
          CABIN_PARTITIONS,
        )
      )
        return;
      return { instanceId: "", deckId: "", elevationM: 0.16 };
    }
    const { scope, geometry } = mode;
    if (
      container.shipId !== scope.instanceId ||
      (placement.version === 2
        ? placement.instanceId !== scope.instanceId ||
          placement.deckId !== scope.deckId
        : !historicalWayfarer(mode))
    )
      return;
    const from = {
      shipId: scope.instanceId,
      deckId: scope.deckId,
      position: [actor.localX, actor.localY] as [number, number],
    };
    const to = {
      ...from,
      position: [container.localX, container.localY] as [number, number],
    };
    if (!canReachOnDeck(geometry.frame, from, to, maximumDistanceM)) return;
    try {
      const elevationM = geometry.supportHeightAt!(
        container.localX,
        container.localY,
      );
      if (
        !Number.isFinite(elevationM) ||
        (placement.version === 2 &&
          Math.abs(placement.elevationM - elevationM) > 0.05)
      )
        return;
      return { instanceId: scope.instanceId, deckId: scope.deckId, elevationM };
    } catch {
      return;
    }
  }
  return {
    position,
    drop(itemId: string) {
      const mode = current();
      if (mode.kind === "unavailable") throw new Error(mode.reason);
      if (mode.kind === "legacy")
        return writeGroundPlacement({ version: 1, itemId });
      const elevationM = mode.geometry.supportHeightAt!(
        actor.localX,
        actor.localY,
      );
      if (!Number.isFinite(elevationM))
        throw new Error("Native ground support unavailable");
      return writeGroundPlacement({
        version: 2,
        itemId,
        instanceId: mode.scope.instanceId,
        deckId: mode.scope.deckId,
        elevationM,
      });
    },
  };
}
