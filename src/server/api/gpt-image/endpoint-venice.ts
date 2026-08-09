import type { GPTImageQuotaResponse } from './endpoint'

// Venice 接入点的余额查询适配

// 前端按 total_available * 0.000002 / creditRatio 换算展示余额（对齐 one-api 的积分单位），
// Venice 余额单位为美元积分，乘此系数使展示值等于实际美元积分数
const VENICE_USD_TO_QUOTA = 500000

// Venice 接入点不走 one-api 的 /api/usage/token/ 查询余额。
// 官方 billing/balance 接口需要 Admin API Key，普通密钥不可用；
// 改用 GET /api/v1/api_keys/rate_limits（返回当前密钥的余额与速率限制，
// 普通推理密钥可用）：data.balances = { USD, DIEM }
export const fetchVeniceQuota = async (
  origin: string,
  apiKey: string,
): Promise<{
  data?: GPTImageQuotaResponse
  errorMessage?: string
  status: number
}> => {
  const response = await fetch(`${origin}/api/v1/api_keys/rate_limits`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const json = (await response.json().catch(() => null)) as any
  // 兼容 Venice 几种可能的报错结构
  const errorMessage: string | undefined =
    (typeof json?.error?.message === 'string' && json.error.message) ||
    (typeof json?.error === 'string' && json.error) ||
    (typeof json?.detail === 'string' && json.detail) ||
    (!response.ok && typeof json?.message === 'string'
      ? json.message
      : undefined) ||
    undefined
  const balances = json?.data?.balances
  if (errorMessage || !balances) {
    return { errorMessage, status: response.status }
  }
  const usd = typeof balances.USD === 'number' ? balances.USD : 0
  const diem = typeof balances.DIEM === 'number' ? balances.DIEM : 0
  const totalAvailable = (usd + diem) * VENICE_USD_TO_QUOTA
  return {
    status: response.status,
    data: {
      message: 'ok',
      data: {
        expires_at: 0,
        name: 'Venice',
        total_available: totalAvailable,
        total_granted: totalAvailable,
        total_used: 0,
        unlimited_quota: false,
      },
    },
  }
}
