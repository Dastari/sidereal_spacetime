import { WAYFARER_REBUILD_SOURCE } from "../../sim/src/wayfarer-rebuild-contract";
import { planLayoutDoorways } from "./layout-doorway-plan";
import { doorwayWallSpans } from "./layout-doorway-walls";
import { planWayfarerRebuildGame } from "../../sim/src/wayfarer-rebuild-game";
import { complexVisualPerimeters } from "./layout-complex-visual-plan";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { INSET_VISUAL_PARTS } from "./inset-visual-registry";
import { supplementalFloor } from "./layout-supplemental-floors";
import {
  compileLayout,
  type CompiledLayout,
} from "@sidereal/sim/layout-compiler";
import { planInsetNativeBoundary } from "@sidereal/sim/layout-inset-native-plan";
import { matchNativeFloorTile } from "@sidereal/sim/layout-native-floor";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { stableStringify } from "@sidereal/sim/layout-geometry";
import type { InsetNativeVisualRequest } from "./inset-native-visuals";

export interface LayoutInsetPreviewInput {
  document: LayoutDocument;
  compiled: CompiledLayout;
  deckId: string;
}
const registry = new Map(INSET_VISUAL_PARTS.map((p) => [p.key, p]));
const structuralShape = (doc: LayoutDocument) => ({
  decks: doc.decks,
  tiles: doc.tiles,
  partitions: doc.partitions,
  openings: doc.openings,
  structure: doc.structure,
});
const rebuiltStructure = stableStringify(
  structuralShape(WAYFARER_REBUILD_SOURCE.layout),
);
/** Immutable visual request mapping. The base native floor is rendered separately. */
export function planLayoutInsetVisuals(input: LayoutInsetPreviewInput): {
  requests: InsetNativeVisualRequest[];
  issues: { key: string; message: string }[];
} {
  const issues: { key: string; message: string }[] = [],
    requests: InsetNativeVisualRequest[] = [];
  const fail = (key: string, message: string) => issues.push({ key, message });
  const result = () => ({
    requests:
      issues.length && !issues.every((issue) => issue.key.startsWith("roof:"))
        ? requests.filter((r) => registry.get(r.key)?.kind === "floor")
        : requests,
    issues,
  });
  const doc = input.document,
    config = doc.structure;
  if (config?.schema !== "sidereal.layout-structure.v2") {
    fail("schema", "Inward native preview requires v2 boundary treatments");
    return result();
  }
  const fresh = compileLayout(doc);
  if (
    !fresh.valid ||
    !input.compiled.valid ||
    fresh.fingerprint !== input.compiled.fingerprint
  ) {
    // Say why the walls are withheld: "invalid" alone sent editors hunting for
    // missing assets when the cause was an overlap two tiles away.
    const errors = fresh.diagnostics.filter((d) => d.severity === "error");
    fail(
      "compiler",
      errors.length
        ? `Native walls stay hidden until the floorplan validates: ${errors.length} error${errors.length === 1 ? "" : "s"} (first: ${errors[0].message})`
        : "Compiled layout is stale; the preview refreshes after the next edit",
    );
    return result();
  }
  const deck = doc.decks.find((d) => d.id === input.deckId),
    profile = config.deckProfiles.find((p) => p.deckId === input.deckId);
  if (
    !deck ||
    !profile ||
    profile.floorThickness !== 6 ||
    profile.roofThickness !== 4 ||
    deck.ceiling !== profile.floorThickness + profile.clearHeight
  ) {
    fail("datum", "Unsupported or mismatched floor/roof/deck profile");
    return result();
  }
  if (deck.holes.length) {
    fail(
      "holes",
      "Native aperture adapters are required for declared deck holes",
    );
    return result();
  }
  if (stableStringify(structuralShape(doc)) === rebuiltStructure) {
    // The authored transition adapters belong to this exact structure. Moving
    // equipment, hull panels or room labels does not change those wall solids.
    // This is visual reuse only; game admission still verifies the whole source.
    return {
      requests: planWayfarerRebuildGame(WAYFARER_REBUILD_SOURCE)
        .nativeVisualRequests,
      issues: [],
    };
  }
  const wallSpans = doorwayWallSpans(
    fresh.walls,
    planLayoutDoorways(doc, deck.id),
  );
  const plan = planInsetNativeBoundary({
    allowDiagonalVisuals: true,
    walls: wallSpans,
    deckId: deck.id,
    elevationUnits: deck.elevation,
    floorThicknessUnits: profile.floorThickness,
    floorPolygons: fresh.tiles
      .filter((t) => t.deckId === deck.id)
      .map((t) => t.vertices),
  });
  const complexFamily = INSET_VISUAL_PARTS.find((p) =>
    p.family.startsWith("complex-"),
  )?.family;
  const complex =
    plan.issues.length && complexFamily
      ? complexVisualPerimeters(wallSpans, deck.id, deck.elevation)
      : undefined;
  issues.push(...(complex ? complex.issues : plan.issues));
  const add = (
    key: string,
    provenance: string,
    originUnits: readonly number[],
    quarterTurns: number,
    yawRadians?: number,
  ) => {
    if (!registry.has(key)) {
      fail(key, "Missing pinned native visual definition");
      return;
    }
    if (requests.length >= 4096) {
      fail("budget", "Native visual request budget exceeded");
      return;
    }
    requests.push({
      id:
        "layout-inset-" +
        constructionHash(
          new TextEncoder().encode(JSON.stringify([deck.id, key, provenance])),
        ),
      key,
      originM: originUnits.map((v) => v / 32) as [number, number, number],
      quarterTurns,
      ...(yawRadians === undefined ? {} : { yawRadians }),
    });
  };
  for (const p of complex?.placements ?? [])
    add(
      complexFamily + "/" + p.profileId + "-q" + p.quarterHeight,
      p.key,
      p.originUnits,
      p.quarterTurns,
      p.yawRadians,
    );
  for (const p of complex ? [] : plan.placements)
    add(
      p.family + "/" + p.profileId + "-q" + p.quarterHeight,
      p.key,
      p.originUnits,
      p.quarterTurns,
      p.yawRadians,
    );
  for (const tile of fresh.tiles
    .filter((t) => t.deckId === deck.id)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const binding = matchNativeFloorTile(
      tile,
      deck.elevation,
      config.tileStyles[tile.id]?.model,
    );
    const extra = !binding
      ? supplementalFloor(tile, config.tileStyles[tile.id]?.model)
      : undefined;
    if (extra) {
      add(
        extra.key,
        "supplemental-floor:" + tile.id,
        [...extra.origin, deck.elevation],
        extra.quarterTurns,
      );
      if (deck.roof) {
        const roof = INSET_VISUAL_PARTS.find(
          (p) =>
            p.family === "legacy-roof-r002" &&
            p.profileId === registry.get(extra.key)?.profileId,
        );
        if (roof)
          add(
            roof.key,
            "supplemental-roof:" + tile.id,
            [...extra.origin, deck.elevation + deck.ceiling],
            extra.quarterTurns,
          );
        else
          fail(
            "roof:" + tile.id,
            "This supplemental floor has no matching native roof yet",
          );
      }
      continue;
    }
    if (!binding || binding.reflected) {
      fail(
        tile.id,
        "No exact supported native floor binding; explicit model is never substituted",
      );
      continue;
    }
    add(
      "floor-contact-r011/" + binding.partId,
      "floor-contact:" + tile.id,
      binding.origin,
      binding.quarterTurns,
    );
    if (deck.roof)
      add(
        "roof-r000/" + binding.partId,
        "roof:" + tile.id,
        [binding.origin[0], binding.origin[1], deck.elevation + deck.ceiling],
        binding.quarterTurns,
      );
  }
  requests.sort((a, b) => a.id.localeCompare(b.id));
  return result();
}
