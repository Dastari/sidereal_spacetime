/** Owner-directed S39 native star; immutable reviewed source revision. */
export const REVIEWED_YELLOW_STAR = Object.freeze({
  id: "yellow-main-sequence-r013",
  label: "Yellow Main Sequence Star",
  revision: "r013",
  seed: 3901,
  visualRadiusScale: 2.1,
  url: "/reviewed-stars/yellow-main-sequence/star.glb",
  sha256: "f651ba13ade02fb918c97dd4d3924879dd9c204527a4e43cef90c8c578505bd2",
});

/** Framing uses visual extent; the authoritative body radius stays untouched. */
export function celestialObservationRadius(
  body: { appearance: string; radius: number },
  aspect = 1,
) {
  return (
    body.radius *
    (body.appearance === REVIEWED_YELLOW_STAR.id
      ? REVIEWED_YELLOW_STAR.visualRadiusScale /
        Math.min(1, Math.max(0.1, aspect))
      : 1)
  );
}
