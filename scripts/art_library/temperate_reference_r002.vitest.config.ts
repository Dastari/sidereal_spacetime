import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "scripts/art_library/temperate_reference_composition_r002.test.ts",
    ],
  },
});
