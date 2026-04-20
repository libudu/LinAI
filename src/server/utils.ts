import { streamSSE } from "hono/streaming";
import { Logger } from "../utils/logger";
import { Context } from "hono";

/**
 * 创建日志 SSE 流的辅助函数
 */
export async function handleLogSSE(c: Context, logger: Logger) {
    return streamSSE(c, async (stream) => {
        // 发送初始日志
        const initialLogs = logger.getLogs(100);
        for (const log of initialLogs) {
            await stream.writeSSE({
                data: log,
                event: "log"
            });
        }

        // 监听新日志
        const onLog = async (message: string) => {
            try {
                await stream.writeSSE({
                    data: message,
                    event: "log"
                });
            } catch (e) {
                // 流可能已关闭
                logger.removeListener('log', onLog);
            }
        };

        logger.on('log', onLog);

        c.req.raw.signal.addEventListener("abort", () => {
            logger.removeListener('log', onLog);
        });

        // 保持连接
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, 30000));
            await stream.writeSSE({ data: "ping", event: "ping" });
        }
    });
}

/**
 * 绑定日志相关的接口
 */
export function bindLogRoutes(app: any, logger: Logger) {
    app.get("/logs", (c: Context) => handleLogSSE(c, logger));
    app.delete("/logs", (c: Context) => {
        logger.clearLogs();
        return c.json({ success: true });
    });
}
