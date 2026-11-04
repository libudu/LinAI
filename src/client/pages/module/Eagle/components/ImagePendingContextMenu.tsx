import { PlusOutlined } from '@ant-design/icons'
import { Dropdown, theme } from 'antd'
import type { ReactElement } from 'react'
import { addEagleImageToPending } from '../pendingImages'

/** 整理缩略图、图片及放大预览共用的右键入口。 */
export function ImagePendingContextMenu({
  itemId,
  disabled = false,
  children,
}: {
  itemId: string
  disabled?: boolean
  children: ReactElement
}) {
  const { token } = theme.useToken()
  return (
    <Dropdown
      disabled={disabled}
      trigger={['contextMenu']}
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
      popupRender={(node) => (
        <div onClick={(event) => event.stopPropagation()}>{node}</div>
      )}
    >
      {children}
    </Dropdown>
  )
}
