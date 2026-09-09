/** Local presentation policy. Sun/fill/planet lights are not candidates here. */
export const LOCAL_LIGHT_LIMITS = [0, 4, 8, 16, 32, "all"] as const;
export type LocalLightLimit = (typeof LOCAL_LIGHT_LIMITS)[number];
export const LOCAL_LIGHT_DEFAULT: LocalLightLimit = "all";
export const LOCAL_LIGHT_STORAGE_KEY = "sidereal.local-light-budget.v1";
export type LightBudgetPoint = Readonly<{ x: number; y: number; z: number }>;
export type LocalLightDecision = Readonly<{
  enabled: boolean;
  shadowEnabled: boolean;
}>;
export type LocalLightCandidate = {
  /** Stable placed-object UUID + fixture/socket ID, never an array index. */
  id: string;
  /** Position and focus must use the SAME current renderer or ship-local frame. */
  position: LightBudgetPoint;
  range: number;
  /** 0 normally; up to 4 for explicit task/selection relevance, not material type. */
  priority?: number;
  /** Desired power/receiver/cutaway/parent/debug eligibility, BEFORE this budget. */
  eligible: boolean;
  /** A partition-occluded room light cannot stay on without its shadow. */
  requiresShadow: boolean;
  shadowEligible: boolean;
};
export type ManagedLocalLight = LocalLightCandidate & {
  /** Presentation-only sink. Guard disposed lights; never write gameplay state. */
  apply: (decision: LocalLightDecision) => void;
};
export type LocalLightBudgetFrame = {
  focus: LightBudgetPoint;
  /** Separate local shadow budget; omitted preserves authored shadow capacity. */
  maxShadowLights?: number;
};
export type LocalLightSelection = {
  decisions: ReadonlyMap<string, LocalLightDecision>;
  selectedIds: ReadonlySet<string>;
  eligibleLights: number;
  enabledLights: number;
  enabledShadowLights: number;
};
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const OFF: LocalLightDecision = Object.freeze({
  enabled: false,
  shadowEnabled: false,
});
const finitePoint = (p: LightBudgetPoint) =>
  [p.x, p.y, p.z].every(Number.isFinite);

export function normalizeLocalLightLimit(
  value: unknown,
  fallback: LocalLightLimit = LOCAL_LIGHT_DEFAULT,
): LocalLightLimit {
  return LOCAL_LIGHT_LIMITS.some((limit) => limit === value)
    ? (value as LocalLightLimit)
    : fallback;
}

/** Deterministic greedy allocation with 15% incumbent score hysteresis.
 * A challenger must be materially more relevant, so doorway/camera jitter does
 * not alternate two fixtures every frame. No timers or simulation clock needed.
 */
export function selectLocalLights(
  candidates: readonly LocalLightCandidate[],
  frame: LocalLightBudgetFrame,
  limit: LocalLightLimit,
  previous: ReadonlySet<string> = new Set(),
): LocalLightSelection {
  const decisions = new Map<string, LocalLightDecision>();
  for (const candidate of candidates) {
    if (!candidate.id || decisions.has(candidate.id))
      throw new Error("Local lights need unique stable IDs");
    decisions.set(candidate.id, OFF);
  }
  const ranked = candidates
    .filter(
      (c) =>
        c.eligible &&
        finitePoint(c.position) &&
        finitePoint(frame.focus) &&
        Number.isFinite(c.range) &&
        c.range > 0 &&
        (!c.requiresShadow || c.shadowEligible),
    )
    .map((c) => {
      const distance = Math.hypot(
        c.position.x - frame.focus.x,
        c.position.y - frame.focus.y,
        c.position.z - frame.focus.z,
      );
      const priority = Number.isFinite(c.priority)
        ? Math.min(4, Math.max(0, c.priority!))
        : 0;
      const score =
        ((1 + priority) / (1 + distance / c.range)) *
        (previous.has(c.id) ? 1.15 : 1);
      return { candidate: c, score };
    })
    .sort(
      (a, b) => b.score - a.score || (a.candidate.id < b.candidate.id ? -1 : 1),
    );
  const lightCap = limit === "all" ? Infinity : limit;
  const shadowCap =
    frame.maxShadowLights === undefined
      ? Infinity
      : Number.isFinite(frame.maxShadowLights)
        ? Math.max(0, Math.floor(frame.maxShadowLights))
        : 0;
  const selectedIds = new Set<string>();
  let enabledShadowLights = 0;
  for (const { candidate: c } of ranked) {
    if (selectedIds.size >= lightCap) break;
    if (c.requiresShadow && enabledShadowLights >= shadowCap) continue;
    const shadowEnabled = c.requiresShadow;
    decisions.set(c.id, { enabled: true, shadowEnabled });
    selectedIds.add(c.id);
    if (shadowEnabled) enabledShadowLights++;
  }
  return {
    decisions,
    selectedIds,
    eligibleLights: ranked.length,
    enabledLights: selectedIds.size,
    enabledShadowLights,
  };
}

