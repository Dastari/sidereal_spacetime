import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["scripts/art_library/gas_moon_mineral_trial_r002.test.ts"],
    testTimeout: 30000,
  },
});
