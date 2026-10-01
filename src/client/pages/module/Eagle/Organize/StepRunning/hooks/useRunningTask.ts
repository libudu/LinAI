import type {
  OrganizeFailedItem,
  OrganizeQueueResp,
} from '@/shared/eagle/organize'
import { Modal, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshQueue } from '../../../refreshQueue'
import {
  clearOrganizeTask,
  fetchFailedOrganizeItems,
  fetchOrganizeQueue,
  pauseOrganizeTask,
  resumeOrganizeTask,
  retryOrganizeResult,
  skipOrganizeResult,
} from '../../api'
import { refreshOrganizeStatus, useOrganizeStatus } from '../../store'

const QUEUE_PREVIEW_LIMIT = 20

/** 执行步骤的数据、刷新和用户命令；界面组件只负责组装。 */
export function useRunningTask() {
  const { status, revision } = useOrganizeStatus()
  const [queue, setQueue] = useState<OrganizeQueueResp | null>(null)
  const [failedItems, setFailedItems] = useState<OrganizeFailedItem[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [failedLoading, setFailedLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'queue' | 'failed'>('queue')
  const [actionLoading, setActionLoading] = useState(false)
  const [itemActionLoading, setItemActionLoading] = useState<string | null>(
    null,
  )
  const mountedRef = useRef(false)
  const generationRef = useRef(0)
  const taskIdRef = useRef(status?.taskId)
  taskIdRef.current = status?.taskId
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAutoJumpedRef = useRef(false)
  const refreshQueueRef = useRef<RefreshQueue | null>(null)
  if (!refreshQueueRef.current) {
    refreshQueueRef.current = new RefreshQueue(async () => {
      const generation = generationRef.current
      const taskId = taskIdRef.current
      if (!mountedRef.current) return
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
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        taskId !== taskIdRef.current
      )
        return
      if (nextQueue) setQueue(nextQueue)
      if (nextFailedItems) setFailedItems(nextFailedItems)
      setQueueLoading(false)
      setFailedLoading(false)
    })
  }
  const doRefreshTask = useCallback(
    () => refreshQueueRef.current!.request(),
    [],
  )

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
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current++
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [doRefreshTask])

  useEffect(() => {
    generationRef.current++
    setQueue(null)
    setFailedItems([])
    setQueueLoading(true)
    setFailedLoading(true)
    hasAutoJumpedRef.current = false
  }, [status?.taskId])

  // status 由 SSE 变更触发更新，变化后防抖刷新任务详情与队列预览
  useEffect(() => {
    triggerDebouncedRefreshTask(200)
  }, [revision, status?.taskId, triggerDebouncedRefreshTask])

  const phase = status?.phase
  const pendingConfirm = status?.pendingConfirm ?? 0
  const hasActiveTask = !!status && status.phase !== 'done'

  const isCompleted =
    phase === 'confirming' ||
    phase === 'done' ||
    (status != null &&
      status.remaining === 0 &&
      phase !== 'running' &&
      phase !== 'paused')

  const isAllCompletedAndClean =
    isCompleted &&
    !failedLoading &&
    failedItems.length === 0 &&
    (status?.failedCount ?? 0) === 0

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
    if (!status) return
    setActionLoading(true)
    try {
      if (phase === 'running') {
        await pauseOrganizeTask(status.taskId)
      } else {
        await resumeOrganizeTask(status.taskId)
      }
      await refreshOrganizeStatus()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      if (mountedRef.current) setActionLoading(false)
    }
  }

  const handleBatchAction = async (
    action: (taskId: string) => Promise<void>,
    successMsg: string,
  ) => {
    if (!status) return
    setActionLoading(true)
    try {
      await action(status.taskId)
      message.success(successMsg)
      await refreshOrganizeStatus()
      await refreshTaskImmediate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      if (mountedRef.current) setActionLoading(false)
    }
  }

  const handleItemAction = async (
    itemId: string,
    action: (id: string, taskId: string) => Promise<void>,
    successMessage: string,
  ) => {
    if (!status) return
    setItemActionLoading(itemId)
    try {
      await action(itemId, status.taskId)
      message.success(successMessage)
      await refreshOrganizeStatus()
      await refreshTaskImmediate()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      if (mountedRef.current) setItemActionLoading(null)
    }
  }
  const handleSingleRetry = (id: string) =>
    handleItemAction(id, retryOrganizeResult, '已重新加入执行队列')
  const handleSingleSkip = (id: string) =>
    handleItemAction(id, skipOrganizeResult, '已跳过该项')

  // 强制清空：中断所有请求（含正在发送的）、丢弃当前结果，SSE 刷新后回到第一步
  const handleClear = () => {
    if (!status) return
    Modal.confirm({
      title: '清空整理任务？',
      content: '将强制停止所有请求并丢弃当前结果，回到第一步。',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await clearOrganizeTask(status.taskId)
          await refreshOrganizeStatus()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '清空任务失败')
          throw error
        }
      },
    })
  }

  const getAddSubtitle = () => {
    if (!hasActiveTask) {
      return '新建分类任务'
    }
    return '从任意文件夹追加图片'
  }

  const getConfirmSubtitle = () => {
    return pendingConfirm > 0 ? `${pendingConfirm} 张待查验` : '暂无待确认'
  }

  const queueItems = queue?.items ?? []

  return {
    phase,
    status,
    queueItems,
    failedItems,
    queueLoading,
    failedLoading,
    activeTab,
    setActiveTab,
    actionLoading,
    itemActionLoading,
    isAllCompletedAndClean,
    pendingConfirm,
    handleToggle,
    handleBatchAction,
    handleSingleRetry,
    handleSingleSkip,
    handleClear,
    getAddSubtitle,
    getConfirmSubtitle,
  }
}
