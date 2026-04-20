import fs from 'fs-extra'
import path from 'path'

export interface TraeAccount {
  id: string
  email: string
  createdAt: string
}

export interface TraeConfig {
  baseEmail: string
}

const CONFIG_FILE = path.join('data', 'trae_config.json')

export class TraeStorage {
  static async getBaseEmail(): Promise<string> {
    try {
      if (!(await fs.pathExists(CONFIG_FILE))) {
        return ''
      }
      const cfg = await fs.readJson(CONFIG_FILE)
      return cfg.baseEmail || ''
    } catch (e) {
      return ''
    }
  }

  static async setBaseEmail(baseEmail: string) {
    await fs.ensureDir(path.dirname(CONFIG_FILE))
    await fs.writeJson(CONFIG_FILE, { baseEmail }, { spaces: 2 })
  }
}
