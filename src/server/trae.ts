import { Hono } from "hono";
import { TraeManager } from "../trae-manager/index";
import { bindLogRoutes } from "./utils";

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
  });

bindLogRoutes(traeApi, traeManager.logger);

export default traeApi;
