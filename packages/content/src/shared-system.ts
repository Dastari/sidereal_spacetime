import { LEGACY_SYSTEM_SEED } from "./legacy-system-seed";
import { SOLAR_SYSTEM } from "./solar-system";
export {
  LEGACY_SYSTEM_SEED,
  LEGACY_SYSTEM_SEED_SHA256,
} from "./legacy-system-seed";
export {
  SOLAR_SYSTEM,
  SOLAR_SYSTEM_BODY_LIMIT,
  solarBodyForLegacyKey,
} from "./solar-system";
/** r002 replaces only celestial descriptors. Historical r001 remains immutable.
 * Existing systems require the guarded server migration; login never resets rows. */
export const SHARED_SYSTEM_SEED = {
  systemId: LEGACY_SYSTEM_SEED.systemId,
  revision: 2,
  bodies: [
    ...LEGACY_SYSTEM_SEED.bodies.filter((body) => body.kind === "asteroid"),
    ...SOLAR_SYSTEM.bodies.map(
      ({ id, key, kind, appearance, x, y, height, radius, massKg, seed }) => ({
        id,
        key,
        kind,
        appearance,
        x,
        y,
        height,
        radius,
        massKg,
        seed,
      }),
    ),
  ],
};
export const SHARED_SYSTEM_SEED_SHA256 =
  "57c070f18dc3aa41cdfa219201f28a581fab48274459a1e130954791443d25b5";
/** Four dynamic rocks leave sixty ship slots in the initial 64-body contact island. */
export const SHARED_SYSTEM_MAX_SHIPS = 60;

/** Public stock exterior payload pinned from the installed approved stock assets.
 * This identifies presentation only, never an account-private assembly or collision. */
export const SHARED_STOCK_EXTERIOR_ID =
  "stock-wayfarer-exterior:6cd837094b61bb6d1e69aefe4629cd9fa7e0f51db02fee80d203a824af756589";
