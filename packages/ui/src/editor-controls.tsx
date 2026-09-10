import { useRef, type ReactNode } from "react";
export function ModeTabs<T extends string>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="layout-tabs" role="tablist" aria-label={label}>
      {values.map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === value}
          tabIndex={v === value ? 0 : -1}
          onKeyDown={(event) => {
            const index = values.indexOf(v);
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % values.length
                : event.key === "ArrowLeft"
                  ? (index + values.length - 1) % values.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? values.length - 1
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            onChange(values[next]);
            (
              event.currentTarget.parentElement?.children[
                next
              ] as HTMLButtonElement
            )?.focus();
          }}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
export function PropertyField({
  label,
  unit,
  children,
}: {
  label: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <label className="layout-property">
      <span>
        {label}
        {unit && <small> ({unit})</small>}
      </span>
      {children}
    </label>
  );
}
export function EditorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="layout-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function ValidationList({
  items,
  onSelect,
}: {
  items: { code: string; severity: string; message: string; ids: string[] }[];
  onSelect: (ids: string[]) => void;
}) {
  return (
    <ul className="layout-validation">
      {items.map((d, i) => (
        <li key={`${d.code}-${i}`} data-severity={d.severity}>
          <button onClick={() => onSelect(d.ids)}>
            <strong>
              {d.severity === "error"
                ? "!"
                : d.severity === "warning"
                  ? "△"
                  : "i"}{" "}
              {d.code.replaceAll("-", " ")}
            </strong>
            <span>{d.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Pointer capture keeps resizing local; unmounting cannot leave window listeners behind. */
export function PanelResizeHandle({
  side,
  width,
  onResize,
}: {
  side: "left" | "right";
  width: number;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const change = (value: number) =>
    onResize(Math.max(200, Math.min(380, value)));
  return (
    <div
      className={`layout-resizer ${side}`}
      role="separator"
      aria-label={side === "left" ? "Resize palette" : "Resize inspector"}
      aria-orientation="vertical"
      aria-valuemin={200}
      aria-valuemax={380}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        if (drag.current)
          change(
            drag.current.width +
              (event.clientX - drag.current.x) * (side === "left" ? 1 : -1),
          );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        change(
          event.key === "Home"
            ? 200
            : event.key === "End"
              ? 380
              : width +
                (event.key === "ArrowRight" ? 16 : -16) *
                  (side === "left" ? 1 : -1),
        );
      }}
    />
  );
}
