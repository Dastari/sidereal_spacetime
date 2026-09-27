import type { Material } from "@babylonjs/core/Materials/material";
import { constructionHash } from "@sidereal/sim/construction-transactions";
const signatures = new WeakMap<
  Material,
  { signature: string; textures: ReturnType<Material["getActiveTextures"]> }
>();
const hash = constructionHash;
function canonical(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
}
const digest = (value: unknown) =>
  hash(new TextEncoder().encode(JSON.stringify(canonical(value))));
/** Material indices are resolved through exact pinned GLB texture/image records.
 * Unsupported containers/extensions remain unpooled; material names never identify
 * assets. Every authored material property, texcoord/transform, sampler, MIME type
 * and embedded image byte contributes to the signature. */
export function insetNativeMaterialSignatures(
  bytes: Uint8Array,
): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      bytes.byteLength < 28 ||
      bytes.byteLength > 64 * 1024 * 1024 ||
      view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== bytes.byteLength
    )
      return out;
    const length = view.getUint32(12, true);
    if (
      length > 4 * 1024 * 1024 ||
      20 + length + 8 > bytes.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a
    )
      return out;
    const doc = JSON.parse(
      new TextDecoder().decode(bytes.subarray(20, 20 + length)),
    );
    if (view.getUint32(24 + length, true) !== 0x004e4942) return out;
    const binary = bytes.subarray(
      28 + length,
      28 + length + view.getUint32(20 + length, true),
    );
    const supported = new Set([
      "KHR_materials_clearcoat",
      "KHR_materials_emissive_strength",
      "KHR_texture_transform",
      "KHR_materials_unlit",
      "KHR_materials_ior",
    ]);
    if ((doc.extensionsUsed ?? []).some((x: string) => !supported.has(x)))
      return out;
    const texture = (index: number) => {
      const t = doc.textures?.[index];
      if (!Number.isInteger(index) || !t || t.extensions)
        throw Error("Unsupported native texture");
      const image = doc.images?.[t.source],
        buffer = doc.bufferViews?.[image?.bufferView];
      if (!image || image.uri || !buffer || (buffer.buffer ?? 0) !== 0)
        throw Error("Embedded native image required");
      const offset = buffer.byteOffset ?? 0;
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(buffer.byteLength) ||
        offset < 0 ||
        buffer.byteLength <= 0 ||
        offset + buffer.byteLength > binary.length
      )
        throw Error("Invalid native image bounds");
      const { name: _name, source: _source, sampler: _sampler, ...rest } = t;
      const sampler =
        t.sampler === undefined ? null : doc.samplers?.[t.sampler];
      if (t.sampler !== undefined && !sampler)
        throw Error("Invalid native sampler");
      return {
        texture: rest,
        sampler,
        image: {
          mimeType: image.mimeType,
          sha256: hash(binary.subarray(offset, offset + buffer.byteLength)),
        },
      };
    };
    const normalize = (value: unknown, key = ""): unknown => {
      if (Array.isArray(value)) return value.map((v) => normalize(v));
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [
            k,
            k === "index" && key.endsWith("Texture")
              ? texture(v as number)
              : normalize(v, k),
          ]),
        );
      return value;
    };
    if (!Array.isArray(doc.materials) || doc.materials.length > 1024)
      return out;
    doc.materials.forEach((m: Record<string, unknown>, i: number) => {
      try {
        const { name: _name, ...properties } = m;
        out.set(i, digest(normalize(properties)));
      } catch {
        /* Only the unsupported material stays unpooled. */
      }
    });
  } catch {
    /* A batching optimization never makes native asset loading fail. */
  }
  return out;
}
/** Babylon's loader records material JSON pointers; no name/order heuristic. */
export function registerInsetNativeMaterials(
  materials: readonly Material[],
  bytes: Uint8Array,
) {
  const keys = insetNativeMaterialSignatures(bytes);
  let count = 0;
  for (const material of materials) {
    const metadata = (
      material as unknown as {
        _internalMetadata?: { gltf?: { pointers?: string[] } };
      }
    )._internalMetadata;
    const pointers = metadata?.gltf?.pointers;
    if (pointers?.length !== 1) continue;
    const match = /^\/materials\/(\d+)$/.exec(pointers[0]);
    const signature = match ? keys.get(Number(match[1])) : undefined;
    if (signature) {
      signatures.set(material, {
        signature,
        textures: [...material.getActiveTextures()],
      });
      count++;
    }
  }
  return count;
}
/** Serialized runtime policy supplements the authored GLB signature: shader
 * switches, color/roughness changes and UV state cannot pool accidentally. Texture
 * names/URLs/IDs are transport identities; their bytes were resolved above. */
export function insetNativeMaterialKey(material: Material): string {
  const entry = signatures.get(material);
  const textures = material.getActiveTextures();
  if (
    !entry ||
    textures.length !== entry.textures.length ||
    textures.some((t, i) => t !== entry.textures[i]) ||
    material.getClassName() !== "PBRMaterial"
  )
    return "identity:" + material.uniqueId;
  try {
    const scrub = (value: unknown, field = "material"): unknown => {
      if (Array.isArray(value)) return value.map((v) => scrub(v, field));
      if (!value || typeof value !== "object") return value;
      const texture = field.toLowerCase().endsWith("texture");
      return Object.fromEntries(
        Object.entries(value)
          .filter(([k]) => {
            if (
              (field === "material" || texture) &&
              ["name", "id", "uniqueId"].includes(k)
            )
              return false;
            if (
              texture &&
              ["internalTextureUniqueId", "url", "base64String"].includes(k)
            )
              return false;
            return true;
          })
          .map(([k, v]) => [k, scrub(v, k)]),
      );
    };
    return entry.signature + ":" + digest(scrub(material.serialize()));
  } catch {
    return "identity:" + material.uniqueId;
  }
}
