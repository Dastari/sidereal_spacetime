/** Bounded history invalidation for skinning without per-bone velocity vectors. */
export function createTemporalSkinHistory() {
  let previous = new Map<string, Float32Array>();
  return {
    sample(palettes: Iterable<{ id: string; values: Float32Array }>): boolean {
      const next = new Map<string, Float32Array>();
      let changed = false;
      for (const { id, values } of palettes) {
        if (next.has(id)) continue;
        // Oversized or malformed rigs conservatively discard history, never
        // allocate unbounded copies or modify the authored skeleton.
        if (
          next.size >= 128 ||
          values.length > 4096 ||
          values.some((v) => !Number.isFinite(v))
        ) {
          previous.clear();
          return true;
        }
        const old = previous.get(id);
        if (
          !old ||
          old.length !== values.length ||
          values.some((v, i) => old[i] !== v)
        ) {
          changed = true;
          next.set(id, values.slice());
        } else next.set(id, old);
      }
      if (next.size !== previous.size) changed = true;
      previous = next;
      return changed;
    },
    clear() {
      previous.clear();
    },
  };
}
