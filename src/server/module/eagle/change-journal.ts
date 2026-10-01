import { randomUUID } from 'crypto'

/** 只保留最近 512 次条目变更；游标过期/服务重启/整体失效时退回完整快照。 */
export class EagleChangeJournal {
  private readonly epoch = randomUUID()
  private sequence = 0
  private floor = 0
  private readonly changes: Array<{ sequence: number; id: string }> = []

  get version() {
    return `${this.epoch}:${this.sequence}`
  }

  changed(id: string) {
    this.changes.push({ sequence: ++this.sequence, id })
    if (this.changes.length > 512) this.floor = this.changes.shift()!.sequence
  }

  reset() {
    this.floor = ++this.sequence
    this.changes.length = 0
  }

  /** null 表示调用方必须读取完整快照，空数组表示没有条目变化。 */
  since(version?: string): string[] | null {
    if (!version?.startsWith(`${this.epoch}:`)) return null
    const sequence = Number(version.slice(this.epoch.length + 1))
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < this.floor ||
      sequence > this.sequence
    )
      return null
    return [
      ...new Set(
        this.changes
          .filter((change) => change.sequence > sequence)
          .map((change) => change.id),
      ),
    ]
  }
}
