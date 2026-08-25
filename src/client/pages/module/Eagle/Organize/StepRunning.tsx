import type {
  OrganizeFailedItem,
  OrganizeQueueItem,
  OrganizeQueueResp,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { CheckOutlined, PlusOutlined } from '@ant-design/icons'
import { Badge, Button, Empty, Modal, Tabs, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { eagleThumbnailUrl } from '../api'
import {
  clearOrganizeTask,
  fetchFailedOrganizeItems,
  fetchOrganizeQueue,
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
  onSwitchToClassify,
  task,
}: {
  onSwitchToConfirm?: () => void
  onSwitchToClassify?: () => void
  task?: OrganizeTaskView | null
}) {
  const { status } = useOrganizeStatus()
  const [queue, setQueue] = useState<OrganizeQueueResp | null>(null)
  const [failedItems, setFailedItems] = useState<OrganizeFailedItem[]>([])
  const [activeTab, setActiveTab] = useState<'queue' | 'failed'>('queue')
  const [actionLoading, setActionLoading] = useState(false)
  const [itemActionLoading, setItemActionLoading] = useState<string | null>(
    null,
  )
  const refreshSequenceRef = useRef(0)
  const hasAutoJumpedRef = useRef(false)

  const refreshTask = useCallback(() => {
    const sequence = ++refreshSequenceRef.current

    fetchOrganizeQueue(QUEUE_PREVIEW_LIMIT)
      .then((nextQueue) => {
        if (sequence === refreshSequenceRef.current) setQueue(nextQueue)
      })
      .catch((error) => console.error('拉取图片整理队列预览失败', error))

    fetchFailedOrganizeItems()
      .then((items) => {
        if (sequence === refreshSequenceRef.current) {
          setFailedItems(items)
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
  const pendingConfirm = status?.pendingConfirm ?? 0

  const isCompleted =
    phase === 'confirming' ||
    phase === 'done' ||
    (status != null &&
      status.remaining === 0 &&
      phase !== 'running' &&
      phase !== 'paused')

  // 当任务重新开始运行时重置自动跳转标记
  useEffect(() => {
    if (phase === 'running') {
      hasAutoJumpedRef.current = false
    }
  }, [phase])

  // 全部完成后如果停留在排队与执行中标题且失败待处理数量不为0则自动跳转失败待处理标签
  useEffect(() => {
    if (isCompleted && !hasAutoJumpedRef.current) {
      if (failedItems.length > 0) {
        if (activeTab === 'queue') {
          setActiveTab('failed')
        }
        hasAutoJumpedRef.current = true
      } else if (status && status.failedCount === 0) {
        hasAutoJumpedRef.current = true
      }
    }
  }, [isCompleted, activeTab, failedItems.length, status])

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

  const handleBatchAction = async (
    action: () => Promise<void>,
    successMsg: string,
  ) => {
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

  const isLocked = status?.isLocked ?? false
  const isAllCompletedAndClean = isCompleted && failedItems.length === 0

  const getAddSubtitle = () => {
    if (!isLocked || phase === 'done') {
      return '新建分类任务'
    }
    if (task?.availableCount !== undefined) {
      if (task.availableCount > 0) {
        return `剩余 ${task.availableCount} 张可选`
      }
      return '全部图片已入队'
    }
    return '追加图片到队列'
  }

  const getConfirmSubtitle = () => {
    return pendingConfirm > 0 ? `${pendingConfirm} 张待查验` : '暂无待确认'
  }

  const queueItems = queue?.items ?? []

  return (
    <div className="flex h-full flex-col gap-3">
      {isAllCompletedAndClean ? (
        /* 全部完成且无错误：居中展示继续添加 / 开始确认卡片 */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-slate-200 p-6 dark:border-slate-700">
          <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            {/* 卡片 1：继续添加 (蓝/Sky) */}
            <button
              type="button"
              onClick={onSwitchToClassify}
              className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-sky-200/80 bg-sky-50/40 p-6 text-center shadow-xs transition-all hover:scale-[1.02] hover:border-sky-400 hover:bg-sky-50/80 hover:shadow-md active:scale-[0.99] dark:border-sky-900/50 dark:bg-sky-950/20 dark:hover:border-sky-700 dark:hover:bg-sky-950/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 transition-transform group-hover:scale-110 dark:bg-sky-900/60 dark:text-sky-400">
                <PlusOutlined className="text-xl" />
              </div>
              <div className="text-base font-semibold text-slate-800 group-hover:text-sky-600 dark:text-slate-200 dark:group-hover:text-sky-400">
                继续添加
              </div>
              <div className="text-xs text-sky-600/80 dark:text-sky-400/80">
                {getAddSubtitle()}
              </div>
            </button>

            {/* 卡片 2：开始确认 (绿/Emerald) */}
            <button
              type="button"
              disabled={!onSwitchToConfirm || pendingConfirm === 0}
              onClick={onSwitchToConfirm}
              className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center shadow-xs transition-all ${
                pendingConfirm === 0
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-slate-800 dark:bg-slate-900/30'
                  : 'cursor-pointer border-emerald-200/80 bg-emerald-50/40 hover:scale-[1.02] hover:border-emerald-400 hover:bg-emerald-50/80 hover:shadow-md active:scale-[0.99] dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40'
              }`}
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform ${
                  pendingConfirm === 0
                    ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    : 'bg-emerald-100 text-emerald-600 group-hover:scale-110 dark:bg-emerald-900/60 dark:text-emerald-400'
                }`}
              >
                <CheckOutlined className="text-xl" />
              </div>
              <div
                className={`text-base font-semibold ${
                  pendingConfirm === 0
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-slate-800 group-hover:text-emerald-600 dark:text-slate-200 dark:group-hover:text-emerald-400'
                }`}
              >
                开始确认
              </div>
              <div
                className={`text-xs ${
                  pendingConfirm === 0
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-emerald-600/80 dark:text-emerald-400/80'
                }`}
              >
                {getConfirmSubtitle()}
              </div>
            </button>
          </div>
        </div>
      ) : (
        /* Tabs: 失败待处理 & 队列预览 */
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'failed' | 'queue')}
            size="small"
            className="flex h-full min-h-0 flex-1 flex-col [&_.ant-tabs-content]:h-full [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content-holder]:flex-1 [&_.ant-tabs-tabpane]:h-full"
            tabBarExtraContent={
              activeTab === 'failed' && failedItems.length > 0 ? (
                <div className="flex gap-2 pb-1">
                  <Button
                    size="small"
                    onClick={() =>
                      handleBatchAction(
                        skipFailedOrganizeItems,
                        '已跳过全部失败项',
                      )
                    }
                  >
                    全部跳过
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    loading={actionLoading}
                    onClick={() =>
                      handleBatchAction(
                        retryFailedOrganizeItems,
                        '已重新加入执行队列',
                      )
                    }
                  >
                    重试所有错误
                  </Button>
                </div>
              ) : null
            }
            items={[
              {
                key: 'queue',
                label: '排队与执行中',
                children: (
                  <div className="h-full divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/60">
                    {queueItems.length === 0 ? (
                      <div className="flex h-full items-center justify-center py-6">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="没有排队中或执行中的条目"
                        />
                      </div>
                    ) : (
                      queueItems.map((item) => (
                        <div
                          key={item.itemId}
                          className="flex items-center gap-3 px-1 py-2"
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
                  <div className="h-full divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/60">
                    {failedItems.length === 0 ? (
                      <div className="flex h-full items-center justify-center py-6">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="太棒了，当前没有失败的任务"
                        />
                      </div>
                    ) : (
                      failedItems.map((item) => (
                        <div
                          key={item.itemId}
                          className="flex items-center gap-3 px-1 py-2"
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
            ]}
          />
        </div>
      )}

      {/* 底部操作与引导（全部完成且无错误时不展示） */}
      {!isAllCompletedAndClean && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
          <div className="flex shrink-0 items-center gap-2">
            <Button danger onClick={handleClear}>
              清空任务
            </Button>
            <Button loading={actionLoading} onClick={handleToggle}>
              {phase === 'running' ? '暂停' : '继续'}
            </Button>
            {/* 仅当暂停时顶部红色小字显示暂停理由 */}
            {phase === 'paused' && status?.pausedReason && (
              <div className="flex items-center text-xs text-red-500">
                {PAUSED_REASON_TEXT[status.pausedReason] ??
                  PAUSED_REASON_TEXT.user}
              </div>
            )}
          </div>
          {onSwitchToConfirm && pendingConfirm > 0 && (
            <Button type="primary" onClick={onSwitchToConfirm}>
              去确认结果 ({pendingConfirm})
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
