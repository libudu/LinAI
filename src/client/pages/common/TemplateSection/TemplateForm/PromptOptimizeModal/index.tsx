import { EditOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Image as AntImage, Button, Input, Modal, message } from 'antd'
import classNames from 'classnames'
import { hc } from 'hono/client'
import { useEffect, useMemo, useState } from 'react'
import type { AppType } from '../../../../../../server'
import { PromptTemplateEditModal } from './PromptTemplateEditModal'

const client = hc<AppType>('/')

export const PROMPT_OPTIMIZE_MODEL = 'gemini-3.1-flash-lite'
export const DEFAULT_PROMPT_TEMPLATE = `
# 生图提示词优化模板

你是一个生图提示词优化助手。你的任务是把用户提供的想法、简短描述、已有 prompt，整理为一版清晰、具体、可直接复制使用的高质量生图提示词。

## 目标

- 优先保留用户原意，不擅自改动核心设定。
- 把模糊表达补全为明确的视觉语言，减少歧义和空泛描述。
- 输出结果尽量包含主体、外观、场景、动作或状态、构图、光线、风格、质感与细节。
- 如果用户已有 prompt，在保留核心内容的前提下提升一致性、细节密度和可执行性。

## 优化原则

- 主体明确：人物、物体、动物或核心主题要清楚。
- 外观具体：补充服饰、材质、颜色、年龄、气质、造型等可见特征。
- 场景完整：如果有必要，补充环境、时间、天气、空间关系和背景元素。
- 构图清晰：优先明确近景、半身、全身、远景、特写、俯拍、仰拍、居中、对称等信息。
- 光线与风格具体：尽量把“高级感”“唯美”“电影感”改成可执行的视觉描述。
- 细节适度：补全必要信息，但不要无根据地添加过多剧情。
- 默认输出中文；如果用户明确要求英文，则输出自然简洁的英文 prompt。
- 默认不输出负面提示词，不伪造特定模型参数，除非用户明确要求。
- 多行分点列举，结果易于理解和二次修改

## 处理规则

- 直接输出优化后的纯文本生图提示词，不要使用 markdown，不要添加任何生图提示词以外的说明、垫话。
- 如果信息不完整，合理补全，基于常见高质量画面表达直接优化，并尽量保持设定稳定。
- 如果用户要求中有明显敏感、露骨或容易触发审核限制的表达，在尽量保留画面效果的前提下，自动改写为更隐晦、更易过审的视觉描述，但不能完全删除省略相关描述。

## 输出要求

- 默认直接输出可复制结果，不写大段分析。
- 除非确有必要，不额外添加说明。
- 只输出提示词正文。

默认输出格式：

[优化后的完整提示词]

## 用户要求

{{ USER_PROMPT }}
`.trim()
const PROMPT_TEMPLATE_STORAGE_KEY = 'prompt-optimize-template'
const PROMPT_USAGE_TIPS = [
  '输入提示词可以按照生文的风格编写提出要求，而不仅仅是生图的提示词的具体直白风格',
  '生成的提示词并不总是好用，可能造成过拟合，建议对生成的提示词进行人工校对和修改',
]

interface PromptOptimizeModalProps {
  open: boolean
  prompt: string
  imageUrls: string[]
  onClose: () => void
  onApply: (optimizedPrompt: string) => void
}

function PreviewImages({
  imageUrls,
  height = 120,
}: {
  imageUrls: string[]
  height?: number
}) {
  if (imageUrls.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        当前没有输入图片
      </div>
    )
  }

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {imageUrls.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm"
          style={{ width: 80, height }}
        >
          <AntImage
            src={url}
            alt={`prompt-optimize-preview-${index}`}
            width={80}
            height={height}
            className="object-cover"
            preview={{ src: url }}
          />
        </div>
      ))}
    </div>
  )
}

function extractOptimizedPrompt(data: any) {
  const content = data?.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function extractErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error.trim()
  }

  if (error instanceof Error) {
    return error.message.trim()
  }

  if (!error || typeof error !== 'object') {
    return ''
  }

  const errorRecord = error as {
    error?: unknown
    message?: unknown
  }

  if (typeof errorRecord.error === 'string') {
    return errorRecord.error.trim()
  }

  if (
    errorRecord.error &&
    typeof errorRecord.error === 'object' &&
    typeof (errorRecord.error as { message?: unknown }).message === 'string'
  ) {
    return (errorRecord.error as { message: string }).message.trim()
  }

  if (typeof errorRecord.message === 'string') {
    return errorRecord.message.trim()
  }

  return ''
}

