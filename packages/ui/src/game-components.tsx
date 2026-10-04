import React, {
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { uiThemeCss, type ControlVariant } from "./theme";

export function GameButton({
  variant = "secondary",
  pending = false,
  selected,
  disabled,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ControlVariant;
  pending?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`ui-button ui-button--${variant} ${className}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-pressed={selected}
      data-selected={selected || undefined}
    >
      {pending && <span className="ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function GamePanel({
  title,
  eyebrow,
  className = "",
  children,
  actions,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`ui-panel ${className}`}>
      {(title || eyebrow || actions) && (
        <header className="ui-panel__heading">
          <div>
            {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function GameInput({
  label,
  id,
  description,
  error,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
  error?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const noteId = `${fieldId}-note`;
  return (
    <label className={`ui-field ${className}`} htmlFor={fieldId}>
      <span>{label}</span>
      <input
        {...props}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={error || description ? noteId : undefined}
      />
      {(error || description) && (
        <small id={noteId} className={error ? "ui-field__error" : ""}>
          {error || description}
        </small>
      )}
    </label>
  );
}

export function GameNotice({
  kind = "info",
  children,
}: {
  kind?: "danger" | "warning" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={`ui-notice ui-notice--${kind}`}
      role={kind === "danger" ? "alert" : "status"}
    >
      <span aria-hidden="true">
        {kind === "danger"
          ? "!"
          : kind === "success"
            ? "✓"
            : kind === "warning"
              ? "△"
              : "i"}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function StatBar({
  label,
  value,
  max,
  kind = "primary",
}: {
  label: string;
  value: number;
  max: number;
  kind?: "primary" | "secondary" | "danger" | "warning" | "success";
}) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value)
    ? Math.max(0, Math.min(value, safeMax))
    : 0;
  return (
    <div className={`ui-stat ui-stat--${kind}`}>
      <div>
        <span>{label}</span>
        <strong>
          {safeValue} / {safeMax}
        </strong>
      </div>
      <meter min={0} max={safeMax || 1} value={safeValue} aria-label={label} />
      <span className="ui-stat__track" aria-hidden="true">
        <span
          style={{ width: `${safeMax ? (safeValue / safeMax) * 100 : 0}%` }}
        />
      </span>
    </div>
  );
}

export function ItemSlot({
  label,
  children,
  selected,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  selected?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      className={`ui-item-slot ${props.className ?? ""}`}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      data-selected={selected || undefined}
    >
      {children ?? <span className="ui-item-slot__empty" aria-hidden="true" />}
    </button>
  );
}

export function KeyHint({ children }: { children: ReactNode }) {
  return <kbd className="ui-key-hint">{children}</kbd>;
}

export function SiderealWordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="ui-wordmark">
      <div>
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <ellipse
            cx="60"
            cy="40"
            rx="56"
            ry="16"
            transform="rotate(-25 60 40)"
          />
          <circle cx="60" cy="40" r="27" />
          <path d="M39 24a27 27 0 0 1 36-9" />
        </svg>
        <span>SIDEREAL</span>
      </div>
      <p>{subtitle ?? "Explore · Build · Survive · Belong"}</p>
    </div>
  );
}

export function HangarShell({
  children,
  className = "",
  header,
  footer,
}: {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      className={`ui-hangar ${className}`}
      style={uiThemeCss as CSSProperties}
    >
      <div className="ui-hangar__art" aria-hidden="true" />
      <header className="ui-hangar__header">
        {header ?? <SiderealWordmark />}
        <span className="ui-hangar__motto">
          A brighter galaxy.
          <br />
          Together.
        </span>
      </header>
      <div className="ui-hangar__content">{children}</div>
      <footer className="ui-hangar__footer">
        {footer ?? (
          <>
            <span>SIDEREAL // A universe of possibilities</span>
            <span>Explore · Build · Survive · Belong</span>
          </>
        )}
      </footer>
    </main>
  );
}

export function GameCheckbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="ui-checkbox">
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

export function GameTabs({
  tabs,
  selected,
  onSelect,
  label,
}: {
  tabs: readonly { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <div className="ui-tabs" role="group" aria-label={label}>
      {tabs.map((tab) => (
        <GameButton
          key={tab.id}
          selected={selected === tab.id}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </GameButton>
      ))}
    </div>
  );
}
