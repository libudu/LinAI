import type { GptImageQuality, GptImageSize } from '@/shared/image/params'
import type { TaskInputSnapshot } from '@/shared/image/template'

/**
 * 生成任务：后端拥有并流转状态的数据，前端只能读取与删除，
 * 不开放通用存储写接口（见 docs/文件系统简化改造方案.md §7.2）
 */
export interface Task {
  id: string
  /** 任务创建时的输入快照（不可变），不是对模板存储的引用 */
  inputSnapshot: TaskInputSnapshot
  source: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
  duration?: number
  outputUrl?: string
  outputUrls?: string[]
  createdAt: number
  size?: GptImageSize
  quality?: GptImageQuality
  [key: string]: any
}

/** 存储层按信封保存：id/createdAt 在信封上，value 为其余字段 */
export type TaskRecord = Omit<Task, 'id' | 'createdAt'>

/** 任务变更在 change bus 上的资源 ID（后端专用，不注册到通用存储） */
export const TASKS_RESOURCE = 'image.tasks'
