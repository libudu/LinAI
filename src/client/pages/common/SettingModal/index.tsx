import { Modal, Tabs } from 'antd'
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminSetting, AdminSettingRef } from './Admin/AdminSetting'
import { EndpointSetting, EndpointSettingRef } from './Endpoint/EndpointSetting'
import { GPTImageSetting, GPTImageSettingRef } from './GPTImageSetting'
import { SideSetting } from './SideSetting'
import { TTSSetting, TTSSettingRef } from './TTSSetting'
import { UploadImageSetting } from './UploadImageSetting'

export const isAdmin = () => {
  return (
    window.location.hostname === 'localhost' && !!localStorage.getItem('admin')
  )
}

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
      options?.initialTab || 'endpoint',
    )
    const gptImageRef = useRef<GPTImageSettingRef>(null)
    const endpointRef = useRef<EndpointSettingRef>(null)
    const ttsRef = useRef<TTSSettingRef>(null)
    const adminRef = useRef<AdminSettingRef>(null)

    const handleSave = async () => {
      try {
        if (activeTab === 'gpt-image') {
          await gptImageRef.current?.save()
        } else if (activeTab === 'endpoint') {
          const apiKey = await endpointRef.current?.save()
          if (apiKey) {
            options?.onSuccess?.(apiKey)
          }
        } else if (activeTab === 'tts') {
          await ttsRef.current?.save()
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
        key: 'endpoint',
        label: '接入点配置',
        children: <EndpointSetting ref={endpointRef} />,
      },
      {
        key: 'gpt-image',
        label: 'GPTImage2 配置',
        children: <GPTImageSetting ref={gptImageRef} />,
      },
      {
        key: 'tts',
        label: 'TTS 配置',
        children: <TTSSetting ref={ttsRef} />,
      },
      {
        key: 'upload-image',
        label: '通用图片设置',
        children: <UploadImageSetting />,
      },
      {
        key: 'side-setting',
        label: '辅助功能',
        children: <SideSetting />,
      },
    ]

    if (isAdmin()) {
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
        footer={activeTab === 'admin' ? null : undefined}
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
