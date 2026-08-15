import { getNovelEndpoint } from '../../module/novel/settings'
import { getTTSInworldApiKey } from '../../module/tts/settings'
import { RelayError, requestRegistry } from './index'

/**
 * 中继目标注册：服务端启动时执行一次（由 api/common/relay.ts 引用触发）。
 * 新增允许代理的外部服务时在此登记；带文件副作用或业务预处理的请求不进中继。
 */

// 小说生成：OpenAI 兼容 chat completions（SSE 流式），origin/密钥/模型来自小说模块设置
requestRegistry.register('novel.openai', {
  resolveOrigin: async () => (await getNovelEndpoint()).baseUrl,
  allowedMethods: ['POST'],
  allowedPaths: ['/chat/completions'],
  streaming: true,
  timeoutMs: 120_000,
  injectCredential: async (headers) => {
    const { apiKey } = await getNovelEndpoint()
    if (!apiKey) {
      throw new RelayError(400, '[配置] 请先在设置中配置小说生成的 API Key')
    }
    headers.Authorization = `Bearer ${apiKey}`
  },
  // 模型由服务端配置权威注入，前端不感知
  injectBody: async () => ({ model: (await getNovelEndpoint()).modelId }),
})

// Inworld TTS：音色列表与试听（纯 GET 代理，无文件副作用；音频保存保留专用接口）
requestRegistry.register('inworld', {
  resolveOrigin: () => 'https://api.inworld.ai',
  allowedMethods: ['GET'],
  allowedPaths: ['/voices/v1/voices', '/tts/v1/voice:preview'],
  injectCredential: async (headers) => {
    const apiKey = (await getTTSInworldApiKey()) || process.env.INWORLD_API_KEY
    if (!apiKey) {
      throw new RelayError(400, '[配置] 请先在设置中配置 Inworld API Key')
    }
    headers.Authorization = `Basic ${apiKey}`
  },
})
