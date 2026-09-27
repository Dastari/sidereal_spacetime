import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["scripts/art_library/toxic_fog_composition_r005.test.ts"] },
});
