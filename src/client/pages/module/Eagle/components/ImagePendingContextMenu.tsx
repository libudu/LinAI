import { ContextMenu } from '@/client/components/ContextMenu'
import { PlusOutlined } from '@ant-design/icons'
import { theme } from 'antd'
import type { ComponentProps } from 'react'
import { addEagleImageToPending } from '../pendingImages'

/** 整理缩略图、图片及放大预览共用的右键和长按菜单。 */
export function ImagePendingContextMenu({
  itemId,
  disabled = false,
  children,
}: {
  itemId: string
  disabled?: boolean
  children: ComponentProps<typeof ContextMenu>['children']
}) {
  const { token } = theme.useToken()
  return (
    <ContextMenu
      disabled={disabled}
      styles={{ root: { zIndex: token.zIndexPopupBase + 100 } }}
      menu={{
        items: [
          {
            key: 'add-to-pending',
            icon: <PlusOutlined />,
            label: '添加到待使用',
          },
        ],
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation()
          void addEagleImageToPending(itemId)
        },
      }}
    >
      {children}
    </ContextMenu>
  )
}
