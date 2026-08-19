import { CopyOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { Button, Modal, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  extractVisionText,
  visionChatCompletion,
} from '@/client/service/vision'
import { EMPTY_ANALYSIS, STYLE_DIMENSIONS, composePrompt } from './dimensions'
import { DimensionSection } from './DimensionSection'
import { PreviewSection } from './PreviewSection'
import { UploadSection } from './UploadSection'
import { parseStyleAnalysis } from './parse'
import { STYLE_ANALYSIS_PROMPT } from './prompt'
import type { StyleAnalysis } from './types'
import { readFileAsBase64 } from './utils'

interface StyleExtractModalProps {
  open: boolean
  onClose: () => void
  onApply: (prompt: string) => void
}

export function StyleExtractModal({
  open,
  onClose,
  onApply,
}: StyleExtractModalProps) {
  const [messageApi, contextHolder] = message.useMessage()

  // 上传状态
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // 解析状态
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analyzedOnce, setAnalyzedOnce] = useState(false)

  // 编辑状态
  const [selections, setSelections] = useState<Set<keyof StyleAnalysis>>(
    () => new Set(STYLE_DIMENSIONS.map((d) => d.key)),
  )
  const [editedValues, setEditedValues] =
    useState<StyleAnalysis>(EMPTY_ANALYSIS)
  const [composedPrompt, setComposedPrompt] = useState('')
  const [manualEdit, setManualEdit] = useState(false)

  // 维度勾选或内容变化时自动拼接（用户手动编辑过预览后停止同步）
  const autoComposed = useMemo(
    () => composePrompt(editedValues, selections),
    [editedValues, selections],
  )
  useEffect(() => {
    if (!manualEdit && autoComposed) {
      setComposedPrompt(autoComposed)
    }
  }, [autoComposed, manualEdit])

  // 关闭时重置全部状态
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
    setManualEdit(false)
    onClose()
  }, [analyzing, onClose])

  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const file = options.file as File
    setUploading(true)
    setAnalysisError(null)

    try {
      const base64 = await readFileAsBase64(file)
      setUploadedPreview(base64)

      const res = await fetch('/api/static/images/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
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
      options.onSuccess?.({})
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '上传失败'
      messageApi.error(msg)
      options.onError?.(error instanceof Error ? error : new Error(msg))
    } finally {
      setUploading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!uploadedUrl || !uploadedPreview) {
      messageApi.warning('请先上传一张图片')
      return
    }

    setAnalyzing(true)
    setAnalysisError(null)

    try {
      const data = await visionChatCompletion({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: uploadedPreview },
              },
              {
                type: 'text',
                text: STYLE_ANALYSIS_PROMPT,
              },
            ],
          },
        ],
      })
      const content = extractVisionText(data)
      if (!content) throw new Error('未获取到图片风格分析结果')
      const result = parseStyleAnalysis(content)

      setEditedValues(result)
      setSelections(new Set(STYLE_DIMENSIONS.map((d) => d.key)))
      setManualEdit(false)
      setAnalyzedOnce(true)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '解析请求失败'
      setAnalysisError(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleToggleDimension = (key: keyof StyleAnalysis) => {
    setSelections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleEditDimension = (key: keyof StyleAnalysis, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }))
  }

  // 按当前勾选的维度重新拼接，覆盖手动编辑
  const handleReset = () => {
    const combined = composePrompt(editedValues, selections)
    if (!combined) {
      messageApi.warning('请至少勾选一项有内容的维度')
      return
    }
    setManualEdit(false)
    setComposedPrompt(combined)
  }

  const handleCopy = () => {
    if (!composedPrompt) return
    navigator.clipboard.writeText(composedPrompt).then(
      () => messageApi.success('已复制到剪贴板'),
      () => messageApi.error('复制失败'),
    )
  }

  const handleApply = () => {
    if (!composedPrompt) return
    onApply(composedPrompt)
  }

  const hasAnalysis = analyzedOnce && !analysisError

  return (
    <>
      {contextHolder}
      <Modal
        title="图片风格提取"
        open={open}
        onCancel={handleClose}
        destroyOnHidden
        width={760}
        footer={
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              分析图片画风，生成可直接用于生图的提示词
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleClose} disabled={analyzing}>
                取消
              </Button>
              <Button
                onClick={handleCopy}
                disabled={!composedPrompt}
                icon={<CopyOutlined />}
              >
                复制
              </Button>
              <Button
                type="primary"
                onClick={handleApply}
                disabled={!composedPrompt}
              >
                应用
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          <UploadSection
            uploading={uploading}
            analyzing={analyzing}
            uploadedUrl={uploadedUrl}
            uploadedPreview={uploadedPreview}
            onUpload={handleUpload}
            onAnalyze={handleAnalyze}
          />

          <div className="border-t border-gray-100" />

          <DimensionSection
            analyzing={analyzing}
            analysisError={analysisError}
            analyzedOnce={analyzedOnce}
            selections={selections}
            editedValues={editedValues}
            onToggle={handleToggleDimension}
            onEdit={handleEditDimension}
            onRetry={() => {
              setAnalysisError(null)
              handleAnalyze()
            }}
          />

          <div className="border-t border-gray-100" />

          <PreviewSection
            analyzedOnce={analyzedOnce}
            hasAnalysis={hasAnalysis}
            composedPrompt={composedPrompt}
            onReset={handleReset}
            onChange={(value) => {
              setComposedPrompt(value)
              setManualEdit(true)
            }}
          />
        </div>
      </Modal>
    </>
  )
}
