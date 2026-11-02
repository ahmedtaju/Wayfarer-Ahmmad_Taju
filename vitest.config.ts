import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["api/src/**/__tests__/**/*.test.ts", "web/src/**/__tests__/**/*.test.ts"],
  },
});
