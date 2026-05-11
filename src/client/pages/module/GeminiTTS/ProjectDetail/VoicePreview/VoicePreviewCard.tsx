import { Button, List, Switch } from 'antd'
import { VoiceTag } from '../components/VoiceTag'
import type { voiceList } from './voiceConfig'

interface VoicePreviewCardProps {
  item: (typeof voiceList)[0]
  isDisabled: boolean
  isGenerating: boolean
  audioUrl?: string
  onToggleDisable: (voiceName: string, checked: boolean) => void
  onGenerateSingle: (voiceName: string) => void
}

export const VoicePreviewCard = ({
  item,
  isDisabled,
  isGenerating,
  audioUrl,
  onToggleDisable,
  onGenerateSingle,
}: VoicePreviewCardProps) => {
  return (
    <List.Item>
      <div
        className={`flex flex-col gap-2 rounded-lg border p-4 transition-all ${
          isDisabled
            ? 'bg-gray-50 opacity-60 hover:opacity-80'
            : 'bg-white shadow-sm hover:shadow-md'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className="min-w-0 truncate text-lg font-bold"
            title={item.name}
          >
            {item.name}
          </span>
          <Switch
            className="shrink-0"
            checked={!isDisabled}
            onChange={(checked, e) => {
              e.stopPropagation()
              onToggleDisable(item.name, checked)
            }}
          />
        </div>
        <div className="shrink-0">
          <VoiceTag allowCustomTag hideName voiceName={item.name} />
        </div>
        <div
          className="mt-2 flex items-center justify-between gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            onClick={() => onGenerateSingle(item.name)}
            loading={isGenerating}
            disabled={isDisabled}
          >
            {audioUrl ? '重新生成' : '生成试听'}
          </Button>
          {audioUrl && !isDisabled && (
            <audio controls src={audioUrl} className="h-8 w-full" />
          )}
        </div>
      </div>
    </List.Item>
  )
}
