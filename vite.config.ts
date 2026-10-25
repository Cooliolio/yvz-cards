import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    minify: mode !== "development",
    sourcemap: mode === "development",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "yvz-cards.js",
    },
  },
}));
