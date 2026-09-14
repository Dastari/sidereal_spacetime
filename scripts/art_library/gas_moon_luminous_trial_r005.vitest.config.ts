import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["scripts/art_library/gas_moon_luminous_trial_r005.test.ts"],
    testTimeout: 30000,
  },
});
