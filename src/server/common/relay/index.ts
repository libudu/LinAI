import { StorageError } from '../storage/errors'

/**
 * 受限请求中继（§8）：注册式目标白名单，替代"任意 URL 代理"。
 * - 目标 origin 由服务端注册定义解析（常量或服务端配置），客户端不能指定
 * - HTTP 方法与路径白名单（精确匹配）；客户端不能设置任何请求头，凭据由服务端注入
 * - 支持 SSE 流式下行与客户端断开联动中断上游
 * 带文件副作用（生图、音频保存）或业务预处理的请求仍保留专用适配器。
 */

/** 中继错误：status 为返回给客户端的 HTTP 状态码 */
export class RelayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'RelayError'
  }
}

export interface RelayTargetDef<C = unknown> {
  /**
   * 每次中继请求调用一次的上下文解析（如读取模块设置），结果传给
   * resolveOrigin / injectCredential / injectBody，避免各 hook 重复读盘
   */
  resolveContext?: () => C | Promise<C>
  /** 目标 origin 解析（服务端常量或配置，绝不来自客户端） */
  resolveOrigin: (context: C) => string | Promise<string>
  allowedMethods: Array<'GET' | 'POST' | 'PUT' | 'DELETE'>
  /** 路径白名单（不含 origin，精确匹配，如 /chat/completions） */
  allowedPaths: string[]
  /** 服务端凭据注入；缺少凭据时抛 RelayError(400) */
  injectCredential?: (
    headers: Record<string, string>,
    context: C,
  ) => void | Promise<void>
  /** 服务端注入的请求体字段（如 model），覆盖客户端同名字段 */
  injectBody?: (
    context: C,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  /** 允许 SSE 流式下行 */
  streaming?: boolean
  /** 非流式请求超时，默认 60s */
  timeoutMs?: number
  /** 请求体最大字符数，默认 2M */
  maxBodyLength?: number
}

// 中继目标 ID 形如 novel.openai：小写段以点分隔
const TARGET_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)*$/

export interface RelayRequest {
  method?: string
  path: string
  body?: unknown
}

class RequestRegistry {
  private readonly defs = new Map<string, RelayTargetDef<unknown>>()

  register<C>(id: string, def: RelayTargetDef<C>): void {
    if (!TARGET_ID_PATTERN.test(id)) {
      throw new Error(`[relay] 非法目标 ID: ${id}`)
    }
    if (this.defs.has(id)) {
      throw new Error(`[relay] 重复注册目标: ${id}`)
    }
    this.defs.set(id, def as RelayTargetDef<unknown>)
  }

  get(id: string): RelayTargetDef {
    const def = this.defs.get(id)
    if (!def) {
      throw new StorageError('INVALID_RESOURCE', `未注册的中继目标: ${id}`)
    }
    return def
  }

  /**
   * 校验并发起上游请求，返回原始 Response（调用方负责消费/转发）。
   * signal 用于客户端断开或超时中断上游
   */
  async execute(
    id: string,
    req: RelayRequest,
    signal?: AbortSignal,
  ): Promise<Response> {
    const def = this.get(id)
    const method = (req.method ?? 'POST').toUpperCase()
    if (!def.allowedMethods.includes(method as never)) {
      throw new RelayError(405, `[中继] 目标 ${id} 不允许方法 ${method}`)
    }
    if (
      typeof req.path !== 'string' ||
      !req.path.startsWith('/') ||
      !def.allowedPaths.includes(req.path)
    ) {
      throw new RelayError(403, `[中继] 目标 ${id} 不允许路径 ${req.path}`)
    }
    // 每请求解析一次上下文（如模块设置），供 origin/凭据/注入体共用
    const context = def.resolveContext ? await def.resolveContext() : undefined
    const baseUrl = new URL(await def.resolveOrigin(context))
    if (!['http:', 'https:'].includes(baseUrl.protocol)) {
      throw new RelayError(400, '[中继] 目标 ' + id + ' 的 Base URL 协议无效')
    }
    // 保留 Base URL 的路径前缀（如 /v1），再拼接已通过白名单校验的逻辑路径
    const basePath = baseUrl.pathname.replace(/\/+$/, '')
    // 防御 //host 或绝对 URL 逃逸：拼出来的 URL 必须仍属于注册 origin
    const url = new URL(basePath + req.path, baseUrl.origin)
    if (url.origin !== baseUrl.origin) {
      throw new RelayError(403, `[中继] 非法路径: ${req.path}`)
    }

    const headers: Record<string, string> = {}
    let body: string | undefined
    if (req.body !== undefined) {
      // 服务端注入字段（如 model）覆盖客户端同名字段
      const injected = def.injectBody
        ? await def.injectBody(context)
        : undefined
      const finalBody =
        injected && typeof req.body === 'object' && req.body !== null
          ? { ...(req.body as Record<string, unknown>), ...injected }
          : req.body
      body = JSON.stringify(finalBody)
      if (body.length > (def.maxBodyLength ?? 2 * 1024 * 1024)) {
        throw new RelayError(413, '[中继] 请求体超出大小限制')
      }
      headers['content-type'] = 'application/json'
    }
    await def.injectCredential?.(headers, context)

    const isStreamRequest =
      def.streaming &&
      typeof req.body === 'object' &&
      req.body !== null &&
      (req.body as Record<string, unknown>).stream === true

    const signals: AbortSignal[] = []
    if (signal) signals.push(signal)
    if (!isStreamRequest) {
      signals.push(AbortSignal.timeout(def.timeoutMs ?? 60_000))
    }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      })
    } catch (error: any) {
      if (signal?.aborted) throw error // 客户端断开，原样抛出由路由静默处理
      throw new RelayError(
        502,
        `[中继] ${url.host} 请求失败: ${error?.message || error}`,
      )
    }
    return response
  }
}

export const requestRegistry = new RequestRegistry()
