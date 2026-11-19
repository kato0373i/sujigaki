import { defineConfig } from "vitest/config";

// テスト戦略 3.3 節。ドメインの規則は、カバレッジを CI の合格の条件にする
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "**/testing/**"],
      reporter: ["text-summary", "text"],
      thresholds: {
        "packages/domain/src/**": { lines: 95, branches: 90 },
        "packages/interchange/src/**": { lines: 95, branches: 90 },
      },
    },
  },
});
