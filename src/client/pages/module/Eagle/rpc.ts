import type { AppType } from '@/server'
import { hc } from 'hono/client'

export const eagleRpc = hc<AppType>('/').api.eagle
