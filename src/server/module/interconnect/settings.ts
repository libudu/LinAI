import { z } from 'zod'
import { settingsRegistry } from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'

export const peerUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        ['tcp:', 'udp:'].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.hash &&
        !url.search
      )
    } catch {
      return false
    }
  }, '请输入有效的 EasyTier TCP 或 UDP 节点 URL')

export const interconnectSettingsSchema = z.object({
  peers: z.array(peerUrlSchema).min(1).max(10),
})
export type InterconnectSettings = z.infer<typeof interconnectSettingsSchema>
settingsRegistry.register<InterconnectSettings>('interconnect', {
  file: dataPath('interconnect', 'settings.json'),
  schema: interconnectSettingsSchema,
  defaults: { peers: ['tcp://public.easytier.cn:11010'] },
})
export const getInterconnectSettings = () =>
  settingsRegistry.get<InterconnectSettings>('interconnect')
