/**
 * Presentation-only level-of-detail rules (pipeline C of the wiki `Architecture/Visibility and
 * Interest Management`). They choose how detailed an authorised, perceived ship or crew body is
 * drawn. They never drop one: the last tier is a marker. Budgets demote tiers, never membership.
 */

/** Ship tiers: 0 = full (S1), 3 = intermediate (S2), 1 = hull proxy (S3), 2 = marker (S5). */
export type ShipLodTier = 0 | 1 | 2 | 3;

export const SHIP_LOD = Object.freeze({
  /** Projected hull radius (px) to enter / leave the full exterior (hysteresis band). */
  fullEnterPx: 56,
  fullExitPx: 44,
  /** Source-qualified intermediate exteriors retain native full geometry when near. */
  nativeFullEnterPx: 180,
  nativeFullExitPx: 150,
  /** Projected hull radius (px) to enter / leave the proxy; below it the ship is a marker. */
  proxyEnterPx: 7,
  proxyExitPx: 5,
  /** Full exteriors drawn at once; the smallest on screen beyond it drop to the proxy tier. */
  fullDetailBudget: 24,
  /** On-screen size (px) of the marker tier. */
  markerPx: 14,
});

/** Screen radius in pixels of a sphere of `radiusM` at `distanceM` under a perspective camera. */
export function projectedRadiusPx(
  radiusM: number,
  distanceM: number,
  fovRad: number,
  viewportHeightPx: number,
): number {
  if (
    ![radiusM, distanceM, fovRad, viewportHeightPx].every(Number.isFinite) ||
    radiusM <= 0 ||
    fovRad <= 0 ||
    viewportHeightPx <= 0
  )
    return 0;
  const d = Math.max(distanceM, radiusM, 1e-3);
  return (radiusM / (d * Math.tan(fovRad / 2))) * (viewportHeightPx / 2);
}

/** Size-only tier with hysteresis around each threshold. */
export function nextShipTier(
  previous: ShipLodTier | undefined,
  px: number,
  intermediate = false,
): ShipLodTier {
  const size = Number.isFinite(px) ? px : 0;
  const full =
    previous === 0
      ? size >= (intermediate ? SHIP_LOD.nativeFullExitPx : SHIP_LOD.fullExitPx)
      : size >=
        (intermediate ? SHIP_LOD.nativeFullEnterPx : SHIP_LOD.fullEnterPx);
  if (full) return 0;
  if (
    intermediate &&
    size >=
      (previous === 0 || previous === 3
        ? SHIP_LOD.fullExitPx
        : SHIP_LOD.fullEnterPx)
  )
    return 3;
  const proxy =
    previous === undefined || previous === 2
      ? size >= SHIP_LOD.proxyEnterPx
      : size >= SHIP_LOD.proxyExitPx;
  return proxy ? 1 : 2;
}

/**
 * Tier per ship: size with hysteresis, then the full-detail budget. Ships over the budget keep
 * the proxy tier (never removed); the largest on screen keep full detail. Every input id gets a
 * tier, so the result never has fewer entries than the input.
 */
export function assignShipTiers(
  ships: readonly {
    id: string;
    px: number;
    previous?: ShipLodTier;
    intermediate?: boolean;
    forceFull?: boolean;
  }[],
  budget: number = SHIP_LOD.fullDetailBudget,
): Map<string, ShipLodTier> {
  const tiers = new Map<string, ShipLodTier>();
  for (const s of ships)
    tiers.set(
      s.id,
      s.forceFull ? 0 : nextShipTier(s.previous, s.px, s.intermediate),
    );
  const full = ships
    .filter(
      (s) => (tiers.get(s.id) === 0 || tiers.get(s.id) === 3) && !s.forceFull,
    )
    .sort((a, b) => b.px - a.px || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const protectedCount = ships.filter((s) => s.forceFull).length;
  for (const s of full.slice(Math.max(0, budget - protectedCount)))
    tiers.set(s.id, 1);
  return tiers;
}

/** Crew tiers: "full" skinned body (C0) or instanced "marker" body (C3). */
export type CrewLodTier = "full" | "marker";

export const CREW_LOD = Object.freeze({
  /** Skinned bodies drawn at once (nearest first); everyone else is an instanced marker. */
  fullBodyBudget: 12,
  /** A body that already has full detail sorts this much nearer (m), so ranks do not thrash. */
  stickyM: 1.5,
});

/**
 * Nearest `budget` bodies get the full tier, with a distance bias for bodies already drawn in
 * full; every other body gets a marker. Every input id gets a tier.
 */
export function assignCrewTiers(
  bodies: readonly { id: string; distanceM: number; previous?: CrewLodTier }[],
  budget: number = CREW_LOD.fullBodyBudget,
): Map<string, CrewLodTier> {
  const ranked = [...bodies].sort((a, b) => {
    const da =
        (Number.isFinite(a.distanceM) ? a.distanceM : Infinity) -
        (a.previous === "full" ? CREW_LOD.stickyM : 0),
      db =
        (Number.isFinite(b.distanceM) ? b.distanceM : Infinity) -
        (b.previous === "full" ? CREW_LOD.stickyM : 0);
    return da - db || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const tiers = new Map<string, CrewLodTier>();
  ranked.forEach((b, i) =>
    tiers.set(b.id, i < Math.max(0, budget) ? "full" : "marker"),
  );
  return tiers;
}
