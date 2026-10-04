/** Aggregate-only evidence: retain no identities, credentials or row payloads. */
export function distribution(values: readonly number[]) {
  if (values.some((v) => !Number.isFinite(v) || v < 0))
    throw new Error("Invalid metric sample");
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null;
  return {
    samples: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1) ?? null,
  };
}
export function byteCounters() {
  return {
    incomingPayloadBytes: 0,
    outgoingPayloadBytes: 0,
    decodedBytes: 0,
    incomingFrames: 0,
    outgoingFrames: 0,
    decodeErrors: 0,
    deliveryInversions: 0,
  };
}
export type ByteCounters = ReturnType<typeof byteCounters>;
export function deltaCounters(after: ByteCounters, before: ByteCounters) {
  const keys = Object.keys(after) as (keyof ByteCounters)[];
  return Object.fromEntries(
    keys.map((key) => [key, after[key] - before[key]]),
  ) as ByteCounters;
}
export function validatePopulation(size: number) {
  if (size !== 50 && size !== 100)
    throw new Error("Capacity size must be 50 or 100");
  return {
    clients: size,
    hosts: size / 5,
    passengers: (size * 4) / 5,
    canonicalShips: size / 5 + 1,
  };
}
