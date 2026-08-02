import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import { Switch } from 'antd'
import { PROMPT_OPTIMIZE_MODEL } from '../TemplateSection/TemplateForm/PromptOptimizeModal'

function SettingItem({
  title,
  checked,
  onChange,
  description,
}: {
  title: string
  checked: boolean
  onChange: (checked: boolean) => void
  description: React.ReactNode
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-gray-600">{title}</div>
        <Switch checked={checked} onChange={onChange} />
      </div>
      <div className="mt-1 text-xs leading-5 text-gray-400">{description}</div>
    </div>
  )
}

export function SideSetting() {
  const {
    promptOptimizeEnabled,
    setPromptOptimizeEnabled,
    styleExtractEnabled,
    setStyleExtractEnabled,
    appendAspectRatioEnabled,
    setAppendAspectRatioEnabled,
    appendAspectRatio,
    setAppendAspectRatio,
    autoFillAspectRatio,
    setAutoFillAspectRatio,
  } = useLocalSetting()

  return (
    <div className="px-4 py-2">
      <SettingItem
        title="提示词优化"
        checked={promptOptimizeEnabled}
        onChange={setPromptOptimizeEnabled}
        description={
          <>
            <div>启用后将在提示词输入框旁显示“提示词优化”按钮</div>
            <div>
              使用 {PROMPT_OPTIMIZE_MODEL} 模型，
              <span className="text-red-500">需要至少包含一个 gemini 分组</span>
            </div>
            <div>以带单张图估算，200次约消耗1分钱，开销可忽略</div>
          </>
        }
      />
      <SettingItem
        title="图片风格提取"
        checked={styleExtractEnabled}
        onChange={setStyleExtractEnabled}
        description={
          <>
            <div>启用后将在提示词输入框旁显示“图片风格提取”按钮</div>
            <div>
              使用 {PROMPT_OPTIMIZE_MODEL} 模型，
              <span className="text-red-500">需要至少包含一个 gemini 分组</span>
            </div>
          </>
        }
      />
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-gray-600">比例拼接</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="text-xs text-gray-500">显示按钮</div>
              <Switch
                checked={appendAspectRatioEnabled}
                onChange={setAppendAspectRatioEnabled}
              />
            </div>
            <div className="flex items-center gap-1">
              <div className="text-xs text-gray-500">功能开启</div>
              <Switch
                checked={appendAspectRatio}
                onChange={setAppendAspectRatio}
              />
            </div>
          </div>
        </div>
        <div className="mt-1 text-xs leading-5 text-gray-400">
          提交时额外追加一行“图片比例X：Y”，用于不支持分辨率和比例选项的分组
        </div>
        <div className="text-xs leading-5 text-gray-400">
          隐藏切换按钮后，是否追加比例仍以“功能开启”为准
        </div>
      </div>
      <SettingItem
        title="首图自动填充比例"
        checked={autoFillAspectRatio}
        onChange={setAutoFillAspectRatio}
        description="新增模板时，上传第一张图片后自动将比例设置为最接近的图片比例"
      />
    </div>
  )
}
