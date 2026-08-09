import {
  BellOutlined,
  GithubOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { openInterfaceSettingModal } from '../components/InterfaceSettingModal'
import { openNotificationModal } from '../Notification'

// 侧边栏底部功能区：通知、GitHub、设置（明暗/主题色）、收起/展开侧栏
export function SidebarFooter({
  collapsed,
  onToggleCollapse,
}: {
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const itemClass =
    'flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-100'

  return (
    <div className="border-t border-slate-200 p-3">
      {collapsed ? (
        <div className="flex flex-col items-center gap-1">
          <div
            className={`${itemClass} w-full`}
            onClick={onToggleCollapse}
            title="展开侧栏"
          >
            <MenuUnfoldOutlined className="text-lg" />
          </div>
        </div>
      ) : (
        <div className="flex items-center">
          <div
            className={itemClass}
            onClick={() => openNotificationModal()}
            title="通知与说明"
          >
            <BellOutlined className="text-lg" />
          </div>
          <a
            className={itemClass}
            href="https://github.com/libudu/LinAI"
            target="_blank"
            rel="noreferrer"
            title="GitHub 源码"
          >
            <GithubOutlined className="text-lg" />
          </a>
          <div
            className={itemClass}
            onClick={() => openInterfaceSettingModal()}
            title="设置"
          >
            <SettingOutlined className="text-lg" />
          </div>
          {onToggleCollapse && (
            <div
              className={itemClass}
              onClick={onToggleCollapse}
              title="收起侧栏"
            >
              <MenuFoldOutlined className="text-lg" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
