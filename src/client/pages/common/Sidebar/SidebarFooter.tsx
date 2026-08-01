import {
  BellOutlined,
  GithubOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { openSettingModal } from '../../common/SettingModal'
import { openNotificationModal } from '../Notification'

// 侧边栏底部功能区：通知、设置、GitHub、收起/展开侧栏
export function SidebarFooter({
  collapsed,
  onToggleCollapse,
}: {
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  return (
    <div className="border-t border-slate-200 p-3">
      {collapsed ? (
        <div className="flex items-center">
          <div
            className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            onClick={onToggleCollapse}
            title="展开侧栏"
          >
            <MenuUnfoldOutlined className="text-lg" />
          </div>
        </div>
      ) : (
        <div className="flex items-center">
          <div
            className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            onClick={() => openNotificationModal()}
            title="通知与说明"
          >
            <BellOutlined className="text-lg" />
          </div>
          <div
            className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            onClick={() => openSettingModal()}
            title="设置"
          >
            <SettingOutlined className="text-lg" />
          </div>
          <a
            className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
            href="https://github.com/libudu/LinAI"
            target="_blank"
            rel="noreferrer"
            title="GitHub 源码"
          >
            <GithubOutlined className="text-lg" />
          </a>
          {onToggleCollapse && (
            <div
              className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
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
