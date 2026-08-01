import { hc } from 'hono/client'
import { useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import type { AppType } from '../../server'
import type { GPTImageQuotaResponse } from '../../server/api/gpt-image'
import { isAdmin } from '../pages/common/SettingModal'
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
  // 切换接入点时立即进入加载态并清空旧数据，避免短暂展示旧接入点余额
  beginSwitch: () => void
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

    if (state.loading && state.lastApiKey === apiKey && state.fetchPromise) {
      return state.fetchPromise
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
  beginSwitch: () => {
    set({ loading: true, data: null, error: null, fetchPromise: null })
  },
}))

export const isPublicApiKey = (name?: string | null) =>
  name?.includes('公开') ||
  name?.includes('共用') ||
  name?.includes('公用') ||
  false

export function useGPTImageQuota() {
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const gptImageBaseUrl = useGlobalStore((state) => state.gptImageBaseUrl)
  const { data: tasks } = useTasks()
  const knownCompletedTasks = useRef<Set<string> | null>(null)

  const data = useQuotaStore((state) => state.data)
  const loading = useQuotaStore((state) => state.loading)
  const error = useQuotaStore((state) => state.error)
  const fetchQuota = useQuotaStore((state) => state.fetchQuota)
  const beginSwitch = useQuotaStore((state) => state.beginSwitch)

  const isPublic = useMemo(
    () => isPublicApiKey(data?.name) && !isAdmin(),
    [data?.name],
  )

  useEffect(() => {
    if (!gptImageApiKey) {
      fetchQuota(null)
      return
    }
    // 切换接入点时立刻进入 loading 状态，接口返回后再重置，
    // 避免短暂用旧接入点数据展示
    beginSwitch()
    // 切换接入点后服务端配置写入存在延迟，延迟 500ms 再查询，
    // 避免用切换前的服务商 host 配新 apikey 导致 Invalid token 报错
    const timer = setTimeout(() => {
      fetchQuota(gptImageApiKey, true)
    }, 500)
    return () => clearTimeout(timer)
  }, [gptImageApiKey, gptImageBaseUrl, fetchQuota, beginSwitch])

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
