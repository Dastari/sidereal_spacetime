import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["scripts/art_library/toxic_reference_composition_r004.test.ts"],
  },
});
