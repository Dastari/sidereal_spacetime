import type { ReactNode } from "react";
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
