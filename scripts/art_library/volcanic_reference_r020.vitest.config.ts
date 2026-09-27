import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "scripts/art_library/volcanic_reference_composition_r020.test.ts",
    ],
  },
});
