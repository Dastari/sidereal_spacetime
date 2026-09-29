/** The backend actually rendering. */
export type RenderBackend = "webgl" | "webgpu";
/** The device preference: Auto picks WebGPU when available and not known to fail here. */
export type RenderBackendChoice = "auto" | RenderBackend;
export const RENDER_BACKEND_CHOICES: readonly RenderBackendChoice[] = [
  "auto",
  "webgpu",
  "webgl",
];
export const RENDER_BACKEND_STORAGE_KEY = "sidereal.render-backend.v1";
export const WEBGPU_FAILURE_STORAGE_KEY =
  "sidereal.render-backend.webgpu-failure.v1";
/**
 * Bump when a client release fixes WebGPU compatibility, so Auto retries WebGPU on devices
 * that recorded a failure against an older client. Failures also expire after a few days.
 */
export const WEBGPU_COMPAT_REVISION = 2;
const FAILURE_TTL_MS = 3 * 24 * 3600 * 1000;

export interface RenderBackendSnapshot {
  requested: RenderBackendChoice;
  active: RenderBackend;
  reloadRequired: boolean;
  reason?: string;
}
type Store = Pick<Storage, "getItem" | "setItem">;

export function renderBackendLabel(backend: RenderBackendChoice) {
  return backend === "auto"
    ? "Auto"
    : backend === "webgpu"
      ? "WebGPU"
      : "WebGL2";
}
export function readRenderBackend(storage?: Store): RenderBackendChoice {
  try {
    const value = storage?.getItem(RENDER_BACKEND_STORAGE_KEY);
    return value === "webgpu" || value === "webgl" ? value : "auto";
  } catch {
    return "auto";
  }
}

/** A WebGPU failure recorded on this device for the current compatibility revision. */
export function readWebGPUFailure(storage?: Store, now = Date.now()) {
  try {
    const raw = storage?.getItem(WEBGPU_FAILURE_STORAGE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as {
      revision?: number;
      at?: number;
      reason?: string;
    };
    if (value.revision !== WEBGPU_COMPAT_REVISION) return undefined;
    if (typeof value.at !== "number" || now - value.at > FAILURE_TTL_MS)
      return undefined;
    return typeof value.reason === "string" ? value.reason : "WebGPU failed";
  } catch {
    return undefined;
  }
}
export function recordWebGPUFailure(
  storage: Store | undefined,
  reason: string,
  now = Date.now(),
) {
  try {
    storage?.setItem(
      WEBGPU_FAILURE_STORAGE_KEY,
      JSON.stringify({
        revision: WEBGPU_COMPAT_REVISION,
        at: now,
        reason: reason.slice(0, 240),
      }),
    );
    return !!storage;
  } catch {
    return false;
  }
}

/** Which backend to try first for a choice. Auto avoids WebGPU after a recorded failure. */
export function resolveRenderBackend(
  choice: RenderBackendChoice,
  webgpuFailure?: string,
): { target: RenderBackend; reason?: string } {
  if (choice !== "auto") return { target: choice };
  if (webgpuFailure)
    return {
      target: "webgl",
      reason: `WebGPU failed on this device (${webgpuFailure}). Auto uses WebGL2; choose WebGPU to retry.`,
    };
  return { target: "webgpu" };
}

/** Device preference only. Applying a different backend requires a fresh canvas. */
export function createRenderBackendPreference(
  active: RenderBackend,
  initial: RenderBackendChoice,
  storage?: Store,
  reason?: string,
  /** What Auto resolves to on this device right now. */
  autoResolves: RenderBackend = initial === "auto" ? active : "webgpu",
) {
  let requested = initial;
  let reloadRequired = false;
  const resolved = (choice: RenderBackendChoice) =>
    choice === "auto" ? autoResolves : choice;
  return {
    snapshot(): RenderBackendSnapshot {
      return { requested, active, reloadRequired, reason };
    },
    set(value: RenderBackendChoice) {
      const next: RenderBackendChoice =
        value === "webgpu" || value === "webgl" ? value : "auto";
      try {
        if (!storage) throw Error("No device storage");
        storage.setItem(RENDER_BACKEND_STORAGE_KEY, next);
        requested = next;
        reloadRequired = resolved(requested) !== active;
      } catch {
        reason = "Renderer preference could not be saved on this device.";
      }
    },
    /** A runtime failure of the active backend (shown in F3 and the Graphics menu). */
    fail(message: string) {
      reason = message;
      if (active === "webgpu") autoResolves = "webgl";
      reloadRequired = resolved(requested) !== active;
    },
  };
}
