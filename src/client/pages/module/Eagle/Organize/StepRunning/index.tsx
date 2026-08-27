import type {
  OrganizeFailedItem,
  OrganizeQueueResp,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { Badge, Button, Modal, Tabs, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
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
} from '../api'
import { refreshOrganizeStatus, useOrganizeStatus } from '../store'
import { BottomBar } from './BottomBar'
import { CompletedCards } from './CompletedCards'
import { FailedList } from './FailedList'
import { QueueList } from './QueueList'

const QUEUE_PREVIEW_LIMIT = 20

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
  const isFetchingRef = useRef(false)
  const pendingFetchRef = useRef(false)
  const refreshSequenceRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAutoJumpedRef = useRef(false)

  const doRefreshTask = useCallback(async () => {
    if (isFetchingRef.current) {
      pendingFetchRef.current = true
      return
    }
    isFetchingRef.current = true
    const sequence = ++refreshSequenceRef.current

    try {
      const [nextQueue, nextFailedItems] = await Promise.all([
        fetchOrganizeQueue(QUEUE_PREVIEW_LIMIT).catch((error) => {
          console.error('拉取图片整理队列预览失败', error)
          return null
        }),
        fetchFailedOrganizeItems().catch((error) => {
          console.error('拉取失败项列表失败', error)
          return null
        }),
      ])

      if (sequence === refreshSequenceRef.current) {
        if (nextQueue) setQueue(nextQueue)
        if (nextFailedItems) setFailedItems(nextFailedItems)
      }
    } finally {
      isFetchingRef.current = false
      if (pendingFetchRef.current) {
        pendingFetchRef.current = false
        queueMicrotask(() => {
          void doRefreshTask()
        })
      }
    }
  }, [])

  const triggerDebouncedRefreshTask = useCallback(
    (delay = 200) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        void doRefreshTask()
      }, delay)
    },
    [doRefreshTask],
  )

  const refreshTaskImmediate = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    await doRefreshTask()
  }, [doRefreshTask])

  useEffect(() => {
    void doRefreshTask()
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [doRefreshTask])

  // status 由 SSE 变更触发更新，变化后防抖刷新任务详情与队列预览
  useEffect(() => {
    triggerDebouncedRefreshTask(200)
  }, [status, triggerDebouncedRefreshTask])

  const phase = status?.phase
  const pendingConfirm = status?.pendingConfirm ?? 0
  const isLocked = status?.isLocked ?? false

  const isCompleted =
    phase === 'confirming' ||
    phase === 'done' ||
    (status != null &&
      status.remaining === 0 &&
      phase !== 'running' &&
      phase !== 'paused')

  const isAllCompletedAndClean = isCompleted && failedItems.length === 0

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
      await refreshTaskImmediate()
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
      await refreshTaskImmediate()
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
      await refreshTaskImmediate()
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
        <CompletedCards
          onSwitchToClassify={onSwitchToClassify}
          onSwitchToConfirm={onSwitchToConfirm}
          addSubtitle={getAddSubtitle()}
          confirmSubtitle={getConfirmSubtitle()}
          pendingConfirm={pendingConfirm}
        />
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
                children: <QueueList items={queueItems} />,
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
                  <FailedList
                    items={failedItems}
                    actionLoadingId={itemActionLoading}
                    onRetry={handleSingleRetry}
                    onSkip={handleSingleSkip}
                  />
                ),
              },
            ]}
          />
        </div>
      )}

      {/* 底部操作与引导（全部完成且无错误时不展示） */}
      {!isAllCompletedAndClean && (
        <BottomBar
          phase={phase}
          pausedReason={status?.pausedReason}
          actionLoading={actionLoading}
          pendingConfirm={pendingConfirm}
          onClear={handleClear}
          onToggle={handleToggle}
          onSwitchToConfirm={onSwitchToConfirm}
        />
      )}
    </div>
  )
}
