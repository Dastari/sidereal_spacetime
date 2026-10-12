/** Exact indexing for packed native surface banks. No quantization or triangle reorder. */
type PackedBank = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
};
export function indexExactVertices<T extends PackedBank>(bank: T): T {
  if (
    Object.keys(bank).some(
      (key) =>
        !["positions", "normals", "uvs", "indices", "ranges"].includes(key),
    )
  )
    return bank;
  const { positions, normals, uvs, indices } = bank;
  if (
    positions.constructor !== Float32Array ||
    normals.constructor !== Float32Array ||
    uvs.constructor !== Float32Array ||
    indices.constructor !== Uint32Array
  )
    return bank;
  const count = positions.length / 3;
  if (
    !Number.isSafeInteger(count) ||
    !count ||
    count > 4_000_000 ||
    normals.length !== count * 3 ||
    uvs.length !== count * 2
  )
    return bank;
  for (const channel of [positions, normals, uvs])
    for (const value of channel) if (!Number.isFinite(value)) return bank;
  for (const index of indices) if (index >= count) return bank;
  const p = new Uint32Array(
      positions.buffer,
      positions.byteOffset,
      positions.length,
    ),
    n = new Uint32Array(normals.buffer, normals.byteOffset, normals.length),
    uv = new Uint32Array(uvs.buffer, uvs.byteOffset, uvs.length);
  let capacity = 1;
  while (capacity < count / 0.7) capacity *= 2;
  const table = new Uint32Array(capacity),
    remap = new Uint32Array(count),
    mask = capacity - 1;
  let unique = 0;
  for (let vertex = 0; vertex < count; vertex++) {
    const at = vertex * 3,
      tex = vertex * 2;
    let hash = 2166136261;
    for (let k = 0; k < 3; k++) hash = Math.imul(hash ^ p[at + k], 16777619);
    for (let k = 0; k < 3; k++) hash = Math.imul(hash ^ n[at + k], 16777619);
    for (let k = 0; k < 2; k++) hash = Math.imul(hash ^ uv[tex + k], 16777619);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    hash ^= hash >>> 16;
    let slot = hash & mask,
      probes = 0;
    while (table[slot]) {
      const other = table[slot] - 1,
        base = other * 3,
        texture = other * 2;
      if (
        p[at] === p[base] &&
        p[at + 1] === p[base + 1] &&
        p[at + 2] === p[base + 2] &&
        n[at] === n[base] &&
        n[at + 1] === n[base + 1] &&
        n[at + 2] === n[base + 2] &&
        uv[tex] === uv[texture] &&
        uv[tex + 1] === uv[texture + 1]
      ) {
        remap[vertex] = remap[other];
        break;
      }
      if (++probes > 512) return bank; // Bounded work for an unhelpful hash distribution.
      slot = (slot + 1) & mask;
    }
    if (!table[slot]) {
      table[slot] = vertex + 1;
      remap[vertex] = unique++;
    }
  }
  if (unique === count) return bank;
  const outP = new Uint32Array(unique * 3),
    outN = new Uint32Array(unique * 3),
    outUv = new Uint32Array(unique * 2),
    outIndices = new Uint32Array(indices.length);
  let next = 0;
  for (let vertex = 0; vertex < count; vertex++)
    if (remap[vertex] === next) {
      const from = vertex * 3,
        to = next * 3;
      outP[to] = p[from];
      outP[to + 1] = p[from + 1];
      outP[to + 2] = p[from + 2];
      outN[to] = n[from];
      outN[to + 1] = n[from + 1];
      outN[to + 2] = n[from + 2];
      outUv[next * 2] = uv[vertex * 2];
      outUv[next * 2 + 1] = uv[vertex * 2 + 1];
      next++;
    }
  for (let i = 0; i < indices.length; i++) outIndices[i] = remap[indices[i]];
  return {
    ...bank,
    positions: new Float32Array(outP.buffer),
    normals: new Float32Array(outN.buffer),
    uvs: new Float32Array(outUv.buffer),
    indices: outIndices,
  };
}
