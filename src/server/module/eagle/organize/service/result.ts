import type {
  OrganizeConfirmBatchResult,
  OrganizeConfirmItemResult,
  OrganizeItemRecord,
  OrganizeItemStatus,
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import {
  deleteItem,
  getItemDetail,
  getItemPresence,
  getItemSnapshots,
  updateItem,
  updateItems,
} from '../../library'
import { organizeExecutor } from '../executor'
import { organizeRepository } from '../storage'
import { transitionTask } from '../transitions'
import { prepareConfirmation, type ConfirmationPlan } from './confirmation'
import { publishOrganizeChange } from './helpers'
import type {
  OrganizeActionResult,
  OrganizeConfirmItem,
  OrganizeTrashResult,
} from './types'

export class ResultService {
  /** 结果状态落盘与任务计数转换共用任务串行队列，收尾不会读到半次决策。 */
  private async saveDecisions(
    records: OrganizeItemRecord[],
    status: 'confirmed' | 'skipped',
  ) {
    if (records.length === 0) return
    await organizeRepository.mutateTask(async (task) => {
      await organizeRepository.saveItemsBatch(
        records.map((record) => ({ ...record, status, updatedAt: Date.now() })),
      )
      return transitionTask(task, {
        type: 'items-changed',
        changes: records.map((record) => ({ from: record.status, to: status })),
      })
    })
    publishOrganizeChange()
  }

  async listResults(
    status?: OrganizeItemStatus,
    options?: { offset?: number; limit?: number },
  ): Promise<OrganizeResultListItem[]> {
    const items = await organizeRepository.listItems()
    let list = status ? items.filter((item) => item.status === status) : items
    const itemMap = await getItemSnapshots(list.map((item) => item.itemId))
    const { offset = 0, limit } = options ?? {}
    if (offset > 0) list = list.slice(offset)
    if (limit !== undefined && limit >= 0) list = list.slice(0, limit)
    return list.map((item) => {
      const entry = itemMap?.get(item.itemId)
      return {
        ...item,
        mtime: entry?.mtime ?? 0,
        width: entry?.width,
        height: entry?.height,
        size: entry?.size,
      }
    })
  }

  /** 缺失结果校准是显式命令；调用方在命令锁内校验任务身份。 */
  async reconcileResults(): Promise<OrganizeActionResult> {
    const items = (await organizeRepository.listItems()).filter(
      (item) => item.status === 'success',
    )
    if (items.length === 0) return { ok: true }
    const itemMap = await getItemSnapshots(items.map((item) => item.itemId))
    if (!itemMap)
      return { ok: false, status: 409, error: 'Eagle 资源库当前不可用' }
    const purged: OrganizeItemRecord[] = []
    for (const item of items) {
      if (itemMap.has(item.itemId)) continue
      const record = await organizeRepository.getItem(item.itemId)
      if (record?.status === 'success') purged.push(record)
    }
    await this.saveDecisions(purged, 'confirmed')
    return { ok: true }
  }

  async getResult(itemId: string): Promise<OrganizeResultDetail | null> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return null
    const entry = await getItemDetail(itemId)
    return {
      ...record,
      itemName: entry?.name ?? null,
      itemFolderPaths: entry?.folderPaths ?? [],
      width: entry?.width,
      height: entry?.height,
      size: entry?.size,
    }
  }

  /** 单张走同一套批量确认流程，保留专用接口的 HTTP 错误语义。 */
  async confirmItem(
    itemId: string,
    folderPath: string,
    withTitle: boolean,
    folderId?: string,
  ): Promise<OrganizeActionResult> {
    const batch = await this.confirmBatch([
      { itemId, folderPath, withTitle, folderId },
    ])
    const result = batch.items[0]
    return result.ok
      ? { ok: true }
      : { ok: false, status: result.status, error: result.error }
  }

  /** 每项都有反馈；重复请求已确认项视为成功，不重复写库或扣减计数。 */
  async confirmBatch(
    items: OrganizeConfirmItem[],
  ): Promise<OrganizeConfirmBatchResult> {
    const task = await organizeRepository.getTask()
    if (!task) {
      return {
        items: items.map(({ itemId }) => ({
          itemId,
          ok: false,
          status: 409,
          error: '整理任务已变更，请重新打开确认列表',
        })),
      }
    }
    const plans = new Map<string, ConfirmationPlan>()
    for (const item of items) {
      if (!plans.has(item.itemId))
        plans.set(item.itemId, await prepareConfirmation(item, task.standards))
    }
    const results = new Map<string, OrganizeConfirmItemResult>()
    const records: OrganizeItemRecord[] = []
    const ready: Extract<ConfirmationPlan, { kind: 'ready' }>[] = []
    for (const [itemId, plan] of plans) {
      if (plan.kind === 'resolved') results.set(itemId, plan.result)
      else if (plan.kind === 'purged') {
        records.push(plan.record)
        results.set(itemId, { itemId, ok: true, outcome: 'purged' })
      } else ready.push(plan)
    }
    const written = await updateItems(
      ready.map(({ record, patch }) => ({ id: record.itemId, patch })),
    )
    const writtenById = new Map(written.map((result) => [result.id, result]))
    for (const plan of ready) {
      const itemId = plan.record.itemId
      const result = writtenById.get(itemId)!
      if (result.ok) {
        records.push(plan.record)
        results.set(itemId, { itemId, ok: true, outcome: 'confirmed' })
      } else if (result.reason === 'not-found') {
        records.push(plan.record)
        results.set(itemId, { itemId, ok: true, outcome: 'purged' })
      } else
        results.set(itemId, {
          itemId,
          ok: false,
          status: result.status,
          error: result.error,
        })
    }
    await this.saveDecisions(records, 'confirmed')
    return { items: items.map(({ itemId }) => results.get(itemId)!) }
  }

  async clearItemClassification(itemId: string): Promise<OrganizeActionResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed')
      return { ok: false, status: 409, error: '该结果当前不需要确认' }
    const presence = await getItemPresence(itemId)
    if (presence === 'unavailable')
      return { ok: false, status: 409, error: 'Eagle 资源库当前不可用' }
    if (presence === 'present') {
      if (!(await updateItem(itemId, { folderIds: [] })))
        return { ok: false, status: 404, error: 'Eagle 条目不存在' }
    }
    await this.saveDecisions([record], 'skipped')
    return { ok: true }
  }

  /** 任务身份由门面校验后，串行执行删除与跳过；写库失败不能跳过结果。 */
  async trashItem(itemId: string): Promise<OrganizeTrashResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed')
      return { ok: false, status: 409, error: '该结果当前不需要处理' }
    const missing = !(await deleteItem(itemId))
    await this.saveDecisions([record], 'skipped')
    return { ok: true, missing }
  }

  async skipItem(itemId: string): Promise<OrganizeActionResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed')
      return { ok: false, status: 409, error: '该结果当前不需要处理' }
    await this.saveDecisions([record], 'skipped')
    return { ok: true }
  }

  async retryItem(itemId: string): Promise<OrganizeActionResult> {
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed')
      return {
        ok: false,
        status: 409,
        error: '仅待确认或失败的结果可以重新执行',
      }
    await organizeRepository.mutateTask(async (task) => {
      await organizeRepository.saveItem({
        ...record,
        status: 'pending',
        updatedAt: Date.now(),
      })
      return transitionTask(task, {
        type: 'items-changed',
        changes: [{ from: record.status, to: 'pending' }],
        resume: true,
      })
    })
    publishOrganizeChange()
    organizeExecutor.kick()
    return { ok: true }
  }
}

export const resultService = new ResultService()
