import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Keep MapLibre out of the dependency pre-bundler: its worker is resolved with
  // `new URL(..., import.meta.url)`, which only works when Vite sees the original
  // source instead of a pre-bundled copy.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // MapLibre GL is ~1 MB on its own; one chunk is expected for this app.
    chunkSizeWarningLimit: 1600,
  },
});
