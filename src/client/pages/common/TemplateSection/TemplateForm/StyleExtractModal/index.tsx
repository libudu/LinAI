import {
  CopyOutlined,
  ExperimentOutlined,
  InboxOutlined,
  PictureOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Skeleton,
  Spin,
  Upload,
  message,
} from 'antd'
import type { UploadProps } from 'antd'
import { hc } from 'hono/client'
import { useCallback, useState } from 'react'
import type { AppType } from '../../../../../../server'
import type { StyleAnalysis } from '../../../../../../server/api/style-analyze'

const client = hc<AppType>('/')

interface DimensionDef {
  key: keyof StyleAnalysis
  label: string
  hint: string
}

const STYLE_DIMENSIONS: DimensionDef[] = [
  { key: 'media_style', label: '媒介与风格', hint: '整体媒介、艺术风格、载体形式' },
  { key: 'camera_lens', label: '镜头与视角', hint: '拍摄视角、镜头类型、取景方式' },
  { key: 'composition', label: '构图', hint: '画面布局、主体位置、画幅比例' },
  { key: 'color_palette', label: '色彩与色调', hint: '主色调、饱和度、冷暖倾向' },
  { key: 'lighting', label: '光影', hint: '光源方向、光质、阴影特点' },
  { key: 'texture_effects', label: '质感与特效', hint: '噪点、颗粒、扫描线、暗角等后期效果' },
  { key: 'subject_main', label: '主体描述', hint: '核心主体外貌、形态、动作、表情' },
  { key: 'subject_detail', label: '主体细节', hint: '穿戴、材质、妆容等细部刻画' },
  { key: 'environment', label: '环境与背景', hint: '场景、地点、物件、天气' },
  { key: 'ui_text', label: '文字与UI', hint: '画面中的文字、字幕、界面元素' },
  { key: 'atmosphere', label: '氛围与情绪', hint: '整体心理感受、情绪关键词' },
  { key: 'art_reference', label: '艺术参考', hint: '关联的艺术家、作品、文化符号' },
]

const EMPTY_ANALYSIS: StyleAnalysis = {
  media_style: '',
  camera_lens: '',
  composition: '',
  color_palette: '',
  lighting: '',
  texture_effects: '',
  subject_main: '',
  subject_detail: '',
  environment: '',
  ui_text: '',
  atmosphere: '',
  art_reference: '',
}

interface StyleExtractModalProps {
  open: boolean
  onClose: () => void
  onApply: (prompt: string) => void
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function composePrompt(
  analysis: StyleAnalysis,
  selections: Set<keyof StyleAnalysis>,
): string {
  return STYLE_DIMENSIONS
    .map((dim) => {
      if (!selections.has(dim.key)) return null
      const value = analysis[dim.key].trim()
      return value || null
    })
    .filter((v): v is string => v !== null)
    .join('，')
}

function isUploadedImageUrl(url: string): boolean {
  return url.startsWith('/api/static/images/input/')
}

export function StyleExtractModal({
  open,
  onClose,
  onApply,
}: StyleExtractModalProps) {
  const [messageApi, contextHolder] = message.useMessage()

  // Upload state
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // Analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Editing state
  const [selections, setSelections] = useState<Set<keyof StyleAnalysis>>(
    () => new Set(STYLE_DIMENSIONS.map((d) => d.key)),
  )
  const [editedValues, setEditedValues] = useState<StyleAnalysis>(EMPTY_ANALYSIS)

  // Compose state
  const [composedPrompt, setComposedPrompt] = useState('')
  const [analyzedOnce, setAnalyzedOnce] = useState(false)

  // Reset on open
  const handleClose = useCallback(() => {
    if (analyzing) return
    setUploadedUrl(null)
    setUploadedPreview(null)
    setUploading(false)
    setAnalyzing(false)
    setAnalysisError(null)
    setSelections(new Set(STYLE_DIMENSIONS.map((d) => d.key)))
    setEditedValues(EMPTY_ANALYSIS)
    setComposedPrompt('')
    setAnalyzedOnce(false)
    onClose()
  }, [analyzing, onClose])

  // Upload handler
  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const file = options.file as File
    setUploading(true)
    setAnalysisError(null)

    try {
      const base64 = await readFileAsBase64(file)
      setUploadedPreview(base64)

      const res = await client.api.static.images.upload.$post({
        json: { image: base64 },
      })
      const data = await res.json()

      if (!data.success || !('url' in data)) {
        const errorMsg =
          typeof (data as { error?: string }).error === 'string'
            ? (data as { error: string }).error
            : '图片上传失败'
        throw new Error(errorMsg)
      }

      const url = (data as { url: string }).url
      setUploadedUrl(url)
      messageApi.success('图片上传成功')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '上传失败'
      messageApi.error(msg)
    } finally {
      setUploading(false)
      options.onSuccess?.({})
    }
  }

