import { useRequest } from 'ahooks'
import { message } from 'antd'
import { listTemplates } from '../service/templates'

export function useTemplates() {
  return useRequest(
    async () => {
      try {
        const { templates } = await listTemplates()
        return templates
      } catch (error) {
        message.error(error instanceof Error ? error.message : '获取模板失败')
        return []
      }
    },
    {
      cacheKey: 'global-templates',
    },
  )
}
