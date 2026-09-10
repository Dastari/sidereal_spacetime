/** Editor preferences only. Structural edits still pass the shared design rules. */
export interface StructuralToolSettings {
  doorWidth: number;
  doorKind: "door" | "passage" | "airlock";
  wallFace: "left" | "right";
  wallFinish: string;
}
export const DEFAULT_STRUCTURAL_TOOLS: StructuralToolSettings = {
  doorWidth: 32,
  doorKind: "door",
  wallFace: "left",
  wallFinish: "standard",
};
export function readStructuralTools(value: unknown): StructuralToolSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Unsupported structural tool preferences");
  const v = value as StructuralToolSettings;
  if (
    !Number.isInteger(v.doorWidth) ||
    v.doorWidth < 16 ||
    v.doorWidth > 256 ||
    !["door", "passage", "airlock"].includes(v.doorKind) ||
    !["left", "right"].includes(v.wallFace) ||
    typeof v.wallFinish !== "string" ||
    !v.wallFinish.trim() ||
    v.wallFinish.length > 128
  )
    throw Error("Unsupported structural tool preferences");
  return {
    doorWidth: v.doorWidth,
    doorKind: v.doorKind,
    wallFace: v.wallFace,
    wallFinish: v.wallFinish,
  };
}
export function structuralTools(
  value?: StructuralToolSettings,
): StructuralToolSettings {
  return value ? readStructuralTools(value) : { ...DEFAULT_STRUCTURAL_TOOLS };
}
