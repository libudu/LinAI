import { RefreshQueue } from './refreshQueue'

/** 列表可见性与刷新调度独立于数据状态，整理弹窗期间只记脏。 */
export class LibraryRefreshController {
  private suspended = false
  private pending = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private waiters: Array<{
    resolve: () => void
    reject: (error: unknown) => void
  }> = []
  private readonly queue: RefreshQueue

  constructor(refresh: () => Promise<void>) {
    this.queue = new RefreshQueue(refresh)
  }

  /** SSE 和主动刷新共用短暂合并窗口，避免同一次写操作重复拉取。 */
  request = (): Promise<void> => {
    this.pending = true
    if (this.suspended) return Promise.resolve()
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 100)
    return new Promise((resolve, reject) =>
      this.waiters.push({ resolve, reject }),
    )
  }

  setSuspended = async (suspended: boolean): Promise<void> => {
    this.suspended = suspended
    if (suspended) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.finishWaiters()
    } else if (this.pending) {
      await this.request()
    }
  }

  private finishWaiters(error?: unknown) {
    const waiters = this.waiters.splice(0)
    for (const waiter of waiters) {
      if (error !== undefined) waiter.reject(error)
      else waiter.resolve()
    }
  }

  private async flush() {
    this.timer = null
    if (this.suspended) return
    this.pending = false
    const waiters = this.waiters.splice(0)
    try {
      await this.queue.request()
      for (const waiter of waiters) waiter.resolve()
    } catch (error) {
      this.pending = true
      for (const waiter of waiters) waiter.reject(error)
    }
  }
}
