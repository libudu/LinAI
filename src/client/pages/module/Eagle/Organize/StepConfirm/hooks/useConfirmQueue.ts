import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import { useCallback } from 'react'
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
  const { taskCreatedAt } = options
  const submission = useConfirmSubmission({ restoreItems })
  const { enqueue, runAction: submitAction, flushPendingBatch } = submission

  const takeItem = useCallback(
    (itemId: string) => {
      if (
        taskCreatedAt === undefined ||
        !beginOptimisticItem(itemId, taskCreatedAt)
      )
        return null
      const removed = removeItem(itemId)
      if (!removed) cancelOptimisticItems([itemId], taskCreatedAt)
      return removed ? { ...removed, taskCreatedAt } : null
    },
    [removeItem, taskCreatedAt],
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
      if (removed) enqueue({ ...removed, ...decision, itemId })
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
    async (action: (itemId: string) => Promise<void>, targetId?: string) => {
      const itemId = targetId ?? selectedId
      if (!itemId) return
      const removed = takeItem(itemId)
      if (!removed) return
      await submitAction(
        { ...removed, itemId, folderPath: '', withTitle: false },
        () => action(itemId),
      )
    },
    [selectedId, submitAction, takeItem],
  )

  return {
    ...list,
    confirmItemQuick,
    confirmCurrentItem,
    runAction,
    flushPendingBatch,
  }
}