export function PromptOptimizeModal({
  open,
  prompt,
  imageUrls,
  onClose,
  onApply,
}: PromptOptimizeModalProps) {
  const [messageApi, contextHolder] = message.useMessage()
  const [sourcePrompt, setSourcePrompt] = useState(prompt)
  const [optimizedPrompt, setOptimizedPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [promptTemplate = DEFAULT_PROMPT_TEMPLATE, setPromptTemplate] =
    useLocalStorageState(PROMPT_TEMPLATE_STORAGE_KEY, {
      defaultValue: DEFAULT_PROMPT_TEMPLATE,
    })

  useEffect(() => {
    if (open) {
      setSourcePrompt(prompt)
      setOptimizedPrompt('')
    }
  }, [open, prompt])

  const renderedTemplate = useMemo(
    () => promptTemplate.replace('{{ USER_PROMPT }}', sourcePrompt),
    [promptTemplate, sourcePrompt],
  )

  const handleGenerate = async () => {
    const trimmedPrompt = sourcePrompt.trim()
    if (!trimmedPrompt) {
      messageApi.warning('请先填写原始提示词')
      return
    }

    setGenerating(true)
    try {
      const res = await client.api.chat.completions.$post({
        json: {
          model: PROMPT_OPTIMIZE_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: renderedTemplate,
                },
                ...imageUrls.map((url) => ({
                  type: 'image_url' as const,
                  image_url: { url },
                })),
              ],
            },
          ],
        },
      })

      const data = await res.json()
      if (!res.ok) {
        messageApi.error(extractErrorMessage(data) || '提示词优化失败')
        return
      }

      const nextPrompt = extractOptimizedPrompt(data)
      if (!nextPrompt) {
        messageApi.error('未获取到优化后的提示词')
        return
      }

      setOptimizedPrompt(nextPrompt)
      messageApi.success('提示词优化成功')
    } catch (error) {
      messageApi.error(extractErrorMessage(error) || '提示词优化请求失败')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      {contextHolder}
      <Modal
        title="提示词优化"
        open={open}
        onCancel={() => {
          if (!generating) {
            onClose()
          }
        }}
        destroyOnHidden
        width={720}
        footer={
          <div className="flex justify-end gap-3">
            <Button onClick={onClose} disabled={generating}>
              取消
            </Button>
            <Button
              type={optimizedPrompt ? 'default' : 'primary'}
              onClick={handleGenerate}
              loading={generating}
            >
              生成
            </Button>
            <Button
              type={optimizedPrompt ? 'primary' : 'default'}
              onClick={() => onApply(optimizedPrompt)}
              disabled={!optimizedPrompt || generating}
            >
              应用
            </Button>
          </div>
        }
      >
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">
              原始提示词和输入图片
            </div>
            <Input.TextArea
              value={sourcePrompt}
              onChange={(event) => setSourcePrompt(event.target.value)}
              autoSize={{
                minRows: 2,
                maxRows: 4,
              }}
              placeholder="请输入原始提示词"
              style={{ resize: 'none' }}
            />
            <div className="mt-3 hidden items-center justify-between gap-3 md:flex">
              {imageUrls.length > 0 && (
                <div className="shrink-0">
                  <PreviewImages height={100} imageUrls={imageUrls} />
                </div>
              )}
              <div
                className={classNames(
                  'flex-1 text-xs leading-6 text-slate-500',
                  { 'max-w-68': imageUrls.length > 0 },
                )}
              >
                {PROMPT_USAGE_TIPS.map((tip, index) => (
                  <div key={tip}>
                    {index + 1}. {tip}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-700">
                提示词优化模板
              </div>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setTemplateModalOpen(true)}
              >
                修改优化模板
              </Button>
            </div>
            <Input.TextArea
              value={promptTemplate}
              disabled
              rows={4}
              style={{ resize: 'none' }}
            />
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">
              优化结果
            </div>
            <Input.TextArea
              value={optimizedPrompt}
              onChange={(event) => setOptimizedPrompt(event.target.value)}
              autoSize={{
                minRows: 4,
                maxRows: 6,
              }}
              placeholder="点击生成后展示优化后的提示词"
              style={{ resize: 'none' }}
            />
          </div>
        </div>
      </Modal>
      <PromptTemplateEditModal
        open={templateModalOpen}
        template={promptTemplate}
        defaultTemplate={DEFAULT_PROMPT_TEMPLATE}
        onClose={() => setTemplateModalOpen(false)}
        onSave={setPromptTemplate}
      />
    </>
  )
}
