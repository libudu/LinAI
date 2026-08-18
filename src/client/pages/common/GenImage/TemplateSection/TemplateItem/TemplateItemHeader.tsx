import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import type { AppType } from '@/server'
import type { GptImageSize } from '@/server/module/gpt-image/enum'
import { FlatTemplate } from '@/shared/image/template'
import { DeleteOutlined, HolderOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Space, Tag, Tooltip } from 'antd'
import { hc } from 'hono/client'
import React from 'react'
import { ImageGenerateDropdown } from '../../components/ImageGenerateDropdown'
import { deleteTemplate } from '../../service/templates'
import { openGPTImageSettingModal } from '../../SettingModal'
import { useGptImageStore } from '../../store'
import { useTemplates } from '../hooks/useTemplates'
import { TemplateEditButton } from './TemplateItemEditButton'

const client = hc<AppType>('/')

export const TemplateItemGenerateButtons: React.FC<{
  template: FlatTemplate
}> = ({ template }) => {
  const { gptImageSettings, appendAspectRatio } = useLocalSetting()
  const gptImageApiKey = useGptImageStore((state) => state.gptImageApiKey)

  const doGenerate = async (template: FlatTemplate, size: GptImageSize) => {
    try {
      const res = await client.api.gptImage.generate.$post({
        json: {
          // 提交完整模板快照，后端不再依赖模板存储
          input: {
            title: template.title,
            prompt: template.prompt,
            images: template.images || [],
            aspectRatio: template.aspectRatio,
            n: template.n,
          },
          size,
          quality: gptImageSettings.quality,
          appendAspectRatio,
        },
      })
      const data = await res.json()
      if (!data.success) {
        message.error(data.error || '生图失败')
        return
      }
      message.success('任务提交成功')
    } catch (error) {
      const msg = error instanceof Error ? error.message : '请求失败'
      message.error(`[网络] ${msg}`)
    }
  }

  const handleGenerate = (template: FlatTemplate, size: GptImageSize) => {
    const apiKey = gptImageApiKey
    if (!apiKey) {
      openGPTImageSettingModal({
        initialTab: 'endpoint',
        onSuccess: () => {
          doGenerate(template, size)
        },
      })
      return
    }

    doGenerate(template, size)
  }
  return (
    <ImageGenerateDropdown
      onGenerate={(size) => handleGenerate(template, size)}
      size="small"
      className="max-w-56"
    />
  )
}

export const TemplateItemHeader = ({
  template,
  draggable,
}: {
  template: FlatTemplate
  draggable: boolean
}) => {
  const { refresh: refreshTemplates } = useTemplates()

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id)
      message.success('删除成功')
      refreshTemplates()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Space size={4}>
          {template.aspectRatio && (
            <Tag color="blue" className="m-0">
              {template.aspectRatio}
            </Tag>
          )}
          {template.n && template.n > 1 && (
            <Tag color="cyan" className="m-0">
              {template.n}张
            </Tag>
          )}
          <div className="ml-2 hidden gap-2 sm:flex">
            <TemplateItemGenerateButtons template={template} />
          </div>
        </Space>
        <div className="flex items-center gap-1">
          <TemplateEditButton template={template} />
          <Popconfirm
            title="确定要删除该模板吗？"
            onConfirm={() => handleDelete(template.id)}
            okButtonProps={{ danger: true }}
            placement="bottom"
          >
            <Tooltip title="删除模板">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
          {draggable && (
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({ type: 'template', id: template.id }),
                )
                e.dataTransfer.effectAllowed = 'move'
              }}
              className="flex cursor-move items-center justify-center px-1 text-slate-400 transition-colors hover:text-slate-600"
            >
              <HolderOutlined />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
