import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  CREW_HEAD_CATALOG,
  crewHeadAssetUrl,
} from "@sidereal/content/crew-heads";

export const HEAD_ART_CANDIDATE = "refinement-r005";
export const HEAD_ART_MANIFEST_SHA256 =
  "5532242e63549c7182c4f28721f5da13cba48d4abfbdd2b4d07b40ca67a0fd11";
const BASE = `/assets/crew/heads/${HEAD_ART_CANDIDATE}/`;
type FilePin = { path: string; sha256: string; bytes: number; nodes: string[] };
export type HeadArtManifest = {
  schema: string;
  id: string;
  legacyCatalogRevision: number;
  voxelMeters: number;
  headScale: number;
  hairStyles: string[];
  hairModes: string[];
  helmets: string[];
  visors: string[];
  intentionalOpenHelmets: string[];
  space: unknown;
  maps: Record<string, never>;
  files: Record<string, FilePin>;
};
const equal = (a: string[], b: string[]) =>
  Array.isArray(a) &&
  a.length === b.length &&
  [...a].sort().join("|") === [...b].sort().join("|");

/** A review manifest replaces only hair and helmets in the unchanged head-space/catalog frame. */
export function validateHeadArtManifest(value: unknown): HeadArtManifest {
  const m = value as HeadArtManifest;
  const c = CREW_HEAD_CATALOG;
  if (
    !m ||
    m.schema !== "sidereal.crew-head-art.v1" ||
    m.id !== HEAD_ART_CANDIDATE ||
    m.legacyCatalogRevision !== c.revision ||
    m.voxelMeters !== c.voxelMeters ||
    m.headScale !== 0.9 ||
    JSON.stringify(m.space) !== JSON.stringify(c.space) ||
    !equal(
      m.hairStyles,
      c.hairStyles.map((h) => h.id),
    ) ||
    !equal(m.hairModes, ["full", "cap", "fringe"]) ||
    !equal(
      m.helmets,
      c.helmets.map((h) => h.id),
    ) ||
    !equal(
      m.visors,
      c.visors.map((v) => v.id),
    ) ||
    !equal(m.intentionalOpenHelmets, ["open"]) ||
    !m.maps ||
    Object.keys(m.maps).length !== 0
  )
    throw new Error("incompatible character art manifest");
  const expected: Record<string, string[]> = {
    helmets: c.helmets.flatMap((h) => [
      `helmet.${h.id}`,
      ...(h.id === "open" ? [] : c.visors.map((v) => `visor.${h.id}.${v.id}`)),
    ]),
  };
  for (const h of c.hairStyles)
    expected[`hair/${h.id}`] = m.hairModes.flatMap((mode) => [
      `hair.${h.id}.${mode}`,
      `hair.${h.id}.${mode}.lod1`,
    ]);
  if (!m.files || !equal(Object.keys(m.files), Object.keys(expected)))
    throw new Error("incomplete character art file mapping");
  for (const [key, nodes] of Object.entries(expected)) {
    const f = m.files[key];
    if (
      !f ||
      f.path !== `${key}.glb` ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes <= 20 ||
      !equal(f.nodes, nodes)
    )
      throw new Error(`invalid character art pin ${key}`);
  }
  return m;
}

