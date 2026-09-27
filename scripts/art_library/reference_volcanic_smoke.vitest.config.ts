import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["scripts/art_library/reference_volcanic_smoke.test.ts"] },
});
