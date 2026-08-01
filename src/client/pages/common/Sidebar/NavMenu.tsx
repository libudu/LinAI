import { AudioOutlined, HomeOutlined, PictureOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../routes'

// 各路由对应的导航图标
const routeIcons: Record<string, ReactNode> = {
  home: <HomeOutlined />,
  tts: <AudioOutlined />,
  'media-classifier': <PictureOutlined />,
}

// 侧边栏导航菜单，当前路由以主题橘色高亮
export function NavMenu({ onNavigate }: { onNavigate?: () => void }) {
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
              active
                ? 'bg-[#EC883A] font-medium text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => go(route.path)}
          >
            <span className="text-base">{routeIcons[route.key]}</span>
            {route.label}
          </div>
        )
      })}
    </nav>
  )
}
