import type { ConstructionDocument } from "@sidereal/content/construction";
import proof from "./wayfarer-refit-fuel-proof.json";
import { REFIT_FUEL_ATTACHMENT } from "./wayfarer-refit-audit";
import {
  WAYFARER_REBUILD_SHA256,
  WAYFARER_REBUILD_SOURCE,
} from "./wayfarer-rebuild-contract";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";
import { canOccupyDeck, deckLineOfSight } from "./construction-collision";
import { stableStringify } from "./layout-geometry";

const ROOF_TRANSITION = {
  key: "wayfarer-rebuild-r001/cockpit-roof-step",
  path: "assets/art-library/designs/shipyard.structure.wayfarer-transition/revisions/r003/wayfarer-transition.glb",
  sha256: "cf008a583532494febff62ee58ce5cdb2e065d5095a08748efebca54d4ab8922",
  // Exported native node transforms + POSITION accessors; not the .5625m
  // part height interpreted as a ground-standing obstacle.
  minimumElevationM: 2.625,
} as const;
export const WAYFARER_REBUILD_FUEL_MOUNT = Object.freeze({
  definitionId: "preserved-fuel-floor-mount-wayfarer-rebuild-r002",
  baseSha256: WAYFARER_REBUILD_SHA256,
  assetId: REFIT_FUEL_ATTACHMENT.assetId,
  assetSha256: REFIT_FUEL_ATTACHMENT.glbSha256,
  footprintM: [1, 1] as const,
  capacityLitres: 100,
  maxMassKg: 80,
  stacking: false as const,
  qualification:
    "native-separation-supported-static-floor-and-conserved-load-limit" as const,
});
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw Error("Wayfarer rebuilt fuel mount: " + message);
}

/** Additive qualification for the unchanged conserved tank, never a generic mount
 * or a new payload rating. Old native volume separation remains valid only for
 * the exact retained native subset and unchanged floor support checked by the
 * game adapter. New walls and roofs receive independent separation checks here.
 * Does not authorize a live refit, manufacture fuel or grant inventory access. */
export function qualifyWayfarerRebuildFuelMount(
  document: ConstructionDocument = WAYFARER_REBUILD_SOURCE,
) {
  const game = planWayfarerRebuildGame(document);
  requireMatch(
    game.sourceSha256 === WAYFARER_REBUILD_SHA256,
    "exact rebuilt source required",
  );
  requireMatch(
    proof.schema === "sidereal.refit-fuel-layout-proof.v1" &&
      proof.baseSha256 ===
        "362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340" &&
      proof.assetSha256 === WAYFARER_REBUILD_FUEL_MOUNT.assetSha256 &&
      proof.nativeVolumeSeparation &&
      proof.nominalFloorCoverage &&
      proof.checkedNativeGroups === 1047 &&
      stableStringify(proof.positionM) === stableStringify([-3, 7, 0.1875]) &&
      stableStringify(proof.reservationM) === stableStringify([1, 1]) &&
      stableStringify(proof.approachM) === stableStringify([-1.875, 7]) &&
      stableStringify(proof.nativeHeightRangeM) ===
        stableStringify([0.1875, 1.0514999628067017]),
    "original native tank volume certificate changed",
  );
  const frame = game.sourceFrame;
  const loc = (position: [number, number]) => ({
    shipId: frame.shipId,
    deckId: frame.deckId,
    position,
  });
  // Circumscribed circle encloses the entire 1x1m square. A point in the exact
  // floor union with this clearance from every boundary proves whole-footprint
  // support and conservative separation from all new wall reservations.
  requireMatch(
    canOccupyDeck(frame, loc([-3, 7]), Math.SQRT1_2),
    "supported tank footprint and new-wall clearance required",
  );
  requireMatch(
    canOccupyDeck(frame, loc([-1.875, 7]), 0.3) &&
      1.125 >= Math.SQRT1_2 + 0.3 &&
      deckLineOfSight(frame, loc([-3, 7]), loc([-1.875, 7])),
    "tank approach and reach corridor obstructed",
  );
  const roofs = game.nativeVisualRequests.filter((r) => r.role === "roof");
  requireMatch(
    roofs.length === game.mainRoofBindings.length + 1 &&
      game.nativeSourcePins[ROOF_TRANSITION.path] === ROOF_TRANSITION.sha256,
    "complete exact new native roof coverage required",
  );
  for (const roof of roofs) {
    if (roof.key === ROOF_TRANSITION.key) {
      requireMatch(
        roof.quarterTurns === 0 && stableStringify(roof.originM) === "[0,0,0]",
        "exact native roof transition transform required",
      );
      requireMatch(
        proof.nativeHeightRangeM[1] < ROOF_TRANSITION.minimumElevationM,
        "tank intersects native cockpit roof transition",
      );
    } else {
      requireMatch(
        game.mainRoofBindings.some(
          (r) => r.id === roof.id && r.key === roof.key,
        ) &&
          roof.originM[2] === 3.1875 &&
          proof.nativeHeightRangeM[1] < roof.originM[2],
        "tank intersects new main roof",
      );
    }
  }
  return WAYFARER_REBUILD_FUEL_MOUNT;
}
