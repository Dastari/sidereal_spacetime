import type { HullCameraState } from "@sidereal/render/layout-hull";
/** One camera for a local document, irrespective of the active editing palette. */
export interface SharedLayoutViewport {
  documentId?: string;
  camera?: HullCameraState;
  projection?: string;
  actions?: { fit(): void; zoom(delta: number): void };
}
