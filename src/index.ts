import { WanxClient } from "./api";
import { Downloader } from "./downloader";
import { config } from "./config";
import type { TaskData } from "./types";
import { logger } from "./logger";
import { authManager } from "./auth";

class WanxBot {
  private client: WanxClient;
  private downloader: Downloader;
  private startTime: number;

  constructor() {
    this.client = new WanxClient();
    this.downloader = new Downloader();
    this.startTime = config.START_TIME;
    logger.log(`🚀 Wan 视频下载 & 自动提交小工具已启动!`);
    logger.log(
      `📅 设置的开始时间: ${new Date(this.startTime).toLocaleString()}`,
    );
  }

  async run() {
    logger.info("🔑 正在初始化身份认证...");
    try {
      await authManager.getSessionToken();
    } catch (error: any) {
      logger.error("❌ 身份认证失败，程序退出:", error.message);
      process.exit(1);
    }

    while (true) {
      try {
        await this.processTasks();
      } catch (error) {
        logger.error(`❌ 主流程执行出错:`, error);
      }
      logger.log(
        `⏳ 等待 ${config.POLL_INTERVAL / 60000} 分钟后进行下一次轮询... 💤`,
      );
      await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL));
    }
  }

  private async processTasks() {
    logger.log(`🔍 正在查询任务列表... 🕵️‍♂️`);
    const response = await this.client.getTaskList();

    if (!response.success) {
      logger.log(`⚠️ 查询失败: ${response.errorCode} ${response.errorMsg}`);
      return;
    }

    const tasks = response.data || [];
    const inProgressTasks = tasks.filter((t) => t.status === -1);
    const completedTasks = tasks.filter(
      (t) => t.status === 2 && t.gmtCreateTimeStamp >= this.startTime,
    );

    logger.log(`📊 统计信息:`);
    logger.log(`   - 正在进行中的任务: ${inProgressTasks.length} ⏳`);
    logger.log(`   - 符合条件的已完成任务: ${completedTasks.length} ✅`);

    // 1. 处理下载
    for (const task of completedTasks) {
      await this.downloader.downloadVideo(task);
    }

    // 2. 检查是否需要提交新任务
    if (inProgressTasks.length < config.MAX_IN_PROGRESS) {
      const needed = config.MAX_IN_PROGRESS - inProgressTasks.length;
      logger.log(
        `🆕 当前进行中任务少于 ${config.MAX_IN_PROGRESS}，准备提交 ${needed} 个新任务... 🛠️`,
      );

      for (let i = 0; i < needed; i++) {
        const submitRes = await this.client.submitTask();
        if (submitRes.success) {
          logger.log(`✅ 任务提交成功! 任务 ID: ${submitRes.data} 🎈`);
        } else if (submitRes.httpCode === 429) {
          logger.log(
            `⚠️ 提交过于频繁或已有处理中任务: ${submitRes.errorMsg} 🛑`,
          );
          break; // 停止当前批次提交
        } else {
          logger.log(`❌ 提交失败: ${submitRes.errorMsg} 🚫`);
        }
        // 提交间隔 2 秒
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } else {
      logger.log(
        `✅ 队列已满 (当前有 ${inProgressTasks.length} 个任务在运行)，无需提交新任务。😎`,
      );
    }
  }
}

const bot = new WanxBot();
bot.run();
