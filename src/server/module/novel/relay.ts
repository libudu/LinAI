import { RelayError, requestRegistry } from '../../common/relay'
import { getNovelEndpoint } from './settings'

/**
 * 小说模块的中继目标注册：OpenAI 兼容 chat completions（SSE 流式），
 * origin/密钥/模型来自本模块设置
 */
type NovelEndpoint = Awaited<ReturnType<typeof getNovelEndpoint>>

requestRegistry.register<NovelEndpoint>('novel.openai', {
  // 每次中继请求只读一次设置，origin/凭据/模型共用
  resolveContext: () => getNovelEndpoint(),
  resolveOrigin: (endpoint) => endpoint.baseUrl,
  allowedMethods: ['POST'],
  allowedPaths: ['/chat/completions'],
  streaming: true,
  timeoutMs: 120_000,
  injectCredential: (headers, endpoint) => {
    if (!endpoint.apiKey) {
      throw new RelayError(400, '[配置] 请先在设置中配置小说生成的 API Key')
    }
    headers.Authorization = `Bearer ${endpoint.apiKey}`
  },
  // 模型由服务端配置权威注入，前端不感知
  injectBody: (endpoint) => ({ model: endpoint.modelId }),
})
