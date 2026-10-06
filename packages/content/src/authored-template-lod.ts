import {
  AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
  type AuthoredTemplateKit,
  type AuthoredTemplatePiece,
} from "./authored-template-kit";

/** Additive runtime derivatives; native authoring/editor sources remain unchanged. */
export const AUTHORED_TEMPLATE_LOD_BASE =
  "/assets/ship-study/template-lod-r001/";
export const AUTHORED_TEMPLATE_LOD_MANIFEST_SHA256 =
  "dcd9e7e7069a333fb6e44ec300ccb218f557bff0a88ac0210355612767005cc9";
export interface AuthoredTemplateLodPiece extends AuthoredTemplatePiece {
  readonly sourceSha256: string;
}

/** A partial or differently pinned pack cannot silently replace native pieces. */
export function readAuthoredTemplateLod(
  input: unknown,
  source: AuthoredTemplateKit,
): readonly AuthoredTemplateLodPiece[] {
  const fail = (): never => {
    throw Error("Invalid authored template LOD source/provenance");
  };
  if (!input || typeof input !== "object") fail();
  const doc = input as Record<string, unknown>;
  if (
    doc.schema !== "sidereal.authored-template-lod/v1" ||
    doc.revision !== "template-lod-r001" ||
    doc.sourceManifestSha256 !== AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256 ||
    !Array.isArray(doc.pieces) ||
    doc.pieces.length !== source.pieces.length
  )
    fail();
  const seen = new Set<string>();
  const originals = new Map(source.pieces.map((p) => [p.id, p]));
  return (doc.pieces as unknown[]).map((row) => {
    if (!row || typeof row !== "object") fail();
    const value = row as Record<string, unknown>;
    const native = originals.get(String(value.id));
    if (
      !native ||
      seen.has(native.id) ||
      value.file !== native.file ||
      value.sourceSha256 !== native.sha256 ||
      value.frame !== native.frame ||
      value.sourceTriangles !== native.triangles ||
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !Number.isInteger(value.triangles) ||
      (value.triangles as number) < 1 ||
      (value.triangles as number) > native.triangles
    )
      fail();
    seen.add(native!.id);
    return {
      ...native!,
      sourceSha256: native!.sha256,
      sha256: value.sha256 as string,
      triangles: value.triangles as number,
    };
  });
}
