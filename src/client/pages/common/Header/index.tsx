import {
  AppstoreOutlined,
  BellOutlined,
  GithubOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Dropdown } from 'antd'
import { useNavigate } from 'react-router-dom'
import pkg from '../../../../../package.json'
import LinpxLogo from '../../../assets/icon/linpx.png'
import { appRoutes } from '../../../routes'
import { openSettingModal } from '../../common/SettingModal'
import { openNotificationModal } from '../Notification'
import { GPTImageQuota } from './GPTImageQuota'

export function Header() {
  const navigate = useNavigate()

  const menuItems = appRoutes.map((route) => ({
    key: route.key,
    label: route.label,
    onClick: () => navigate(route.path),
  }))

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg shadow-sm">
            <img
              src={LinpxLogo}
              alt="LinAI Logo"
              className="cursor-pointer"
              onClick={() => navigate('/')}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <h1
              className="m-0 hidden cursor-pointer bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-2xl font-bold text-transparent md:block"
              onClick={() => navigate('/')}
            >
              LinAI：AI 任务编排集成
            </h1>
            <span className="text-sm text-gray-400">v{pkg.version}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-4">
          <GPTImageQuota />
          <Dropdown menu={{ items: menuItems }} placement="bottomRight">
            <div
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100"
              title="应用导航"
            >
              <AppstoreOutlined className="text-xl" />
            </div>
          </Dropdown>
          <div
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100"
            onClick={() => openNotificationModal()}
            title="通知与说明"
          >
            <BellOutlined className="text-xl" />
          </div>
          <div
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100"
            onClick={() => openSettingModal()}
            title="设置"
          >
            <SettingOutlined className="text-xl" />
          </div>
          <a
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100"
            href="https://github.com/libudu/LinAI"
            target="_blank"
            rel="noreferrer"
            title="GitHub 源码"
          >
            <GithubOutlined className="text-xl" />
          </a>
        </div>
      </div>
    </header>
  )
}
