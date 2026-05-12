import { Button, Switch } from 'antd'
import { VoiceTag } from '../components/VoiceTag'
import { CustomAudio } from '../components/Audio'
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
    <div
      className={`flex flex-col gap-2 rounded-lg border border-slate-200 p-4 pt-2 transition-shadow ${
        isDisabled
          ? 'bg-slate-50 opacity-60 hover:opacity-80'
          : 'bg-white shadow-sm hover:shadow-md'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="min-w-0 truncate text-base leading-tight font-bold text-slate-800"
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
      <VoiceTag allowCustomTag hideName voiceName={item.name} />
      <div
        className="mt-1 flex items-center justify-between gap-2"
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
          <CustomAudio src={audioUrl} className="h-10 w-full" />
        )}
      </div>
    </div>
  )
}
