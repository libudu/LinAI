import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { WanxBot } from "../wan-downloader/index";

const app = new Hono();
const bot = new WanxBot();

app.get("/api/status", (c) => {
  return c.json(bot.getStatus());
});

app.post("/api/login", async (c) => {
  try {
    await bot.login();
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post("/api/auto-submit", async (c) => {
  const body = await c.req.json();
  const enable = body.enable;

  if (enable) {
    bot.start().catch(console.error);
  } else {
    bot.stop();
  }

  return c.json({ success: true, isRunning: enable });
});

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
