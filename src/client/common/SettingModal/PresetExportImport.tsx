import { InboxOutlined } from '@ant-design/icons'
import { Button, Checkbox, Input, message, Modal, Spin, Typography } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../server'
import type { TaskTemplate } from '../../../server/common/template-manager'
import { useTemplates } from '../../hooks/useTemplates'
import type { PresetExportData } from '../../types/presetExport'

const client = hc<AppType>('/')
const { Text } = Typography

/**
 * 使用 base64 编码图片数据的模板接口
 */
interface TemplateWithBase64Images {
  id: string
  title?: string
  images: string[]
  prompt: string
  usageType: 'image' | 'video'
  aspectRatio?: string
  folder?: string
  n?: number
}

/**
 * 包含 base64 图片数据的预设导出文件结构
 */
interface PresetExportDataWithBase64 extends Omit<PresetExportData, 'templates'> {
  templates: TemplateWithBase64Images[]
}

/**
 * 预设导出/导入组件
 * 
 * 功能：
 * - 选择并导出模板为 JSON 文件（图片使用 base64 编码）
 * - 从 JSON 文件导入模板（自动将 base64 图片上传到服务器）
 */
export const PresetExportImport = () => {
  /** 所有模板数据 */
  const { data: templates = [], refresh } = useTemplates()
  /** 选中的模板 ID 集合 */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  /** 作者信息 */
  const [author, setAuthor] = useState('')
  /** 导出附言 */
  const [exportMessage, setExportMessage] = useState('')
  /** 导出进行中状态 */
  const [exporting, setExporting] = useState(false)

  /**
   * 全选/取消全选所有模板
   */
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(templates.map((t) => t.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  /**
   * 选中/取消选中单个模板
   */
  const handleSelectTemplate = (id: string, checked: boolean) => {
    const newIds = new Set(selectedIds)
    if (checked) {
      newIds.add(id)
    } else {
      newIds.delete(id)
    }
    setSelectedIds(newIds)
  }

  /**
   * 将图片 URL 数组转换为 base64 编码数组
   * 转换失败时保留原始 URL
   */
  const convertImagesToBase64 = async (
    imageUrls: string[],
  ): Promise<string[]> => {
    const base64Images: string[] = []

    for (const url of imageUrls) {
      try {
        const res = await client.api.static.images['to-base64'].$post({
          json: { url },
        })
        const json = await res.json()
        if (json.success && 'data' in json) {
          base64Images.push((json as any).data.base64)
        } else {
          console.warn(`Failed to convert image: ${url}`)
          base64Images.push(url)
        }
      } catch (error) {
        console.warn(`Error converting image ${url}:`, error)
        base64Images.push(url)
      }
    }

    return base64Images
  }

  /**
   * 处理导出操作
   * 将选中的模板图片转换为 base64 并生成 JSON 文件下载
   */
  const handleExport = async () => {
    if (selectedIds.size === 0) {
      message.warning('请至少选择一个模板')
      return
    }

    setExporting(true)

    try {
      const selectedTemplates = templates.filter((t) =>
        selectedIds.has(t.id),
      )

      const templatesWithBase64: TemplateWithBase64Images[] = []

      for (const template of selectedTemplates) {
        const base64Images =
          template.images.length > 0
            ? await convertImagesToBase64(template.images)
            : []

        templatesWithBase64.push({
          ...template,
          images: base64Images,
        })
      }

      const exportData: PresetExportDataWithBase64 = {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        author: author.trim() || undefined,
        message: exportMessage.trim() || undefined,
        templates: templatesWithBase64,
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `linai-templates-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)

      message.success(`已导出 ${selectedTemplates.length} 个模板`)
    } finally {
      setExporting(false)
    }
  }

  /**
   * 将 base64 图片上传到服务器
   * @param base64 base64 编码的图片数据
   * @returns 上传成功返回服务器 URL，失败返回 null
   */
  const uploadBase64Image = async (base64: string): Promise<string | null> => {
    try {
      const res = await client.api.static.images.upload.$post({
        json: { image: base64 },
      })
      const json = await res.json()
      if (json.success && 'url' in json) {
        return (json as any).url as string
      }
      return null
    } catch (error) {
      console.error('Failed to upload image:', error)
      return null
    }
  }

  /**
   * 处理导入操作
   * 读取 JSON 文件，预验证并显示确认弹窗，确认后逐个导入模板
   */
  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as PresetExportDataWithBase64

      if (
        !data.version ||
        !Array.isArray(data.templates) ||
        data.templates.length === 0
      ) {
        message.error('文件格式无效或文件为空')
        return
      }

      const res = await client.api.template.$get()
      const json = await res.json()
      if (!json.success) {
        message.error('获取现有模板失败')
        return
      }

      const existingTemplates: TaskTemplate[] = json.data
      const existingIds = new Set(existingTemplates.map((t) => t.id))

      const toImport = data.templates.filter((t) => !existingIds.has(t.id))
      const toSkip = data.templates.filter((t) => existingIds.has(t.id))

      Modal.confirm({
        title: '导入模板',
        width: 600,
        content: (
          <div>
            <p className="mb-2">📁 文件包含 {data.templates.length} 个模板</p>
            {data.author && (
              <p className="mb-1">👤 作者：{data.author}</p>
            )}
            {data.message && (
              <p className="mb-2">💬 附言：{data.message}</p>
            )}
            <div className="my-3">
              <p className="text-green-600">
                将导入 {toImport.length} 个模板
              </p>
              <p className="text-orange-500">
                跳过 {toSkip.length} 个已存在的模板
              </p>
            </div>
            {toSkip.length > 0 && (
              <div className="rounded-md bg-gray-50 p-3">
                <p className="mb-2 text-sm font-medium">跳过的模板：</p>
                <ul className="list-disc pl-5 text-sm text-gray-600">
                  {toSkip.map((t) => (
                    <li key={t.id}>{t.title || '未命名模板'}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ),
        onOk: async () => {
          let successCount = 0
          let failCount = 0

          for (const template of toImport) {
            try {
              const imageUrls: string[] = []

              for (const base64Image of template.images) {
                if (base64Image.startsWith('data:image')) {
                  const url = await uploadBase64Image(base64Image)
                  if (url) {
                    imageUrls.push(url)
                  }
                } else {
                  imageUrls.push(base64Image)
                }
              }

              const res = await client.api.template.$post({
                json: {
                  title: template.title,
                  images: imageUrls,
                  prompt: template.prompt,
                  usageType: template.usageType,
                  aspectRatio: template.aspectRatio,
                  folder: template.folder,
                  n: template.n,
                },
              })
              const json = await res.json()
              if (json.success) {
                successCount++
              } else {
                failCount++
              }
            } catch (error) {
              failCount++
            }
          }

          message.success(
            `导入完成：成功 ${successCount} 个，跳过 ${toSkip.length} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}`,
          )

          refresh()
        },
      })
    } catch (error) {
      message.error('导入失败：文件格式错误或文件已损坏')
    }
  }

  /**
   * 处理文件拖拽事件
   */
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (!file.name.endsWith('.json')) {
        message.error('请选择 .json 文件')
        return
      }
      await handleImport(file)
    }
  }

  /**
   * 处理文件选择事件
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      await handleImport(file)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-6 px-4 py-2">
      <div>
        <div className="mb-4 text-base font-medium">导出模板</div>

        {templates.length === 0 ? (
          <Text type="secondary">暂无模板可导出</Text>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <Checkbox
                checked={
                  selectedIds.size === templates.length &&
                  templates.length > 0
                }
                indeterminate={
                  selectedIds.size > 0 && selectedIds.size < templates.length
                }
                onChange={(e) => handleSelectAll(e.target.checked)}
              >
                全选/取消全选
              </Checkbox>
              <Text type="secondary" className="text-xs">
                已选择 {selectedIds.size} / {templates.length}
              </Text>
            </div>

            <div className="mb-4 max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
              {templates.map((template) => (
                <Checkbox
                  key={template.id}
                  checked={selectedIds.has(template.id)}
                  onChange={(e) =>
                    handleSelectTemplate(template.id, e.target.checked)
                  }
                  className="block"
                >
                  {template.title || '未命名模板'}
                </Checkbox>
              ))}
            </div>

            <div className="mb-3">
              <div className="mb-1 text-sm text-gray-500">
                作者信息（可选）
              </div>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="输入作者名称"
                maxLength={50}
              />
            </div>

            <div className="mb-4">
              <div className="mb-1 text-sm text-gray-500">附言（可选）</div>
              <Input.TextArea
                value={exportMessage}
                onChange={(e) => setExportMessage(e.target.value)}
                placeholder="输入附言，将在导入时显示"
                maxLength={200}
                rows={3}
              />
            </div>

            <Spin spinning={exporting}>
              <Button type="primary" onClick={handleExport} block>
                导出选中的模板 ({selectedIds.size})
              </Button>
            </Spin>
          </>
        )}
      </div>

      <div>
        <div className="mb-4 text-base font-medium">导入模板</div>

        <div
          className="rounded-md border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-blue-400"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <InboxOutlined className="mb-2 text-4xl text-gray-400" />
          <p className="mb-1 text-sm text-gray-500">拖拽文件到此处或</p>
          <label className="cursor-pointer text-sm text-blue-500 hover:text-blue-600">
            点击选择 JSON 文件
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
