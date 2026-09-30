import type {
  OrganizeConfirmItem,
  OrganizeConfirmItemResult,
  OrganizeFolderStandard,
  OrganizeItemRecord,
} from '@/shared/eagle/organize'
import { EAGLE_UNCLASSIFIED_FOLDER_ID } from '@/shared/eagle/types'
import {
  findFolderIdByPath,
  folderExists,
  getItemPresence,
  type UpdateItemPatch,
} from '../../library'
import { organizeRepository } from '../storage'

export type ConfirmationPlan =
  | { kind: 'ready'; record: OrganizeItemRecord; patch: UpdateItemPatch }
  | { kind: 'purged'; record: OrganizeItemRecord }
  | { kind: 'resolved'; result: OrganizeConfirmItemResult }

/** 单张和批量共用校验、目标解析、缺失条目自愈与幂等判断。 */
export const prepareConfirmation = async (
  item: OrganizeConfirmItem,
  standards: OrganizeFolderStandard[],
): Promise<ConfirmationPlan> => {
  const fail = (status: 404 | 409, error: string): ConfirmationPlan => ({
    kind: 'resolved',
    result: { itemId: item.itemId, ok: false, status, error },
  })
  const record = await organizeRepository.getItem(item.itemId)
  if (!record) return fail(404, '结果不存在')
  if (record.status === 'confirmed') {
    return {
      kind: 'resolved',
      result: { itemId: item.itemId, ok: true, outcome: 'already-confirmed' },
    }
  }
  if (record.status !== 'success') return fail(409, '仅判定成功的结果可以确认')
  const presence = await getItemPresence(item.itemId)
  if (presence === 'unavailable')
    return fail(409, 'Eagle 资源库当前不可用，请检查配置后重新确认')
  if (presence === 'missing') return { kind: 'purged', record }

  const isUnclassified =
    item.folderId === EAGLE_UNCLASSIFIED_FOLDER_ID ||
    item.folderPath === '未分类' ||
    item.folderPath === EAGLE_UNCLASSIFIED_FOLDER_ID
  let folderId: string | null = null
  if (!isUnclassified) {
    // 显式 ID 优先于快照路径，手动选择不会被同名/旧路径覆盖。
    folderId =
      item.folderId ??
      standards.find((s) => s.folderPath === item.folderPath)?.folderId ??
      (await findFolderIdByPath(item.folderPath))
    if (!folderId || !(await folderExists(folderId))) {
      return fail(409, '目标文件夹已不存在（可能已被删除），请重新选择后再确认')
    }
  }
  return {
    kind: 'ready',
    record,
    patch: {
      folderIds: isUnclassified ? [] : [folderId!],
      name: item.withTitle ? record.title : undefined,
    },
  }
}
