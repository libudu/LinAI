import { Hono } from "hono";
import { WanxBot } from "../wan-downloader/index";

const wanApi = new Hono();
const bot = new WanxBot();

wanApi.get("/status", (c) => {
  return c.json(bot.getStatus());
});

wanApi.post("/login", async (c) => {
  try {
    await bot.login();
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

wanApi.post("/auto-submit", async (c) => {
  const body = await c.req.json();
  const enable = body.enable;

  if (enable) {
    bot.start().catch(console.error);
  } else {
    bot.stop();
  }

  return c.json({ success: true, isRunning: enable });
});

export default wanApi;
