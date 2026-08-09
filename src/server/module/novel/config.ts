import path from 'path'
import { ConfigJson } from '../../common/config/config-json'

// 小说模块（DeepSeek，OpenAI 兼容）配置：独立存储在 data/novels/config.json
export interface NovelConfig {
  novelApiKey: string | null
  novelBaseUrl: string | null
  novelModelId: string | null
}

const DEFAULT_NOVEL_CONFIG: NovelConfig = {
  novelApiKey: '',
  novelBaseUrl: 'https://api.deepseek.com',
  novelModelId: 'deepseek-chat',
}

const NOVELS_DIR = path.join(process.cwd(), 'data', 'novels')

const novelConfigJson = new ConfigJson<NovelConfig>({
  dir: NOVELS_DIR,
  defaults: DEFAULT_NOVEL_CONFIG,
})

export const getNovelConfig = novelConfigJson.get

export const updateNovelConfig = novelConfigJson.update

// 获取小说模块接入点，未配置时回退到默认值
export const getNovelEndpoint = () => {
  const config = novelConfigJson.get()
  const apiKey = config.novelApiKey || ''
  const baseUrl = config.novelBaseUrl || DEFAULT_NOVEL_CONFIG.novelBaseUrl!
  const modelId = config.novelModelId || DEFAULT_NOVEL_CONFIG.novelModelId!
  return { apiKey, baseUrl, modelId }
}
