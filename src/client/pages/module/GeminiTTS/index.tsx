import { Button, Input, message } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../server'

const { TextArea } = Input

const client = hc<AppType>('/')

export const GeminiTTS = () => {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      message.warning('请输入提示词')
      return
    }

    setLoading(true)
    try {
      const response = await client.api['gemini-tts'].generate.$post({
        json: { prompt },
      })

      const data = await response.json()
      if (data.success) {
        setAudioUrl(data.url)
        message.success('生成成功')
      } else {
        message.error(data.error || '生成失败')
      }
    } catch (error: any) {
      message.error(error.message || '网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-slate-800">Gemini TTS</h2>
        <div className="space-y-4">
          <TextArea
            rows={6}
            placeholder="请输入想要转换为语音的文本或对话..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full"
          />
          <div className="flex items-center gap-4">
            <Button
              type="primary"
              onClick={handleGenerate}
              loading={loading}
              className="w-32"
            >
              {loading ? '生成中...' : '生成语音'}
            </Button>
            {audioUrl && <audio controls src={audioUrl} className="h-10" />}
          </div>
        </div>
      </div>
    </div>
  )
}
