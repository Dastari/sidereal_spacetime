import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["scripts/art_library/ice_moon_blue_cut_r003.test.ts"],
    testTimeout: 30000,
  },
});
