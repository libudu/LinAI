import type {
  OrganizeFolderStandard,
  OrganizeItemRecord,
} from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import { getFolderTree } from '../library'

/** 每次查询共用一份当前路径映射，父目录改名也会更新全部后代路径。 */
export const getOrganizeFolderPaths = async (): Promise<
  Map<string, string>
> => {
  const paths = new Map<string, string>()
  const walk = (folders: EagleFolder[], parent = '') => {
    for (const folder of folders) {
      const path = parent ? `${parent}/${folder.name}` : folder.name
      paths.set(folder.id, path)
      walk(folder.children, path)
    }
  }
  walk(await getFolderTree())
  return paths
}

/** 旧结果只按分析时的标准快照绑定 ID，不能用当前同名目录接管旧目标。 */
export const bindOrganizeFolderIds = (
  item: Pick<OrganizeItemRecord, 'folderPaths' | 'folderIds'>,
  standards: OrganizeFolderStandard[],
): string[] =>
  item.folderIds ??
  (item.folderPaths ?? []).map(
    (path) =>
      standards.find((standard) => standard.folderPath === path)?.folderId ??
      '',
  )
