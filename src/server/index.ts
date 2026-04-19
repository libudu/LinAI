import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import wanApi from "./wan";

const app = new Hono();

app.route("/api/wan", wanApi);

if (process.env.NODE_ENV !== "development") {
  // Production serving of static files
  app.use("/*", serveStatic({ root: "./dist" }));

  serve(
    {
      fetch: app.fetch,
      port: 3000,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  );
}

export default app;
