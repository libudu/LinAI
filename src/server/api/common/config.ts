import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import os from 'os'
import { z } from 'zod'
import { BACKEND_PORT } from '../..'
import { getConfig, updateConfig } from '../../common/config'

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]
    if (iface) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          return alias.address
        }
      }
    }
  }
  return null
}

const configApi = new Hono()
  .get('/', (c) => {
    const ip = getLocalIpAddress()
    const localNetworkUrl = ip ? `http://${ip}:${BACKEND_PORT}` : null

    return c.json({
      success: true,
      data: {
        ...getConfig(),
        localNetworkUrl
      }
    })
  })
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        gptImageApiKey: z.string().nullable().optional()
      })
    ),
    (c) => {
      const body = c.req.valid('json')
      const newConfig = updateConfig(body)
      const ip = getLocalIpAddress()
      const port = 3000
      const localNetworkUrl = `http://${ip}:${port}`

      return c.json({
        success: true,
        data: {
          ...newConfig,
          localNetworkUrl
        }
      })
    }
  )

export default configApi
