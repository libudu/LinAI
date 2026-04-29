import { useRequest } from 'ahooks'
import { message } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../server'

const client = hc<AppType>('/')

export function useTemplates() {
  return useRequest(
    async () => {
      const res = await client.api.template.$get()
      const json = await res.json()
      if (json.success) {
        return json.data
      } else {
        message.error(json.error || '获取模板失败')
        return []
      }
    },
    {
      cacheKey: 'global-templates',
      onError: () => {
        message.error('请求失败')
      },
    },
  )
}
