import type { OrganizePhase } from '@/shared/eagle/organize'
import { Button } from 'antd'

const PAUSED_REASON_TEXT: Record<string, string> = {
  user: '已手动暂停',
  error: '执行出错，队列已暂停',
  restart: '服务重启，任务已暂停',
}

interface BottomBarProps {
  phase?: OrganizePhase
  pausedReason?: string | null
  actionLoading: boolean
  pendingConfirm: number
  onClear: () => void
  onToggle: () => void
  onSwitchToConfirm?: () => void
}

export function BottomBar({
  phase,
  pausedReason,
  actionLoading,
  pendingConfirm,
  onClear,
  onToggle,
  onSwitchToConfirm,
}: BottomBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
      <div className="flex shrink-0 items-center gap-2">
        <Button danger onClick={onClear}>
          清空任务
        </Button>
        <Button loading={actionLoading} onClick={onToggle}>
          {phase === 'running' ? '暂停' : '继续'}
        </Button>
        {/* 仅当暂停时顶部红色小字显示暂停理由 */}
        {phase === 'paused' && pausedReason && (
          <div className="flex items-center text-xs text-red-500">
            {PAUSED_REASON_TEXT[pausedReason] ?? PAUSED_REASON_TEXT.user}
          </div>
        )}
      </div>
      {onSwitchToConfirm && pendingConfirm > 0 && (
        <Button type="primary" onClick={onSwitchToConfirm}>
          去确认结果 ({pendingConfirm})
        </Button>
      )}
    </div>
  )
}
