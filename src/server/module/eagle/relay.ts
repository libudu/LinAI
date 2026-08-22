import { RelayError, requestRegistry } from '../../common/relay'
import { getEagleVisionEndpoint } from './settings'

type EagleVisionEndpoint = Awaited<ReturnType<typeof getEagleVisionEndpoint>>

// Eagle 图片整理视觉判定中继：与 vision/relay.ts 同构（POST /chat/completions，非流式），
// 接入点与密钥来自独立的 eagle-vision 设置；执行器在服务端直接调用 requestRegistry.execute
requestRegistry.register<EagleVisionEndpoint>('eagle.vision', {
  resolveContext: () => getEagleVisionEndpoint(),
  resolveOrigin: (endpoint) => endpoint.baseUrl,
  allowedMethods: ['POST'],
  allowedPaths: ['/chat/completions'],
  streaming: false,
  timeoutMs: 120_000,
  maxBodyLength: 20 * 1024 * 1024,
  injectCredential: (headers, endpoint) => {
    if (!endpoint.apiKey) {
      throw new RelayError(
        400,
        '[配置] 请先在设置中配置 Eagle 视觉接入点的 API Key',
      )
    }
    headers.Authorization = `Bearer ${endpoint.apiKey}`
  },
  // 模型由服务端配置权威注入，调用方不能覆盖
  injectBody: (endpoint) => ({ model: endpoint.modelId }),
})
