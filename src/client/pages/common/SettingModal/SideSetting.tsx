import { Switch } from 'antd'
import { useLocalSetting } from '../../../hooks/useLocalSetting'
import { PROMPT_OPTIMIZE_MODEL } from '../TemplateSection/TemplateForm/PromptOptimizeModal'

export function SideSetting() {
  const { promptOptimizeEnabled, setPromptOptimizeEnabled } = useLocalSetting()

  return (
    <div className="px-4 py-2">
      <div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-600">提示词优化</div>
          <Switch
            checked={promptOptimizeEnabled}
            onChange={setPromptOptimizeEnabled}
          />
        </div>
        <div className="mt-2 text-xs leading-5 text-gray-400">
          <div>启用后将在提示词输入框旁显示优化按钮</div>
          <div>
            使用 {PROMPT_OPTIMIZE_MODEL} 模型，
            <span className="text-red-500">需要至少包含一个 gemini 分组</span>
          </div>
          <div>以带单张图估算，200次约消耗1分钱，开销可忽略</div>
        </div>
      </div>
    </div>
  )
}
