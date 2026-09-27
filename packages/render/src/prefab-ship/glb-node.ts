/** Select a named, identity-transform mesh node from the Blender bow bundle.
 * Repack only its accessors before handing it to the normal Babylon GLB loader.
 * The file is fetched/decoded once; unused variants never create Babylon objects.
 */
interface Accessor {
  bufferView: number;
  [key: string]: unknown;
}
interface BufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  [key: string]: unknown;
}
interface Primitive {
  attributes: Record<string, number>;
  indices: number;
  material: number;
  mode?: number;
}
interface BundleDocument {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  nodes: {
    name: string;
    mesh: number;
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    children?: number[];
  }[];
  meshes: { name?: string; primitives: Primitive[] }[];
  materials: unknown[];
  accessors: Accessor[];
  bufferViews: BufferView[];
}
const decoded = new WeakMap<
  Uint8Array,
  { doc: BundleDocument; binary: Uint8Array }
>();

export function selectGlbNode(bytes: Uint8Array, name: string): Uint8Array {
  let bundle = decoded.get(bytes);
  if (!bundle) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const doc = JSON.parse(
      new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)),
    ) as BundleDocument;
    bundle = { doc, binary: bytes.subarray(28 + jsonLength) };
    decoded.set(bytes, bundle);
  }
  const { doc, binary } = bundle;
  const node = doc.nodes.find((n) => n.name === name);
  if (
    !node ||
    node.matrix ||
    node.translation ||
    node.rotation ||
    node.scale ||
    node.children
  )
    throw Error(`Missing or non-local bundle node: ${name}`);
  const source = doc.meshes[node.mesh];
  if (!source) throw Error(`Missing mesh for bundle node: ${name}`);
  const accessors: Accessor[] = [],
    bufferViews: BufferView[] = [],
    materials: unknown[] = [];
  const chunks: { offset: number; data: Uint8Array }[] = [];
  const materialMap = new Map<number, number>();
  let binaryLength = 0;
  function append(
    data: Uint8Array,
    spec: Omit<Accessor, "bufferView">,
    target: number,
  ): number {
    binaryLength = (binaryLength + 3) & ~3;
    chunks.push({ offset: binaryLength, data });
    bufferViews.push({
      buffer: 0,
      byteOffset: binaryLength,
      byteLength: data.length,
      target,
    });
    binaryLength += data.length;
    const index = accessors.length;
    accessors.push({ ...spec, bufferView: bufferViews.length - 1 });
    return index;
  }
  const primitives = source.primitives.map((p) => {
    let material = materialMap.get(p.material);
    if (material === undefined) {
      material = materials.length;
      materials.push(doc.materials[p.material]);
      materialMap.set(p.material, material);
    }
    const ia = doc.accessors[p.indices],
      iv = doc.bufferViews[ia.bufferView];
    const data = new DataView(
      binary.buffer,
      binary.byteOffset,
      binary.byteLength,
    );
    const size =
      ia.componentType === 5125 ? 4 : ia.componentType === 5123 ? 2 : 1;
    const offset = (iv.byteOffset ?? 0) + Number(ia.byteOffset ?? 0);
    const used = new Map<number, number>();
    const local = new Uint32Array(Number(ia.count));
    for (let i = 0; i < local.length; i++) {
      const at = offset + i * size;
      const index =
        size === 4
          ? data.getUint32(at, true)
          : size === 2
            ? data.getUint16(at, true)
            : data.getUint8(at);
      if (!used.has(index)) used.set(index, used.size);
      local[i] = used.get(index)!;
    }
    const indices = append(
      new Uint8Array(local.buffer),
      { componentType: 5125, count: local.length, type: "SCALAR" },
      34963,
    );
    const attributes: Record<string, number> = {};
    for (const [key, index] of Object.entries(p.attributes)) {
      const a = doc.accessors[index],
        v = doc.bufferViews[a.bufferView];
      if (v.buffer !== 0 || a.type !== "VEC3")
        throw Error("Bow bundle attributes must be embedded VEC3 arrays");
      const width =
        a.componentType === 5126 ? 12 : a.componentType === 5120 ? 3 : 0;
      if (!width) throw Error("Unsupported bow bundle attribute encoding");
      const compact = new Uint8Array(used.size * width);
      const base = (v.byteOffset ?? 0) + Number(a.byteOffset ?? 0);
      for (const [original, localIndex] of used) {
        const start = base + original * Number(v.byteStride ?? width);
        compact.set(binary.subarray(start, start + width), localIndex * width);
      }
      const spec = { ...a, count: used.size, byteOffset: 0 };
      if (key === "POSITION") {
        const values = new DataView(compact.buffer);
        const min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < used.size; i++)
          for (let k = 0; k < 3; k++) {
            const value = values.getFloat32(i * 12 + k * 4, true);
            min[k] = Math.min(min[k], value);
            max[k] = Math.max(max[k], value);
          }
        Object.assign(spec, { min, max });
      }
      attributes[key] = append(compact, spec, 34962);
    }
    return { ...p, material, indices, attributes };
  });
  binaryLength = (binaryLength + 3) & ~3;
  const selected = {
    asset: { version: "2.0" },
    extensionsUsed: doc.extensionsUsed,
    extensionsRequired: doc.extensionsRequired,
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binaryLength }],
  };
  const json = new TextEncoder().encode(JSON.stringify(selected));
  const jsonLength = (json.length + 3) & ~3;
  const result = new Uint8Array(28 + jsonLength + binaryLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + jsonLength);
  result.set(json, 20);
  view.setUint32(20 + jsonLength, binaryLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  for (const chunk of chunks)
    result.set(chunk.data, 28 + jsonLength + chunk.offset);
  return result;
}
