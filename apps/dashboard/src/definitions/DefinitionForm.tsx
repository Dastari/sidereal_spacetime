/**
 * Form generated from the shared field schema (`@sidereal/sim/content-definition-schema`). The same
 * schema validates on the server, so a value this form accepts is one the reducer accepts.
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type {
  DefinitionIssue,
  FieldSpec,
} from "@sidereal/sim/content-definitions";

type Payload = Record<string, unknown>;

function issueFor(issues: readonly DefinitionIssue[], path: string) {
  return issues.find((i) => i.path === path)?.message;
}
/** What "none" is for a field: `null` for nullable keys, absent otherwise. */
const emptyOf = (spec: FieldSpec) => (spec.nullable ? null : undefined);
/** A starting value when a designer switches an object or list entry on. */
function defaultFor(spec: FieldSpec): unknown {
  switch (spec.type) {
    case "string":
      return spec.options?.[0] ?? "";
    case "number":
      return spec.exclusiveMin ? spec.min + 1 : spec.min;
    case "boolean":
      return false;
    case "json":
      return {};
    case "list":
      return Array.from({ length: spec.minItems }, () => defaultFor(spec.of));
    case "object":
      return Object.fromEntries(
        spec.fields
          .filter((f) => f.required || f.nullable)
          .map((f) => [f.key, f.nullable ? null : defaultFor(f)]),
      );
  }
}
const isVector = (spec: FieldSpec) =>
  spec.type === "list" &&
  spec.of.type === "number" &&
  spec.minItems === spec.maxItems &&
  spec.minItems <= 4;

function JsonField({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState(
    value === undefined ? "" : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    setText(value === undefined ? "" : JSON.stringify(value, null, 2));
  }, [JSON.stringify(value)]);
  return (
    <>
      <textarea
        className="df-json-field"
        value={text}
        disabled={disabled}
        spellCheck={false}
        rows={6}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) {
            setError("");
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(e.target.value));
            setError("");
          } catch {
            setError("Not valid JSON yet");
          }
        }}
      />
      {error && <span className="df-field-issue">{error}</span>}
    </>
  );
}

function NumberInput({
  spec,
  value,
  disabled,
  onChange,
  label,
}: {
  spec: Extract<FieldSpec, { type: "number" }>;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
  label?: string;
}) {
  return (
    <span className="df-number">
      <input
        type="number"
        aria-label={label}
        value={typeof value === "number" ? value : ""}
        step={spec.integer ? 1 : "any"}
        min={spec.min}
        max={spec.max}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? emptyOf(spec)
              : Number.isFinite(e.target.valueAsNumber)
                ? e.target.valueAsNumber
                : e.target.value,
          )
        }
      />
      {spec.unit && <span className="df-unit">{spec.unit}</span>}
    </span>
  );
}

