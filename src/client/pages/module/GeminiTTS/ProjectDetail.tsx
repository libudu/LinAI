import { Button, Input, Select, Tag, message } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../server'
import { voiceList } from './voiceConfig'

const { TextArea } = Input
const { Option } = Select

const client = hc<AppType>('/')

interface ProjectManagerProps {
  project: any
  onBack: () => void
}

export const ProjectDetail = ({ project, onBack }: ProjectManagerProps) => {
  const [prompt, setPrompt] = useState('')
  const [voiceName, setVoiceName] = useState('Puck')
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
        json: { prompt, voiceName },
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
      <div className="flex items-center gap-4">
        <Button onClick={onBack}>返回列表</Button>
        <h2 className="text-xl font-bold text-slate-800">{project.name}</h2>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-slate-800">Gemini TTS</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="font-medium text-slate-600">音色选择：</span>
            <Select
              value={voiceName}
              onChange={setVoiceName}
              className="w-80"
              optionLabelProp="label"
              dropdownMatchSelectWidth={false}
            >
              {voiceList.map((item) => (
                <Option key={item.name} value={item.name} label={item.name}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{item.name}</span>
                    <div className="flex gap-1">
                      <Tag color="blue" className="m-0 border-0">
                        {item.voice}
                      </Tag>
                      <Tag
                        color={item.gender === '男' ? 'cyan' : 'magenta'}
                        className="m-0 border-0"
                      >
                        {item.gender}
                      </Tag>
                    </div>
                  </div>
                </Option>
              ))}
            </Select>
          </div>
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
