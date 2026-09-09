export interface DraftOptions {
  boundary: "none" | "r001" | "r004";
  roofs: boolean;
  revision: string;
}

/** Local recovery carries the revision last read by this editor, never a newer
 * remote revision: concurrent edits must still fail the authority's CAS check. */
export function readDraftOptions(raw: string | null): DraftOptions | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as DraftOptions;
    if (
      !["none", "r001", "r004"].includes(value.boundary) ||
      typeof value.roofs !== "boolean" ||
      typeof value.revision !== "string" ||
      !/^(0|[1-9]\d{0,19})$/.test(value.revision) ||
      BigInt(value.revision) > 18446744073709551615n
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function draftOptionsKey(
  subject: string,
  workspace: string,
  draft: string,
): string {
  return (
    "sidereal.authoring.options:" + JSON.stringify([subject, workspace, draft])
  );
}
