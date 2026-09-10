export type RenderBackend = "webgl" | "webgpu";
export const RENDER_BACKEND_STORAGE_KEY = "sidereal.render-backend.v1";
export interface RenderBackendSnapshot {
  requested: RenderBackend;
  active: RenderBackend;
  reloadRequired: boolean;
  reason?: string;
}
type Store = Pick<Storage, "getItem" | "setItem">;
export function readRenderBackend(storage?: Store): RenderBackend {
  try { return storage?.getItem(RENDER_BACKEND_STORAGE_KEY) === "webgpu" ? "webgpu" : "webgl"; }
  catch { return "webgl"; }
}
/** Device preference only. Applying a different backend requires a fresh canvas. */
export function createRenderBackendPreference(active: RenderBackend, initial: RenderBackend, storage?: Store, reason?: string) {
  let requested = initial;
  let reloadRequired = false;
  return {
    snapshot(): RenderBackendSnapshot {
      return {requested,active,reloadRequired,reason};
    },
    set(value: RenderBackend) {
      const next = value === "webgpu" ? "webgpu" : "webgl";
      try {
        if (!storage) throw Error("No device storage");
        storage.setItem(RENDER_BACKEND_STORAGE_KEY, next);
        requested = next;
        reloadRequired = requested !== active;
      } catch { reason = "Renderer preference could not be saved on this device."; }
    },
  };
}
