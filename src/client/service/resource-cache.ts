import { useEffect } from 'react'
import { create } from 'zustand'
import { RefreshQueue } from './refresh-queue'
import { subscribeStorageEvent } from './storage-events'

/** 服务端资源缓存：保留旧数据、串行补拉、按订阅轮次丢弃旧响应。 */
export function createResourceCache<T>(options: {
  resource: string
  initialValue: T
  load: () => Promise<T>
}) {
  const useStore = create<{
    data: T
    loading: boolean
    loaded: boolean
    error: Error | null
  }>()(() => ({
    data: options.initialValue,
    loading: true,
    loaded: false,
    error: null,
  }))
  let subscribers = 0
  let epoch = 0
  let requestVersion = 0
  let unsubscribe: (() => void) | undefined
  const queue = new RefreshQueue(async () => {
    const currentEpoch = epoch
    const currentVersion = requestVersion
    useStore.setState({ loading: !useStore.getState().loaded })
    try {
      const data = await options.load()
      if (currentEpoch === epoch && currentVersion === requestVersion)
        useStore.setState({ data, loading: false, loaded: true, error: null })
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason))
      if (currentEpoch === epoch && currentVersion === requestVersion)
        useStore.setState({ loading: false, error })
      throw error
    }
  })
  const refresh = () => {
    requestVersion += 1
    return queue.request()
  }
  const invalidate = () => {
    if (subscribers) void refresh().catch(() => undefined)
  }
  const subscribe = () => {
    if (subscribers++ === 0) {
      epoch += 1
      unsubscribe = subscribeStorageEvent(options.resource, invalidate)
      invalidate()
    }
    return () => {
      if (--subscribers === 0) {
        epoch += 1
        unsubscribe?.()
        unsubscribe = undefined
      }
    }
  }
  const useCache = (enabled = true) => {
    const state = useStore()
    useEffect(() => (enabled ? subscribe() : undefined), [enabled])
    return { ...state, refresh: invalidate, refreshAsync: refresh }
  }
  return { useCache, invalidate, refresh, getState: useStore.getState }
}
