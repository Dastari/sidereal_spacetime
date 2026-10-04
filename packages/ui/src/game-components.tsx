import React, {
  useId,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { drawItemFrame, type ItemRarity } from "./item-frame";
import {
  panelFrameGeometry,
  uiTheme,
  uiThemeCss,
  type ControlVariant,
} from "./theme";

/** Code-native frame using exactly the gameplay shell, without stretching its corners. */
function PanelFrame() {
  const host = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradient = useId();
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const update = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const frame = panelFrameGeometry(size.width, size.height);
  const points = (vertices: number[][]) =>
    vertices.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg ref={host} className="ui-panel__frame" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            stopColor={uiTheme.colors.panel}
            stopOpacity="0.995"
          />
          <stop
            offset="1"
            stopColor={uiTheme.colors.background}
            stopOpacity="0.985"
          />
        </linearGradient>
      </defs>
      <polygon
        points={points(frame.outline)}
        fill={`url(#${gradient})`}
        stroke={uiTheme.colors.border}
      />
      {frame.accents.map((vertices, i) => (
        <polyline
          key={i}
          points={points(vertices)}
          className="ui-panel__trace"
          fill="none"
        />
      ))}
      <path d={`M12 3 H${Math.max(12, size.width - 14)}`} stroke="#759ad044" />
    </svg>
  );
}

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
      <PanelFrame />
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
  rarity = "common",
  disabled,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  selected?: boolean;
  rarity?: ItemRarity;
}) {
  const frame = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const canvas = frame.current;
    if (!canvas) return;
    const paint = () => {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawItemFrame(
        { ctx },
        { x: 0, y: 0, w: width, h: height },
        { rarity, selected, hovered, focused, disabled, empty: !children },
      );
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [rarity, selected, hovered, focused, disabled, children]);
  return (
    <button
      {...props}
      type="button"
      className={`ui-item-slot ${props.className ?? ""}`}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      data-selected={selected || undefined}
      onPointerEnter={(event) => {
        setHovered(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setHovered(false);
        onPointerLeave?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
    >
      <canvas ref={frame} className="ui-item-slot__frame" aria-hidden="true" />
      {children}
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
      {subtitle && <p>{subtitle}</p>}
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
      </header>
      <div className="ui-hangar__content">{children}</div>
      <footer className="ui-hangar__footer">
        {footer ?? <span>SIDEREAL</span>}
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
