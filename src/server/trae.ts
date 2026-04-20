import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { TraeManager } from "../trae-manager/index";

const traeManager = new TraeManager();

const traeApi = new Hono()
  .post("/apply-email", async (c) => {
    try {
      // 异步调用以免阻塞响应，或者等待调用完成，具体取决于需求
      // 这里目前只打开网页，所以可以直接等待
      const result = await traeManager.applyTempEmail();
      return c.json(result);
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  })
  .get("/logs", async (c) => {
    return streamSSE(c, async (stream) => {
      // Send initial logs
      const initialLogs = traeManager.logger.getLogs(100);
      for (const log of initialLogs) {
        await stream.writeSSE({
          data: log,
          event: "log"
        });
      }

      // Listen for new logs
      const onLog = async (message: string) => {
        try {
          await stream.writeSSE({
            data: message,
            event: "log"
          });
        } catch (e) {
          // Stream might be closed
          traeManager.logger.removeListener('log', onLog);
        }
      };

      traeManager.logger.on('log', onLog);

      c.req.raw.signal.addEventListener("abort", () => {
        traeManager.logger.removeListener('log', onLog);
      });

      // Keep connection alive
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 30000));
        await stream.writeSSE({ data: "ping", event: "ping" });
      }
    });
  });

export default traeApi;
