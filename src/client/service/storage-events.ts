/**
 * 统一前端 SSE 资源变更事件复用器：
 * 浏览器对单个域名（HTTP/1.1）存在最多 6 个并发 TCP 连接的严格上限。
 * 将全应用所有模块的变更订阅（如 eagle.library, eagle.organize, image.tasks）
 * 合并为单一 EventSource 连接（/api/storage/events?resources=resA,resB,...），
 * 为普通业务请求（读写、图片与缩略图加载）释放 2~3 个宝贵的连接槽位。
 */

export interface StorageResourceChange {
  resource: string
  revision?: number
  entityId?: string
}

type StorageChangeListener = (change: StorageResourceChange) => void

class StorageEventsMultiplexer {
  private readonly listeners = new Map<string, Set<StorageChangeListener>>()
  private activeResourcesKey = ''
  private eventSource: EventSource | null = null
  private syncTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 订阅指定资源的变更事件
   * @param resource 资源标识（如 'eagle.library', 'eagle.organize', 'image.tasks'）
   * @param listener 变更回调函数
   * @returns 取消订阅函数
   */
  subscribe(resource: string, listener: StorageChangeListener): () => void {
    let set = this.listeners.get(resource)
    if (!set) {
      set = new Set()
      this.listeners.set(resource, set)
    }
    set.add(listener)
    this.scheduleSync()

    return () => {
      const currentSet = this.listeners.get(resource)
      if (currentSet) {
        currentSet.delete(listener)
        if (currentSet.size === 0) {
          this.listeners.delete(resource)
        }
        this.scheduleSync()
      }
    }
  }

  private scheduleSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      this.sync()
    }, 50)
  }

  private sync(): void {
    const activeResources = Array.from(this.listeners.entries())
      .filter(([, set]) => set.size > 0)
      .map(([res]) => res)
      .sort()

    const newKey = activeResources.join(',')

    if (newKey === this.activeResourcesKey) {
      return
    }

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    this.activeResourcesKey = newKey

    if (activeResources.length === 0) {
      return
    }

    const url = `/api/storage/events?resources=${encodeURIComponent(newKey)}`
    const es = new EventSource(url)

    es.addEventListener('change', (event: MessageEvent) => {
      try {
        const change = JSON.parse(event.data) as StorageResourceChange
        if (!change || !change.resource) return
        const set = this.listeners.get(change.resource)
        if (set) {
          for (const listener of set) {
            try {
              listener(change)
            } catch (err) {
              console.error(
                `[storage-events] 资源 ${change.resource} 监听器回调报错:`,
                err,
              )
            }
          }
        }
      } catch (err) {
        console.error('[storage-events] 解析 SSE 数据失败:', err)
      }
    })

    es.onerror = (error) => {
      // EventSource 会自动进行退避重连，此处仅做静默或警告记录
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[storage-events] SSE 连接已断开，等待浏览器重连', error)
      }
    }

    this.eventSource = es
  }
}

export const storageEventsClient = new StorageEventsMultiplexer()

/**
 * 便捷订阅函数：订阅指定资源的变更事件
 */
export const subscribeStorageEvent = (
  resource: string,
  listener: StorageChangeListener,
): (() => void) => {
  return storageEventsClient.subscribe(resource, listener)
}
