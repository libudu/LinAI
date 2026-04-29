import { Modal, Tabs } from 'antd'
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminSetting, AdminSettingRef } from './AdminSetting'
import { GPTImageSetting, GPTImageSettingRef } from './GPTImageSetting'

export function openSettingModal(options?: {
  initialTab?: string
  onSuccess?: (apiKey: string) => void
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  function destroy() {
    root.unmount()
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  function ModalComponent() {
    const [activeTab, setActiveTab] = useState(
      options?.initialTab || 'gpt-image',
    )
    const gptImageRef = useRef<GPTImageSettingRef>(null)
    const adminRef = useRef<AdminSettingRef>(null)

    const handleSave = async () => {
      try {
        if (activeTab === 'gpt-image') {
          const apiKey = await gptImageRef.current?.save()
          if (apiKey) {
            options?.onSuccess?.(apiKey)
          }
        } else if (activeTab === 'admin') {
          await adminRef.current?.save()
        }
        destroy()
      } catch (error) {
        // 表单验证失败或其他错误
      }
    }

    const items = [
      {
        key: 'gpt-image',
        label: 'GPTImage 配置',
        children: <GPTImageSetting ref={gptImageRef} />,
      },
    ]

    const isAdmin =
      window.location.hostname === 'localhost' &&
      !!localStorage.getItem('admin')

    if (isAdmin) {
      items.push({
        key: 'admin',
        label: '管理员设置',
        children: <AdminSetting ref={adminRef} />,
      })
    }

    return (
      <Modal
        title="设置"
        open={true}
        onCancel={destroy}
        onOk={handleSave}
        okText={options?.onSuccess ? '保存并继续' : '保存'}
        cancelText="取消"
        destroyOnHidden
        width={620}
      >
        <div className="min-h-[200px] pt-4">
          <Tabs
            tabPlacement="start"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={items}
            styles={{
              item: {
                padding: '8px 16px', // 你要的 padding
              },
            }}
          />
        </div>
      </Modal>
    )
  }

  root.render(<ModalComponent />)
}
