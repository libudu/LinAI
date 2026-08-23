import type { OrganizeTaskView } from '@/shared/eagle/organize'
import { EAGLE_UNCLASSIFIED_FOLDER_ID } from '@/shared/eagle/types'
import { changeBus } from '../../../../common/storage/change-bus'
import { getFolderPaths } from '../../library'
import { ORGANIZE_RESOURCE } from '../constants'
import type { OrganizeTaskRecord } from '../storage'

export const toTaskView = (
  record: OrganizeTaskRecord,
  availableCount?: number,
): OrganizeTaskView => ({
  phase: record.phase,
  pausedReason: record.pausedReason,
  compress: record.compress,
  concurrency: record.concurrency,
  createdAt: record.createdAt,
  standards: record.standards,
  folderId: record.folderId,
  folderName: record.folderName ?? '全部',
  total: record.itemIds.length,
  executed: record.executed,
  pendingConfirm: record.pendingConfirm,
  successCount: record.successCount,
  failedCount: record.failedCount,
  availableCount,
})

export const publishOrganizeChange = (): void => {
  changeBus.publish({ resource: ORGANIZE_RESOURCE })
}

export const resolveFolderName = async (folderId?: string): Promise<string> => {
  if (!folderId) return '全部'
  if (folderId === EAGLE_UNCLASSIFIED_FOLDER_ID) return '未分类'
  const paths = await getFolderPaths([folderId])
  return paths[0] ?? '指定文件夹'
}
