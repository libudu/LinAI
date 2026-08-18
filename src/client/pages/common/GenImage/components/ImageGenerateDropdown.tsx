import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import type { GptImageSize } from '@/server/module/gpt-image/enum'
import { DownOutlined } from '@ant-design/icons'
import type { ButtonProps, MenuProps } from 'antd'
import { Button, Dropdown, Tooltip } from 'antd'
import classnames from 'classnames'
import { useGptImageStore } from '../store'

interface ImageGenerateDropdownProps {
  onGenerate: (size: GptImageSize) => void
  disabled?: boolean
  size?: ButtonProps['size']
  className?: string
  block?: boolean
}

const IMAGE_SIZE_OPTIONS = [
  { settingKey: 'enable1K', value: '1k', label: '1K' },
  { settingKey: 'enable2K', value: '2k', label: '2K' },
  { settingKey: 'enable4K', value: '4k', label: '4K' },
] as const

export function ImageGenerateDropdown({
  onGenerate,
  disabled = false,
  size,
  className,
  block = false,
}: ImageGenerateDropdownProps) {
  const { gptImageSettings } = useLocalSetting()
  const gptImageModelId = useGptImageStore((state) => state.gptImageModelId)

  const enabledOptions = IMAGE_SIZE_OPTIONS.filter(
    (option) => gptImageSettings[option.settingKey],
  )
  const modelName = gptImageModelId?.split('-')[0]?.trim()
  const buttonLabel = modelName ? `${modelName} 生图` : '未配置模型'
  const hasEnabledSize = enabledOptions.length > 0
  const isDisabled = disabled || !hasEnabledSize
  const items: MenuProps['items'] = enabledOptions.map((option) => ({
    key: option.value,
    label: `生成 ${option.label}`,
  }))

  const button = (
    <Button
      disabled={isDisabled}
      size={size}
      block={block}
      className={classnames('min-w-0', className)}
    >
      <span
        className="min-w-0 flex-1 truncate"
        title={gptImageModelId || '未配置模型'}
      >
        {buttonLabel}
      </span>
      <DownOutlined className="shrink-0" />
    </Button>
  )

  return (
    <Tooltip
      title={
        hasEnabledSize ? undefined : '请先在生图设置中启用至少一个生成尺寸'
      }
    >
      <span className={classnames('inline-block min-w-0', block && 'w-full')}>
        <Dropdown
          disabled={isDisabled}
          trigger={['hover', 'click']}
          menu={{
            items,
            onClick: ({ key }) => onGenerate(key as GptImageSize),
          }}
        >
          {button}
        </Dropdown>
      </span>
    </Tooltip>
  )
}
