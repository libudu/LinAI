import LinpxLogo from '../../assets/icon/linpx.png'
import { SettingOutlined, BellOutlined } from '@ant-design/icons'
import { openSettingModal } from '../SettingModal'
import { openNotificationModal } from '../Notification'
import { GPTImageQuota } from './GPTImageQuota'
import pkg from '../../../../package.json'

export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm">
            <img src={LinpxLogo} alt="LinAI Logo" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent m-0">
              LinAI：AI 任务编排集成
            </h1>
            <span className="text-sm text-gray-400">v{pkg.version}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <GPTImageQuota />
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 cursor-pointer transition-colors"
            onClick={() => openNotificationModal()}
            title="通知与说明"
          >
            <BellOutlined className="text-xl text-slate-600" />
          </div>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 cursor-pointer transition-colors"
            onClick={() => openSettingModal()}
            title="设置"
          >
            <SettingOutlined className="text-xl text-slate-600" />
          </div>
        </div>
      </div>
    </header>
  )
}
