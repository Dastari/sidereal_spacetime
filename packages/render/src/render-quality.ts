/**
 * Render-cost switches of the in-game F3 debug window (owner live feedback 2026-09-29: "Rendering/FPS
 * is slow ... an option to disable the plastic effect ... IN the debug menu"). Local presentation
 * preferences only: saved on this device, applied live, never simulation state.
 *
 * - plastic: the molded-plastic finish (molded-plastic.ts); off restores each material's
 *   pre-finish response (pre-#59 metallic/roughness, scene IBL, scene grading) and the rim light;
 * - ssao: the contact-shading SSAO pass (contact-shading.ts); OFF by default for frame rate;
 * - clearCoat: the plastic clear-coat lobe (off by default, as in #59);
 * - glow: bloom (every effect layer);
 * - renderScale: canvas resolution relative to CSS pixels (hardware scaling 1 / scale).
 *
 * URL overrides for reviews and harnesses (not saved): `ao=0|1`, `coat=0|1`, `plastic=0|1`,
 * `glow=0|1`, `renderScale=<0.5..1>`.
 */
export interface RenderQuality {
  plastic: boolean;
  ssao: boolean;
  clearCoat: boolean;
  glow: boolean;
  renderScale: number;
}

export const RENDER_QUALITY_DEFAULTS: Readonly<RenderQuality> = Object.freeze({
  plastic: true,
  ssao: false,
  clearCoat: false,
  glow: true,
  renderScale: 1,
});

/** Stepped render-scale choices offered by the debug window. */
export const RENDER_SCALES = [0.5, 0.67, 0.75, 0.85, 1] as const;
export const RENDER_SCALE_RANGE = [0.5, 1] as const;

export const RENDER_QUALITY_STORAGE_KEY = "sidereal.renderQuality.v1";

type Store = Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem">>;

function clampScale(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return RENDER_QUALITY_DEFAULTS.renderScale;
  return (
    Math.round(
      Math.min(RENDER_SCALE_RANGE[1], Math.max(RENDER_SCALE_RANGE[0], n)) * 100,
    ) / 100
  );
}

/** Coerce any stored/partial value into a complete, valid preference. */
export function normalizeRenderQuality(value: unknown): RenderQuality {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const flag = (key: keyof RenderQuality) =>
    typeof v[key] === "boolean"
      ? (v[key] as boolean)
      : (RENDER_QUALITY_DEFAULTS[key] as boolean);
  return {
    plastic: flag("plastic"),
    ssao: flag("ssao"),
    clearCoat: flag("clearCoat"),
    glow: flag("glow"),
    renderScale:
      v.renderScale === undefined
        ? RENDER_QUALITY_DEFAULTS.renderScale
        : clampScale(v.renderScale),
  };
}

/** Saved preference (defaults when absent/blocked/corrupt). */
export function readStoredRenderQuality(storage: Store | undefined) {
  try {
    const raw = storage?.getItem(RENDER_QUALITY_STORAGE_KEY);
    return normalizeRenderQuality(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizeRenderQuality(undefined);
  }
}

/** URL overrides (reviews/harness) layered over a preference; not persisted. */
export function applyRenderQualityQuery(
  quality: RenderQuality,
  search = "",
): RenderQuality {
  const q = new URLSearchParams(search);
  const on = (name: string) => {
    const v = q.get(name);
    if (v === "0" || v === "off") return false;
    if (v === "1" || v === "on") return true;
    return undefined;
  };
  const scale = q.get("renderScale");
  return {
    plastic: on("plastic") ?? quality.plastic,
    ssao: on("ao") ?? quality.ssao,
    clearCoat: on("coat") ?? quality.clearCoat,
    glow: on("glow") ?? quality.glow,
    renderScale: scale === null ? quality.renderScale : clampScale(scale),
  };
}

export function writeRenderQuality(
  storage: Store | undefined,
  quality: RenderQuality,
) {
  try {
    storage?.setItem?.(
      RENDER_QUALITY_STORAGE_KEY,
      JSON.stringify(normalizeRenderQuality(quality)),
    );
  } catch {
    /* Device storage can be blocked; the preference then lasts for this page. */
  }
}

/** Hardware scaling level for a render scale (Babylon renders at CSS size / level). */
export function hardwareScalingForRenderScale(scale: number) {
  return 1 / clampScale(scale);
}
