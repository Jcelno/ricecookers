import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app is served on http://localhost:3000 and talks to the Python API
// on port 8000 through the /api proxy, so the browser sees a single origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 3000,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
  preview: { port: 3000, proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } } },
  build: {
    chunkSizeWarningLimit: 6000,
    target: "es2022",
    // Map engines in their own long-cached chunks; MapLibre loads only when an Earth view opens.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/cesium") || id.includes("node_modules/@cesium")) return "cesium";
          if (id.includes("node_modules/maplibre-gl")) return "maplibre";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler") || id.includes("node_modules/zustand")) return "react";
          return undefined;
        },
      },
    },
  },
});
