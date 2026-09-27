import { requireQualifiedPreservedFuelMount } from "@sidereal/sim/wayfarer-refit-mount";
import {
  compileDeckCollision,
  resolveDeckCollision,
} from "@sidereal/sim/construction-collision";
import { t } from "spacetimedb/server";
import {
  WAYFARER_REBUILD_SOURCE,
  WAYFARER_REBUILD_SHA256,
} from "@sidereal/sim/wayfarer-rebuild-contract";
import { planWayfarerRebuildGame } from "@sidereal/sim/wayfarer-rebuild-game";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
import { WAYFARER_V1_NOZZLES } from "@sidereal/content/wayfarer-nozzles";
import { WAYFARER_PHYSICAL_CATALOG } from "@sidereal/content/physical-definitions";
import type { ComputerDefinition } from "@sidereal/sim/flight-definition";
import {
  CONSTRUCTION_FLIGHT_DEFINITION,
  CONSTRUCTION_FLIGHT_DEFINITION_SHA256,
} from "@sidereal/sim/construction-flight";
import removals from "@sidereal/content/wayfarer-rebuild-removals.json";
import {
  offerWayfarerRebuildRefit,
  refitWayfarerRebuild,
  type WayfarerRebuildRefitHooks,
  type RebuildRefitReadContext,
} from "./wayfarer-rebuild-refit";

let cached: WayfarerRebuildRefitHooks | undefined;
export function qualifiedWayfarerRebuildHooks(): WayfarerRebuildRefitHooks {
  if (cached) return cached;
  const snapshot = compileConstruction(JSON.stringify(WAYFARER_REBUILD_SOURCE));
  if (snapshot.sha256 !== WAYFARER_REBUILD_SHA256)
    throw Error("Rebuilt template pin mismatch");
  return (cached = {
    target: {
      canonical: snapshot.canonical,
      sha256: snapshot.sha256,
      blueprintId: "trusted-wayfarer-rebuild-r002",
      removableStructuralSourceIds: removals,
    },
    qualify(document, state) {
      compileConstruction(JSON.stringify(document));
      const geometry = planWayfarerRebuildGame(document);
      if (state.doors.length)
        throw Error(
          "Existing operational doors require a matching rebuilt door interface",
        );
      if (state.attachments.length > 1)
        throw Error("Unsupported additional fuel mounts");
      const tanks = state.attachments.map((a) => {
        const container = state.containers.find((c) => c.id === a.containerId);
        if (
          !container ||
          container.kind !== "liquid" ||
          a.deckId !== geometry.instanceFrame.deckId
        )
          throw Error("Preserved fuel container binding differs");
        requireQualifiedPreservedFuelMount({
          baseSha256: WAYFARER_REBUILD_SHA256,
          assetId: a.assetId,
          assetSha256: a.assetSha256,
          x: a.x,
          y: a.y,
          z: a.z,
          capacityLitres: container.capacityLitres,
          maxMassKg: container.maxMassKg,
        });
        return {
          id: a.id,
          definitionId: a.assetId,
          vertices: [
            [-3.5, 6.5],
            [-2.5, 6.5],
            [-2.5, 7.5],
            [-3.5, 7.5],
          ] as [number, number][],
        };
      });
      const frame = resolveDeckCollision(
        compileDeckCollision(document.layout, geometry.instanceFrame.deckId, {
          shipId: state.instance.id,
          perimeterHalfWidthM: 0,
          partitionHalfWidthM: 0,
          obstacles: [...geometry.instanceObstacles, ...tanks],
        }),
        [],
      );
      for (const actor of state.actors) {
        const location = state.locations.find(
          (l) => l.characterId === actor.id,
        );
        if (
          !location ||
          location.deckId !== geometry.instanceFrame.deckId ||
          !canOccupyDeck(
            frame,
            {
              shipId: state.instance.id,
              deckId: location.deckId,
              position: [actor.localX, actor.localY],
            },
            0.3,
          )
        )
          throw Error(
            "Actor must stand in a clear retained floor area before refit",
          );
      }
      if (
        state.flight.definitionId !== CONSTRUCTION_FLIGHT_DEFINITION ||
        state.flight.definitionSha256 !== CONSTRUCTION_FLIGHT_DEFINITION_SHA256
      )
        throw Error("Preserved development flight definition mismatch");
      const consolePart = document.layout.assembly!.parts.find(
        (p) => p.id === geometry.identities["equipment-control-console"],
      );
      const computer = WAYFARER_PHYSICAL_CATALOG.definitions.find(
        (d) =>
          d.kind === "computer" && d.id === "physical:" + consolePart?.assetId,
      ) as ComputerDefinition | undefined;
      if (!computer)
        throw Error("Missing retained computer physical definition");
      const expected = [
        {
          id: "computer-flight-01",
          placed: "equipment-control-console",
          definition: computer.fittingDefinitionId,
        },
        ...WAYFARER_V1_NOZZLES.map((a) => ({
          id: a.id,
          placed: a.id,
          definition: a.definitionId,
        })),
      ];
      if (
        state.fittings.length !== expected.length ||
        expected.some(
          (e) =>
            !state.fittings.some(
              (f) =>
                f.sourceDeviceId === e.id &&
                f.placedObjectId === geometry.identities[e.placed] &&
                f.definitionId === e.definition,
            ),
        ) ||
        state.flightStation.seatPlacedObjectId !==
          geometry.identities["equipment-control-seat"] ||
        state.flightStation.consolePlacedObjectId !==
          geometry.identities["equipment-control-console"]
      )
        throw Error("Retained pilot or actuator installation differs");
      return {
        definitionId: CONSTRUCTION_FLIGHT_DEFINITION,
        definitionSha256: CONSTRUCTION_FLIGHT_DEFINITION_SHA256,
        doors: [],
      };
    },
  });
}
export const wayfarerRebuildOfferProjection = t.object(
  "WayfarerRebuildOfferProjection",
  {
    shipId: t.string(),
    eligible: t.bool(),
    reason: t.string(),
    expectedInstanceRevision: t.u64(),
    expectedShipRevision: t.u64(),
    fingerprint: t.string(),
    targetSha256: t.string(),
    reportJson: t.string(),
  },
);
export function ownWayfarerRebuildOffer(ctx: RebuildRefitReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor) return [];
  const instance = ctx.db.constructionInstance.id.find(actor.shipId);
  if (!instance || instance.blueprintSha256 === WAYFARER_REBUILD_SHA256)
    return [];
  try {
    const offer = offerWayfarerRebuildRefit(
      ctx,
      actor.shipId,
      qualifiedWayfarerRebuildHooks(),
    );
    return [
      {
        shipId: actor.shipId,
        eligible: true,
        reason: "",
        expectedInstanceRevision: offer.expectedInstanceRevision,
        expectedShipRevision: offer.expectedShipRevision,
        fingerprint: offer.fingerprint,
        targetSha256: offer.targetSha256,
        reportJson: JSON.stringify(offer, (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      },
    ];
  } catch (error) {
    return [
      {
        shipId: actor.shipId,
        eligible: false,
        reason: String(error),
        expectedInstanceRevision: instance.revision,
        expectedShipRevision: 0n,
        fingerprint: "",
        targetSha256: WAYFARER_REBUILD_SHA256,
        reportJson: "",
      },
    ];
  }
}
export function applyWayfarerRebuild(
  ctx: Parameters<typeof refitWayfarerRebuild>[0],
  args: Parameters<typeof refitWayfarerRebuild>[1],
) {
  refitWayfarerRebuild(ctx, args, qualifiedWayfarerRebuildHooks());
}
