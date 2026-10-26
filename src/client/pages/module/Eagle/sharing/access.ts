let ownerSession: Promise<void> | null = null

/** 本机管理会话先于设置读取、共享 SSE 和业务请求建立，避免首次加载的竞态。 */
export function ensureEagleOwnerSession(renew = false) {
  if (!ownerSession || renew) {
    ownerSession = fetch('/api/eagle/sharing/local-session')
      .then(async (response) => {
        if (!response.ok) {
          const json = await response.json()
          throw new Error(json?.error?.message || '无法建立 Eagle 本机管理会话')
        }
      })
      .catch((error) => {
        ownerSession = null
        throw error
      })
  }
  return ownerSession
}
