import { RefreshQueue } from '@/client/service/refresh-queue'
import { isAdmin } from '@/client/utils/admin'
import type { AppType } from '@/server'
import type { GPTImageQuotaResponse } from '@/server/api/gpt-image/endpoint'
import { COMFY_IMAGE_SOURCE } from '@/shared/image/sources'
import { hc } from 'hono/client'
import { useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import { useTasks } from '../tasks/useTasks'
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
    const response = await client.api.gptImage.endpoint.quota.$get(
      { query: { endpointId: current.endpointId } },
      { init: { signal: controller.signal } },
    )
    const json = await response.json()
    if (!response.ok || !json.success) {
      const error: unknown = 'error' in json ? json.error : undefined
      throw new Error(typeof error === 'string' ? error : '获取余额失败')
    }
    if (currentEpoch === epoch)
      useQuotaStore.setState({
        data: json.data.data,
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
        endpoint.baseUrl,
        endpoint.modelId,
        endpoint.apiKey,
      ])
    : null
  const endpointId = endpoint?.selectionId ?? ''
  const { data: tasks, loaded: tasksLoaded } = useTasks()
  const knownCompletedTasks = useRef<Set<string> | null>(null)
  const state = useQuotaStore()

  useEffect(() => {
    updateTarget(key ? { key, endpointId } : null)
  }, [key, endpointId])

  useEffect(() => {
    if (!tasksLoaded) return
    const completed = new Set(
      tasks
        .filter((task) => task.status === 'completed')
        .map((task) => task.id),
    )
    const previous = knownCompletedTasks.current
    knownCompletedTasks.current = completed
    if (
      previous &&
      tasks.some(
        (task) =>
          task.status === 'completed' &&
          task.source !== COMFY_IMAGE_SOURCE &&
          !previous.has(task.id),
      )
    )
      void refreshQuota()
  }, [tasks, tasksLoaded])

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
