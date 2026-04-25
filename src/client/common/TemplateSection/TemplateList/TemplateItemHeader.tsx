import { Button, Popconfirm, Space, Tag, message, Tooltip } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import { useGlobalStore } from '../../../store/global'
import { openSettingModal } from '../../../common/SettingModal'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { useTasks } from '../../../hooks/useTasks'
import { useTemplates } from '../../../hooks/useTemplates'
import openaiIcon from '../../../assets/icon/openai.svg'
import { TemplateEditButton } from './TemplateEditButton'
import { useLocalSetting } from '../../../hooks/useLocalSetting'
import type { GptImageSize } from '../../../../server/module/gpt-image/enum'

const client = hc<AppType>('/')

export const TemplateItemHeader = ({
  template
}: {
  template: TaskTemplate
}) => {
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const { refresh } = useTasks()
  const { refresh: refreshTemplates } = useTemplates()
  const { gptImageSettings } = useLocalSetting()

  const doGenerate = async (templateId: string, size: GptImageSize) => {
    message.success('任务提交成功')
    // give server some time to create the task
    setTimeout(() => refresh(), 500)
    try {
      const res = await client.api.gptImage.generate.$post({
        json: {
          templateId,
          size,
          quality: gptImageSettings.quality
        }
      })
      const data = await res.json()
      if (data.success && 'image' in data && data.image) {
        message.success('生成图片成功')
      } else {
        message.error((data as any).error || '生成失败')
      }
    } catch (error) {
      message.error('请求失败')
    } finally {
      refresh()
    }
  }

  const handleGenerate = (templateId: string, size: GptImageSize) => {
    const apiKey = gptImageApiKey
    if (!apiKey) {
      openSettingModal({
        initialTab: 'gpt-image',
        onSuccess: () => {
          doGenerate(templateId, size)
        }
      })
      return
    }

    doGenerate(templateId, size)
  }

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
    <div className="flex justify-between items-center">
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
      </Space>
      <div className="flex gap-1 items-center">
        {template.usageType === 'image' && (
          <>
            {gptImageSettings.enable1K && (
              <Tooltip title="GPTImage2 生成 1K 图">
                <Button
                  type="text"
                  className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center px-2!"
                  icon={<img src={openaiIcon} className="w-4 h-4 opacity-70" />}
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
                  className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center px-2!"
                  icon={<img src={openaiIcon} className="w-4 h-4 opacity-70" />}
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
                  className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center px-2!"
                  icon={<img src={openaiIcon} className="w-4 h-4 opacity-70" />}
                  onClick={() => handleGenerate(template.id, '4k')}
                >
                  4K
                </Button>
              </Tooltip>
            )}
          </>
        )}
        <TemplateEditButton template={template} />
        <Popconfirm
          title="确定要删除该模板吗？"
          onConfirm={() => handleDelete(template.id)}
          okText="确定"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Tooltip title="删除模板">
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      </div>
    </div>
  )
}
