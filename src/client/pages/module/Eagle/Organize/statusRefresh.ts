import { subscribeStorageEvent } from '@/client/service/storage-events'
import type { OrganizeStatus } from '@/shared/eagle/organize'
import { fetchOrganizeStatus } from './api'
import type { OptimisticItems } from './statusModel'

const MIN_REFRESH_INTERVAL_MS = 3000

interface StatusRefreshOptions {
  getItems: () => OptimisticItems
  applyStatus: (status: OrganizeStatus | null, settledIds: string[]) => void
  onError: () => void
}

/** 只负责订阅、节流与快照有效性；乐观记录和展示计数由状态模型处理。 */
export class OrganizeStatusRefresh {
  private subscribers = 0
  private unsubscribe: (() => void) | null = null
  private promise: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending = false
  private lastFetchedAt = 0
  private epoch = 0
  private revision = 0
  private waiters: Array<{ revision: number; resolve: () => void }> = []

  constructor(private readonly options: StatusRefreshOptions) {}

  invalidate() {
    this.epoch++
  }

  private hasSubmittingItems() {
    return Object.values(this.options.getItems()).some(
      (item) => item.state === 'submitting',
    )
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private resolveWaiters(revision: number) {
    const remaining: typeof this.waiters = []
    for (const waiter of this.waiters) {
      if (waiter.revision <= revision) waiter.resolve()
      else remaining.push(waiter)
    }
    this.waiters = remaining
  }

  private fetchPending = (): void => {
    if (this.promise || this.hasSubmittingItems()) return
    this.clearTimer()
    this.promise = Promise.resolve()
      .then(async () => {
        while (this.pending && !this.hasSubmittingItems()) {
          this.pending = false
          const epoch = this.epoch
          const revision = this.revision
          const settledIds = Object.entries(this.options.getItems())
            .filter(([, item]) => item.state === 'settled')
            .map(([id]) => id)
          try {
            const status = await fetchOrganizeStatus()
            if (epoch !== this.epoch) {
              this.pending = true
              continue
            }
            this.lastFetchedAt = Date.now()
            this.options.applyStatus(status, settledIds)
            this.resolveWaiters(revision)
          } catch (error) {
            console.error('拉取图片整理任务状态失败', error)
            this.options.onError()
            this.resolveWaiters(revision)
            // 保留已提交记录，失败后限速重试，避免重复扣减和紧密重试。
            if (settledIds.length > 0) this.schedule(MIN_REFRESH_INTERVAL_MS)
          }
        }
      })
      .finally(() => {
        this.promise = null
        if (this.pending && !this.hasSubmittingItems()) this.fetchPending()
      })
  }

  private schedule = (minimumDelay = 0): void => {
    if (this.hasSubmittingItems()) {
      this.pending = true
      return
    }
    if (this.timer) return
    const delay = Math.max(
      minimumDelay,
      MIN_REFRESH_INTERVAL_MS - (Date.now() - this.lastFetchedAt),
      0,
    )
    this.timer = setTimeout(() => {
      this.timer = null
      this.pending = true
      this.revision++
      this.fetchPending()
    }, delay)
  }

  /** 已有请求也等待本次失效后的有效快照；提交期间等待提交结束再校准。 */
  refresh = (): Promise<void> => {
    this.clearTimer()
    this.pending = true
    const revision = ++this.revision
    const promise = new Promise<void>((resolve) =>
      this.waiters.push({ revision, resolve }),
    )
    this.fetchPending()
    return promise
  }

  subscribe = (): (() => void) => {
    if (this.subscribers++ === 0) {
      this.unsubscribe = subscribeStorageEvent('eagle.organize', () =>
        this.schedule(),
      )
      void this.refresh()
    }
    return () => {
      if (--this.subscribers === 0) {
        this.unsubscribe?.()
        this.unsubscribe = null
        this.clearTimer()
      }
    }
  }
}
