import { Button } from 'antd'

interface ActionBarProps {
  selectedId: string | null
  canConfirm: boolean
  onDelete: () => void
  onClearClassification: () => void
  onSkip: () => void
  onRetry: () => void
  onConfirm: () => void
}

export function ActionBar({
  selectedId,
  canConfirm,
  onDelete,
  onClearClassification,
  onSkip,
  onRetry,
  onConfirm,
}: ActionBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
      <div className="flex flex-wrap gap-2">
        <Button danger disabled={!selectedId} onClick={onDelete}>
          移到回收站
        </Button>
        <Button disabled={!selectedId} onClick={onRetry}>
          重新执行
        </Button>
        <Button disabled={!selectedId} onClick={onSkip}>
          不处理(S)
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!selectedId} onClick={onClearClassification}>
          清除分类手动处理(A)
        </Button>
        <Button
          type="primary"
          disabled={!selectedId || !canConfirm}
          onClick={onConfirm}
        >
          确认(D)
        </Button>
      </div>
    </div>
  )
}
