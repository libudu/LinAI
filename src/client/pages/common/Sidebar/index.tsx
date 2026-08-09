import { MenuOutlined } from '@ant-design/icons'
import { Drawer } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LinpxLogo from '../../../assets/icon/linpx.png'
import { EndpointDisplay } from './EndpointDisplay'
import { NavMenu } from './NavMenu'
import { SidebarFooter } from './SidebarFooter'
import { SidebarLogo } from './SidebarLogo'

// 侧边栏内容，桌面端固定栏与移动端抽屉共用
function SidebarContent({
  onNavigate,
  collapsed,
  onToggleCollapse,
}: {
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  return (
    <div className="flex h-full flex-col bg-white">
      {/* Logo 与标题 */}
      <SidebarLogo collapsed={collapsed} />

      {/* 当前接入点，收起状态下隐藏但保持挂载，避免余额查询失活重发 */}
      <div className={`px-3 pb-2 ${collapsed ? 'hidden' : ''}`}>
        <EndpointDisplay />
      </div>

      {/* 导航菜单 */}
      <NavMenu onNavigate={onNavigate} collapsed={collapsed} />

      {/* 底部功能区 */}
      <SidebarFooter
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </div>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      {/* 移动端顶栏：汉堡按钮打开抽屉 */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
        <div
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100"
          onClick={() => setDrawerOpen(true)}
          title="打开导航"
        >
          <MenuOutlined className="text-xl" />
        </div>
        <div
          className="flex cursor-pointer items-center gap-2"
          onClick={() => navigate('/')}
        >
          <img
            src={LinpxLogo}
            alt="LinAI Logo"
            className="h-7 w-7 rounded-md"
          />
          <span className="app-logo-text text-lg font-bold">LinAI</span>
        </div>
      </header>

      {/* 桌面端固定左侧导航栏，可收起为窄图标栏；内容宽度固定，动画仅作用于外层宽度，避免文字重排抖动 */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r border-slate-200 transition-[width] md:block ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className={`h-full ${collapsed ? 'w-16' : 'w-56'}`}>
          <SidebarContent
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
          />
        </div>
      </aside>

      {/* 移动端抽屉导航，默认收起，抽屉内始终展开显示 */}
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={240}
        styles={{ body: { padding: 0 } }}
      >
        <SidebarContent onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
    </>
  )
}
