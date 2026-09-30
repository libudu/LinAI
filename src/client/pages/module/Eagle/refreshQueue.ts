/** 合并同一时刻的刷新；请求进行中再次失效时补拉一轮，调用方等待全部补拉结束。 */
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
      // 同步调用共用一轮；running 在安排微任务前设置，避免启动多个刷新。
      queueMicrotask(() => void this.drain())
    }
    return promise
  }

  private async drain() {
    try {
      while (this.pending) {
        this.pending = false
        await this.refresh()
      }
      for (const waiter of this.waiters.splice(0)) waiter.resolve()
    } catch (error) {
      this.pending = false
      for (const waiter of this.waiters.splice(0)) waiter.reject(error)
    } finally {
      this.running = false
    }
  }
}
