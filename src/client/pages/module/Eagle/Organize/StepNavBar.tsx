import type { OrganizeStatus, OrganizeTaskView } from '@/shared/eagle/organize'
import { Badge, Tag } from 'antd'
import React from 'react'

export type OrganizeStepKey = 'classify' | 'running' | 'confirm'

interface StepNavBarProps {
  currentStep: OrganizeStepKey
  onChange: (step: OrganizeStepKey) => void
  status: OrganizeStatus | null
  task: OrganizeTaskView | null
}

export const StepNavBar: React.FC<StepNavBarProps> = ({
  currentStep,
  onChange,
  status,
  task,
}) => {
  const isLocked = status?.isLocked ?? false
  const phase = status?.phase
  const pendingConfirm = status?.pendingConfirm ?? 0
  const failedCount = status?.failedCount ?? 0
  const total = task?.total ?? 0
  const executed = task?.executed ?? 0

  // 02 处理中：无任务或已全部完成且无队列时置灰
  const isStepRunningDisabled =
    !isLocked && phase !== 'running' && phase !== 'paused' && total === 0

  // 03 待确认：无待确认且无任务结果时置灰
  const isStepConfirmDisabled =
    !isLocked && pendingConfirm === 0 && (task?.successCount ?? 0) === 0

  const getAddSubtitle = () => {
    if (!isLocked || phase === 'done') {
      return '新建分类任务'
    }
    if (task?.availableCount !== undefined) {
      if (task.availableCount > 0) {
        return `剩余 ${task.availableCount} 张可选`
      }
      return '全部图片已入队'
    }
    return '追加图片到队列'
  }

  const getRunningSubtitle = () => {
    if (isStepRunningDisabled) {
      return '暂无任务'
    }
    if (total > 0) {
      return `${executed}/${total}`
    }
    return phase === 'running' ? '执行中' : '已暂停'
  }

  return (
    <div className="flex w-40 shrink-0 flex-col gap-3 border-r border-slate-200 pr-3 dark:border-slate-700">
      {/* 01 待添加 */}
      <button
        type="button"
        onClick={() => onChange('classify')}
        className={`group flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all ${
          currentStep === 'classify'
            ? 'border-blue-500 bg-blue-50/70 shadow-xs dark:border-blue-500 dark:bg-blue-950/30'
            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-800/40 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-semibold ${
              currentStep === 'classify'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            01 待添加
          </span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {getAddSubtitle()}
        </div>
      </button>

      {/* 02 处理中 */}
      <button
        type="button"
        disabled={isStepRunningDisabled}
        onClick={() => !isStepRunningDisabled && onChange('running')}
        className={`group flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all ${
          isStepRunningDisabled
            ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-40 dark:border-slate-800 dark:bg-slate-900/30'
            : currentStep === 'running'
              ? 'border-blue-500 bg-blue-50/70 shadow-xs dark:border-blue-500 dark:bg-blue-950/30'
              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-800/40 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-semibold ${
              currentStep === 'running'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            02 处理中
          </span>
          {!isStepRunningDisabled && phase === 'running' && (
            <span className="flex h-2 w-2 items-center justify-center">
              <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          )}
          {!isStepRunningDisabled && phase === 'paused' && (
            <Tag color="warning" className="m-0 text-[10px] leading-4">
              暂停
            </Tag>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{getRunningSubtitle()}</span>
          {failedCount > 0 && (
            <Badge
              count={`${failedCount} 失败`}
              className="site-badge-count-4"
              style={{
                backgroundColor: '#ef4444',
                fontSize: '10px',
                lineHeight: '16px',
                height: '16px',
              }}
            />
          )}
        </div>
      </button>

      {/* 03 待确认 */}
      <button
        type="button"
        disabled={isStepConfirmDisabled}
        onClick={() => !isStepConfirmDisabled && onChange('confirm')}
        className={`group flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all ${
          isStepConfirmDisabled
            ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-40 dark:border-slate-800 dark:bg-slate-900/30'
            : currentStep === 'confirm'
              ? 'border-blue-500 bg-blue-50/70 shadow-xs dark:border-blue-500 dark:bg-blue-950/30'
              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-800/40 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-semibold ${
              currentStep === 'confirm'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            03 待确认
          </span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {isStepConfirmDisabled ? '暂无待确认' : `${pendingConfirm} 张待查验`}
        </div>
      </button>
    </div>
  )
}
