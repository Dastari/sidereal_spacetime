import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    testTimeout: 30000,
    include: [
      "scripts/art_library/toxic_moon_reference_composition_r001.test.ts",
    ],
  },
});
