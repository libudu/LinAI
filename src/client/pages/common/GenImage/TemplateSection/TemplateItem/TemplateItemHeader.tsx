import { FlatTemplate } from '@/shared/image/template'
import { DeleteOutlined, HolderOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Space, Tag, Tooltip } from 'antd'
import React from 'react'
import { ImageGenerateDropdown } from '../../components/ImageGenerateDropdown'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { deleteTemplate } from '../../service/templates'
import { useGptImageStore } from '../../store'
import { useTemplates } from '../hooks/useTemplates'
import { TemplateEditButton } from './TemplateItemEditButton'

export const TemplateItemGenerateButtons: React.FC<{
  template: FlatTemplate
}> = ({ template }) => {
  const { generate } = useImageGeneration()
  return (
    <ImageGenerateDropdown
      onGenerate={(size) => generate(template, size)}
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
  const isComfy = useGptImageStore(
    (state) => state.gptImageEndpointKind === 'comfyui',
  )

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
          {!isComfy && template.aspectRatio && (
            <Tag color="blue" className="m-0">
              {template.aspectRatio}
            </Tag>
          )}
          {!isComfy && template.n && template.n > 1 && (
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
