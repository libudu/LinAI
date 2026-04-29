import { hc } from 'hono/client'
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { AppType } from '../../server'
import type { GPTImageQuotaResponse } from '../../server/api/gpt-image'
import { useGlobalStore } from '../store/global'
import { useTasks } from './useTasks'

// 人民币和积分的汇率
export const GPT_IMAGE_RMB_RATIO = 2
// 分组的积分消耗倍率
export const MODEL_GROUP_RATIO = 1.0

const client = hc<AppType>('/')

interface QuotaStore {
  data: GPTImageQuotaResponse['data'] | null
  error: string | null
  loading: boolean
  lastApiKey: string | null
  fetchPromise: Promise<void> | null
  fetchQuota: (apiKey: string | null, force?: boolean) => Promise<void>
}

const useQuotaStore = create<QuotaStore>((set, get) => ({
  data: null,
  error: null,
  loading: false,
  lastApiKey: null,
  fetchPromise: null,
  fetchQuota: async (apiKey, force = false) => {
    if (!apiKey) {
      set({ data: null, error: null, lastApiKey: null })
      return
    }

    const state = get()
    if (
      !force &&
      state.lastApiKey === apiKey &&
      (state.data !== null || state.error !== null || state.loading)
    ) {
      return state.fetchPromise || Promise.resolve()
    }

    if (state.loading && state.lastApiKey === apiKey) {
      return state.fetchPromise || Promise.resolve()
    }

    const promise = (async () => {
      set({ loading: true, error: null, lastApiKey: apiKey })
      try {
        const response = await client.api.gptImage.quota.$get()
        const json = await response.json()
        if (!json.success) {
          throw new Error(json.error || '获取余额失败')
        }
        set({
          data: json.data.data,
          error: null,
          loading: false,
          fetchPromise: null,
        })
      } catch (error: any) {
        console.error(error)
        set({ error: error.message, loading: false, fetchPromise: null })
      }
    })()

    set({ fetchPromise: promise })
    return promise
  },
}))

export function useGPTImageQuota() {
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const { data: tasks } = useTasks()
  const knownCompletedTasks = useRef<Set<string> | null>(null)

  const data = useQuotaStore((state) => state.data)
  const loading = useQuotaStore((state) => state.loading)
  const error = useQuotaStore((state) => state.error)
  const fetchQuota = useQuotaStore((state) => state.fetchQuota)

  const isPublic =
    data?.name?.includes('公开') ||
    data?.name?.includes('共用') ||
    data?.name?.includes('公用') ||
    false

  useEffect(() => {
    fetchQuota(gptImageApiKey)
  }, [gptImageApiKey, fetchQuota])

  useEffect(() => {
    if (!tasks) return

    // 假设第一页任务数量为前 20 条
    const recentTasks = tasks.slice(0, 20)

    if (knownCompletedTasks.current === null) {
      // 初始化已完成任务集合
      knownCompletedTasks.current = new Set()
      for (const task of recentTasks) {
        if (task.status === 'completed') {
          knownCompletedTasks.current.add(task.id)
        }
      }
      return
    }

    let hasNewCompletedTask = false
    for (const task of recentTasks) {
      if (task.status === 'completed') {
        if (!knownCompletedTasks.current.has(task.id)) {
          hasNewCompletedTask = true
          knownCompletedTasks.current.add(task.id)
        }
      }
    }

    if (hasNewCompletedTask) {
      fetchQuota(gptImageApiKey, true)
    }
  }, [tasks, gptImageApiKey, fetchQuota])

  return {
    quota: data,
    loading,
    error,
    isPublic,
    refresh: () => fetchQuota(gptImageApiKey, true),
  }
}
