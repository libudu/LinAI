import { SettingOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../routes'
import { isAdmin } from '../../../utils/admin'

// 侧边栏导航菜单，当前路由以主题橘色高亮；收起状态下仅显示图标
export function NavMenu({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()

  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
      {appRoutes
        .filter((route) => !route.hidden && (!route.adminOnly || isAdmin()))
        .map((route) => {
          const active = location.pathname === route.path
          if (route.disabled) {
            return (
              <div
                key={route.key}
                className={`flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 ${
                  collapsed ? 'justify-center' : ''
                }`}
                title={collapsed ? `${route.label}（开发中）` : undefined}
              >
                <span className="text-base">{route.icon}</span>
                {!collapsed && (
                  <>
                    {route.label}
                    <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400">
                      开发中
                    </span>
                  </>
                )}
              </div>
            )
          }
          return (
            <div
              key={route.key}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-[#EC883A] font-medium text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              onClick={() => go(route.path)}
              title={collapsed ? route.label : undefined}
            >
              <span className="text-base">{route.icon}</span>
              {!collapsed && route.label}
              {/* 模块设置按钮：桌面端仅 hover 导航项时可见，移动端直接显示 */}
              {!collapsed && route.onClickSetting && (
                <span
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-slate-400/30 md:invisible md:group-hover:visible"
                  title="设置"
                  onClick={(e) => {
                    e.stopPropagation()
                    route.onClickSetting?.()
                    onNavigate?.()
                  }}
                >
                  <SettingOutlined className="text-base" />
                </span>
              )}
            </div>
          )
        })}
    </nav>
  )
}
