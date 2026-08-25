import { CheckOutlined, PlusOutlined } from '@ant-design/icons'

interface CompletedCardsProps {
  onSwitchToClassify?: () => void
  onSwitchToConfirm?: () => void
  addSubtitle: string
  confirmSubtitle: string
  pendingConfirm: number
}

export function CompletedCards({
  onSwitchToClassify,
  onSwitchToConfirm,
  addSubtitle,
  confirmSubtitle,
  pendingConfirm,
}: CompletedCardsProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-slate-200 p-6 dark:border-slate-700">
      <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        {/* 卡片 1：继续添加 (蓝/Sky) */}
        <button
          type="button"
          onClick={onSwitchToClassify}
          className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-sky-200/80 bg-sky-50/40 p-6 text-center shadow-xs transition-all hover:scale-[1.02] hover:border-sky-400 hover:bg-sky-50/80 hover:shadow-md active:scale-[0.99] dark:border-sky-900/50 dark:bg-sky-950/20 dark:hover:border-sky-700 dark:hover:bg-sky-950/40"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 transition-transform group-hover:scale-110 dark:bg-sky-900/60 dark:text-sky-400">
            <PlusOutlined className="text-xl" />
          </div>
          <div className="text-base font-semibold text-slate-800 group-hover:text-sky-600 dark:text-slate-200 dark:group-hover:text-sky-400">
            继续添加
          </div>
          <div className="text-xs text-sky-600/80 dark:text-sky-400/80">
            {addSubtitle}
          </div>
        </button>

        {/* 卡片 2：开始确认 (绿/Emerald) */}
        <button
          type="button"
          disabled={!onSwitchToConfirm || pendingConfirm === 0}
          onClick={onSwitchToConfirm}
          className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center shadow-xs transition-all ${
            pendingConfirm === 0
              ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50 dark:border-slate-800 dark:bg-slate-900/30'
              : 'cursor-pointer border-emerald-200/80 bg-emerald-50/40 hover:scale-[1.02] hover:border-emerald-400 hover:bg-emerald-50/80 hover:shadow-md active:scale-[0.99] dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40'
          }`}
        >
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform ${
              pendingConfirm === 0
                ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                : 'bg-emerald-100 text-emerald-600 group-hover:scale-110 dark:bg-emerald-900/60 dark:text-emerald-400'
            }`}
          >
            <CheckOutlined className="text-xl" />
          </div>
          <div
            className={`text-base font-semibold ${
              pendingConfirm === 0
                ? 'text-slate-400 dark:text-slate-500'
                : 'text-slate-800 group-hover:text-emerald-600 dark:text-slate-200 dark:group-hover:text-emerald-400'
            }`}
          >
            开始确认
          </div>
          <div
            className={`text-xs ${
              pendingConfirm === 0
                ? 'text-slate-400 dark:text-slate-500'
                : 'text-emerald-600/80 dark:text-emerald-400/80'
            }`}
          >
            {confirmSubtitle}
          </div>
        </button>
      </div>
    </div>
  )
}
