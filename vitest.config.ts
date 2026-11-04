import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": resolve(__dirname, "web/src") } },
  test: {
    environment: "node",
    globals: true,
    include: ["api/src/**/__tests__/**/*.test.ts", "web/src/**/__tests__/**/*.test.{ts,tsx}"],
  },
});
