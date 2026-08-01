import { ReloadOutlined } from '@ant-design/icons'
import { Button, Input } from 'antd'
import { StepBadge } from './StepBadge'

interface PreviewSectionProps {
  analyzedOnce: boolean
  hasAnalysis: boolean
  composedPrompt: string
  onReset: () => void
  onChange: (value: string) => void
}

export function PreviewSection({
  analyzedOnce,
  hasAnalysis,
  composedPrompt,
  onReset,
  onChange,
}: PreviewSectionProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <StepBadge n={3} />
        <span className="text-sm font-medium text-gray-700">提示词预览</span>
        {hasAnalysis && (
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={onReset}
            className="ml-auto text-xs! text-gray-500"
            disabled={!composedPrompt}
          >
            重置
          </Button>
        )}
      </div>

      {!analyzedOnce ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-10 text-center text-sm text-gray-400">
          完成分析后，自动拼接的提示词将显示在此处
        </div>
      ) : (
        <Input.TextArea
          value={composedPrompt}
          onChange={(e) => onChange(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 8 }}
          placeholder="点击「重置」从已选维度重新拼接提示词，也可直接编辑"
          style={{ resize: 'vertical' }}
        />
      )}
    </section>
  )
}
