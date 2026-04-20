import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
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
