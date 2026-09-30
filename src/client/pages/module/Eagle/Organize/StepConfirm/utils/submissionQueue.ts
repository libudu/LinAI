import type { PendingConfirmItem } from '../types'

const BATCH_SIZE = 20
const BATCH_DELAY_MS = 3000

/** 批次和单图命令共用串行队列；flush 会等待已发送和本次待发送的全部操作。 */
export class ConfirmSubmissionQueue {
  private pending: PendingConfirmItem[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly submit: (items: PendingConfirmItem[]) => Promise<void>,
  ) {}

  enqueue(item: PendingConfirmItem) {
    this.pending.push(item)
    this.clearTimer()
    if (this.pending.length >= BATCH_SIZE) void this.flush()
    else
      this.timer = setTimeout(() => {
        void this.flush()
      }, BATCH_DELAY_MS)
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  flush(): Promise<void> {
    this.clearTimer()
    const batch = this.pending.splice(0)
    if (batch.length > 0) {
      this.runSerially(() => this.submit(batch))
    }
    return this.tail
  }

  /** 先安排所有已积攒批次，再加入单图操作；后续新增批次排在其后。 */
  runAction(action: () => Promise<void>): Promise<void> {
    void this.flush()
    return this.runSerially(action)
  }

  private runSerially(action: () => Promise<void>): Promise<void> {
    const result = this.tail.then(action)
    this.tail = result.catch((error) =>
      console.error('图片整理提交队列执行失败', error),
    )
    return result
  }
}
