import { DeleteOutlined, HolderOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Space, Tag, Tooltip } from 'antd'
import { hc } from 'hono/client'
import React from 'react'
import type { AppType } from '../../../../server'
import { TaskTemplate } from '../../../../server/common/template-manager'
import type { GptImageSize } from '../../../../server/module/gpt-image/enum'
import openaiIcon from '../../../assets/icon/openai.svg'
import { useLocalSetting } from '../../../hooks/useLocalSetting'
import { useTemplates } from '../../../hooks/useTemplates'
import { useGlobalStore } from '../../../store/global'
import { openSettingModal } from '../../SettingModal'
import { TemplateEditButton } from './TemplateItemEditButton'

const client = hc<AppType>('/')

export const TemplateItemGenerateButtons: React.FC<{
  template: TaskTemplate
}> = ({ template }) => {
  const { gptImageSettings } = useLocalSetting()
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)

  const doGenerate = async (templateId: string, size: GptImageSize) => {
    message.success('任务提交成功')
    try {
      await client.api.gptImage.generate.$post({
        json: {
          templateId,
          size,
          quality: gptImageSettings.quality,
        },
      })
    } catch (error) {
      message.error('请求失败')
    }
  }

  const handleGenerate = (templateId: string, size: GptImageSize) => {
    const apiKey = gptImageApiKey
    if (!apiKey) {
      openSettingModal({
        initialTab: 'gpt-image',
        onSuccess: () => {
          doGenerate(templateId, size)
        },
      })
      return
    }

    doGenerate(templateId, size)
  }
  return (
    template.usageType === 'image' && (
      <>
        {gptImageSettings.enable1K && (
          <Tooltip title="GPTImage2 生成 1K 图">
            <Button
              type="text"
              className="flex items-center justify-center px-2! text-slate-500 hover:bg-purple-50 hover:text-purple-600"
              icon={<img src={openaiIcon} className="h-4 w-4 opacity-70" />}
              onClick={() => handleGenerate(template.id, '1k')}
            >
              1K
            </Button>
          </Tooltip>
        )}
        {gptImageSettings.enable2K && (
          <Tooltip title="GPTImage2 生成 2K 图">
            <Button
              type="text"
              className="flex items-center justify-center px-2! text-slate-500 hover:bg-purple-50 hover:text-purple-600"
              icon={<img src={openaiIcon} className="h-4 w-4 opacity-70" />}
              onClick={() => handleGenerate(template.id, '2k')}
            >
              2K
            </Button>
          </Tooltip>
        )}
        {gptImageSettings.enable4K && (
          <Tooltip title="GPTImage2 生成 4K 图">
            <Button
              type="text"
              className="flex items-center justify-center px-2! text-slate-500 hover:bg-purple-50 hover:text-purple-600"
              icon={<img src={openaiIcon} className="h-4 w-4 opacity-70" />}
              onClick={() => handleGenerate(template.id, '4k')}
            >
              4K
            </Button>
          </Tooltip>
        )}
      </>
    )
  )
}

export const TemplateItemHeader = ({
  template,
  draggable,
}: {
  template: TaskTemplate
  draggable: boolean
}) => {
  const { refresh: refreshTemplates } = useTemplates()

  const handleDelete = async (id: string) => {
    try {
      const res = await client.api.template[':id'].$delete({ param: { id } })
      const json = await res.json()
      if (json.success) {
        message.success('删除成功')
        refreshTemplates()
      } else {
        message.error(json.error || '删除失败')
      }
    } catch (error) {
      message.error('请求失败')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Space size={4}>
          <Tag
            color={template.usageType === 'image' ? 'blue' : 'purple'}
            className="m-0"
          >
            {template.usageType === 'image' ? '图片' : '视频'}
          </Tag>
          {template.aspectRatio && (
            <Tag color="default" className="m-0">
              {template.aspectRatio}
            </Tag>
          )}
          <div className="hidden sm:flex">
            <TemplateItemGenerateButtons template={template} />
          </div>
        </Space>
        <div className="flex items-center gap-1">
          <TemplateEditButton template={template} />
          <Popconfirm
            title="确定要删除该模板吗？"
            onConfirm={() => handleDelete(template.id)}
            okText="确定"
            cancelText="取消"
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
