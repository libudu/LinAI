/** 本期仅允许服务端连接本机 ComfyUI；前后端共用同一地址规则。 */
export function normalizeComfyBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('ComfyUI 地址不是有效 URL')
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('ComfyUI 地址仅允许本机 HTTP 回环地址及端口')
  }
  return url.origin
}

export function isValidComfyBaseUrl(value: string): boolean {
  try {
    normalizeComfyBaseUrl(value)
    return true
  } catch {
    return false
  }
}
