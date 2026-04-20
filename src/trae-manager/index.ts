import { chromium } from 'playwright';
import { Logger } from '../utils/logger';

export class TraeManager {
  public logger: Logger;

  constructor() {
    this.logger = new Logger('trae');
  }

  async applyTempEmail() {
    try {
      this.logger.info('开始启动浏览器...');
      // 启动浏览器，headless 设为 false 以便能看到打开的过程
      const browser = await chromium.launch({ headless: false });

      this.logger.info('创建浏览器上下文...');
      const context = await browser.newContext();

      this.logger.info('打开新页面...');
      const page = await context.newPage();

      this.logger.info('导航到 Trae 官网: https://www.trae.ai/');
      // 导航到 Trae 官网
      await page.goto('https://www.trae.ai/');

      // 暂时只打开网页，不关闭浏览器以便用户查看
      this.logger.info('成功打开 Trae 官网');

      return { success: true, message: '成功打开 Trae 官网' };
    } catch (error: any) {
      this.logger.error('打开 Trae 官网失败:', error);
      throw error;
    }
  }
}

export const traeManager = new TraeManager();
