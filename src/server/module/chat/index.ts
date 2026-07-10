export const YUNWU_CHAT_COMPLETIONS_URL = 'https://yunwu.ai/v1/chat/completions'

export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
  [key: string]: unknown
}

export interface ChatMessage {
  role: string
  content: string | ChatContentPart[]
  [key: string]: unknown
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  [key: string]: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function parseChatResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return await response.json()
  }

  const text = await response.text()
  return {
    error: text || 'Upstream service returned an empty response',
  }
}

export async function createChatCompletion(options: {
  apiKey: string
  body: ChatCompletionRequest
}) {
  const { apiKey, body } = options

  if (body.stream) {
    return {
      status: 400,
      data: {
        success: false as const,
        error: '[服务] Stream mode is not supported',
      },
    }
  }

  try {
    const response = await fetch(YUNWU_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await parseChatResponse(response)

    if (!response.ok) {
      const upstreamError = isPlainObject(data) && typeof data.error === 'string'
        ? data.error
        : ''
      const prefix = '[yunwu.ai] '
      return {
        status: response.status,
        data: isPlainObject(data)
          ? { ...data, error: `${prefix}${upstreamError || 'Chat completion request failed'}` }
          : {
              success: false as const,
              error: `${prefix}Chat completion request failed`,
            },
      }
    }

    return {
      status: response.status,
      data,
    }
  } catch (error: any) {
    return {
      status: 500,
      data: {
        success: false as const,
        error: `[网络] ${error.message || 'Chat completion request failed'}`,
      },
    }
  }
}
