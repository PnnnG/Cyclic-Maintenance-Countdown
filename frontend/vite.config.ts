import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/cyclic-countdown-card.ts"),
      formats: ["es"],
      fileName: () => "cyclic-countdown-card.js",
    },
    outDir: resolve(__dirname, "../custom_components/cyclic_countdown/frontend"),
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
  },
});
