import { rpcData } from '@/client/service/http'
import { RefreshQueue } from '@/client/service/refresh-queue'
import { isAdmin } from '@/client/utils/admin'
import type { AppType } from '@/server'
import type { GPTImageQuotaResponse } from '@/server/api/gpt-image/endpoint'
import { hc } from 'hono/client'
import { useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import { useTaskSummary } from '../tasks/useTasks'
import { useGptImageStore } from './store'

export const GPT_IMAGE_RMB_RATIO = 2
export const MODEL_GROUP_RATIO = 1.0
const client = hc<AppType>('/')
interface QuotaTarget {
  key: string
  endpointId: string
}
const useQuotaStore = create<{
  key: string | null
  data: GPTImageQuotaResponse['data'] | null
  error: string | null
  loading: boolean
}>(() => ({ key: null, data: null, error: null, loading: false }))

let target: QuotaTarget | null = null
let controller: AbortController | undefined
let epoch = 0
const queue = new RefreshQueue(async () => {
  const current = target
  const currentEpoch = epoch
  if (!current) return
  controller = new AbortController()
  useQuotaStore.setState({ loading: true, error: null })
  try {
    const result = await rpcData(
      client.api.gptImage.endpoint.quota.$get(
        { query: { endpointId: current.endpointId } },
        { init: { signal: controller.signal } },
      ),
    )
    if (currentEpoch === epoch)
      useQuotaStore.setState({
        data: result.data,
        error: null,
        loading: false,
      })
  } catch (error) {
    if (currentEpoch === epoch)
      useQuotaStore.setState({
        error: error instanceof Error ? error.message : '获取余额失败',
        loading: false,
      })
  }
})

const updateTarget = (next: QuotaTarget | null) => {
  if (target?.key === next?.key) return
  target = next
  epoch += 1
  controller?.abort()
  useQuotaStore.setState({
    key: next?.key ?? null,
    data: null,
    error: null,
    loading: !!next,
  })
  if (next) void queue.request()
}
const refreshQuota = () => (target ? queue.request() : Promise.resolve())

export const isPublicApiKey = (name?: string | null) =>
  name?.includes('公开') ||
  name?.includes('共用') ||
  name?.includes('公用') ||
  false

export function useGPTImageQuota() {
  const endpoint = useGptImageStore((state) => state.currentEndpoint)
  const capabilities = useGptImageStore((state) => state.capabilities)
  const quotaEnabled =
    capabilities.quota &&
    endpoint &&
    endpoint.protocol !== 'comfyui' &&
    !!endpoint.apiKey
  const key = quotaEnabled
    ? JSON.stringify([
        endpoint.selectionId,
        endpoint.protocol,
        endpoint.quotaProvider,
        endpoint.baseUrl,
        endpoint.modelId,
        endpoint.apiKey,
      ])
    : null
  const endpointId = endpoint?.selectionId ?? ''
  const { data: summary, loaded: summaryLoaded } = useTaskSummary()
  const previousCloudCompletion = useRef<number | null>(null)
  const state = useQuotaStore()

  useEffect(() => {
    updateTarget(key ? { key, endpointId } : null)
  }, [key, endpointId])

  useEffect(() => {
    if (!summaryLoaded) return
    const previous = previousCloudCompletion.current
    previousCloudCompletion.current = summary.cloudCompletedAt
    if (previous !== null && summary.cloudCompletedAt > previous)
      void refreshQuota()
  }, [summary, summaryLoaded])

  // 配置刚切换但 effect 尚未执行时也不显示旧接入点余额。
  const matches = state.key === key
  const quota = matches ? state.data : null
  const isPublic = useMemo(
    () => isPublicApiKey(quota?.name) && !isAdmin(),
    [quota?.name],
  )
  return {
    quota,
    loading: !!key && (!matches || state.loading),
    error: matches ? state.error : null,
    isPublic,
    refresh: refreshQuota,
  }
}
