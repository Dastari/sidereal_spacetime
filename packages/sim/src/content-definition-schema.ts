/**
 * Field schema language of the content definition registry (wiki `Systems/Content Definitions`).
 * One description drives validation here and form generation in the Studio, so a Studio form
 * never accepts what the server rejects. Pure.
 */
type Common = {
  key: string;
  label: string;
  required?: boolean;
  /** The key is present with `null` meaning "none" (component stat blocks, optional links). */
  nullable?: boolean;
  help?: string;
};
export type FieldSpec =
  | (Common & {
      type: "string";
      minLength?: number;
      maxLength: number;
      pattern?: RegExp;
      patternHint?: string;
      options?: readonly string[];
    })
  | (Common & {
      type: "number";
      integer?: boolean;
      min: number;
      max: number;
      /** Strictly greater than `min`. */
      exclusiveMin?: boolean;
      unit?: string;
    })
  | (Common & { type: "boolean" })
  | (Common & { type: "object"; fields: readonly FieldSpec[] })
  | (Common & {
      /** A list; `of` describes each element (its `key` is ignored). Fixed-length number lists
       * (`minItems === maxItems`) are vectors. */
      type: "list";
      of: FieldSpec;
      minItems: number;
      maxItems: number;
    })
  /** Free JSON object (planned kinds until their batch defines real fields). */
  | (Common & { type: "json" });
export interface DefinitionIssue {
  path: string;
  message: string;
}
export type Payload = Record<string, unknown>;

export const text = (
  key: string,
  label: string,
  maxLength: number,
  extra: Partial<Extract<FieldSpec, { type: "string" }>> = {},
): FieldSpec => ({ key, type: "string", label, maxLength, ...extra });
export const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  extra: Partial<Extract<FieldSpec, { type: "number" }>> = {},
): FieldSpec => ({ key, type: "number", label, min, max, ...extra });
export const flag = (
  key: string,
  label: string,
  extra: Partial<Extract<FieldSpec, { type: "boolean" }>> | string = {},
): FieldSpec => ({
  key,
  type: "boolean",
  label,
  ...(typeof extra === "string" ? { help: extra } : extra),
});
export const group = (
  key: string,
  label: string,
  fields: readonly FieldSpec[],
  extra: Partial<Extract<FieldSpec, { type: "object" }>> = {},
): FieldSpec => ({ key, type: "object", label, fields, ...extra });
export const list = (
  key: string,
  label: string,
  of: FieldSpec,
  minItems: number,
  maxItems: number,
  extra: Partial<Extract<FieldSpec, { type: "list" }>> = {},
): FieldSpec => ({
  key,
  type: "list",
  label,
  of,
  minItems,
  maxItems,
  ...extra,
});
/** Fixed-length number vector (metres unless `unit` says otherwise). */
export const vector = (
  key: string,
  label: string,
  length: number,
  min: number,
  max: number,
  extra: Partial<Extract<FieldSpec, { type: "list" }>> & {
    integer?: boolean;
    unit?: string;
  } = {},
): FieldSpec => {
  const { integer, unit, ...rest } = extra;
  return list(
    key,
    label,
    num("", "", min, max, { integer, unit }),
    length,
    length,
    rest,
  );
};

export const record = (v: unknown): v is Payload =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function jsonDepthOk(v: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (Array.isArray(v)) return v.every((x) => jsonDepthOk(x, depth + 1));
  if (record(v))
    return Object.values(v).every((x) => jsonDepthOk(x, depth + 1));
  return typeof v !== "number" || Number.isFinite(v);
}

function checkValue(
  f: FieldSpec,
  v: unknown,
  path: string,
  issues: DefinitionIssue[],
) {
  if (v === null) {
    if (!f.nullable)
      issues.push({ path, message: "Use absent instead of null" });
    return;
  }
  switch (f.type) {
    case "string":
      if (typeof v !== "string") {
        issues.push({ path, message: "Must be text" });
        break;
      }
      if (v.length > f.maxLength || v.length < (f.minLength ?? 0))
        issues.push({
          path,
          message: `Length must be ${f.minLength ?? 0} to ${f.maxLength}`,
        });
      else if (f.options && !f.options.includes(v))
        issues.push({ path, message: "Not one of the allowed values" });
      else if (f.pattern && !f.pattern.test(v))
        issues.push({ path, message: "Must be " + (f.patternHint ?? "valid") });
      break;
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) {
        issues.push({ path, message: "Must be a number" });
        break;
      }
      if (f.integer && !Number.isInteger(v))
        issues.push({ path, message: "Must be a whole number" });
      if (v > f.max || v < f.min || (f.exclusiveMin && v === f.min))
        issues.push({
          path,
          message: `Must be ${f.exclusiveMin ? "above" : "at least"} ${f.min} and at most ${f.max}`,
        });
      break;
    case "boolean":
      if (typeof v !== "boolean")
        issues.push({ path, message: "Must be true or false" });
      break;
    case "object":
      if (!record(v)) issues.push({ path, message: "Must be an object" });
      else checkFields(v, f.fields, path + ".", issues);
      break;
    case "list":
      if (!Array.isArray(v)) {
        issues.push({ path, message: "Must be a list" });
        break;
      }
      if (v.length < f.minItems || v.length > f.maxItems)
        issues.push({
          path,
          message:
            f.minItems === f.maxItems
              ? `Must have exactly ${f.minItems} values`
              : `Must have ${f.minItems} to ${f.maxItems} entries`,
        });
      v.forEach((item, i) => checkValue(f.of, item, `${path}[${i}]`, issues));
      break;
    case "json":
      if (!record(v)) issues.push({ path, message: "Must be a JSON object" });
      else if (!jsonDepthOk(v))
        issues.push({ path, message: "Too deeply nested or not finite" });
      break;
  }
}
export function checkFields(
  value: Payload,
  fields: readonly FieldSpec[],
  prefix: string,
  issues: DefinitionIssue[],
) {
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(value))
    if (!known.has(key))
      issues.push({ path: prefix + key, message: "Unknown field" });
  for (const f of fields) {
    const path = prefix + f.key,
      v = value[f.key];
    if (v === undefined) {
      if (f.required || f.nullable) issues.push({ path, message: "Required" });
      continue;
    }
    checkValue(f, v, path, issues);
  }
}
