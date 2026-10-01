import { collectionClient } from '@/client/service/storage'

/** Eagle UI 偏好文档：共享加载与版本，串行保存并合并尚未发送的修改。 */
export class EaglePreferenceDocument<T extends object> {
  private readonly client: ReturnType<typeof collectionClient<T>>
  private snapshot: { value: T; loaded: boolean }
  private revision: number | undefined
  private exists = false
  private readonly defaults: T
  private loadPromise: Promise<void> | null = null
  private savePromise: Promise<void> | null = null
  private dirty = false
  private readonly listeners = new Set<() => void>()
  private pendingMutations: Array<(value: T) => T> = []

  constructor(id: string, defaults: T) {
    this.client = collectionClient<T>(id)
    this.defaults = defaults
    this.snapshot = { value: defaults, loaded: false }
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private publish(value: T, loaded = this.snapshot.loaded) {
    this.snapshot = { value, loaded }
    for (const listener of this.listeners) listener()
  }

  load = (): Promise<void> => {
    if (this.revision !== undefined) return Promise.resolve()
    if (!this.loadPromise) {
      this.loadPromise = this.client
        .list()
        .then((result) => {
          const stored = result.items.find((item) => item.id === 'preferences')
          this.exists = !!stored
          // 加载期间的操作基于实际文档重放，既保留用户操作，也不丢弃历史记录。
          const value = this.pendingMutations.reduce(
            (current, mutate) => mutate(current),
            stored ? { ...this.defaults, ...stored.value } : this.defaults,
          )
          this.pendingMutations = []
          this.revision = result.revision
          this.publish(value, true)
        })
        .catch((error) => {
          this.publish(this.snapshot.value, true)
          throw error
        })
        .finally(() => {
          this.loadPromise = null
        })
    }
    return this.loadPromise
  }

  update = (mutate: (value: T) => T): Promise<void> => {
    if (this.revision === undefined) this.pendingMutations.push(mutate)
    this.publish(mutate(this.snapshot.value))
    this.dirty = true
    if (!this.savePromise) {
      this.savePromise = Promise.resolve().then(async () => {
        try {
          await this.load()
          while (this.dirty) {
            this.dirty = false
            try {
              await this.client.batch(
                [
                  {
                    type: this.exists ? 'replace' : 'create',
                    id: 'preferences',
                    value: this.snapshot.value,
                  },
                ],
                this.revision,
              )
              this.exists = true
              this.revision = this.revision! + 1
              // 保存响应只更新版本，不能覆盖请求期间产生的更新状态。
            } catch (error) {
              this.dirty = true
              throw error
            }
          }
        } finally {
          // 与队列退出同步释放，避免退出后的新修改误用已完成的保存 Promise。
          this.savePromise = null
        }
      })
    }
    return this.savePromise
  }
}
