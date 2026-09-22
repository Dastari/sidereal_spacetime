import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
export function MapToolButton({
  label,
  help,
  children,
  disabled = false,
  pressed,
  onClick,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  const id = useId(),
    [position, setPosition] = useState<{ left: number; top: number } | null>(
      null,
    );
  return (
    <span
      className="map-tool-tip"
      tabIndex={disabled ? 0 : undefined}
      onPointerEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPosition({
          left: Math.max(8, Math.min(r.left, innerWidth - 256)),
          top: Math.min(r.bottom + 7, innerHeight - 100),
        });
      }}
      onPointerLeave={() => setPosition(null)}
      onFocus={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPosition({
          left: Math.max(8, Math.min(r.left, innerWidth - 256)),
          top: Math.min(r.bottom + 7, innerHeight - 100),
        });
      }}
      onBlur={() => setPosition(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setPosition(null);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={position ? id : undefined}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => {
          setPosition(null);
          onClick();
        }}
      >
        {children}
      </button>
      {position &&
        createPortal(
          <span id={id} role="tooltip" className="map-tooltip" style={position}>
            <strong>{label}</strong>
            {help && <span>{help}</span>}
            {disabled && (
              <span>Unavailable for the current selection or access.</span>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}
