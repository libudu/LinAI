/** 合并刷新；进行中再次失效时补拉，调用方等待所有补拉结束。 */
export class RefreshQueue {
  private pending = false
  private running = false
  private waiters: Array<{
    resolve: () => void
    reject: (error: unknown) => void
  }> = []

  constructor(private readonly refresh: () => Promise<void>) {}

  request(): Promise<void> {
    this.pending = true
    const promise = new Promise<void>((resolve, reject) =>
      this.waiters.push({ resolve, reject }),
    )
    if (!this.running) {
      this.running = true
      queueMicrotask(() => void this.drain())
    }
    return promise
  }

  private async drain() {
    let error: unknown
    let failed = false
    try {
      while (this.pending) {
        this.pending = false
        try {
          await this.refresh()
          failed = false
        } catch (reason) {
          error = reason
          failed = true
          // 请求失败期间又有失效事件，仍补拉一次，不能丢掉最新变更。
        }
      }
      for (const waiter of this.waiters.splice(0)) {
        if (failed) waiter.reject(error)
        else waiter.resolve()
      }
    } finally {
      this.running = false
    }
  }
}
