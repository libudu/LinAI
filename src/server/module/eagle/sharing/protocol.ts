/** 独立于系统登录的共享协议白名单；只读资源需经房间权限组验证的 Bearer 会话。 */
export const isSharedRead = (path: string) =>
  /^\/(overview|folders|items)$/.test(path) ||
  /^\/items\/[A-Za-z0-9]+\/(detail|thumbnail|preview|file)$/.test(path)

const LIBRARY_PREFIX = '/api/eagle/sharing/library'
const COMMAND_PATHS = new Set([
  '/api/eagle/sharing/request',
  '/api/eagle/sharing/session/heartbeat',
  '/api/eagle/sharing/session/close',
])

export function isEagleSharingProtocol(method: string, path: string) {
  if (method === 'POST') return COMMAND_PATHS.has(path)
  return (
    method === 'GET' &&
    path.startsWith(`${LIBRARY_PREFIX}/`) &&
    isSharedRead(path.slice(LIBRARY_PREFIX.length))
  )
}
