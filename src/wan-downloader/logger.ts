import fs from "fs-extra";
import { config } from "./config";
import path from "path";

class Logger {
  constructor() {
    fs.ensureDirSync(config.LOG_DIR);
  }

  private formatMessage(message: any, ...args: any[]): string {
    const timestamp = new Date().toLocaleString();
    let formattedMessage = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    
    if (args.length > 0) {
      args.forEach(arg => {
        const argStr = typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2);
        formattedMessage += ' ' + argStr;
      });
    }

    return `[${timestamp}] ${formattedMessage}`;
  }

  private writeToFile(message: string) {
    try {
      fs.appendFileSync(config.LOG_FILE, message + "\n");
    } catch (error) {
      console.error("无法写入日志文件:", error);
    }
  }

  log(message: any, ...args: any[]) {
    const fullMessage = this.formatMessage(message, ...args);
    console.log(fullMessage);
    this.writeToFile(fullMessage);
  }

  error(message: any, ...args: any[]) {
    const fullMessage = this.formatMessage(message, ...args);
    console.error(fullMessage);
    this.writeToFile(fullMessage);
  }

  info(message: any, ...args: any[]) {
    this.log(message, ...args);
  }

  warn(message: any, ...args: any[]) {
    const fullMessage = this.formatMessage(`⚠️ ${message}`, ...args);
    console.warn(fullMessage);
    this.writeToFile(fullMessage);
  }
}

export const logger = new Logger();
