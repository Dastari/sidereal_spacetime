import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "scripts/art_library/rocky_moon_reference_composition_r001.test.ts",
    ],
  },
});
