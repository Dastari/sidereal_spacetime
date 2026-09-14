/** Isolated review camera only; lets cold approach tests start before a hero visit. */
export function referenceInitialRadius(query: URLSearchParams): number {
  if (!query.has("initialRadius")) return 4.7;
  const radius = Number(query.get("initialRadius"));
  if (!Number.isFinite(radius) || radius < 0.1 || radius > 1000)
    throw new Error("Invalid initial reference camera radius");
  return radius;
}
