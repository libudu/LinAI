import { useAsyncEffect, useLocalStorageState } from 'ahooks'
import { Button, Input, message } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../../../server'
import { generateTTS } from '../../generate'
import { useDisabledVoices } from './useDisabledVoices'
import { voiceList } from './voiceConfig'
import { VoicePreviewCard } from './VoicePreviewCard'

const client = hc<AppType>('/')

interface VoicePreviewProps {
  backgroundPrompt: string
}

export const VoicePreview = ({ backgroundPrompt }: VoicePreviewProps) => {
  const [disabledVoices, setDisabledVoices] = useDisabledVoices()
  const [previewText, setPreviewText] = useLocalStorageState(
    'gemini-tts-preview-text-global',
    { defaultValue: '你好，我是当前音色的测试语音。' },
  )
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [generatingStatus, setGeneratingStatus] = useState<
    Record<string, boolean>
  >({})
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)

  useAsyncEffect(async () => {
    const res = await client.api['gemini-tts'].output.trial.$get()
    const data = await res.json()
    if (data.success) {
      const urls: Record<string, string> = {}
      data.data.forEach((filename: string) => {
        const voiceName = filename.replace('.wav', '')
        urls[voiceName] =
          `/api/gemini-tts/output/trial/${filename}?t=${Date.now()}`
      })
      setAudioUrls(urls)
    }
  }, [])

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
        isTrial: true,
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
              isTrial: true,
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {voiceList.map((item) => {
          const isDisabled = (disabledVoices || []).includes(item.name)
          const isGenerating = generatingStatus[item.name]
          const audioUrl = audioUrls?.[item.name]

          return (
            <VoicePreviewCard
              key={item.name}
              item={item}
              isDisabled={isDisabled}
              isGenerating={isGenerating}
              audioUrl={audioUrl}
              onToggleDisable={handleToggleDisable}
              onGenerateSingle={generateSingleTTS}
            />
          )
        })}
      </div>
    </div>
  )
}
