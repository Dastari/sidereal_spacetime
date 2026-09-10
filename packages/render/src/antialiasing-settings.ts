/** Render preferences, never gameplay state. Samples count coverage samples, not DPR. */
export const ANTIALIASING_MODES = [
  "off",
  "msaa",
  "fxaa",
  "taa",
  "msaa-fxaa",
  "ssaa",
] as const;
export type AntialiasingMode = (typeof ANTIALIASING_MODES)[number];
export type AntialiasingSettings = {
  mode: AntialiasingMode;
  samples: 2 | 4 | 8;
};
export const ANTIALIASING_DEFAULTS: Readonly<AntialiasingSettings> = {
  mode: "msaa",
  samples: 4,
};
export const ANTIALIASING_STORAGE_KEY = "sidereal.antialiasing.v1";
export interface AntialiasingCapabilities {
  maxSamples: number;
  maxTextureSize: number;
  width: number;
  height: number;
  temporalReprojection: boolean;
  temporalResetIntegrated: boolean;
}
export interface AntialiasingPlan {
  mode: AntialiasingMode;
  samples: number;
  renderScale: 1 | 2;
  fxaa: boolean;
  reason?: string;
}
export function normalizeAntialiasing(
  value: unknown,
  base: AntialiasingSettings = { ...ANTIALIASING_DEFAULTS },
): AntialiasingSettings {
  if (!value || typeof value !== "object") return { ...base };
  const raw = value as Record<string, unknown>;
  return {
    mode: ANTIALIASING_MODES.includes(raw.mode as AntialiasingMode)
      ? (raw.mode as AntialiasingMode)
      : base.mode,
    samples:
      raw.samples === 2 || raw.samples === 4 || raw.samples === 8
        ? raw.samples
        : base.samples,
  };
}
export function resolveAntialiasing(
  settings: AntialiasingSettings,
  caps: AntialiasingCapabilities,
): AntialiasingPlan {
  const fallback = (reason: string): AntialiasingPlan => ({
    mode: "fxaa",
    samples: 1,
    renderScale: 1,
    fxaa: true,
    reason,
  });
  if (
    settings.mode === "taa" &&
    (!caps.temporalReprojection || !caps.temporalResetIntegrated)
  )
    return fallback(
      "TAA requires supported motion buffers and camera history reset integration.",
    );
  if (
    settings.mode === "ssaa" &&
    (!Number.isFinite(caps.maxTextureSize) ||
      caps.maxTextureSize <= 0 ||
      !Number.isFinite(caps.width * caps.height) ||
      caps.width <= 0 ||
      caps.height <= 0 ||
      caps.width * 2 > caps.maxTextureSize ||
      caps.height * 2 > caps.maxTextureSize ||
      caps.width * caps.height * 4 > 16_777_216)
  )
    return fallback(
      "2× supersampling exceeds the texture or 16-million-pixel budget at this resolution.",
    );
  const msaa = settings.mode === "msaa" || settings.mode === "msaa-fxaa";
  const samples = msaa
    ? ([8, 4, 2].find((n) => n <= settings.samples && n <= caps.maxSamples) ??
      1)
    : 1;
  if (msaa && samples === 1)
    return fallback("Multisample render targets are unavailable; using FXAA.");
  return {
    mode: settings.mode,
    samples,
    renderScale: settings.mode === "ssaa" ? 2 : 1,
    fxaa: settings.mode === "fxaa" || settings.mode === "msaa-fxaa",
    ...(msaa && samples < settings.samples
      ? {
          reason: `Using ${samples}× MSAA, the supported limit for this request.`,
        }
      : {}),
  };
}
export interface AntialiasingSnapshot {
  requested: AntialiasingSettings;
  effective: AntialiasingPlan;
  pending: boolean;
  error?: string;
}
/** Existing foreign effects retain identity and relative order; our FXAA is exactly once, last. */
export function antialiasingPassOrder<T>(
  current: readonly (T | null)[],
  first: readonly T[],
  last: readonly T[],
): T[] {
  const owned = new Set([...first, ...last]);
  return [
    ...new Set([
      ...first,
      ...current.filter((p): p is T => p !== null && !owned.has(p)),
      ...last,
    ]),
  ];
}
