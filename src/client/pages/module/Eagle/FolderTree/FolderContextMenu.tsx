import { ContextMenu } from '@/client/components/ContextMenu'
import type { EagleFolder } from '@/shared/eagle/types'
import type { ReactNode } from 'react'
import { useEagleConfig } from '../settings/useEagleConfig'

// 触发区域铺满节点标题，右侧空白也能右键或长按。
export function FolderContextMenu({
  folder,
  onEdit,
  children,
}: {
  folder: EagleFolder
  onEdit: (folder: EagleFolder) => void
  children: ReactNode
}) {
  const remote = useEagleConfig((state) => state.libraryMode === 'remote')

  return (
    <ContextMenu
      disabled={remote}
      menu={{
        items: [{ key: 'edit', label: '编辑' }],
        onClick: () => onEdit(folder),
      }}
    >
      <span className="block select-none">{children}</span>
    </ContextMenu>
  )
}
