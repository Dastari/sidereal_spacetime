import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
export interface MapMenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
}
export function MapContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: MapMenuAction[];
  onClose: () => void;
}) {
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const ref = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, innerHeight - r.height - 8)),
    });
    ref
      .current!.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Map context actions"
      className="map-context-menu"
      style={position}
      onKeyDown={(e) => {
        e.stopPropagation();
        const buttons = [
            ...ref.current!.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ],
          index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          onClose();
          returnFocus.current?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length
          ]?.focus();
        }
      }}
    >
      {actions.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.action();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
