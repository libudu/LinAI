import type { EagleMediaType } from '@/shared/eagle/types'
import { z } from 'zod'

export const downloadProgressSchema = z
  .object({
    id: z.string().uuid(),
    completed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    total: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    percent: z.number().min(0).max(100),
    state: z.enum(['queued', 'running', 'completed', 'error']),
    error: z.string().max(1000),
  })
  .refine((task) => task.completed <= task.total)

export type DownloadProgress = z.infer<typeof downloadProgressSchema>

type Task = Omit<DownloadProgress, 'percent'> & {
  connectionId: string
  folderId: string
  mediaType: EagleMediaType
  folder: string
  /** 各在途文件的传输比例；入库成功后转入 completed，不向共享协议暴露。 */
  currentProgress: Map<string, number>
}

// 独立于会话服务，供下载执行器和后台心跳共用，避免循环依赖。
export const downloadTasks: Task[] = []

export const downloadSnapshot = () =>
  downloadTasks.map(({ currentProgress, ...task }) => ({
    ...task,
    remaining: task.total - task.completed,
    percent:
      task.state === 'completed'
        ? 100
        : Math.min(
            99,
            Math.floor(
              ((task.completed +
                [...currentProgress.values()].reduce(
                  (sum, value) => sum + value,
                  0,
                )) /
                task.total) *
                100,
            ),
          ),
  }))
