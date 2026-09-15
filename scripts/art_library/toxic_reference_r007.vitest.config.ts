import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    testTimeout: 20000,
    include: ["scripts/art_library/toxic_reference_composition_r007.test.ts"],
  },
});
