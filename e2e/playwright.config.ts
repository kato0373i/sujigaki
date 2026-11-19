import { defineConfig, devices } from "@playwright/test";

const PORT = 4399;

// テスト戦略 5章。画面と API とファイルをまたぐ流れだけを確かめる
export default defineConfig({
  testDir: "tests",
  outputDir: ".work/results",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: "ja-JP",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: "node e2e/serve.ts",
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/api/projects/local/snapshot`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