/** Settings and lifecycle wrapper. The caller composes eligibility explicitly;
 * reading last frame's light.isEnabled() as eligibility would latch suppression.
 * update applies the final decision each frame, including unchanged selections,
 * so normal presentation recomputation cannot accidentally override the cap.
 */
export function createLocalLightBudget(storage?: Storage) {
  if (!storage)
    try {
      storage = globalThis.localStorage;
    } catch {
      /* denied storage: keep a session-only preference */
    }
  let limit: LocalLightLimit = LOCAL_LIGHT_DEFAULT;
  try {
    limit = normalizeLocalLightLimit(
      JSON.parse(storage?.getItem(LOCAL_LIGHT_STORAGE_KEY) ?? "null"),
    );
  } catch {
    /* restricted/corrupt storage */
  }
  let previous: ReadonlySet<string> = new Set();
  let managed = new Map<string, ManagedLocalLight>();
  let lastFrame: LocalLightBudgetFrame | undefined;
  let disposed = false;
  let selection: LocalLightSelection = {
    decisions: new Map(),
    selectedIds: previous,
    eligibleLights: 0,
    enabledLights: 0,
    enabledShadowLights: 0,
  };
  function update(
    candidates: readonly ManagedLocalLight[],
    frame: LocalLightBudgetFrame,
  ) {
    if (disposed) return selection;
    // Validate all IDs before changing any sink or lifecycle state.
    const next = selectLocalLights(candidates, frame, limit, previous);
    const incoming = new Map(candidates.map((c) => [c.id, c]));
    for (const [id, old] of managed)
      if (!incoming.has(id) || incoming.get(id)!.apply !== old.apply)
        old.apply(OFF);
    for (const c of candidates) c.apply(next.decisions.get(c.id)!);
    managed = incoming;
    // Copy the focus so caller-owned mutable vectors cannot change a setting replay.
    lastFrame = { ...frame, focus: { ...frame.focus } };
    previous = next.selectedIds;
    selection = next;
    return selection;
  }
  function setLimit(value: unknown) {
    if (disposed) return limit;
    limit = normalizeLocalLightLimit(value, limit);
    try {
      storage?.setItem(LOCAL_LIGHT_STORAGE_KEY, JSON.stringify(limit));
    } catch {
      /* session-only preference */
    }
    if (lastFrame) update([...managed.values()], lastFrame);
    return limit;
  }
  return {
    snapshot: () => ({
      limit,
      eligibleLights: selection.eligibleLights,
      enabledLights: selection.enabledLights,
      enabledShadowLights: selection.enabledShadowLights,
    }),
    update,
    setLimit,
    reset: () => setLimit(LOCAL_LIGHT_DEFAULT),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of managed.values()) c.apply(OFF);
      managed.clear();
      previous = new Set();
      lastFrame = undefined;
      selection = {
        decisions: new Map(),
        selectedIds: previous,
        eligibleLights: 0,
        enabledLights: 0,
        enabledShadowLights: 0,
      };
    },
  };
}
