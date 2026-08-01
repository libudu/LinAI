import {
  BellOutlined,
  GithubOutlined,
  MenuOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Drawer } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pkg from '../../../../../package.json'
import LinpxLogo from '../../../assets/icon/linpx.png'
import { openSettingModal } from '../../common/SettingModal'
import { openNotificationModal } from '../Notification'
import { EndpointDisplay } from './EndpointDisplay'
import { NavMenu } from './NavMenu'

// 侧边栏内容，桌面端固定栏与移动端抽屉共用
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Logo 与标题 */}
      <div
        className="flex cursor-pointer items-center gap-3 px-5 pt-6 pb-4"
        onClick={() => {
          navigate('/')
          onNavigate?.()
        }}
      >
        <img
          src={LinpxLogo}
          alt="LinAI Logo"
          className="h-16 w-16 rounded-lg shadow-sm"
        />
        <div className="flex flex-col">
          <span className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-xl leading-6 font-bold text-transparent">
            LinAI
          </span>
          <span className="text-sm text-gray-400">AI 任务编排集成</span>
          <span className="text-sm text-gray-400">v{pkg.version}</span>
        </div>
      </div>

      {/* 当前接入点 */}
      <div className="px-3 pb-2">
        <EndpointDisplay />
      </div>

      {/* 导航菜单 */}
      <NavMenu onNavigate={onNavigate} />

      {/* 底部功能区 */}
      <div className="border-t border-slate-200 p-3">
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
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
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
          <span className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-lg font-bold text-transparent">
            LinAI
          </span>
        </div>
      </header>

      {/* 桌面端固定左侧导航栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-slate-200 md:block">
        <SidebarContent />
      </aside>

      {/* 移动端抽屉导航，默认收起 */}
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
