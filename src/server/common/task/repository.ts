import type { StoredItem } from '@/shared/storage/types'
import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import { CollectionStore } from '../storage/collection-store'
import { dataPath } from '../storage/data-path'
import { StorageError } from '../storage/errors'
import type { Task, TaskRecord } from './types'

// 旧格式：data/tasks.json 为 Task 扁平数组（快照字段名为 rawTemplate），
// 迁移为信封结构，同时把 rawTemplate 改名为 inputSnapshot
const migrateLegacyTasks = (raw: unknown): StoredItem<TaskRecord>[] => {
  if (!Array.isArray(raw)) {
    throw new Error('旧任务文件不是数组')
  }
  return raw.map((t) => {
    const record = t as Partial<Task> & { rawTemplate?: unknown }
    const { id, createdAt, rawTemplate, ...rest } = record
    const value = { ...rest } as TaskRecord
    if (rawTemplate !== undefined && value.inputSnapshot === undefined) {
      value.inputSnapshot = rawTemplate as TaskRecord['inputSnapshot']
    }
    return {
      id: typeof id === 'string' ? id : randomUUID(),
      revision: 1,
      createdAt: createdAt ?? Date.now(),
      updatedAt: createdAt ?? Date.now(),
      value,
    }
  })
}

const flatten = (item: StoredItem<TaskRecord>): Task => ({
  id: item.id,
  createdAt: item.createdAt,
  ...item.value,
})

const toRecord = (task: Task): TaskRecord => {
  const { id: _id, createdAt: _createdAt, ...record } = task
  return record
}

/**
 * 任务仓库：只负责任务记录的可靠持久化。
 * 复用通用集合存储引擎（原子写入 + 串行队列 + 损坏报错），
 * 但不注册到 storageRegistry，前端无法通过 /api/storage 任意修改任务
 */
export class TaskRepository {
  private readonly file = dataPath('tasks.json')
  private epoch = 0
  private cached?: { stamp: string; tasks: Task[] }
  private reading?: { epoch: number; promise: Promise<Task[]> }
  private readonly store = new CollectionStore<TaskRecord>(this.file, {
    migrateLegacy: migrateLegacyTasks,
    onChange: () => {
      this.epoch += 1
      this.cached = undefined
    },
  })

  async list(): Promise<Task[]> {
    const epoch = this.epoch
    const operation = async () => {
      const info = await stat(this.file).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined
          throw new StorageError('READ_FAILED', '读取任务文件状态失败', {
            cause: error.message,
          })
        },
      )
      const stamp = info
        ? `${info.mtimeMs}:${info.ctimeMs}:${info.size}`
        : 'missing'
      if (this.cached?.stamp === stamp) return this.cached.tasks
      const snapshot = await this.store.getSnapshot()
      const tasks = snapshot.items
        .map(flatten)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      if (epoch === this.epoch) this.cached = { stamp, tasks }
      return tasks
    }
    const reading =
      this.reading?.epoch === epoch
        ? this.reading
        : { epoch, promise: operation() }
    this.reading = reading
    try {
      const tasks = await reading.promise
      // 读列表期间有写入时补读，引用检查不能复用写入前的在途快照。
      if (epoch !== this.epoch) return this.list()
      return structuredClone(tasks)
    } finally {
      if (this.reading === reading) this.reading = undefined
    }
  }

  async create(record: TaskRecord, id?: string): Promise<Task> {
    return flatten(await this.store.create(record, id))
  }

  /** 在同一把资源锁内完成读改写，fn 基于当前记录计算新记录 */
  async update(
    id: string,
    fn: (record: TaskRecord) => TaskRecord,
  ): Promise<Task> {
    return flatten(await this.store.update(id, fn))
  }

  async remove(id: string): Promise<Task> {
    return flatten(await this.store.removeAndGet(id))
  }

  /** 批量整体替换（启动恢复等场景一次落盘） */
  async replaceAll(tasks: Task[]): Promise<void> {
    if (tasks.length === 0) return
    await this.store.batch(
      tasks.map((t) => ({
        type: 'replace' as const,
        id: t.id,
        value: toRecord(t),
      })),
    )
  }
}
