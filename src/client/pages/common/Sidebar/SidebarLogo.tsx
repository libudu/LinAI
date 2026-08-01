import pkg from '../../../../../package.json'
import LinpxLogo from '../../../assets/icon/linpx.png'

// Logo 与标题，收起状态下仅显示 Logo 图标
export function SidebarLogo({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex items-center justify-center px-3 pt-6 pb-4">
        <img
          src={LinpxLogo}
          alt="LinAI Logo"
          className="h-10 w-10 rounded-lg shadow-sm"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-4">
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
  )
}
