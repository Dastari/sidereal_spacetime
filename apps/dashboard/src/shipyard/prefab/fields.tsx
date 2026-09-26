/** Inspector fields that commit one history step on Enter or blur, not per keystroke. */
import { useEffect, useState, type ReactNode } from "react";

export function TextField({
  label,
  value,
  onCommit,
  filter,
  maxLength,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  /** Normalise typed text (e.g. to the grammar's allowed characters). */
  filter?: (v: string) => string;
  maxLength?: number;
  multiline?: boolean;
  hint?: ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const change = (v: string) => setDraft(filter ? filter(v) : v);
  return (
    <label className="pf-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          maxLength={maxLength}
          rows={3}
          onChange={(e) => change(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit();
            if (e.key === "Escape") setDraft(value);
          }}
        />
      ) : (
        <input
          value={draft}
          maxLength={maxLength}
          onChange={(e) => change(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(value);
          }}
        />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n)) return setDraft(String(value));
    const snapped = Math.round(n / step) * step;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, snapped));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <label className="pf-field pf-number">
      <span>
        {label}
        {unit && <small> {unit}</small>}
      </span>
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (T | { value: T; label: string })[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="pf-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          return (
            <option key={v} value={v}>
              {typeof o === "string" ? o : o.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function CheckField({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="pf-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Grammar label characters (names, room labels). */
export const labelFilter = (v: string) => v.replace(/[^A-Za-z0-9 ._/'&-]/g, "").slice(0, 32);
/** Hull marking characters: upper case only. */
export const markingFilter = (max: number) => (v: string) => v.toUpperCase().replace(/[^A-Z0-9 ._/-]/g, "").slice(0, max);
