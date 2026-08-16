import { RelayError, requestRegistry } from '../../common/relay'
import { getTTSInworldApiKey } from './settings'

/**
 * TTS 模块的中继目标注册：Inworld 音色列表与试听
 * （纯 GET 代理，无文件副作用；音频保存保留专用接口）
 */
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
