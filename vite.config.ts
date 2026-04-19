import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";

export default defineConfig({
  plugins: [
    react(),
    devServer({
      entry: "src/server/index.ts",
      exclude: [
        /^(?!\/api).*/, // Exclude all requests that don't start with /api
      ],
      injectClientScript: false,
    }),
  ],
});
