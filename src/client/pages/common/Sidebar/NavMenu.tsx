import { useLocation, useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../routes'

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
      {appRoutes.map((route) => {
        const active = location.pathname === route.path
        return (
          <div
            key={route.key}
            className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
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
          </div>
        )
      })}
    </nav>
  )
}
