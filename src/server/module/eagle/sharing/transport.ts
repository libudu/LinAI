import { HTTPException } from 'hono/http-exception'
import { getRemoteConnection } from './service'

/** 共享协议只有这几个读取入口；禁止把任意 URL 或写接口转发给共享方。 */
export const isSharedRead = (path: string) =>
  /^\/(overview|folders|items)$/.test(path) ||
  /^\/items\/[A-Za-z0-9]+\/(detail|thumbnail|preview|file)$/.test(path)

/** 连接撤销时终止在途传输；禁用媒体缓存，后续读取始终重新校验会话。 */
export function bindSharedResponse(
  response: Response,
  signal: AbortSignal,
  onBytes?: (bytes: number) => void,
) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.delete('set-cookie')
  if (!response.body)
    return new Response(null, { status: response.status, headers })
  const reader = response.body.getReader()
  let ended = false
  let abort: () => void
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (ended) return
        ended = true
        void reader.cancel().catch(() => undefined)
        controller.error(new Error('Eagle 共享连接已终止'))
        signal.removeEventListener('abort', abort)
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    },
    async pull(controller) {
      try {
        const result = await reader.read()
        if (ended) return
        if (result.done) {
          ended = true
          signal.removeEventListener('abort', abort)
          controller.close()
        } else {
          onBytes?.(result.value.byteLength)
          controller.enqueue(result.value)
        }
      } catch (error) {
        if (ended) return
        ended = true
        signal.removeEventListener('abort', abort)
        controller.error(error)
      }
    },
    cancel() {
      ended = true
      signal.removeEventListener('abort', abort)
      return reader.cancel()
    },
  })
  return new Response(body, { status: response.status, headers })
}

export async function proxySharedRead(
  pageId: string,
  path: string,
  request: Request,
) {
  if (!isSharedRead(path))
    throw new HTTPException(403, {
      message: '远程共享资源库仅支持浏览和预览，不能编辑或删除',
    })
  const session = await getRemoteConnection(pageId)
  const url = new URL(`${session.url}/api/eagle/sharing/library${path}`)
  const source = new URL(request.url)
  for (const [key, value] of source.searchParams) {
    if (key !== 'pageId') url.searchParams.append(key, value)
  }
  const headers = new Headers({ Authorization: `Bearer ${session.token}` })
  const range = request.headers.get('range')
  if (range) headers.set('Range', range)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  const signal = AbortSignal.any([
    request.signal,
    session.controller.signal,
    controller.signal,
  ])
  try {
    const response = await fetch(url, { headers, signal, redirect: 'error' })
    return bindSharedResponse(response, signal)
  } catch (error) {
    throw new HTTPException(409, {
      message:
        error instanceof Error
          ? `远程资源读取失败：${error.message}`
          : '远程资源读取失败',
    })
  } finally {
    clearTimeout(timeout)
  }
}
