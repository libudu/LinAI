import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { getNovelEndpoint } from '../module/novel/settings'

/**
 * 规范化并拼接上游目标 URL
 * 兼容 base URL 带/不带 /v1、带/不带尾随斜杠、以及已包含目标路径的情况
 */
function resolveTargetUrl(
  rawBaseUrl: string,
  subPath: string = '/chat/completions',
): string {
  let base = (rawBaseUrl || '').trim()
  if (!base) {
    throw new Error('Base URL 不能为空')
  }
  if (!/^https?:\/\//i.test(base)) {
    base = 'https://' + base
  }
  const url = new URL(base)
  const pathname = url.pathname.replace(/\/+$/, '')
  const normalizedSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`

  if (pathname.endsWith(normalizedSubPath)) {
    return url.origin + pathname
  }
  return url.origin + pathname + normalizedSubPath
}

export const handleChatCompletions = async (c: Context) => {
  const endpoint = await getNovelEndpoint()

  if (!endpoint.apiKey?.trim()) {
    return c.json(
      {
        error: {
          message:
            '小说模块尚未配置 API Key，请先在 LinAI 小说设置中配置生文接入点',
          type: 'invalid_request_error',
          param: null,
          code: 'missing_api_key',
        },
      },
      400,
    )
  }

  if (!endpoint.baseUrl?.trim()) {
    return c.json(
      {
        error: {
          message:
            '小说模块尚未配置 Base URL，请先在 LinAI 小说设置中配置生文接入点',
          type: 'invalid_request_error',
          param: null,
          code: 'missing_base_url',
        },
      },
      400,
    )
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  // 注入服务端配置的小说模型 ID，若未配置则保留客户端传入的模型
  if (endpoint.modelId?.trim()) {
    body.model = endpoint.modelId.trim()
  }

  const targetUrl = resolveTargetUrl(endpoint.baseUrl, '/chat/completions')

  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${endpoint.apiKey.trim()}`,
  }

  const acceptHeader = c.req.header('accept')
  if (acceptHeader) {
    upstreamHeaders.Accept = acceptHeader
  }

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
      signal: c.req.raw.signal,
    })
  } catch (err: any) {
    if (c.req.raw.signal?.aborted) {
      return new Response(null, { status: 499 })
    }
    return c.json(
      {
        error: {
          message: `请求上游接入点失败 (${targetUrl}): ${err?.message || err}`,
          type: 'upstream_error',
          param: null,
          code: 'upstream_connect_error',
        },
      },
      502,
    )
  }

  if (!upstreamRes.ok) {
    const contentType = upstreamRes.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        const errorJson = await upstreamRes.json()
        return c.json(errorJson, upstreamRes.status as any)
      } catch {
        // Fallthrough
      }
    }
    const errorText = await upstreamRes.text().catch(() => '')
    return c.json(
      {
        error: {
          message: errorText || `上游返回 HTTP ${upstreamRes.status}`,
          type: 'upstream_error',
          param: null,
          code: `upstream_error_${upstreamRes.status}`,
        },
      },
      upstreamRes.status as any,
    )
  }

  const contentType = upstreamRes.headers.get('content-type') || ''
  const isStream =
    contentType.includes('text/event-stream') || body.stream === true

  if (isStream) {
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': contentType || 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const handleModels = async (c: Context) => {
  const endpoint = await getNovelEndpoint()
  const modelId = endpoint.modelId?.trim() || 'default'

  return c.json({
    object: 'list',
    data: [
      {
        id: modelId,
        object: 'model',
        created: 1677610602,
        owned_by: 'linai',
        permission: [],
        root: modelId,
        parent: null,
      },
    ],
  })
}

export const handleModelDetail = async (c: Context) => {
  const model = c.req.param('model') || 'default'
  return c.json({
    id: model,
    object: 'model',
    created: 1677610602,
    owned_by: 'linai',
    permission: [],
    root: model,
    parent: null,
  })
}

const openaiApi = new Hono()

openaiApi.use('*', cors())
openaiApi.onError((err, c) => {
  console.error('[OpenAI API] 错误:', err)
  return c.json(
    {
      error: {
        message: err.message || '内部服务器错误',
        type: 'internal_error',
        param: null,
        code: 'internal_error',
      },
    },
    500,
  )
})

openaiApi.post('/chat/completions', handleChatCompletions)
openaiApi.get('/models', handleModels)
openaiApi.get('/models/:model', handleModelDetail)

export default openaiApi
