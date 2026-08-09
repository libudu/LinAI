import { Hono } from 'hono'
import {
  getGptImageEndpoint,
  getYunwuApiKey,
} from '../../module/gpt-image/config'

export interface GPTImageQuotaResponse {
  message: string
  data: {
    expires_at: number
    name: string
    total_available: number
    total_granted: number
    total_used: number
    unlimited_quota: boolean
  }
}

// 接入点相关接口：余额查询针对的是当前接入点，与具体生图任务无关
const gptImageEndpointApi = new Hono().get('/quota', async (c) => {
  const apiKey = getYunwuApiKey()
  if (!apiKey) {
    return c.json(
      { success: false as const, error: '[配置] API Key is not configured' },
      400,
    )
  }

  try {
    const { baseUrl } = getGptImageEndpoint()
    const origin = new URL(baseUrl).origin
    const response = await fetch(`${origin}/api/usage/token/`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    const json = (await response.json()) as any
    const quota = json?.data
    // 不同服务商报错结构不统一，且 HTTP 状态码可能仍是 200，需要逐项判断：
    // 1. { success: true, data: { message: '...', success: false } }
    // 2. { success: true, data: { error: { message: '...', type: '...' } } }
    // 3. 非 200 时 message 可能在顶层
    const errorMessage: string | undefined =
      (typeof quota?.error?.message === 'string' && quota.error.message) ||
      (quota?.success === false && typeof quota?.message === 'string'
        ? quota.message
        : undefined) ||
      (!response.ok && typeof json?.message === 'string'
        ? json.message
        : undefined) ||
      undefined
    if (errorMessage || !quota || typeof quota.total_available !== 'number') {
      // Invalid token 一般是密钥填错或接入点与密钥不匹配
      const isInvalidToken = /invalid token/i.test(errorMessage || '')
      const prefix = isInvalidToken ? '[密钥]' : '[服务]'
      return c.json(
        {
          success: false as const,
          error: `${prefix} ${errorMessage || `获取余额失败（HTTP ${response.status}）`}`,
        },
        502,
      )
    }
    const data: GPTImageQuotaResponse = json
    return c.json({
      success: true as const,
      data: data,
    })
  } catch (error: any) {
    return c.json(
      {
        success: false as const,
        error: `[网络] ${error.message || '获取余额失败'}`,
      },
      500,
    )
  }
})

export default gptImageEndpointApi
