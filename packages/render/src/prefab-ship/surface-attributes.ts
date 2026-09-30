/** Optional authored channels. glTF TEXCOORD_0/1 map to Babylon uvs/uvs2. */
export interface SurfaceChannels {
  uvs?: ArrayLike<number>;
  uvs2?: ArrayLike<number>;
  tangents?: ArrayLike<number>;
  /** Sticky false after any source in a legacy batch lacks the channel. */
  uvsComplete?: boolean;
  uvs2Complete?: boolean;
  tangentsComplete?: boolean;
}

export function validateSurfaceChannels(
  channels: SurfaceChannels,
  vertices: number,
): void {
  for (const [name, width] of [
    ["uvs", 2],
    ["uvs2", 2],
    ["tangents", 4],
  ] as const) {
    const values = channels[name];
    if (!values) continue;
    if (values.length !== vertices * width)
      throw Error(`Surface ${name} length does not match vertex count`);
    for (let i = 0; i < values.length; i++)
      if (!Number.isFinite(values[i]))
        throw Error(`Surface ${name} contains a nonfinite value`);
    if (name === "tangents")
      for (let i = 0; i < values.length; i += 4)
        if (
          Math.hypot(values[i], values[i + 1], values[i + 2]) < 1e-8 ||
          Math.abs(Math.abs(values[i + 3]) - 1) > 1e-5
        )
          throw Error("Surface tangent frame is invalid");
  }
}

export interface MutableSurfaceChannels {
  uvs?: number[];
  uvs2?: number[];
  tangents?: number[];
  uvsComplete?: boolean;
  uvs2Complete?: boolean;
  tangentsComplete?: boolean;
}

/** Legacy groups retain their grouping: omit an incomplete GPU channel, never pad it.
 * Cache/source arrays remain intact. Detail groups must split before appending. */
export function appendSurfaceChannels(
  target: MutableSurfaceChannels,
  source: SurfaceChannels,
  previousVertices: number,
  vertices: number,
): void {
  validateSurfaceChannels(source, vertices);
  for (const [name, flag] of [
    ["uvs", "uvsComplete"],
    ["uvs2", "uvs2Complete"],
    ["tangents", "tangentsComplete"],
  ] as const) {
    if (target[flag] === false) continue;
    const values = source[name];
    if (
      !values ||
      source[flag] === false ||
      (previousVertices > 0 && !target[name])
    ) {
      target[flag] = false;
      delete target[name];
      continue;
    }
    target[flag] = true;
    const output = target[name] ?? (target[name] = []);
    for (let i = 0; i < values.length; i++) output.push(values[i]);
  }
}

/** Compatibility key for opt-in detail only; legacy material grouping stays unchanged. */
export function surfaceBatchLayoutKey(
  channels: SurfaceChannels,
  coordinatesIndex: 0 | 1 = 0,
): string {
  const values = coordinatesIndex === 0 ? channels.uvs : channels.uvs2;
  const complete =
    coordinatesIndex === 0 ? channels.uvsComplete : channels.uvs2Complete;
  return values?.length && complete !== false
    ? `uv${coordinatesIndex}`
    : "legacy";
}
