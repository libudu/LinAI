import fs from 'fs'
import path from 'path'

export interface Config {
  gptImageApiKey: string | null
  localNetworkUrl?: string
}

const CONFIG_DIR = path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: Config = {
  gptImageApiKey: null,
}

let currentConfig: Config = { ...DEFAULT_CONFIG }

// Initialize config on module load
try {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  if (fs.existsSync(CONFIG_FILE)) {
    const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8')
    currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fileContent) }
  } else {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(DEFAULT_CONFIG, null, 2),
      'utf-8',
    )
  }
} catch (error) {
  console.error('Failed to initialize config:', error)
}

export const getConfig = (): Config => {
  return currentConfig
}

export const updateConfig = (newConfig: Partial<Config>): Config => {
  currentConfig = { ...currentConfig, ...newConfig }
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(currentConfig, null, 2),
      'utf-8',
    )
  } catch (error) {
    console.error('Failed to write config:', error)
  }
  return currentConfig
}
