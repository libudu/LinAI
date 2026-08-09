import { Hono } from 'hono'
import { BACKEND_PORT } from '../..'
import { getLocalIpAddress } from '../utils/ip'

// 通用配置接口：目前仅提供局域网访问地址（各业务模块配置见各自模块，如 /api/gptImage/config）
const configApi = new Hono().get('/', (c) => {
  const ip = getLocalIpAddress()
  const localNetworkUrl = ip ? `http://${ip}:${BACKEND_PORT}` : null

  return c.json({
    success: true,
    data: {
      localNetworkUrl,
    },
  })
})

export default configApi
