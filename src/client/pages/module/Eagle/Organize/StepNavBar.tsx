import { usePlatform } from '@/client/hooks/usePlatform'
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
  const { isMobile } = usePlatform()
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
    <div className="flex w-full shrink-0 flex-row gap-2 border-b border-slate-200 pb-2.5 md:w-40 md:flex-col md:gap-3 md:border-r md:border-b-0 md:pr-3 md:pb-0 dark:border-slate-700">
      {/* 01 待添加 */}
      <button
        type="button"
        onClick={() => onChange('classify')}
        className={`group flex min-w-0 flex-1 flex-col gap-1 rounded-xl border p-2 text-left transition-all sm:gap-1.5 sm:p-3 md:flex-none ${
          currentStep === 'classify'
            ? 'border-sky-500 bg-sky-50 shadow-xs dark:border-sky-500 dark:bg-sky-950/40'
            : 'border-sky-200/60 bg-sky-50/30 hover:border-sky-300 hover:bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/15 dark:hover:border-sky-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`truncate text-xs font-semibold sm:text-sm ${
              currentStep === 'classify'
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            01 待添加
          </span>
        </div>
        <div
          className={`truncate text-[11px] sm:text-xs ${
            currentStep === 'classify'
              ? 'text-sky-600/80 dark:text-sky-400/80'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {getAddSubtitle()}
        </div>
      </button>

      {/* 02 处理中 */}
      <button
        type="button"
        disabled={isStepRunningDisabled}
        onClick={() => !isStepRunningDisabled && onChange('running')}
        className={`group flex min-w-0 flex-1 flex-col gap-1 rounded-xl border p-2 text-left transition-all sm:gap-1.5 sm:p-3 md:flex-none ${
          isStepRunningDisabled
            ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-40 dark:border-slate-800 dark:bg-slate-900/30'
            : currentStep === 'running'
              ? 'border-purple-500 bg-purple-50 shadow-xs dark:border-purple-500 dark:bg-purple-950/40'
              : 'border-purple-200/60 bg-purple-50/30 hover:border-purple-300 hover:bg-purple-50/60 dark:border-purple-900/40 dark:bg-purple-950/15 dark:hover:border-purple-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`truncate text-xs font-semibold sm:text-sm ${
              currentStep === 'running'
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            02 处理中
          </span>
          {!isStepRunningDisabled && phase === 'running' && (
            <span className="flex h-2 w-2 shrink-0 items-center justify-center">
              <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          )}
          {!isStepRunningDisabled && phase === 'paused' && (
            <Tag color="warning" className="m-0 shrink-0 text-[10px] leading-4">
              暂停
            </Tag>
          )}
        </div>
        <div
          className={`flex items-center justify-between gap-1 text-[11px] sm:text-xs ${
            currentStep === 'running'
              ? 'text-purple-600/80 dark:text-purple-400/80'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span className="truncate">{getRunningSubtitle()}</span>
          {failedCount > 0 && (
            <Badge
              count={isMobile ? failedCount : `${failedCount} 失败`}
              className="shrink-0"
              style={{
                backgroundColor: '#ef4444',
                fontSize: '10px',
                lineHeight: '14px',
                height: '14px',
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
        className={`group flex min-w-0 flex-1 flex-col gap-1 rounded-xl border p-2 text-left transition-all sm:gap-1.5 sm:p-3 md:flex-none ${
          isStepConfirmDisabled
            ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-40 dark:border-slate-800 dark:bg-slate-900/30'
            : currentStep === 'confirm'
              ? 'border-emerald-500 bg-emerald-50 shadow-xs dark:border-emerald-500 dark:bg-emerald-950/40'
              : 'border-emerald-200/60 bg-emerald-50/30 hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:hover:border-emerald-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`truncate text-xs font-semibold sm:text-sm ${
              currentStep === 'confirm'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            03 待确认
          </span>
        </div>
        <div
          className={`truncate text-[11px] sm:text-xs ${
            currentStep === 'confirm'
              ? 'text-emerald-600/80 dark:text-emerald-400/80'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {isStepConfirmDisabled ? '暂无待确认' : `${pendingConfirm} 张待查验`}
        </div>
      </button>
    </div>
  )
}
