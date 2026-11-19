import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 開発中は、ローカルモードの CLI（既定のポート 4300）に API を中継する
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:4300" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
