/** 前后端共用 ComfyUI 地址规则，支持本机、远程地址及反向代理路径前缀。 */
export function normalizeComfyBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('ComfyUI 地址不是有效 URL')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'ComfyUI 地址必须为 HTTP/HTTPS，且不能包含用户名、密码、查询参数或片段',
    )
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export function isValidComfyBaseUrl(value: string): boolean {
  try {
    normalizeComfyBaseUrl(value)
    return true
  } catch {
    return false
  }
}
