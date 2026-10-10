import type {
  OrganizeClassificationMode,
  OrganizeConfirmItemResult,
  OrganizeFolderStandard,
  OrganizeItemRecord,
} from '@/shared/eagle/organize'
import { needsOrganizeRename } from '@/shared/eagle/organize'
import { EAGLE_UNCLASSIFIED_FOLDER_ID } from '@/shared/eagle/types'
import {
  findFolderIdByPath,
  folderExists,
  getItemSnapshots,
  type UpdateItemPatch,
} from '../../library'
import { organizeRepository } from '../storage'
import type { OrganizeConfirmItem } from './types'

export type ConfirmationPlan =
  | { kind: 'ready'; record: OrganizeItemRecord; patch: UpdateItemPatch }
  | { kind: 'purged'; record: OrganizeItemRecord }
  | { kind: 'resolved'; result: OrganizeConfirmItemResult }

/** 确认与清除分类共用推荐标题判断，已匹配当前模型的文件不重复改名。 */
export const getOrganizeRenamePatch = (
  record: Pick<OrganizeItemRecord, 'needsRename' | 'title'>,
  currentName: string,
  modelId: string,
  withTitle: boolean,
): UpdateItemPatch =>
  withTitle &&
  record.needsRename !== false &&
  needsOrganizeRename(currentName, modelId) &&
  record.title
    ? { name: record.title }
    : {}

/** 单张和批量共用校验、目标解析、缺失条目自愈与幂等判断。 */
export const prepareConfirmation = async (
  item: OrganizeConfirmItem,
  standards: OrganizeFolderStandard[],
  modelId: string,
  classificationMode: OrganizeClassificationMode,
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
  const snapshots = await getItemSnapshots([item.itemId])
  if (!snapshots)
    return fail(409, 'Eagle 资源库当前不可用，请检查配置后重新确认')
  const entry = snapshots.get(item.itemId)
  if (!entry) return { kind: 'purged', record }
  const renamePatch = getOrganizeRenamePatch(
    record,
    entry.name,
    modelId,
    item.withTitle,
  )

  // 仅重命名不提交 folderIds，写库时保留最新元数据中的全部目录归属。
  if (classificationMode === 'recursive-rename') {
    return {
      kind: 'ready',
      record,
      patch: renamePatch,
    }
  }

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
      ...renamePatch,
    },
  }
}
