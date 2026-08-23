import type {
  OrganizeFailedItem,
  OrganizeQueueItem,
  OrganizeQueueResp,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Badge, Button, Empty, Modal, Tabs, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { eagleThumbnailUrl } from '../api'
import {
  clearOrganizeTask,
  fetchFailedOrganizeItems,
  fetchOrganizeQueue,
  fetchOrganizeTask,
  pauseOrganizeTask,
  resumeOrganizeTask,
  retryFailedOrganizeItems,
  retryOrganizeResult,
  skipFailedOrganizeItems,
  skipOrganizeResult,
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
// 错误任务集中管理与重试 + 队列预览 + 随时跳转到步骤 3 查验
export function StepRunning({
  onSwitchToConfirm,
}: {
  onSwitchToConfirm?: () => void
}) {
  const { status } = useOrganizeStatus()
  const [task, setTask] = useState<OrganizeTaskView | null>(null)
  const [queue, setQueue] = useState<OrganizeQueueResp | null>(null)
  const [failedItems, setFailedItems] = useState<OrganizeFailedItem[]>([])
  const [activeTab, setActiveTab] = useState<'failed' | 'queue'>('failed')
  const [actionLoading, setActionLoading] = useState(false)
  const [itemActionLoading, setItemActionLoading] = useState<string | null>(null)
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

    fetchFailedOrganizeItems()
      .then((items) => {
        if (sequence === refreshSequenceRef.current) {
          setFailedItems(items)
          // 若有失败项且之前未手动选过，保持在失败项 tab
          if (items.length > 0) {
            setActiveTab('failed')
          }
        }
      })
      .catch((error) => console.error('拉取失败项列表失败', error))
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
      await refreshOrganizeStatus()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBatchAction = async (action: () => Promise<void>, successMsg: string) => {
    setActionLoading(true)
    try {
      await action()
      message.success(successMsg)
      await refreshOrganizeStatus()
      refreshTask()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSingleRetry = async (itemId: string) => {
    setItemActionLoading(itemId)
    try {
      await retryOrganizeResult(itemId)
      message.success('已重新加入执行队列')
      await refreshOrganizeStatus()
      refreshTask()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重试失败')
    } finally {
      setItemActionLoading(null)
    }
  }

  const handleSingleSkip = async (itemId: string) => {
    setItemActionLoading(itemId)
    try {
      await skipOrganizeResult(itemId)
      message.success('已跳过该项')
      await refreshOrganizeStatus()
      refreshTask()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '跳过失败')
    } finally {
      setItemActionLoading(null)
    }
  }

  // 强制清空：中断所有请求（含正在发送的）、丢弃当前结果，SSE 刷新后回到第一步
  const handleClear = () => {
    Modal.confirm({
      title: '清空整理任务？',
      content: '将强制停止所有请求并丢弃当前结果，解锁文件夹并回到第一步。',
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
    <div className="flex flex-col gap-3">
      {/* 状态总览卡片 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/70 px-2.5 py-1.5 dark:border-violet-900/60 dark:bg-violet-950/30">
          <div className="flex w-5 shrink-0 items-center justify-center text-lg text-violet-600 dark:text-violet-400">
            <DashboardOutlined />
          </div>
          <div className="min-w-0">
            <div
              className={`truncate text-sm font-semibold ${
                phase === 'running'
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
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
              <div className="truncate text-[10px] text-amber-500">
                {PAUSED_REASON_TEXT[status.pausedReason] ??
                  PAUSED_REASON_TEXT.user}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-2.5 py-1.5 dark:border-sky-900/60 dark:bg-sky-950/30">
          <div className="flex w-5 shrink-0 items-center justify-center text-lg text-sky-600 dark:text-sky-400">
            <ThunderboltOutlined />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              进度
            </div>
            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {executed}
              <span className="ml-0.5 text-[10px] font-normal text-slate-400">
                / {total}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <div className="flex w-5 shrink-0 items-center justify-center text-lg text-emerald-600 dark:text-emerald-400">
            <CheckCircleOutlined />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              成功
            </div>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {successCount}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/70 px-2.5 py-1.5 dark:border-red-900/60 dark:bg-red-950/30">
          <div className="flex w-5 shrink-0 items-center justify-center text-lg text-red-600 dark:text-red-400">
            <CloseCircleOutlined />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              失败
            </div>
            <div className="text-sm font-semibold text-red-600 dark:text-red-400">
              {failedCount}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-1.5 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex w-5 shrink-0 items-center justify-center text-lg text-amber-600 dark:text-amber-400">
            <ClockCircleOutlined />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              待确认
            </div>
            <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              {pendingConfirm}
              <span className="ml-0.5 text-[10px] font-normal">张</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: 失败待处理 & 队列预览 */}
      <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'failed' | 'queue')}
          size="small"
          tabBarExtraContent={
            activeTab === 'failed' && failedItems.length > 0 ? (
              <div className="flex gap-2 pb-1">
                <Button
                  size="small"
                  onClick={() =>
                    handleBatchAction(skipFailedOrganizeItems, '已跳过全部失败项')
                  }
                >
                  全部跳过
                </Button>
                <Button
                  type="primary"
                  size="small"
                  loading={actionLoading}
                  onClick={() =>
                    handleBatchAction(retryFailedOrganizeItems, '已将失败项加入队首重试')
                  }
                >
                  重试所有错误
                </Button>
              </div>
            ) : null
          }
          items={[
            {
              key: 'failed',
              label: (
                <div className="flex items-center gap-1.5">
                  <span>失败待处理</span>
                  {failedItems.length > 0 && (
                    <Badge
                      count={failedItems.length}
                      style={{ backgroundColor: '#ef4444' }}
                    />
                  )}
                </div>
              ),
              children: (
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                  {failedItems.length === 0 ? (
                    <Empty
                      className="py-6"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="太棒了，当前没有失败的任务"
                    />
                  ) : (
                    failedItems.map((item) => (
                      <div
                        key={item.itemId}
                        className="flex items-center gap-3 py-2 px-1"
                      >
                        <img
                          src={eagleThumbnailUrl(item.itemId)}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                            {item.itemName ?? item.itemId}
                          </div>
                          <div
                            className="truncate text-[11px] text-red-500"
                            title={item.error}
                          >
                            {item.error}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            size="small"
                            disabled={itemActionLoading === item.itemId}
                            onClick={() => handleSingleSkip(item.itemId)}
                          >
                            跳过
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            loading={itemActionLoading === item.itemId}
                            onClick={() => handleSingleRetry(item.itemId)}
                          >
                            重试
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ),
            },
            {
              key: 'queue',
              label: `排队与执行中 (${queueItems.length})`,
              children: (
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                  {queueItems.length === 0 ? (
                    <Empty
                      className="py-6"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="没有排队中或执行中的条目"
                    />
                  ) : (
                    queueItems.map((item) => (
                      <div
                        key={item.itemId}
                        className="flex items-center gap-3 py-2 px-1"
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
                          className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400"
                          title={item.itemName ?? undefined}
                        >
                          {item.itemName ?? item.itemId}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* 底部操作与引导 */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {pendingConfirm > 0 ? (
            <div className="flex items-center gap-2">
              <span>
                已有 <strong className="text-amber-600 dark:text-amber-400">{pendingConfirm}</strong> 张判定成功，
              </span>
              <Button
                type="link"
                size="small"
                className="p-0 text-blue-600 dark:text-blue-400"
                onClick={onSwitchToConfirm}
              >
                先行查验结果 <RightOutlined className="text-[10px]" />
              </Button>
            </div>
          ) : (
            <span>任务在后台执行，可随时切换到其他步骤或关闭窗口。</span>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button danger onClick={handleClear}>
            清空任务
          </Button>
          <Button loading={actionLoading} onClick={handleToggle}>
            {phase === 'running' ? '暂停' : '继续'}
          </Button>
        </div>
      </div>
    </div>
  )
}
