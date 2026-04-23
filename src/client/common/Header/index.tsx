import LinpxLogo from '../../assets/icon/linpx.png'
import { SettingOutlined } from '@ant-design/icons'
import { openSettingModal } from '../SettingModal'

export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm">
            <img src={LinpxLogo} alt="LinAI Logo" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
            LinAI：AI 任务编排集成
          </h1>
        </div>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 cursor-pointer transition-colors"
          onClick={() => openSettingModal()}
        >
          <SettingOutlined className="text-xl text-slate-600" />
        </div>
      </div>
    </header>
  )
}
