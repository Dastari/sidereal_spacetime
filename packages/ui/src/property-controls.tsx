import { useEffect, useId, useState, useRef, type ReactNode } from "react";

/** Keeps incomplete keyboard input local; documents only receive finite values. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  integer = false,
  slider = false,
  disabled = false,
  precision,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  slider?: boolean;
  disabled?: boolean;
  precision?: number;
}) {
  const id = useId();
  const editing = useRef(false);
  const format = (n: number) =>
    precision === undefined ? String(n) : n.toFixed(precision);
  const [text, setText] = useState(format(value));
  useEffect(() => {
    if (!editing.current)
      setText(
        precision === undefined ? String(value) : value.toFixed(precision),
      );
  }, [value, precision]);
  const normalize = (n: number) =>
    Math.min(
      max ?? Infinity,
      Math.max(
        min ?? -Infinity,
        integer
          ? Math.round(n)
          : precision === undefined
            ? n
            : Number(n.toFixed(precision)),
      ),
    );
  const change = (n: number) => {
    if (Number.isFinite(n)) onChange(normalize(n));
  };
  return (
    <div className="editor-number-property">
      <label htmlFor={id}>{label}</label>
      <div className="editor-number-control">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || (min !== undefined && value <= min)}
          onClick={() => change(value - step)}
        >
          −
        </button>
        <input
          id={id}
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={integer ? 1 : step}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value !== "") change(e.target.valueAsNumber);
          }}
          onFocus={() => {
            editing.current = true;
          }}
          onBlur={() => {
            editing.current = false;
            setText(format(value));
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={() => change(value + step)}
        >
          +
        </button>
      </div>
      {slider && min !== undefined && max !== undefined && (
        <input
          aria-label={`${label} slider`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => change(e.target.valueAsNumber)}
        />
      )}
    </div>
  );
}

export function CoordinateFields({
  label = "Position (m)",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="editor-coordinates">
      <legend>{label}</legend>
      <div>{children}</div>
    </fieldset>
  );
}
