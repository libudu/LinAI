import { useRequest } from 'ahooks'
import { hc } from 'hono/client'
import type { AppType } from '../../server'

const client = hc<AppType>('/')

export function useTasks(usageType: 'image' | 'video') {
  return useRequest(
    async () => {
      const res = await client.api.task[':usageType'].$get({
        param: { usageType }
      })
      const json = await res.json()
      if (json.success) {
        return json.data
      } else {
        return []
      }
    },
    {
      pollingInterval: 5000,
      onError: () => {
        console.error('Failed to fetch tasks')
      }
    }
  )
}
