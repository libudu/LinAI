import type {
  OrganizeQueueItem,
  OrganizeQueueResp,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Button, Modal, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
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
// 右下角红色「清空」按钮（强制停止所有请求、丢弃结果并回到第一步）；
// 队列在服务端后台推进（SSE 通知刷新），全部执行完后由弹窗壳自动切到步骤 3
export function StepRunning() {
  const { status } = useOrganizeStatus()
  const [task, setTask] = useState<OrganizeTaskView | null>(null)
  const [queue, setQueue] = useState<OrganizeQueueResp | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const refreshSequenceRef = useRef(0)

  const refreshTask = useCallback(() => {
    const sequence = ++refreshSequenceRef.current
    fetchOrganizeTask()
      .then((nextTask) => {
        if (sequence === refreshSequenceRef.current) setTask(nextTask)
      })
      .catch((error) => console.error('拉取图片整理任务详情失败', error))
    fetchOrganizeQueue(QUEUE_PREVIEW_LIMIT)
      .then((nextQueue) => {
        if (sequence === refreshSequenceRef.current) setQueue(nextQueue)
      })
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
  // 一组进度数字必须来自同一次 task 快照；status 是独立请求，只负责阶段路由。
  const pendingConfirm = task?.pendingConfirm ?? 0
  const successCount = task?.successCount ?? 0
  const failedCount = task?.failedCount ?? 0

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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="flex items-center gap-2.5 rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2 dark:border-violet-900/60 dark:bg-violet-950/30">
          <div className="flex w-6 shrink-0 items-center justify-center text-xl text-violet-600 dark:text-violet-400">
            <DashboardOutlined />
          </div>
          <div className="min-w-0">
            <div
              className={`truncate text-base font-semibold ${phase === 'running' ? 'text-violet-600 dark:text-violet-400' : 'text-amber-600 dark:text-amber-400'}`}
              title={
                phase === 'paused' && status?.pausedReason
                  ? (PAUSED_REASON_TEXT[status.pausedReason] ??
                    PAUSED_REASON_TEXT.user)
                  : undefined
              }
            >
              {phase === 'running' ? '执行中' : '已暂停'}
            </div>
            {phase === 'paused' && status?.pausedReason && (
              <div className="truncate text-xs text-amber-500">
                {PAUSED_REASON_TEXT[status.pausedReason] ??
                  PAUSED_REASON_TEXT.user}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/60 dark:bg-sky-950/30">
          <div className="flex w-6 shrink-0 items-center justify-center text-xl text-sky-600 dark:text-sky-400">
            <ThunderboltOutlined />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              已执行
            </div>
            <div className="truncate text-base font-semibold text-slate-800 dark:text-slate-100">
              {executed}
              <span className="ml-1 text-xs font-normal text-slate-400">
                / {total}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <div className="flex w-6 shrink-0 items-center justify-center text-xl text-emerald-600 dark:text-emerald-400">
            <CheckCircleOutlined />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              成功
            </div>
            <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
              {successCount}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/30">
          <div className="flex w-6 shrink-0 items-center justify-center text-xl text-red-600 dark:text-red-400">
            <CloseCircleOutlined />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              失败
            </div>
            <div className="text-base font-semibold text-red-600 dark:text-red-400">
              {failedCount}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex w-6 shrink-0 items-center justify-center text-xl text-amber-600 dark:text-amber-400">
            <ClockCircleOutlined />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              待确认
            </div>
            <div className="text-base font-semibold text-amber-600 dark:text-amber-400">
              {pendingConfirm}
              <span className="ml-1 text-xs font-normal">张</span>
            </div>
          </div>
        </div>
      </div>

      {/* 队列预览：左缩略图 / 中状态 / 右信息（失败原因），仅展示前 20 条 */}
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

      <div className="flex items-center justify-between gap-4">
        {phase === 'running' ? (
          <div className="text-xs text-slate-400">
            任务在后台执行，可以关闭此窗口；全部执行完成后将进入结果确认。
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            点击「继续」恢复执行；正在发送中的请求不会被中断。
          </div>
        )}

        <div className="flex shrink-0 gap-2">
          <Button danger onClick={handleClear}>
            清空
          </Button>
          <Button loading={actionLoading} onClick={handleToggle}>
            {phase === 'running' ? '暂停' : '继续'}
          </Button>
        </div>
      </div>
    </div>
  )
}
