import {
  ORGANIZE_CONCURRENCY_DEFAULT,
  type OrganizeFolderStandard,
  type OrganizeItemRecord,
  type OrganizePhase,
  type OrganizeStatus,
} from '@/shared/eagle/organize'

/** 整理任务领域模型：队列与进度，服务和执行器共用，不依赖持久化实现 */
export interface OrganizeTaskRecord {
  phase: OrganizePhase
  pausedReason: OrganizeStatus['pausedReason']
  compress: boolean
  /** 队列执行并发数（创建任务时用户指定；旧任务文档可能缺失，读取时兜底默认值） */
  concurrency: number
  createdAt: number
  standards: OrganizeFolderStandard[]
  /** 首批图片来源文件夹 ID，仅保留历史信息，不限制后续追加 */
  folderId?: string
  /** 首批图片来源文件夹名称 */
  folderName: string
  /** 处理队列：按创建时排序的图片 id */
  itemIds: string[]
  /** 已执行完成（success / failed / skipped / confirmed）的数量 */
  executed: number
  /** 待确认数量（仅 success 且未确认/未跳过） */
  pendingConfirm: number
  /** 本轮成功数，保留已确认/跳过的成功；重新执行会撤回上一轮成功，旧文档兜底为 0 */
  successCount: number
  /** 当前失败待处理数，旧文档兜底为 0 */
  failedCount: number
}

/** 旧任务允许缺少后来新增的配置与计数字段，仅在持久化边界使用。 */
export type StoredOrganizeTask = Omit<
  OrganizeTaskRecord,
  'folderName' | 'successCount' | 'failedCount' | 'concurrency'
> &
  Partial<
    Pick<
      OrganizeTaskRecord,
      'folderName' | 'successCount' | 'failedCount' | 'concurrency'
    >
  >

/** 单分类字段只用于读取旧结果，不暴露给当前业务与客户端。 */
export type StoredOrganizeItem = OrganizeItemRecord & { folderPath?: string }
export type NormalizedOrganizeItem = OrganizeItemRecord & {
  folderPaths: string[]
}

export const normalizeOrganizeTask = (
  task: StoredOrganizeTask,
): OrganizeTaskRecord => ({
  ...structuredClone(task),
  folderName: task.folderName ?? '全部',
  successCount: task.successCount ?? 0,
  failedCount: task.failedCount ?? 0,
  concurrency: task.concurrency ?? ORGANIZE_CONCURRENCY_DEFAULT,
})

/** 兼容只发生在载入/写入边界；当前空数组优先于旧单分类字段。 */
export const normalizeOrganizeItem = (
  record: StoredOrganizeItem,
): NormalizedOrganizeItem => {
  const { folderPath, folderPaths, ...current } = structuredClone(record)
  return {
    ...current,
    folderPaths: folderPaths ?? (folderPath ? [folderPath] : []),
  }
}
