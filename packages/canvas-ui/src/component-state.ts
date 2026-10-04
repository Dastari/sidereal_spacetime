import { resolveControlStyle, type ControlState } from "@sidereal/ui/theme";

/** Legacy accent means an amber action; explicit variants take precedence. */
export type CanvasControlState = ControlState & { accent?: boolean };

export function canvasControlState(options: CanvasControlState = {}) {
  return resolveControlStyle({
    ...options,
    variant: options.variant ?? (options.accent ? "warning" : "primary"),
  });
}

/** The callback guard also protects direct callers, not only the hit registry. */
export function controlAction(
  action: () => void,
  options: () => CanvasControlState,
) {
  return () => {
    if (canvasControlState(options()).interactive) action();
  };
}

/** Corner cuts stay inside even the compact close/key controls. */
export function controlCornerCut(width: number, height: number, cut: number) {
  return Math.max(0, Math.min(cut, width / 4, height / 4));
}
