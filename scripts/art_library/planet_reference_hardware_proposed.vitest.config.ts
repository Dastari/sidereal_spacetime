import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "scripts/art_library/planet_reference_pbr_channels_hardware_proposed.test.ts",
    ],
  },
});
