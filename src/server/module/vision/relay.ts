import { RelayError, requestRegistry } from '../../common/relay'
import { getVisionEndpoint } from './settings'

type VisionEndpoint = Awaited<ReturnType<typeof getVisionEndpoint>>

requestRegistry.register<VisionEndpoint>('vision.openai', {
  resolveContext: () => getVisionEndpoint(),
  resolveOrigin: (endpoint) => endpoint.baseUrl,
  allowedMethods: ['POST'],
  allowedPaths: ['/chat/completions'],
  streaming: false,
  timeoutMs: 120_000,
  maxBodyLength: 20 * 1024 * 1024,
  injectCredential: (headers, endpoint) => {
    if (!endpoint.apiKey) {
      throw new RelayError(400, '[配置] 请先在设置中配置视觉接入点的 API Key')
    }
    headers.Authorization = `Bearer ${endpoint.apiKey}`
  },
  // 模型由服务端配置权威注入，前端不能覆盖
  injectBody: (endpoint) => ({ model: endpoint.modelId }),
})
