import type { ButtonHTMLAttributes, ReactNode } from "react";
export function ToolButton({
  label,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      {...rest}
      className={"tool-button " + (active ? "active" : "")}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Readout({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="readout">
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
export function Status({
  children,
  good = false,
}: {
  children: ReactNode;
  good?: boolean;
}) {
  return <span className={"status " + (good ? "good" : "")}>{children}</span>;
}
export function ItemSlot({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <button className="item-slot" title={label} aria-label={label}>
      {children}
    </button>
  );
}
