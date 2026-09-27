import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "scripts/art_library/hybrid_moon_reference_composition_r002.test.ts",
    ],
    testTimeout: 30000,
  },
});
