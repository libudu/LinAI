import { Modal, Tabs } from 'antd'
import { createRoot } from 'react-dom/client'
import ErrorContent from './ErrorContent'
import ImportantContent from './ImportantContent'
import TipContent from './TipContent'
import UpgradeContent from './UpgradeContent'

export function openNotificationModal() {
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
    const items = [
      {
        key: 'important',
        label: '📢 重要说明',
        children: <ImportantContent />,
      },
      {
        key: 'tip',
        label: '💡 高级技巧',
        children: <TipContent />,
      },
      {
        key: 'error',
        label: '🚨 错误提示',
        children: <ErrorContent />,
      },
      {
        key: 'upgrade',
        label: '💅 更新日志',
        children: <UpgradeContent />,
      },
    ]

    return (
      <Modal
        title={
          <span className="flex items-center gap-2 text-xl font-semibold">
            <span>🔔</span> 通知与说明
          </span>
        }
        classNames={{
          header: 'mb-0!',
        }}
        open={true}
        onCancel={destroy}
        footer={null}
        destroyOnHidden
        width={650}
      >
        <div className="min-h-[350px]">
          <Tabs
            items={items}
            defaultActiveKey="important"
            size="large"
            className="px-2 py-4 text-sm text-gray-700 sm:text-base!"
          />
        </div>
      </Modal>
    )
  }

  root.render(<ModalComponent />)
}
