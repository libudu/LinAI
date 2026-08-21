import type { EagleFolder } from '@/shared/eagle/types'
import { Dropdown } from 'antd'
import type { ReactNode } from 'react'

// 右键菜单：挂在节点标题上，trigger 为 contextMenu 时 antd 会在鼠标位置弹出，
// 并在点击菜单外区域或滚动时自动关闭，无需外部维护开关状态；
// 触发 span 设为 block 配合 FolderTree.scss 铺满整行标题区，右侧空白也能右键
export function FolderContextMenu({
  folder,
  onEdit,
  children,
}: {
  folder: EagleFolder
  onEdit: (folder: EagleFolder) => void
  children: ReactNode
}) {
  return (
    <Dropdown
      trigger={['contextMenu']}
      menu={{
        items: [{ key: 'edit', label: '编辑' }],
        onClick: () => onEdit(folder),
      }}
      // 菜单虽经 portal 渲染到 body，React 合成事件仍沿 React 树冒泡到树节点，
      // 触发 rc-tree 的节点点击选中（已选中节点会被切换为取消选中），
      // 包一层拦截 click，阻止菜单内的点击（含空白边缘）影响选中状态
      popupRender={(node) => (
        <div onClick={(e) => e.stopPropagation()}>{node}</div>
      )}
    >
      <span className="block">{children}</span>
    </Dropdown>
  )
}
