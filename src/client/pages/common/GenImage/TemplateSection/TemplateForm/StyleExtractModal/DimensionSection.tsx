import { CheckCircleFilled } from '@ant-design/icons'
import { Button, Input, Skeleton } from 'antd'
import type { StyleAnalysis } from '../../../../../../../server/api/style-analyze'
import { STYLE_DIMENSIONS } from './dimensions'
import { StepBadge } from './StepBadge'

interface DimensionSectionProps {
  analyzing: boolean
  analysisError: string | null
  analyzedOnce: boolean
  selections: Set<keyof StyleAnalysis>
  editedValues: StyleAnalysis
  onToggle: (key: keyof StyleAnalysis) => void
  onEdit: (key: keyof StyleAnalysis, value: string) => void
  onRetry: () => void
}

export function DimensionSection({
  analyzing,
  analysisError,
  analyzedOnce,
  selections,
  editedValues,
  onToggle,
  onEdit,
  onRetry,
}: DimensionSectionProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <StepBadge n={2} />
        <span className="text-sm font-medium text-gray-700">画风维度</span>
        {analyzedOnce && !analysisError && (
          <span className="text-xs text-gray-400">
            点击卡片切换勾选，共 {STYLE_DIMENSIONS.length} 项
          </span>
        )}
        {analysisError && (
          <Button
            size="small"
            type="link"
            className="ml-auto text-xs!"
            onClick={onRetry}
          >
            重试
          </Button>
        )}
      </div>

      {analyzing ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} active paragraph={{ rows: 1 }} />
          ))}
        </div>
      ) : analysisError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center">
          <p className="mb-3 text-sm text-red-600">{analysisError}</p>
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : !analyzedOnce ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-10 text-center text-sm text-gray-400">
          上传图片并点击「开始解析」后，{STYLE_DIMENSIONS.length}{' '}
          个维度的分析结果将展示在此处
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {STYLE_DIMENSIONS.map((dim) => {
            const value = editedValues[dim.key] ?? ''
            const checked = selections.has(dim.key)

            return (
              <div
                key={dim.key}
                onClick={() => onToggle(dim.key)}
                className={`cursor-pointer rounded-lg border px-3 py-2 transition-all select-none ${
                  checked
                    ? 'border-blue-300 bg-blue-50/60 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium ${
                      checked ? 'text-blue-700' : 'text-gray-600'
                    }`}
                  >
                    {dim.label}
                  </span>
                  {checked && (
                    <CheckCircleFilled className="text-xs text-blue-500" />
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Input.TextArea
                    value={value}
                    onChange={(e) => onEdit(dim.key, e.target.value)}
                    placeholder="（空）"
                    autoSize={{ minRows: 1, maxRows: 2 }}
                    className="cursor-text select-auto"
                    style={{ resize: 'none', fontSize: 12 }}
                    variant="borderless"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