function Field({
  spec,
  value,
  path,
  issues,
  disabled,
  onChange,
  label = spec.label,
}: {
  spec: FieldSpec;
  value: unknown;
  path: string;
  issues: readonly DefinitionIssue[];
  disabled: boolean;
  onChange: (v: unknown) => void;
  label?: string;
}) {
  const issue = issueFor(issues, path);
  const removable = !spec.required || spec.nullable;
  const present = value !== undefined && value !== null;
  const clear =
    removable && present && !disabled && spec.type !== "object" ? (
      <button
        type="button"
        className="df-clear"
        title={`Remove ${label}`}
        aria-label={`Remove ${label}`}
        onClick={() => onChange(emptyOf(spec))}
      >
        <X size={14} />
      </button>
    ) : null;
  if (spec.type === "object") {
    const obj = (present ? value : {}) as Payload;
    return (
      <fieldset className={"df-group" + (issue ? " invalid" : "")}>
        <legend>
          {removable ? (
            <label className="df-include">
              <input
                type="checkbox"
                checked={present}
                disabled={disabled}
                onChange={(e) =>
                  onChange(e.target.checked ? defaultFor(spec) : emptyOf(spec))
                }
              />
              {label}
              {spec.nullable && !present && (
                <span className="df-none">none</span>
              )}
            </label>
          ) : (
            label
          )}
        </legend>
        {spec.help && <p className="df-help">{spec.help}</p>}
        {present &&
          spec.fields.map((f) => (
            <Field
              key={f.key}
              spec={f}
              value={obj[f.key]}
              path={path + "." + f.key}
              issues={issues}
              disabled={disabled}
              onChange={(v) => {
                const next = { ...obj };
                if (v === undefined) delete next[f.key];
                else next[f.key] = v;
                onChange(next);
              }}
            />
          ))}
        {issue && <span className="df-field-issue">{issue}</span>}
      </fieldset>
    );
  }
  if (spec.type === "list" && !isVector(spec)) {
    const items = Array.isArray(value) ? value : [];
    const set = (next: unknown[]) => onChange(next);
    return (
      <fieldset className={"df-group df-list" + (issue ? " invalid" : "")}>
        <legend>
          {label} <span className="df-count">{items.length}</span>
        </legend>
        {spec.help && <p className="df-help">{spec.help}</p>}
        {items.map((item, i) => (
          <div className="df-list-item" key={i}>
            <Field
              spec={{ ...spec.of, required: true }}
              label={`${spec.of.label || label} ${i + 1}`}
              value={item}
              path={`${path}[${i}]`}
              issues={issues}
              disabled={disabled}
              onChange={(v) => set(items.map((x, j) => (j === i ? v : x)))}
            />
            {!disabled && (
              <button
                type="button"
                className="df-clear"
                title={`Remove ${spec.of.label || "entry"} ${i + 1}`}
                aria-label={`Remove ${spec.of.label || "entry"} ${i + 1}`}
                onClick={() => set(items.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {!disabled && items.length < spec.maxItems && (
          <button
            type="button"
            className="df-add"
            onClick={() => set([...items, defaultFor(spec.of)])}
          >
            <Plus size={14} /> Add {(spec.of.label || "entry").toLowerCase()}
          </button>
        )}
        {issue && <span className="df-field-issue">{issue}</span>}
      </fieldset>
    );
  }
  let control;
  if (spec.type === "list") {
    // Fixed-length number vector.
    const of = spec.of as Extract<FieldSpec, { type: "number" }>;
    const items = Array.isArray(value)
      ? value
      : Array.from({ length: spec.minItems }, () => undefined);
    control = (
      <span className="df-vector">
        {items.map((v, i) => (
          <NumberInput
            key={i}
            spec={{ ...of, unit: i === items.length - 1 ? of.unit : undefined }}
            label={`${label} ${"xyzw"[i] ?? i}`}
            value={v}
            disabled={disabled}
            onChange={(n) => onChange(items.map((x, j) => (j === i ? n : x)))}
          />
        ))}
      </span>
    );
  } else if (spec.type === "json")
    control = (
      <JsonField value={value} onChange={onChange} disabled={disabled} />
    );
  else if (spec.type === "boolean")
    control = (
      <select
        value={present ? String(value) : ""}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            e.target.value === "" ? emptyOf(spec) : e.target.value === "true",
          )
        }
      >
        {removable && <option value="">—</option>}
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  else if (spec.type === "string" && spec.options)
    control = (
      <select
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === "" ? emptyOf(spec) : e.target.value)
        }
      >
        {removable && <option value="">—</option>}
        {typeof value === "string" && !spec.options.includes(value) && (
          <option value={value}>{value} (unknown)</option>
        )}
        {spec.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  else if (spec.type === "string")
    control = (
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        maxLength={spec.maxLength}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) =>
          onChange(
            e.target.value === "" && removable ? emptyOf(spec) : e.target.value,
          )
        }
      />
    );
  else
    control = (
      <NumberInput
        spec={spec}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  return (
    <label
      className={
        "df-field" +
        (issue ? " invalid" : "") +
        (spec.type === "json" ? " wide" : "")
      }
    >
      <span className="df-label">
        {label}
        {spec.required && <em aria-label="required">*</em>}
        {spec.key && <code>{spec.key}</code>}
      </span>
      <span className="df-control">
        {control}
        {clear}
      </span>
      {issue ? (
        <span className="df-field-issue">{issue}</span>
      ) : (
        spec.help && <span className="df-help">{spec.help}</span>
      )}
    </label>
  );
}

export function DefinitionForm({
  fields,
  value,
  issues,
  disabled,
  onChange,
}: {
  fields: readonly FieldSpec[];
  value: Payload;
  issues: readonly DefinitionIssue[];
  disabled: boolean;
  onChange: (next: Payload) => void;
}) {
  return (
    <div className="df-form">
      {fields.map((f) => (
        <Field
          key={f.key}
          spec={f}
          value={value[f.key]}
          path={f.key}
          issues={issues}
          disabled={disabled}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined) delete next[f.key];
            else next[f.key] = v;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}
