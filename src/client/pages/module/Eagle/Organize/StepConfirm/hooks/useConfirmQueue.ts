import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import { message } from 'antd'
import { useCallback } from 'react'
import { trashOrganizeResult } from '../../api'
import { beginOptimisticItem, cancelOptimisticItems } from '../../store'
import type { PendingConfirmItem } from '../types'
import {
  useConfirmResults,
  type UseConfirmResultsOptions,
} from './useConfirmResults'
import { useConfirmSubmission } from './useConfirmSubmission'

/** 确认页门面：列表管理和串行提交各自独立，普通/快速确认只负责生成决策。 */
export function useConfirmQueue(options: UseConfirmResultsOptions) {
  const list = useConfirmResults(options)
  const { removeItem, restoreItems, selectedId } = list
  const { taskId } = options
  const submission = useConfirmSubmission({ restoreItems })
  const { enqueue, runAction: submitAction, flushPendingBatch } = submission

  const takeItem = useCallback(
    (itemId: string) => {
      if (taskId === undefined || !beginOptimisticItem(itemId, taskId))
        return null
      const removed = removeItem(itemId)
      if (!removed) cancelOptimisticItems([itemId], taskId)
      return removed ? { ...removed, taskId } : null
    },
    [removeItem, taskId],
  )

  const enqueueConfirmation = useCallback(
    (
      itemId: string,
      decision: Pick<
        PendingConfirmItem,
        'folderPath' | 'folderId' | 'withTitle'
      >,
    ) => {
      const removed = takeItem(itemId)
      if (removed)
        enqueue({
          ...removed,
          ...decision,
          itemId,
          withTitle:
            removed.originalItem.needsRename !== false && decision.withTitle,
        })
    },
    [enqueue, takeItem],
  )

  const confirmItemQuick = useCallback(
    (item: OrganizeResultListItem, withTitle: boolean) => {
      enqueueConfirmation(item.itemId, {
        folderPath: item.folderPaths?.[0] || '未分类',
        withTitle,
      })
    },
    [enqueueConfirmation],
  )

  const confirmCurrentItem = useCallback(
    (decision: {
      folderPath: string
      folderId?: string
      withTitle: boolean
    }) => {
      if (selectedId) enqueueConfirmation(selectedId, decision)
    },
    [enqueueConfirmation, selectedId],
  )

  const runAction = useCallback(
    async (
      action: (itemId: string, taskId: string) => Promise<void>,
      targetId?: string,
    ) => {
      const itemId = targetId ?? selectedId
      if (!itemId) return
      const removed = takeItem(itemId)
      if (!removed) return
      await submitAction(
        { ...removed, itemId, folderPath: '', withTitle: false },
        () => action(itemId, removed.taskId),
      )
    },
    [selectedId, submitAction, takeItem],
  )

  /** 删除成功或条目已不存在后才跳过；其他失败由提交层恢复待确认项。 */
  const trashItem = useCallback(
    (itemId: string) =>
      runAction(async (id, taskId) => {
        const { missing } = await trashOrganizeResult(id, taskId)
        message.success(
          missing ? '图片已不存在，已跳过整理结果' : '已移至回收站',
        )
      }, itemId),
    [runAction],
  )

  return {
    ...list,
    confirmItemQuick,
    confirmCurrentItem,
    runAction,
    trashItem,
    flushPendingBatch,
  }
}
