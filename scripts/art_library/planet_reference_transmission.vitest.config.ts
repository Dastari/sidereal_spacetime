import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["scripts/art_library/planet_reference_transmission.test.ts"],
  },
});
