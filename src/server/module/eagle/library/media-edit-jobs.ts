import type { EagleMediaEditSaveProgress } from '@/shared/eagle/media-edit'
import { randomUUID } from 'node:crypto'
import { EagleError } from '../errors'
import type { EagleMediaEditSaveRequest } from '../schemas'
import { saveItemMediaEdits } from './media-edit'

type MediaEditSaveJobState = EagleMediaEditSaveProgress &
  (
    | { status: 'running' | 'cancelling' }
    | {
        status: 'completed'
        result: NonNullable<Awaited<ReturnType<typeof saveItemMediaEdits>>>
      }
    | { status: 'cancelled' }
    | { status: 'failed'; error: string }
  )

const jobs = new Map<
  string,
  { itemId: string; controller: AbortController; state: MediaEditSaveJobState }
>()

const findJob = (itemId: string, jobId: string) => {
  const job = jobs.get(jobId)
  if (!job || job.itemId !== itemId)
    throw new EagleError(
      'MEDIA_EDIT_JOB_NOT_FOUND',
      404,
      '媒体编辑保存任务不存在或已过期',
    )
  return job
}

/** 内存任务只保留完成后的十分钟，启动接口立即返回，查询失败不会丢失保存结果。 */
export const startMediaEditSaveJob = (
  itemId: string,
  request: EagleMediaEditSaveRequest,
) => {
  if (jobs.size >= 100)
    throw new EagleError(
      'MEDIA_EDIT_BUSY',
      409,
      '媒体编辑保存任务过多，请稍后重试',
    )
  const id = randomUUID()
  const job = {
    itemId,
    controller: new AbortController(),
    state: {
      status: 'running',
      percent: 0,
      phase: 'queued',
      canCancel: true,
    } as MediaEditSaveJobState,
  }
  jobs.set(id, job)
  void (async () => {
    try {
      const result = await saveItemMediaEdits(itemId, request, {
        signal: job.controller.signal,
        onProgress: (progress) => {
          if (job.controller.signal.aborted) return
          job.state = {
            ...job.state,
            ...progress,
            percent: Math.max(job.state.percent, Math.floor(progress.percent)),
          }
        },
      })
      if (!result) throw new Error('Eagle 资源库当前不可用')
      job.state = {
        ...job.state,
        status: 'completed',
        percent: 100,
        canCancel: false,
        result,
      }
    } catch (error) {
      // 回滚或清理错误仍作为失败报告，不能把损坏状态显示为已取消。
      job.state =
        error === job.controller.signal.reason
          ? { ...job.state, status: 'cancelled', canCancel: false }
          : {
              ...job.state,
              status: 'failed',
              canCancel: false,
              error:
                error instanceof Error ? error.message : '媒体编辑保存失败',
            }
    } finally {
      setTimeout(() => jobs.delete(id), 10 * 60_000).unref()
    }
  })()
  return { id }
}

export const getMediaEditSaveJob = (itemId: string, jobId: string) =>
  findJob(itemId, jobId).state

export const cancelMediaEditSaveJob = (itemId: string, jobId: string) => {
  const job = findJob(itemId, jobId)
  if (job.state.status === 'running' && job.state.canCancel) {
    job.state = { ...job.state, status: 'cancelling', canCancel: false }
    job.controller.abort(new Error('媒体编辑保存已取消，原文件未覆盖'))
  }
  return job.state
}
