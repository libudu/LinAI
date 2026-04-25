import { Button, Card, Popconfirm, Space, Tag, message, Tooltip } from 'antd'
import { DeleteOutlined, InboxOutlined } from '@ant-design/icons'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import { useGlobalStore } from '../../../store/global'
import { openSettingModal } from '../../../common/SettingModal'
import { ImageGroup } from './ImageGroup'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { useTasks } from '../../../hooks/useTasks'
import { useTemplates } from '../../../hooks/useTemplates'
import openaiIcon from '../../../assets/icon/openai.svg'
import { TemplateEditButton } from './TemplateEditButton'

const client = hc<AppType>('/')

interface TemplateItemListProps {
  filteredTemplates: TaskTemplate[]
}

const CardHeader = ({ template }: { template: TaskTemplate }) => {
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const { refresh } = useTasks()
  const { refresh: refreshTemplates } = useTemplates()

  const doGenerate = async (templateId: string, size: '1k' | '2k') => {
    message.success('任务提交成功')
    // give server some time to create the task
    setTimeout(() => refresh(), 500)
    try {
      const res = await client.api.gptImage.generate.$post({
        json: {
          templateId,
          size
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

  const handleGenerate = (templateId: string, size: '1k' | '2k') => {
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
            <Tooltip title="生成1K测试图">
              <Button
                type="text"
                className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center px-2!"
                icon={<img src={openaiIcon} className="w-4 h-4 opacity-70" />}
                onClick={() => handleGenerate(template.id, '1k')}
              >
                1K
              </Button>
            </Tooltip>
            <Tooltip title="生成2K高清图">
              <Button
                type="text"
                className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center px-2!"
                icon={<img src={openaiIcon} className="w-4 h-4 opacity-70" />}
                onClick={() => handleGenerate(template.id, '2k')}
              >
                2K
              </Button>
            </Tooltip>
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

export function TemplateItemList({ filteredTemplates }: TemplateItemListProps) {
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-1 overflow-y-auto pr-2"
        style={{ maxHeight: '550px' }}
      >
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-4 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
            <InboxOutlined className="text-5xl text-slate-300" />
            <p className="text-sm font-medium">该分类下暂无模板内容</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                size="small"
                className="shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  <ImageGroup images={template.images || []} />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <CardHeader template={template} />
                    {template.title && (
                      <div
                        className="font-bold text-slate-800 truncate"
                        title={template.title}
                      >
                        {template.title}
                      </div>
                    )}
                    <Tooltip title={template.prompt} placement="bottom">
                      <p className="text-sm text-slate-600 line-clamp-2 cursor-default m-0">
                        {template.prompt}
                      </p>
                    </Tooltip>
                    <div className="mt-auto text-xs text-slate-400 pt-1">
                      {new Date(template.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
