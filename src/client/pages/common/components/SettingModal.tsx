import { Modal, Tabs } from 'antd'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

export interface CommonSettingTab {
  key: string
  label: string
  children: ReactNode
  /** 点击保存时调用，正常返回后关闭弹窗；抛出异常则保持弹窗打开 */
  onSave?: () => Promise<unknown>
  /** 该标签页不显示底部按钮（内容自行处理保存） */
  hideFooter?: boolean
}

/**
 * 通用设置弹窗：
 * - tabs 仅 1 个时不渲染标签页，打开即为设置内容
 * - tabs 多个时通过左侧标签页切换不同子类配置项
 */
export function openCommonSettingModal(options: {
  title?: ReactNode
  tabs: CommonSettingTab[]
  initialTab?: string
  okText?: string
  width?: number
  /** 保存成功且有返回值时触发（如接入点保存后返回 apiKey） */
  onSuccess?: (result: unknown) => void
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
      options.initialTab || options.tabs[0]?.key,
    )
    const activeItem =
      options.tabs.find((tab) => tab.key === activeTab) ?? options.tabs[0]

    const handleSave = async () => {
      try {
        const result = await activeItem?.onSave?.()
        if (result !== undefined && result !== null) {
          options.onSuccess?.(result)
        }
        destroy()
      } catch (error) {
        // 表单验证失败或其他错误，保持弹窗打开
      }
    }

    const singleTab = options.tabs.length <= 1

    return (
      <Modal
        title={options.title ?? '设置'}
        open={true}
        onCancel={destroy}
        onOk={handleSave}
        okText={options.okText ?? '保存'}
        cancelText="取消"
        footer={activeItem?.hideFooter ? null : undefined}
        destroyOnHidden
        width={options.width ?? 620}
      >
        <div className="min-h-[200px] pt-4">
          {singleTab ? (
            activeItem?.children
          ) : (
            <Tabs
              tabPlacement="start"
              activeKey={activeTab}
              onChange={setActiveTab}
              items={options.tabs}
              styles={{
                item: {
                  padding: '8px 16px',
                },
              }}
            />
          )}
        </div>
      </Modal>
    )
  }

  root.render(<ModalComponent />)
}
