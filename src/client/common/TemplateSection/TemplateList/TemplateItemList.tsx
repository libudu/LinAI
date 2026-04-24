import { Button, Card, Popconfirm, Space, Tag, message } from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  InboxOutlined
} from '@ant-design/icons'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import { useGlobalStore } from '../../../store/global'
import { openSettingModal } from '../../../common/SettingModal'
import { ImageGroup } from './ImageGroup'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { useTasks } from '../../../hooks/useTasks'
import openaiIcon from '../../../assets/icon/openai.svg'
import { useGPTImageQuota } from '../../../hooks/useGPTImageQuota'

const client = hc<AppType>('/')

interface TemplateItemListProps {
  selectedSource: 'video' | 'image'
  filteredTemplates: TaskTemplate[]
  onBack: () => void
}

const CardHeader = ({ template }: { template: TaskTemplate }) => {
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const { refresh } = useTasks()
  const { quota } = useGPTImageQuota()

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
        refresh()
      } else {
        message.error(json.error || '删除失败')
      }
    } catch (error) {
      message.error('请求失败')
    }
  }

  return (
    <div className="flex justify-between items-center mb-2">
      <Tag color={template.usageType === 'image' ? 'blue' : 'purple'}>
        {template.usageType === 'image' ? '图片' : '视频'}
      </Tag>
      <Space size={8} className="flex-nowrap">
        {template.usageType === 'image' && (
          <>
            <Button
              type="text"
              className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center"
              icon={<img src={openaiIcon} className="w-4 h-4 opacity-70" />}
              onClick={() => handleGenerate(template.id, '1k')}
            >
              1K
            </Button>
            <Button
              type="text"
              className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center"
              icon={<img src={openaiIcon} className="w-4 h-4 opacity-70" />}
              onClick={() => handleGenerate(template.id, '2k')}
            >
              2K
            </Button>
          </>
        )}
        <Popconfirm
          title="确定要删除该模板吗？"
          onConfirm={() => handleDelete(template.id)}
          okText="确定"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    </div>
  )
}

export function TemplateItemList({
  selectedSource,
  filteredTemplates,
  onBack
}: TemplateItemListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          className="text-slate-500 hover:text-slate-800 -ml-2"
        />
        <h4 className="text-md font-medium text-slate-800 m-0">
          {selectedSource === 'video' ? '视频' : '图片'} 模板 (
          {filteredTemplates.length})
        </h4>
      </div>

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
          <div className="space-y-4">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                size="small"
                className="shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  <ImageGroup images={template.images || []} />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <CardHeader template={template} />
                    {template.title && (
                      <div
                        className="font-bold text-slate-800 mb-1 truncate"
                        title={template.title}
                      >
                        {template.title}
                      </div>
                    )}
                    <p
                      className="text-sm text-slate-600 line-clamp-2 mt-1"
                      title={template.prompt}
                    >
                      {template.prompt}
                    </p>
                    <div className="mt-auto text-xs text-slate-400">
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
