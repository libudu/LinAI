import { message } from 'antd'
import { useCallback, useEffect, useRef } from 'react'
import { confirmOrganizeResultsBatch } from '../../api'
import {
  cancelOptimisticItems,
  isCurrentOrganizeTask,
  markOptimisticItemsSubmitting,
  settleOptimisticItems,
} from '../../store'
import type { PendingConfirmItem } from '../types'
import { ConfirmSubmissionQueue } from '../utils/submissionQueue'

interface UseConfirmSubmissionOptions {
  restoreItems: (items: PendingConfirmItem[]) => void
}

/** 只负责提交、逐项反馈和校准；列表恢复由列表 Hook 完成。 */
export function useConfirmSubmission(options: UseConfirmSubmissionOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const mountedRef = useRef(true)
  const queueRef = useRef<ConfirmSubmissionQueue | null>(null)
  if (!queueRef.current) {
    queueRef.current = new ConfirmSubmissionQueue(async (batch) => {
      const groups = new Map<number, PendingConfirmItem[]>()
      for (const item of batch) {
        const group = groups.get(item.taskCreatedAt) ?? []
        group.push(item)
        groups.set(item.taskCreatedAt, group)
      }
      for (const [taskCreatedAt, items] of groups) {
        const ids = items.map((item) => item.itemId)
        markOptimisticItemsSubmitting(ids, taskCreatedAt)
        let failed: PendingConfirmItem[] = []
        try {
          const response = await confirmOrganizeResultsBatch(
            items.map(({ itemId, folderPath, folderId, withTitle }) => ({
              itemId,
              folderPath,
              folderId,
              withTitle,
            })),
            taskCreatedAt,
          )
          const results = new Map(
            response.items.map((result) => [result.itemId, result]),
          )
          failed = items.filter((item) => results.get(item.itemId)?.ok !== true)
          if (failed.length > 0) {
            const first = results.get(failed[0].itemId)
            message.error(
              `${failed.length} 张图片确认失败：${first && !first.ok ? first.error : '未收到处理结果'}`,
            )
          }
        } catch (error) {
          failed = items
          console.error('批量确认失败', error)
          message.error(error instanceof Error ? error.message : '确认失败')
        }
        const failedIds = new Set(failed.map((item) => item.itemId))
        cancelOptimisticItems([...failedIds], taskCreatedAt)
        if (mountedRef.current) optionsRef.current.restoreItems(failed)
        await settleOptimisticItems(
          ids.filter((id) => !failedIds.has(id)),
          taskCreatedAt,
        )
      }
    })
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // 继续使用同一条串行队列，切换步骤/关闭弹窗不另开并发请求。
      void queueRef.current?.flush()
    }
  }, [])

  const enqueue = useCallback(
    (item: PendingConfirmItem) => queueRef.current!.enqueue(item),
    [],
  )
  const flushPendingBatch = useCallback(() => queueRef.current!.flush(), [])
  const runAction = useCallback(
    (item: PendingConfirmItem, action: () => Promise<void>) =>
      queueRef.current!.runAction(async () => {
        markOptimisticItemsSubmitting([item.itemId], item.taskCreatedAt)
        let succeeded = false
        try {
          if (!isCurrentOrganizeTask(item.taskCreatedAt))
            throw new Error('整理任务已变更，请重新打开确认列表')
          await action()
          succeeded = true
        } catch (error) {
          message.error(error instanceof Error ? error.message : '操作失败')
          cancelOptimisticItems([item.itemId], item.taskCreatedAt)
          if (mountedRef.current) optionsRef.current.restoreItems([item])
        }
        await settleOptimisticItems(
          succeeded ? [item.itemId] : [],
          item.taskCreatedAt,
        )
      }),
    [],
  )

  return { enqueue, flushPendingBatch, runAction }
}
