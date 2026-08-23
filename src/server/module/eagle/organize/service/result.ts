import type {
  OrganizeItemStatus,
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import {
  folderExists,
  getFolderPaths,
  getItemEntry,
  updateItem,
} from '../../library'
import { organizeExecutor } from '../executor'
import { organizeRepository } from '../storage'
import { publishOrganizeChange } from './helpers'
import type { OrganizeActionResult } from './types'

export class ResultService {
  async listResults(
    status?: OrganizeItemStatus,
    options?: { offset?: number; limit?: number },
  ): Promise<OrganizeResultListItem[]> {
    const items = await organizeRepository.listItems()
    let list = status ? items.filter((item) => item.status === status) : items
    // 列表按 updatedAt 倒序（EntityStore.list），offset/limit 在过滤后切片
    const { offset = 0, limit } = options ?? {}
    if (offset > 0) list = list.slice(offset)
    if (limit !== undefined && limit >= 0) list = list.slice(0, limit)
    return list
  }

  async getResult(itemId: string): Promise<OrganizeResultDetail | null> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return null
    const entry = await getItemEntry(itemId)
    const itemFolderPaths = await getFolderPaths(entry?.folders ?? [])
    return {
      ...record,
      folderPaths:
        record.folderPaths ?? (record.folderPath ? [record.folderPath] : []),
      itemName: entry?.name ?? null,
      itemFolderPaths,
    }
  }

  /**
   * 确认结果：写 Eagle 库（移入目标文件夹，withTitle 决定是否同时改标题），状态 → confirmed。
   * 仅判定成功且至少有一个候选文件夹的结果可确认
   */
  async confirmItem(
    itemId: string,
    folderPath: string,
    withTitle: boolean,
  ): Promise<OrganizeActionResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success') {
      return { ok: false, status: 409, error: '仅判定成功的结果可以确认' }
    }
    const candidates =
      record.folderPaths ?? (record.folderPath ? [record.folderPath] : [])
    if (!candidates.includes(folderPath)) {
      return {
        ok: false,
        status: 409,
        error: '所选文件夹不在该图片的候选分类中',
      }
    }
    const task = await organizeRepository.getTask()
    const standard = task?.standards.find((s) => s.folderPath === folderPath)
    if (!standard) {
      return {
        ok: false,
        status: 409,
        error: '结果的分类文件夹已不在标准中，请重新执行后再确认',
      }
    }
    // 标准是任务创建时的快照，长任务期间文件夹可能已被删除，写库前按当前库校验
    if (!(await folderExists(standard.folderId))) {
      return {
        ok: false,
        status: 409,
        error: '目标文件夹已不存在（可能已被删除），请重新执行该图片后再确认',
      }
    }
    const updated = await updateItem(itemId, {
      folderIds: [standard.folderId],
      name: withTitle ? record.title : undefined,
    })
    if (!updated) return { ok: false, status: 404, error: 'Eagle 条目不存在' }
    await organizeRepository.saveItem({
      ...record,
      status: 'confirmed',
      updatedAt: Date.now(),
    })
    await this.settleAfterDecision()
    publishOrganizeChange()
    return { ok: true }
  }

  /** 清除全部文件夹归属并结束该结果，留给用户在「未分类」中手动处理 */
  async clearItemClassification(itemId: string): Promise<OrganizeActionResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed') {
      return { ok: false, status: 409, error: '该结果当前不需要确认' }
    }
    const updated = await updateItem(itemId, { folderIds: [] })
    if (!updated) return { ok: false, status: 404, error: 'Eagle 条目不存在' }
    await organizeRepository.saveItem({
      ...record,
      status: 'skipped',
      updatedAt: Date.now(),
    })
    await this.settleAfterDecision()
    publishOrganizeChange()
    return { ok: true }
  }

  /** 不处理：不做任何修改，状态 → skipped */
  async skipItem(itemId: string): Promise<OrganizeActionResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed') {
      return { ok: false, status: 409, error: '该结果当前不需要处理' }
    }
    const wasSuccess = record.status === 'success'
    const wasFailed = record.status === 'failed'
    await organizeRepository.saveItem({
      ...record,
      status: 'skipped',
      updatedAt: Date.now(),
    })
    await organizeRepository.mutateTask((task) => {
      const next = {
        ...task,
        pendingConfirm: wasSuccess
          ? Math.max(0, task.pendingConfirm - 1)
          : task.pendingConfirm,
        failedCount: wasFailed
          ? Math.max(0, task.failedCount - 1)
          : task.failedCount,
      }
      if (next.phase === 'confirming' && next.pendingConfirm === 0) {
        return { ...next, phase: 'done', pausedReason: null }
      }
      return next
    })
    publishOrganizeChange()
    return { ok: true }
  }

  /**
   * 重新执行单图：状态 → pending、phase → running（仅该图入队）。
   * attempts 与 executed 由执行器在真正执行时推进（executed 先减一回补），
   * 保证 remaining = total - executed 徽标语义。
   * 先改任务计数再落盘结果：后半步写盘失败时 kick 会经 finalize 以实体为准
   * 自愈回 confirming（旧结果仍在，计数被权威重算），不会卡死在 running
   */
  async retryItem(itemId: string): Promise<OrganizeActionResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed') {
      return {
        ok: false,
        status: 409,
        error: '仅待确认或失败的结果可以重新执行',
      }
    }
    const wasSuccess = record.status === 'success'
    const wasFailed = record.status === 'failed'
    await organizeRepository.mutateTask((task) => ({
      ...task,
      phase: 'running',
      pausedReason: null,
      pendingConfirm: wasSuccess
        ? Math.max(0, task.pendingConfirm - 1)
        : task.pendingConfirm,
      successCount: wasSuccess
        ? Math.max(0, task.successCount - 1)
        : task.successCount,
      failedCount: wasFailed
        ? Math.max(0, task.failedCount - 1)
        : task.failedCount,
      executed: Math.max(0, task.executed - 1),
    }))
    try {
      await organizeRepository.saveItem({
        ...record,
        status: 'pending',
        updatedAt: Date.now(),
      })
    } finally {
      publishOrganizeChange()
      organizeExecutor.kick()
    }
    return { ok: true }
  }

  /** 一张待确认结果处理完（确认 / 不处理）：待确认计数减一，全部处理完且非执行中 → done */
  private async settleAfterDecision(): Promise<void> {
    await organizeRepository.mutateTask((task) => {
      const pendingConfirm = Math.max(0, task.pendingConfirm - 1)
      if (task.phase === 'confirming' && pendingConfirm === 0) {
        return { ...task, pendingConfirm, phase: 'done', pausedReason: null }
      }
      return { ...task, pendingConfirm }
    })
  }
}

export const resultService = new ResultService()
