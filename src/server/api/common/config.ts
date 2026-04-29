import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import os from 'os'
import { z } from 'zod'
import { BACKEND_PORT } from '../..'
import { getConfig, updateConfig } from '../../common/config'

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces()

  const allInterfaces = Object.entries(interfaces).flatMap(([name, ifaces]) =>
    (ifaces || []).map((iface) => ({ name, ...iface })),
  )

  const validInterfaces = allInterfaces.filter(
    (i) => i.family === 'IPv4' && !i.internal,
  )

  const isVirtual = (name: string) => {
    const n = name.toLowerCase()
    return (
      n.includes('vmware') ||
      n.includes('virtual') ||
      n.includes('vethernet') ||
      n.includes('wsl') ||
      n.includes('vpn') ||
      n.includes('tailscale') ||
      n.includes('zerotier')
    )
  }

  const isLocal = (ip: string) =>
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)

  const physicalInterfaces = validInterfaces.filter((i) => !isVirtual(i.name))

  const bestMatch =
    physicalInterfaces.find((i) => isLocal(i.address)) ||
    validInterfaces.find((i) => isLocal(i.address)) ||
    physicalInterfaces[0] ||
    validInterfaces[0]

  return bestMatch?.address || null
}

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
