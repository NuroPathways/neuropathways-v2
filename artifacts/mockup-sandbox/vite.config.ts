import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const basePath = (process.env.BASE_PATH || "/__mockup").replace(/\/+$/, "");
const port = Number(process.env.PORT || 8081);

export default defineConfig({
  base: `${basePath}/`,
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    allowedHosts: true,
  },
});
