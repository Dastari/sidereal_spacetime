/** Canonical heading (-π, π], preserving already canonical values bit-for-bit. */
export function wrapFlightHeading(value: number): number {
  if (value > -Math.PI && value <= Math.PI) return value;
  const turn = 2 * Math.PI;
  const wrapped = ((((value + Math.PI) % turn) + turn) % turn) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
