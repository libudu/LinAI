import type {
  OrganizeQueueItem,
  OrganizeQueueResp,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { Button, Modal, Progress, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { eagleThumbnailUrl } from '../api'
import {
  clearOrganizeTask,
  fetchOrganizeQueue,
  fetchOrganizeTask,
  pauseOrganizeTask,
  resumeOrganizeTask,
} from './api'
import { refreshOrganizeStatus, useOrganizeStatus } from './store'

const PAUSED_REASON_TEXT: Record<string, string> = {
  user: '已手动暂停',
  error: '执行出错，队列已暂停',
  restart: '服务重启，任务已暂停',
}

/** 队列预览展示条数 */
const QUEUE_PREVIEW_LIMIT = 20

const QUEUE_STATE_TEXT: Record<OrganizeQueueItem['state'], string> = {
  processing: '执行中',
  pending: '等待中',
  failed: '失败',
}

const QUEUE_STATE_CLASS: Record<OrganizeQueueItem['state'], string> = {
  processing: 'text-sky-500',
  pending: 'text-slate-400',
  failed: 'text-red-500',
}

// 步骤 2 执行中任务：总处理状态 + 进度（已执行/总数、成功/失败）+ 暂停/继续 +
// 队列预览（缩略图 / 状态 / 失败原因，完成无误的项过滤掉、进入下一步处理）+
// 右上角红色「清空」按钮（强制停止所有请求、丢弃结果并回到第一步）；
// 队列在服务端后台推进（SSE 通知刷新），全部执行完后由弹窗壳自动切到步骤 3
export function StepRunning() {
  const { status } = useOrganizeStatus()
  const [task, setTask] = useState<OrganizeTaskView | null>(null)
  const [queue, setQueue] = useState<OrganizeQueueResp | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refreshTask = useCallback(() => {
    fetchOrganizeTask()
      .then(setTask)
      .catch((error) => console.error('拉取图片整理任务详情失败', error))
    fetchOrganizeQueue(QUEUE_PREVIEW_LIMIT)
      .then(setQueue)
      .catch((error) => console.error('拉取图片整理队列预览失败', error))
  }, [])

  useEffect(() => {
    refreshTask()
  }, [refreshTask])

  // status 由 SSE 变更触发更新，变化后同步刷新任务详情与队列预览
  useEffect(() => {
    refreshTask()
  }, [status, refreshTask])

  const phase = status?.phase
  const total = task?.total ?? 0
  const executed = task?.executed ?? 0
  const remaining = status?.remaining ?? total - executed
  const pendingConfirm = status?.pendingConfirm ?? task?.pendingConfirm ?? 0
  const successCount = task?.successCount ?? 0
  const failedCount = task?.failedCount ?? 0
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

  // 强制清空：中断所有请求（含正在发送的）、丢弃当前结果，SSE 刷新后弹窗回到第一步
  const handleClear = () => {
    Modal.confirm({
      title: '清空整理任务？',
      content: '将强制停止所有请求并丢弃当前结果，之后回到第一步重新开始。',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await clearOrganizeTask()
          await refreshOrganizeStatus()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '清空任务失败')
          throw error
        }
      },
    })
  }

  const queueItems = queue?.items ?? []
  const queueTotal = queue?.total ?? 0

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
        <div className="flex gap-2">
          <Button loading={actionLoading} onClick={handleToggle}>
            {phase === 'running' ? '暂停' : '继续'}
          </Button>
          <Button danger onClick={handleClear}>
            清空
          </Button>
        </div>
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

      {/* 队列预览：左缩略图 / 中状态 / 右信息（失败原因），仅展示前 20 条 */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>处理队列（未完成 {queueTotal} 条）</span>
        {queueTotal > queueItems.length && (
          <span>仅展示前 {QUEUE_PREVIEW_LIMIT} 条</span>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
        {queueItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            没有执行中或待处理的条目
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {queueItems.map((item) => (
              <div
                key={item.itemId}
                className="flex items-center gap-3 px-3 py-2"
              >
                <img
                  src={eagleThumbnailUrl(item.itemId)}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
                <span
                  className={`w-14 shrink-0 text-xs font-medium ${QUEUE_STATE_CLASS[item.state]}`}
                >
                  {QUEUE_STATE_TEXT[item.state]}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-xs ${
                    item.state === 'failed'
                      ? 'text-red-500'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                  title={
                    item.state === 'failed'
                      ? item.error
                      : (item.itemName ?? undefined)
                  }
                >
                  {item.state === 'failed' ? item.error : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
