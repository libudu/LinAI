import type { OrganizeTaskView } from '@/shared/eagle/organize'
import { Button, Progress, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import {
  fetchOrganizeResult,
  fetchOrganizeResults,
  fetchOrganizeTask,
  pauseOrganizeTask,
  resumeOrganizeTask,
} from './api'
import { useOrganizeStatus } from './store'

const PAUSED_REASON_TEXT: Record<string, string> = {
  user: '已手动暂停',
  error: '执行出错，队列已暂停',
  restart: '服务重启，任务已暂停',
}

// 步骤 2 执行中任务：总处理状态 + 进度（已执行/总数、成功/失败）+ 暂停/继续 + 最近失败原因；
// 队列在服务端后台推进（SSE 通知刷新），全部执行完后由弹窗壳自动切到步骤 3
export function StepRunning() {
  const { status } = useOrganizeStatus()
  const [task, setTask] = useState<OrganizeTaskView | null>(null)
  const [latestFailure, setLatestFailure] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refreshTask = useCallback(() => {
    fetchOrganizeTask()
      .then(setTask)
      .catch((error) => console.error('拉取图片整理任务详情失败', error))
  }, [])

  useEffect(() => {
    refreshTask()
  }, [refreshTask])

  // status 由 SSE 变更触发更新，变化后同步刷新任务详情
  useEffect(() => {
    refreshTask()
  }, [status, refreshTask])

  // 失败计数变化时拉取最近一条失败结果的原因（limit=1 只取最新，列表按 updatedAt 倒序）
  const failedCount = task?.failedCount ?? 0
  useEffect(() => {
    let cancelled = false
    if (failedCount <= 0) {
      setLatestFailure(null)
      return
    }
    fetchOrganizeResults('failed', { limit: 1 })
      .then((results) => {
        const latest = results[0]
        if (!latest) return null
        return fetchOrganizeResult(latest.itemId)
      })
      .then((detail) => {
        if (!cancelled) setLatestFailure(detail?.error ?? null)
      })
      .catch((error) => console.error('拉取图片整理失败原因失败', error))
    return () => {
      cancelled = true
    }
  }, [failedCount])

  const phase = status?.phase
  const total = task?.total ?? 0
  const executed = task?.executed ?? 0
  const remaining = status?.remaining ?? total - executed
  const pendingConfirm = status?.pendingConfirm ?? task?.pendingConfirm ?? 0
  const successCount = task?.successCount ?? 0
  const percent = total > 0 ? Math.round((executed / total) * 100) : 0

  const handleToggle = async () => {
    setActionLoading(true)
    try {
      if (phase === 'running') {
        await pauseOrganizeTask()
      } else {
        await resumeOrganizeTask()
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-base font-medium">
            {phase === 'running' ? '执行中' : '已暂停'}
          </span>
          {phase === 'paused' && status?.pausedReason && (
            <span className="ml-2 text-sm text-amber-500">
              {PAUSED_REASON_TEXT[status.pausedReason] ??
                PAUSED_REASON_TEXT.user}
            </span>
          )}
        </div>
        <Button loading={actionLoading} onClick={handleToggle}>
          {phase === 'running' ? '暂停' : '继续'}
        </Button>
      </div>

      <Progress
        percent={percent}
        status={phase === 'paused' ? 'normal' : 'active'}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
        <span>
          已执行 {executed} / {total}（剩余 {remaining}）
        </span>
        <span>
          成功 <span className="text-emerald-500">{successCount}</span>
        </span>
        <span>
          失败 <span className="text-red-500">{failedCount}</span>
        </span>
        <span>待确认 {pendingConfirm} 张</span>
      </div>

      {latestFailure && (
        <div
          className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-500 dark:bg-red-500/10"
          title={latestFailure}
        >
          <span className="font-medium">最近失败：</span>
          <span className="line-clamp-2">{latestFailure}</span>
        </div>
      )}

      {phase === 'running' ? (
        <div className="text-xs text-slate-400">
          任务在后台执行，可以关闭此窗口；全部执行完成后将进入结果确认。
        </div>
      ) : (
        <div className="text-xs text-slate-400">
          点击「继续」恢复执行；正在发送中的请求不会被中断。
        </div>
      )}
    </div>
  )
}