/** Inspect exactly the bytes fed to Babylon. Candidates are self-contained COLOR_0 GLBs. */
export function validateHeadArtBytes(
  bytes: Uint8Array,
  pin: FilePin,
): Uint8Array {
  if (
    bytes.byteLength !== pin.bytes ||
    bytesToHex(sha256(bytes)) !== pin.sha256
  )
    throw new Error("character art byte hash mismatch");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error("invalid character art GLB");
  const doc = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))),
  );
  const jsonEnd = 20 + view.getUint32(12, true);
  if (
    jsonEnd + 8 > bytes.length ||
    view.getUint32(jsonEnd + 4, true) !== 0x004e4942 ||
    jsonEnd + 8 + view.getUint32(jsonEnd, true) !== bytes.length ||
    doc.buffers?.length !== 1 ||
    doc.buffers[0].byteLength > view.getUint32(jsonEnd, true) ||
    doc.images?.length ||
    doc.textures?.length ||
    doc.skins?.length ||
    doc.animations?.length
  )
    throw new Error("invalid character art embedded geometry");
  const names = (doc.nodes ?? [])
    .filter((n: { mesh?: number }) => n.mesh !== undefined)
    .map((n: { name: string }) => n.name);
  if (
    !equal(names, pin.nodes) ||
    (doc.images ?? []).some((i: { uri?: string }) => i.uri) ||
    (doc.buffers ?? []).some((b: { uri?: string }) => b.uri) ||
    (doc.materials ?? []).some(
      (m: { name?: string }) =>
        !(
          pin.path.startsWith("hair/")
            ? /^crew\.hair(\.\d+)?$/
            : /^crew\.(suit_primary|suit_secondary|accent|metal|dark|emit|glass)(\.\d+)?$/
        ).test(m.name ?? ""),
    )
  )
    throw new Error("invalid character art nodes, slots or external maps");
  const roots = doc.scenes?.[doc.scene ?? 0]?.nodes;
  if (
    !Array.isArray(roots) ||
    roots.some((i: number) => !Number.isInteger(i) || !doc.nodes?.[i]) ||
    !equal(
      roots.map((i: number) => doc.nodes[i].name),
      pin.nodes,
    )
  )
    throw new Error("character art required nodes missing from active scene");
  const widths: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
  };
  const sizes: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  for (const a of doc.accessors ?? []) {
    const b = doc.bufferViews?.[a.bufferView];
    const width = widths[a.type],
      size = sizes[a.componentType];
    const start = (b?.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = b?.byteStride ?? width * size;
    if (
      !b ||
      b.buffer !== 0 ||
      a.sparse ||
      !width ||
      !size ||
      !Number.isSafeInteger(a.count) ||
      a.count <= 0 ||
      stride < width * size ||
      start < 0 ||
      start + (a.count - 1) * stride + width * size >
        doc.buffers[0].byteLength ||
      (a.byteOffset ?? 0) + (a.count - 1) * stride + width * size > b.byteLength
    )
      throw new Error("invalid character art accessor bounds");
    if (a.componentType === 5126)
      for (let i = 0; i < a.count; i++)
        for (let k = 0; k < width; k++)
          if (
            !Number.isFinite(
              view.getFloat32(
                jsonEnd + 8 + start + i * stride + k * size,
                true,
              ),
            )
          )
            throw new Error("non-finite character art geometry");
  }
  for (const n of doc.nodes ?? []) {
    if (n.matrix || n.translation || n.rotation || n.scale || n.children)
      throw new Error("character art frame must be baked");
    const primitives = doc.meshes?.[n.mesh]?.primitives;
    if (!Array.isArray(primitives) || !primitives.length)
      throw new Error("character art required node has no geometry");
    for (const p of primitives) {
      const pos = doc.accessors[p.attributes?.POSITION];
      const normal = doc.accessors[p.attributes?.NORMAL];
      const color = doc.accessors[p.attributes?.COLOR_0];
      const index = doc.accessors[p.indices];
      const uv = doc.accessors[p.attributes?.TEXCOORD_0];
      if (
        !pos ||
        pos.type !== "VEC3" ||
        pos.componentType !== 5126 ||
        !normal ||
        normal.count !== pos.count ||
        normal.type !== "VEC3" ||
        !color ||
        color.count !== pos.count ||
        !["VEC3", "VEC4"].includes(color.type) ||
        (p.attributes?.TEXCOORD_0 !== undefined &&
          (!uv ||
            uv.type !== "VEC2" ||
            uv.componentType !== 5126 ||
            uv.count !== pos.count)) ||
        !index ||
        index.type !== "SCALAR" ||
        ![5121, 5123, 5125].includes(index.componentType) ||
        index.count % 3 ||
        (p.mode ?? 4) !== 4 ||
        !doc.materials[p.material] ||
        pos.min?.length !== 3 ||
        pos.max?.length !== 3 ||
        !pos.min.every(
          (v: number, k: number) =>
            Number.isFinite(v) && v >= -1.5 && v <= pos.max[k],
        ) ||
        !pos.max.every((v: number) => Number.isFinite(v) && v <= 1.5)
      )
        throw new Error("invalid character art channels or head-space bounds");
      const positionView = doc.bufferViews[pos.bufferView];
      const positionStart =
        jsonEnd + 8 + (positionView.byteOffset ?? 0) + (pos.byteOffset ?? 0);
      for (let i = 0; i < pos.count; i++)
        for (let k = 0; k < 3; k++) {
          const v = view.getFloat32(
            positionStart + i * (positionView.byteStride ?? 12) + k * 4,
            true,
          );
          if (
            Math.abs(v) > 1.5 ||
            v < pos.min[k] - 1e-6 ||
            v > pos.max[k] + 1e-6
          )
            throw new Error(
              "character art position outside declared or head-space bounds",
            );
        }
      const b = doc.bufferViews[index.bufferView];
      const size = sizes[index.componentType];
      const start = jsonEnd + 8 + (b.byteOffset ?? 0) + (index.byteOffset ?? 0);
      for (let i = 0; i < index.count; i++) {
        const offset = start + i * (b.byteStride ?? size);
        const value =
          size === 1
            ? view.getUint8(offset)
            : size === 2
              ? view.getUint16(offset, true)
              : view.getUint32(offset, true);
        if (value >= pos.count)
          throw new Error("character art index outside vertex channel");
      }
    }
  }
  return bytes;
}

/** Own only immutable bytes here; GPU containers/materials remain owned by each attachment. */
export async function headArtSources(
  keys: string[],
  revision: string | undefined,
) {
  const legacy = () => new Map(keys.map((key) => [key, crewHeadAssetUrl(key)]));
  if (!revision || revision === "legacy")
    return { sources: legacy(), error: undefined };
  try {
    if (revision !== HEAD_ART_CANDIDATE)
      throw new Error(`unknown character art revision ${revision}`);
    const response = await fetch(BASE + "manifest.json");
    if (!response.ok)
      throw new Error(`character art manifest HTTP ${response.status}`);
    const manifestText = await response.text();
    if (
      bytesToHex(sha256(new TextEncoder().encode(manifestText))) !==
      HEAD_ART_MANIFEST_SHA256
    )
      throw new Error("character art manifest hash mismatch");
    const manifest = validateHeadArtManifest(JSON.parse(manifestText));
    const entries = await Promise.all(
      keys.map(async (key) => {
        const pin = manifest.files[key];
        if (!pin) return [key, crewHeadAssetUrl(key)] as const;
        const r = await fetch(BASE + pin.path);
        if (!r.ok) throw new Error(`character art asset HTTP ${r.status}`);
        const data = validateHeadArtBytes(
          new Uint8Array(await r.arrayBuffer()),
          pin,
        );
        return [key, data] as const;
      }),
    );
    return {
      sources: new Map<string, string | Uint8Array>(entries),
      error: undefined,
    };
  } catch (error) {
    return { sources: legacy(), error: String(error) };
  }
}
