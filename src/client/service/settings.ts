import { apiRequest } from './storage'

/**
 * 注册式设置客户端（GET/PUT /api/settings/:id）。
 * 本应用前后端均在用户本地，密钥明文回传，方便用户查看与复制
 */

export interface SettingsResult<T> {
  /** 文档版本，PUT 时作为 expectedRevision 做冲突检测 */
  revision: number
  value: T
}

export const settingsClient = <T>(id: string) => {
  const base = `/api/settings/${id}`
  return {
    get: async (): Promise<SettingsResult<T>> => {
      const json = await apiRequest<T>(base)
      return { revision: json.revision ?? 0, value: json.data }
    },
    put: async (
      value: T,
      expectedRevision?: number,
    ): Promise<SettingsResult<T>> => {
      const json = await apiRequest<T>(base, {
        method: 'PUT',
        body: JSON.stringify({ value, expectedRevision }),
      })
      return { revision: json.revision ?? 0, value: json.data }
    },
  }
}
