import { defineConfig } from "vite";

// Playground only; the HACS bundle is built by vite.config.ts.
export default defineConfig({
  root: "dev",
  server: { port: 5173, fs: { allow: [process.cwd()] } },
});
