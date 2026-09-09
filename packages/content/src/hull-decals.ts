/** Cosmetic paint on a flat top surface. Coordinates are part-local east/north/up metres. */
export interface HullDecal {
  id: string;
  kind: 'text' | 'frontier-planet';
  text?: string;
  face?: 'top' | 'front' | 'right' | 'left';
  position: [number, number, number];
  size: [number, number];
  rotation: number;
  color: string;
}
export const MAX_PART_DECALS = 4;
export const MAX_ASSEMBLY_DECALS = 128;
export function validateHullDecals(value: unknown): asserts value is HullDecal[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_PART_DECALS) throw Error('At most four hull markings per component');
  const ids = new Set<string>();
  for (const d of value) {
    if (!d || typeof d.id !== 'string' || !d.id.length || d.id.length > 80 || ids.has(d.id)
      || !['text', 'frontier-planet'].includes(d.kind)
      || (d.face !== undefined && !['top', 'front', 'right', 'left'].includes(d.face))
      || (d.kind === 'text' && (typeof d.text !== 'string' || !/^[A-Za-z0-9 ._/-]{1,32}$/.test(d.text)))
      || !Array.isArray(d.position) || d.position.length !== 3 || !d.position.every((n: number) => Number.isFinite(n) && Math.abs(n) <= 64)
      || !Array.isArray(d.size) || d.size.length !== 2 || !d.size.every((n: number) => Number.isFinite(n) && n >= .05 && n <= 16)
      || !Number.isFinite(d.rotation) || Math.abs(d.rotation) > Math.PI * 2
      || typeof d.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.color)) throw Error('Invalid hull marking');
    ids.add(d.id);
  }
}
