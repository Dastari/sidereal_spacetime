/**
 * Form generated from the shared field schema (`@sidereal/sim/content-definitions`). The same
 * schema validates on the server, so a value this form accepts is one the reducer accepts.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  DefinitionIssue,
  FieldSpec,
} from "@sidereal/sim/content-definitions";

type Payload = Record<string, unknown>;

function issueFor(issues: readonly DefinitionIssue[], path: string) {
  return issues.find((i) => i.path === path)?.message;
}

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

function Field({
  spec,
  value,
  path,
  issues,
  disabled,
  onChange,
}: {
  spec: FieldSpec;
  value: unknown;
  path: string;
  issues: readonly DefinitionIssue[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const issue = issueFor(issues, path);
  const optional = !spec.required;
  const clear =
    optional && value !== undefined && !disabled ? (
      <button
        type="button"
        className="df-clear"
        title={`Remove ${spec.label}`}
        aria-label={`Remove ${spec.label}`}
        onClick={() => onChange(undefined)}
      >
        <X size={14} />
      </button>
    ) : null;
  if (spec.type === "object") {
    const included = value !== undefined;
    const obj = (value && typeof value === "object" ? value : {}) as Payload;
    return (
      <fieldset className={"df-group" + (issue ? " invalid" : "")}>
        <legend>
          {optional ? (
            <label className="df-include">
              <input
                type="checkbox"
                checked={included}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked ? {} : undefined)}
              />
              {spec.label}
            </label>
          ) : (
            spec.label
          )}
        </legend>
        {spec.help && <p className="df-help">{spec.help}</p>}
        {included &&
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
  let control;
  if (spec.type === "json")
    control = (
      <JsonField value={value} onChange={onChange} disabled={disabled} />
    );
  else if (spec.type === "boolean")
    control = (
      <select
        value={value === undefined ? "" : String(value)}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            e.target.value === "" ? undefined : e.target.value === "true",
          )
        }
      >
        {optional && <option value="">—</option>}
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
          onChange(e.target.value === "" ? undefined : e.target.value)
        }
      >
        {optional && <option value="">—</option>}
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
            e.target.value === "" && optional ? undefined : e.target.value,
          )
        }
      />
    );
  else
    control = (
      <span className="df-number">
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          step={spec.integer ? 1 : "any"}
          min={spec.min}
          max={spec.max}
          disabled={disabled}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? undefined
                : Number.isFinite(e.target.valueAsNumber)
                  ? e.target.valueAsNumber
                  : e.target.value,
            )
          }
        />
        {spec.unit && <span className="df-unit">{spec.unit}</span>}
      </span>
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
        {spec.label}
        {spec.required && <em aria-label="required">*</em>}
        <code>{spec.key}</code>
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
