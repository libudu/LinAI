import { useLocalStorageState } from 'ahooks'
import { Button, Input, List, Switch, message } from 'antd'
import { useState } from 'react'
import { generateTTS } from '../../generate'
import { VoiceTag } from '../components/VoiceTag'
import { voiceList } from './voiceConfig'

interface VoicePreviewProps {
  backgroundPrompt: string
}

export const VoicePreview = ({ backgroundPrompt }: VoicePreviewProps) => {
  const [disabledVoices, setDisabledVoices] = useLocalStorageState<string[]>(
    'gemini-tts-disabled-voices',
    { defaultValue: [] },
  )
  const [previewText, setPreviewText] = useLocalStorageState(
    'gemini-tts-preview-text',
    { defaultValue: '你好，我是当前音色的测试语音。' },
  )
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [generatingStatus, setGeneratingStatus] = useState<
    Record<string, boolean>
  >({})
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)

  const handleToggleDisable = (voiceName: string, checked: boolean) => {
    const current = disabledVoices || []
    if (checked) {
      setDisabledVoices(current.filter((name) => name !== voiceName))
    } else {
      setDisabledVoices([...current, voiceName])
    }
  }

  const generateSingleTTS = async (voiceName: string) => {
    if (!previewText?.trim()) {
      message.warning('请输入试听文本')
      return
    }

    setGeneratingStatus((prev) => ({ ...prev, [voiceName]: true }))
    try {
      const url = await generateTTS({
        backgroundPrompt,
        voicePrompt: '',
        contentPrompt: previewText,
        voiceName,
      })
      setAudioUrls((prev) => ({ ...prev, [voiceName]: url }))
    } catch (error: any) {
      message.error(`${voiceName} 生成失败: ${error.message || '网络错误'}`)
    } finally {
      setGeneratingStatus((prev) => ({ ...prev, [voiceName]: false }))
    }
  }

  const handleBatchGenerate = async () => {
    if (!previewText?.trim()) {
      message.warning('请输入试听文本')
      return
    }

    const currentDisabled = disabledVoices || []
    const enabledVoices = voiceList.filter(
      (v) => !currentDisabled.includes(v.name),
    )

    setIsBatchGenerating(true)

    // 并发数为 3，避免请求过于密集
    const concurrency = 3
    for (let i = 0; i < enabledVoices.length; i += concurrency) {
      const chunk = enabledVoices.slice(i, i + concurrency)
      await Promise.allSettled(
        chunk.map(async (voice) => {
          setGeneratingStatus((prev) => ({ ...prev, [voice.name]: true }))
          try {
            const url = await generateTTS({
              backgroundPrompt,
              voicePrompt: '',
              contentPrompt: previewText,
              voiceName: voice.name,
            })
            setAudioUrls((prev) => ({ ...prev, [voice.name]: url }))
          } catch (error: any) {
            console.error(`${voice.name} 生成失败`, error)
          } finally {
            setGeneratingStatus((prev) => ({ ...prev, [voice.name]: false }))
          }
        }),
      )
    }

    setIsBatchGenerating(false)
    message.success('批量生成完成')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 rounded-lg bg-gray-50 p-4">
        <span className="shrink-0 font-medium">统一试听文本：</span>
        <Input
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="请输入试听文本"
          className="max-w-md"
        />
        <Button
          type="primary"
          onClick={handleBatchGenerate}
          loading={isBatchGenerating}
        >
          批量生成可用音色试听
        </Button>
      </div>

      <List
        grid={{ gutter: 16, xs: 2, sm: 3, md: 3, lg: 4, xl: 5 }}
        dataSource={voiceList}
        renderItem={(item) => {
          const isDisabled = (disabledVoices || []).includes(item.name)
          const isGenerating = generatingStatus[item.name]
          const audioUrl = audioUrls[item.name]

          return (
            <List.Item>
              <div
                className={`flex flex-col gap-3 rounded-lg border p-4 transition-all ${isDisabled ? 'bg-gray-50 opacity-60' : 'bg-white shadow-sm hover:shadow-md'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{item.name}</span>
                    <VoiceTag hideName voiceName={item.name} />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Switch
                    checked={!isDisabled}
                    onChange={(checked) =>
                      handleToggleDisable(item.name, checked)
                    }
                    checkedChildren="启用"
                    unCheckedChildren="禁用"
                  />
                  {!isDisabled && (
                    <Button
                      size="small"
                      onClick={() => generateSingleTTS(item.name)}
                      loading={isGenerating}
                      disabled={isBatchGenerating && !isGenerating}
                    >
                      {audioUrl ? '重新生成' : '生成试听'}
                    </Button>
                  )}
                  {audioUrl && !isDisabled && (
                    <audio controls src={audioUrl} className="h-8 w-full" />
                  )}
                </div>
              </div>
            </List.Item>
          )
        }}
      />
    </div>
  )
}