  // Analyze handler
  const handleAnalyze = async () => {
    if (!uploadedUrl || !isUploadedImageUrl(uploadedUrl)) {
      messageApi.warning('请先上传一张图片')
      return
    }

    setAnalyzing(true)
    setAnalysisError(null)

    try {
      const res = await client.api['style-analyze'].analyze.$post({
        json: { imageUrl: uploadedUrl },
      })
      const data = await res.json()

      if (!data.success) {
        const errorMsg = 'error' in data ? String(data.error) : '解析失败'
        throw new Error(errorMsg)
      }

      const result = 'data' in data ? (data.data as StyleAnalysis) : EMPTY_ANALYSIS
      setEditedValues(result)
      setSelections(new Set(STYLE_DIMENSIONS.map((d) => d.key)))
      setComposedPrompt('')
      setAnalyzedOnce(true)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '解析请求失败'
      setAnalysisError(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  // Toggle dimension selection
  const handleToggleDimension = (key: keyof StyleAnalysis, checked: boolean) => {
    setSelections((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  // Edit dimension value
  const handleEditDimension = (key: keyof StyleAnalysis, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }))
  }

  // Compose
  const handleCompose = () => {
    const combined = composePrompt(editedValues, selections)
    if (!combined) {
      messageApi.warning('请至少勾选一项维度，且确保内容非空')
      return
    }
    setComposedPrompt(combined)
  }

  // Copy
  const handleCopy = () => {
    if (!composedPrompt) return
    navigator.clipboard.writeText(composedPrompt).then(
      () => messageApi.success('已复制到剪贴板'),
      () => messageApi.error('复制失败'),
    )
  }

  // Apply
  const handleApply = () => {
    if (!composedPrompt) return
    onApply(composedPrompt)
  }

  return (
    <>
      {contextHolder}
      <Modal
        title="图片风格提取"
        open={open}
        onCancel={handleClose}
        destroyOnHidden
        width={800}
        footer={
          <div className="flex justify-end gap-3">
            <Button onClick={handleClose} disabled={analyzing}>
              取消
            </Button>
            <Button
              type="primary"
              icon={<CopyOutlined />}
              onClick={handleCopy}
              disabled={!composedPrompt}
            >
              复制提示词
            </Button>
            <Button
              type="primary"
              onClick={handleApply}
              disabled={!composedPrompt}
            >
              直接覆盖原提示词
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {/* Upload area */}
          <Card
            size="small"
            title={
              <span className="text-sm font-medium text-slate-700">
                <PictureOutlined className="mr-2" />
                上传图片
              </span>
            }
            className="border-slate-200 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <Upload.Dragger
                customRequest={handleUpload}
                showUploadList={false}
                accept="image/jpeg,image/png,image/webp"
                disabled={analyzing}
                className="shrink-0"
                style={{ width: 200, height: 140 }}
              >
                {uploadedPreview ? (
                  <img
                    src={uploadedPreview}
                    alt="preview"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-2">
                    {uploading ? (
                      <Spin />
                    ) : (
                      <InboxOutlined className="text-2xl text-slate-300" />
                    )}
                    <p className="text-xs text-slate-400">
                      {uploading ? '上传中...' : '点击或拖拽上传图片'}
                    </p>
                  </div>
                )}
              </Upload.Dragger>

              <div className="flex flex-1 flex-col justify-center gap-2">
                <p className="text-xs text-slate-500">
                  支持 JPG / PNG / WebP 格式，上传后点击「开始解析」自动分析画风构成
                </p>
                <Button
                  type="primary"
                  icon={<ExperimentOutlined />}
                  onClick={handleAnalyze}
                  loading={analyzing}
                  disabled={!uploadedUrl}
                >
                  {analyzing ? '解析中...' : '开始解析'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Dimension cards */}
          <div>
            <h4 className="mb-3 text-sm font-medium text-slate-700">
              <ThunderboltOutlined className="mr-2" />
              画风维度 ({STYLE_DIMENSIONS.length})
            </h4>

            {analyzing ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} active paragraph={{ rows: 1 }} />
                ))}
              </div>
            ) : analysisError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center">
                <p className="mb-3 text-sm text-red-600">{analysisError}</p>
                <Button
                  size="small"
                  onClick={() => {
                    setAnalysisError(null)
                    handleAnalyze()
                  }}
                >
                  重试
                </Button>
              </div>
            ) : !analyzedOnce ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
                上传图片并点击"开始解析"后，结果将展示在此处
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {STYLE_DIMENSIONS.map((dim) => {
                  const value = editedValues[dim.key] ?? ''
                  const checked = selections.has(dim.key)

                  return (
                    <Card
                      key={dim.key}
                      size="small"
                      className="border-slate-200 shadow-sm"
                      styles={{ body: { padding: '10px 12px' } }}
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={checked}
                          onChange={(e) =>
                            handleToggleDimension(dim.key, e.target.checked)
                          }
                          className="pt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 text-xs font-medium text-slate-600">
                            {dim.label}
                          </div>
                          <Input.TextArea
                            value={value}
                            onChange={(e) =>
                              handleEditDimension(dim.key, e.target.value)
                            }
                            placeholder="（空）"
                            autoSize={{ minRows: 1, maxRows: 3 }}
                            className="text-xs"
                            style={{ resize: 'none', fontSize: 12 }}
                          />
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Compose + preview area */}
          {analyzedOnce && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-700">生成提示词</h4>
                <Button
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={handleCompose}
                >
                  拼接
                </Button>
              </div>
              <Input.TextArea
                value={composedPrompt}
                onChange={(e) => setComposedPrompt(e.target.value)}
                autoSize={{ minRows: 4, maxRows: 8 }}
                placeholder="点击「拼接」按钮生成提示词，也可直接在下方编辑"
                style={{ resize: 'vertical' }}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
