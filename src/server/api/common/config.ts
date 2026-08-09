import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { BACKEND_PORT } from '../..'
import { getConfig, updateConfig } from '../../common/config'
import { getLocalIpAddress } from '../utils/ip'

const configApi = new Hono()
  .get('/', (c) => {
    const ip = getLocalIpAddress()
    const localNetworkUrl = ip ? `http://${ip}:${BACKEND_PORT}` : null

    return c.json({
      success: true,
      data: {
        ...getConfig(),
        localNetworkUrl,
      },
    })
  })
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        gptImageApiKey: z.string().nullable().optional(),
        gptImageBaseUrl: z.string().nullable().optional(),
        gptImageModelId: z.string().nullable().optional(),
        gptImageCustomEndpoints: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              baseUrl: z.string(),
              modelId: z.string(),
              apiKey: z.string().optional(),
            }),
          )
          .optional(),
        gptImagePresetApiKeys: z.record(z.string(), z.string()).optional(),
      }),
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
          localNetworkUrl,
        },
      })
    },
  )

export default configApi
