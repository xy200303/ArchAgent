import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "vitest-disable-dep-scan",
      config: () => ({
        optimizeDeps: {
          entries: [],
          noDiscovery: true
        }
      })
    }
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "out", "data"],
    globals: true,
    pool: "vmForks",
    restoreMocks: true,
    testTimeout: 120000
  }
});
