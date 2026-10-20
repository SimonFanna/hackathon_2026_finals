import { defineConfig } from "vitest/config";

// Relative base so dist/ runs from any folder (file server, USB stick, web/public/3d/).
export default defineConfig({
  base: "./",
  build: { target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
