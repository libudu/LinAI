import { chromium } from "playwright";
import { config } from "./config";
import { logger } from "./logger";
import path from "path";
import fs from "fs-extra";
import axios from "axios";

export class AuthManager {
  private static instance: AuthManager;
  private currentSession: string | null = null;

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  async getSessionToken(): Promise<string> {
    if (
      this.currentSession &&
      (await this.validateSession(this.currentSession))
    ) {
      return this.currentSession;
    }
    return await this.refreshSession();
  }

  /**
   * 验证 Session 是否有效
   */
  private async validateSession(session: string): Promise<boolean> {
    try {
      const response = await axios.post(
        `${config.BASE_URL}/v2/task/pagingList`,
        { pageSize: 1, mediaType: "all" },
        {
          headers: {
            "content-type": "application/json",
            Cookie: `WANX_CN_SESSION=${session}`,
          },
        },
      );
      return !!response.data?.success;
    } catch (error: any) {
      if (error.response?.status === 401) {
        return false;
      }
      logger.error("❌ 验证 session 时发生错误:", error.message);
      return false;
    }
  }

  /**
   * 静默刷新 Session
   */
  async refreshSession(): Promise<string> {
    logger.info("🔄 正在刷新 session 凭证...");
    const userDataDir = path.resolve(config.USER_DATA_DIR);
    fs.ensureDirSync(userDataDir);

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
    });

    try {
      const page = await context.newPage();
      // 访问官网，这会自动刷新 Cookie
      await page.goto(config.EXPLORE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });

      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name === "WANX_CN_SESSION");

      if (!sessionCookie) {
        logger.warn("⚠️ 未发现 WANX_CN_SESSION，尝试引导用户登录...");
        await context.close();
        return await this.manualLogin();
      }

      // 验证获取到的 Cookie 是否有效
      const isValid = await this.validateSession(sessionCookie.value);
      if (!isValid) {
        logger.warn("⚠️ 发现 WANX_CN_SESSION 但已失效，尝试引导用户登录...");
        await context.close();
        return await this.manualLogin();
      }

      this.currentSession = sessionCookie.value;
      logger.info("✅ Session 刷新并验证成功");
      await context.close();
      return this.currentSession;
    } catch (error: any) {
      logger.error("❌ 刷新 session 失败:", error.message);
      await context.close();
      throw error;
    }
  }

  /**
   * 引导用户手动登录
   */
  private async manualLogin(): Promise<string> {
    logger.info("🚀 启动有界面浏览器进行登录...");
    const userDataDir = path.resolve(config.USER_DATA_DIR);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
    });

    const page = await context.newPage();
    await page.goto(config.EXPLORE_URL);

    logger.info("💡 请在浏览器中完成登录，登录完成后程序将自动检测并继续。");

    return new Promise<string>((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          const cookies = await context.cookies();
          const sessionCookie = cookies.find(
            (c) => c.name === "WANX_CN_SESSION",
          );
          if (sessionCookie) {
            // 同样需要验证手动登录后的 cookie
            const isValid = await this.validateSession(sessionCookie.value);
            if (isValid) {
              logger.info("✅ 检测到有效登录凭证！");
              clearInterval(checkInterval);
              this.currentSession = sessionCookie.value;
              await context.close();
              resolve(this.currentSession);
            }
          }
        } catch (e) {
          clearInterval(checkInterval);
          reject(new Error("浏览器已关闭或登录异常"));
        }
      }, 2000);

      context.on("close", () => {
        clearInterval(checkInterval);
        if (!this.currentSession) {
          reject(new Error("浏览器已关闭，未完成登录"));
        }
      });
    });
  }
}

export const authManager = AuthManager.getInstance();
