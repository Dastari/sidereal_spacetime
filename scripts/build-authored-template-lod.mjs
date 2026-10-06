/** Offline, additive LOD derivatives. Original native bytes are never overwritten. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer/simplifier";

export const POLICY = Object.freeze({
  revision: "template-lod-r001",
  simplifier: "meshoptimizer@1.3.0",
  targetRatio: 0.12,
  absoluteError: 0.012,
  normalWeight: 0.3,
  uvWeight: 1,
  tangentWeight: 0.1,
  flags: ["LockBorder", "ErrorAbsolute", "Permissive", "ErrorClamped"],
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const components = {
  5121: [1, "readUInt8"],
  5123: [2, "readUInt16LE"],
  5125: [4, "readUInt32LE"],
  5126: [4, "readFloatLE"],
};

export function readGlb(bytes) {
  if (
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw Error("Invalid native GLB header");
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const kind = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > bytes.length || length % 4) throw Error("Invalid GLB chunk");
    const chunk = bytes.subarray(offset + 8, end);
    if (kind === 0x4e4f534a && !json) json = JSON.parse(chunk.toString());
    else if (kind === 0x004e4942 && !binary) binary = chunk;
    else throw Error("Unsupported GLB chunk");
    offset = end;
  }
  if (!json || !binary || json.buffers?.length !== 1 || json.buffers[0].uri)
    throw Error("LOD requires one embedded native buffer");
  return { json, binary };
}

export function accessorData(doc, binary, index) {
  const accessor = doc.accessors[index];
  const view = doc.bufferViews[accessor?.bufferView];
  const width = widths[accessor?.type];
  const component = components[accessor?.componentType];
  if (
    !view ||
    !width ||
    !component ||
    accessor.sparse ||
    accessor.extensions ||
    view.extensions ||
    view.buffer !== 0 ||
    !Number.isInteger(accessor.count) ||
    accessor.count < 1
  )
    throw Error("Unsupported native accessor");
  const [size, read] = component;
  const stride = view.byteStride ?? size * width;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (
    stride < size * width ||
    start + (accessor.count - 1) * stride + size * width > binary.length
  )
    throw Error("Native accessor outside embedded buffer");
  const values = [];
  for (let vertex = 0; vertex < accessor.count; vertex++)
    for (let channel = 0; channel < width; channel++) {
      const value = binary[read](start + vertex * stride + channel * size);
      if (!Number.isFinite(value)) throw Error("Nonfinite native attribute");
      values.push(value);
    }
  return { accessor, width, size, values };
}

/** Index-only simplification: retained channels are exact source values. */
export async function deriveGlb(bytes) {
  await MeshoptSimplifier.ready;
  const { json: source, binary } = readGlb(bytes);
  if (source.skins?.length || source.animations?.length)
    throw Error("Skinned/animated sources need a separate LOD producer");
  const doc = structuredClone(source);
  doc.accessors = [];
  doc.bufferViews = [];
  const chunks = [];
  let byteLength = 0;
  const append = (bytes, target) => {
    const padding = Buffer.alloc((4 - (byteLength % 4)) % 4);
    chunks.push(padding, bytes);
    byteLength += padding.length;
    const index = doc.bufferViews.length;
    doc.bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: bytes.length,
      ...(target ? { target } : {}),
    });
    byteLength += bytes.length;
    return index;
  };
  const encode = (values, type, componentType, minMax = false) => {
    const width = widths[type];
    const array =
      componentType === 5126
        ? new Float32Array(values)
        : componentType === 5123
          ? new Uint16Array(values)
          : componentType === 5121
            ? new Uint8Array(values)
            : new Uint32Array(values);
    const bufferView = append(
      Buffer.from(array.buffer),
      type === "SCALAR" ? 34963 : 34962,
    );
    const accessor = {
      bufferView,
      componentType,
      count: values.length / width,
      type,
    };
    if (minMax) {
      accessor.min = Array(width).fill(Infinity);
      accessor.max = Array(width).fill(-Infinity);
      for (let i = 0; i < values.length; i++) {
        accessor.min[i % width] = Math.min(accessor.min[i % width], values[i]);
        accessor.max[i % width] = Math.max(accessor.max[i % width], values[i]);
      }
    }
    doc.accessors.push(accessor);
    return doc.accessors.length - 1;
  };
  const metrics = [];
  for (let meshIndex = 0; meshIndex < source.meshes.length; meshIndex++) {
    const mesh = source.meshes[meshIndex];
    for (
      let primitiveIndex = 0;
      primitiveIndex < mesh.primitives.length;
      primitiveIndex++
    ) {
      const primitive = mesh.primitives[primitiveIndex];
      if (
        (primitive.mode ?? 4) !== 4 ||
        primitive.targets ||
        primitive.extensions
      )
        throw Error("Unsupported native primitive");
      const streams = Object.fromEntries(
        Object.entries(primitive.attributes).map(([name, index]) => [
          name,
          accessorData(source, binary, index),
        ]),
      );
      const positions = streams.POSITION;
      if (
        !positions ||
        !streams.NORMAL ||
        positions.width !== 3 ||
        streams.NORMAL.width !== 3 ||
        (streams.TANGENT && streams.TANGENT.width !== 4) ||
        Object.entries(streams).some(
          ([name, stream]) =>
            name.startsWith("TEXCOORD_") && stream.width !== 2,
        ) ||
        Object.values(streams).some(
          (s) =>
            s.accessor.componentType !== 5126 ||
            s.accessor.normalized ||
            s.accessor.count !== positions.accessor.count,
        )
      )
        throw Error("LOD requires complete float native vertex channels");
      const indexStream = accessorData(source, binary, primitive.indices);
      if (
        indexStream.width !== 1 ||
        ![5121, 5123, 5125].includes(indexStream.accessor.componentType)
      )
        throw Error("LOD requires unsigned scalar indices");
      let indices = Uint32Array.from(indexStream.values);
      if (
        indices.length % 3 ||
        indices.some((i) => i >= positions.accessor.count)
      )
        throw Error("Invalid source triangle indices");
      const before = indices.length / 3;
      const material = source.materials?.[primitive.material];
      const protectedPrimitive =
        material?.alphaMode === "BLEND" ||
        material?.alphaMode === "MASK" ||
        material?.emissiveFactor?.some((c) => c > 0) ||
        (material?.extensions?.KHR_materials_transmission?.transmissionFactor ??
          0) > 0;
      let error = 0;
      if (!protectedPrimitive && indices.length > 36) {
        const attributes = Object.entries(streams).filter(
          ([name]) => name !== "POSITION",
        );
        const weights = attributes.flatMap(([name, stream]) =>
          Array(stream.width).fill(
            name === "NORMAL"
              ? POLICY.normalWeight
              : name.startsWith("TEXCOORD")
                ? POLICY.uvWeight
                : name === "TANGENT"
                  ? POLICY.tangentWeight
                  : 1,
          ),
        );
        const values = new Float32Array(
          positions.accessor.count * weights.length,
        );
        for (let i = 0; i < positions.accessor.count; i++) {
          let channel = 0;
          for (const [, stream] of attributes)
            for (let c = 0; c < stream.width; c++)
              values[i * weights.length + channel++] =
                stream.values[i * stream.width + c];
        }
        [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
          indices,
          Float32Array.from(positions.values),
          3,
          values,
          weights.length,
          weights,
          null,
          Math.max(
            3,
            Math.floor((indices.length * POLICY.targetRatio) / 3) * 3,
          ),
          POLICY.absoluteError,
          POLICY.flags,
        );
        if (
          !indices.length ||
          !Number.isFinite(error) ||
          error > POLICY.absoluteError + 1e-7
        )
          throw Error("Derivative exceeded its appearance-error policy");
      }
      // Compact every stream together; no rebuilding normals or dropping UV/tangent channels.
      const order = protectedPrimitive
        ? Array.from({ length: positions.accessor.count }, (_, i) => i)
        : [...new Set(indices)];
      const remap = new Map(order.map((index, i) => [index, i]));
      const output = doc.meshes[meshIndex].primitives[primitiveIndex];
      output.attributes = Object.fromEntries(
        Object.entries(streams).map(([name, stream]) => [
          name,
          encode(
            order.flatMap((i) =>
              stream.values.slice(i * stream.width, (i + 1) * stream.width),
            ),
            stream.accessor.type,
            5126,
            name === "POSITION",
          ),
        ]),
      );
      output.indices = encode(
        Array.from(indices, (i) => remap.get(i)),
        "SCALAR",
        protectedPrimitive
          ? source.accessors[primitive.indices].componentType
          : 5125,
      );
      metrics.push({
        mesh: meshIndex,
        primitive: primitiveIndex,
        material: material?.name ?? null,
        attributes: Object.keys(streams),
        before,
        after: indices.length / 3,
        protected: Boolean(protectedPrimitive),
        error,
      });
    }
  }
  for (const image of doc.images ?? []) {
    if (image.uri || image.bufferView === undefined)
      throw Error("LOD requires embedded images");
    const view = source.bufferViews[image.bufferView];
    image.bufferView = append(
      binary.subarray(
        view.byteOffset ?? 0,
        (view.byteOffset ?? 0) + view.byteLength,
      ),
    );
  }
  const packed = Buffer.concat([
    ...chunks,
    Buffer.alloc((4 - (byteLength % 4)) % 4),
  ]);
  doc.buffers = [{ byteLength }];
  doc.asset.extras = {
    ...doc.asset.extras,
    runtimeLod: POLICY.revision,
    sourceSha256: digest(bytes),
  };
  let encoded = Buffer.from(JSON.stringify(doc));
  encoded = Buffer.concat([
    encoded,
    Buffer.alloc((4 - (encoded.length % 4)) % 4, 32),
  ]);
  const result = Buffer.alloc(12 + 8 + encoded.length + 8 + packed.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(encoded.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(result, 20);
  const offset = 20 + encoded.length;
  result.writeUInt32LE(packed.length, offset);
  result.writeUInt32LE(0x004e4942, offset + 4);
  packed.copy(result, offset + 8);
  return { bytes: result, metrics };
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const input = resolve(
    root,
    "assets/runtime/ship-study/template-authored-r001",
  );
  const output = resolve(
    process.argv[2] ?? `${root}/assets/runtime/ship-study/${POLICY.revision}`,
  );
  if (output === input) throw Error("Refusing to replace native source kit");
  const original = await readFile(`${input}/manifest.json`);
  const sourceManifestSha256 = digest(original);
  if (
    sourceManifestSha256 !==
    "554c46e354d719460d0a730e06822f71fe5d23932fb779012344fa601df88cec"
  )
    throw Error("Changed native source manifest");
  const source = JSON.parse(original);
  await mkdir(output, { recursive: true });
  const pieces = [];
  for (const piece of source.pieces) {
    const native = await readFile(`${input}/${piece.file}`);
    if (digest(native) !== piece.sha256)
      throw Error(`Changed source ${piece.id}`);
    const derivative = await deriveGlb(native);
    const triangles = derivative.metrics.reduce((n, p) => n + p.after, 0);
    if (
      derivative.metrics.reduce((n, p) => n + p.before, 0) !== piece.triangles
    )
      throw Error(`Source triangle mismatch ${piece.id}`);
    await writeFile(`${output}/${piece.file}`, derivative.bytes);
    pieces.push({
      id: piece.id,
      file: piece.file,
      sourceSha256: piece.sha256,
      sha256: digest(derivative.bytes),
      triangles,
      sourceTriangles: piece.triangles,
      frame: piece.frame,
      sourceBytes: native.length,
      bytes: derivative.bytes.length,
      primitives: derivative.metrics,
    });
  }
  const manifest = {
    schema: "sidereal.authored-template-lod/v1",
    revision: POLICY.revision,
    sourceManifestSha256,
    policy: POLICY,
    pieces,
    producerSha256: digest(await readFile(fileURLToPath(import.meta.url))),
  };
  const totals = pieces.reduce(
    (n, p) => ({
      sourceTriangles: n.sourceTriangles + p.sourceTriangles,
      triangles: n.triangles + p.triangles,
      sourceBytes: n.sourceBytes + p.sourceBytes,
      bytes: n.bytes + p.bytes,
    }),
    { sourceTriangles: 0, triangles: 0, sourceBytes: 0, bytes: 0 },
  );
  manifest.totals = totals;
  const encoded = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(`${output}/manifest.json`, encoded);
  console.log(
    JSON.stringify({
      pieces: pieces.length,
      ...totals,
      manifestSha256: digest(encoded),
    }),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
