import { useState } from 'react'
import { Button, Card, Popconfirm, Space, Tag, message } from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  InboxOutlined
} from '@ant-design/icons'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import { useGlobalStore } from '../../../store/global'
import { openGPTTokenModal } from '../../../module/GPTImageSection/openGPTTokenModal'
import { ImageGroup } from './ImageGroup'
import { TaskTemplate } from '../../../../server/common/template-manager'
import openaiIcon from '../../../assets/icon/openai.svg'

const client = hc<AppType>('/')

interface TemplateItemListProps {
  selectedSource: 'video' | 'image'
  filteredTemplates: TaskTemplate[]
  onBack: () => void
  onDelete: (id: string) => void
}

export function TemplateItemList({
  selectedSource,
  filteredTemplates,
  onBack,
  onDelete
}: TemplateItemListProps) {
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)

  const doGenerate = async (
    apiKey: string,
    templateId: string,
    quality: 'low' | 'high'
  ) => {
    try {
      const res = await client.api.gptImage.generate.$post({
        json: {
          apiKey,
          templateId,
          quality
        }
      })
      const data = await res.json()
      if (data.success && 'image' in data && data.image) {
        message.success('生成图片成功')
        const link = document.createElement('a')
        link.href = data.image as string
        link.download = `generated-${quality}-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        message.error((data as any).error || '生成失败')
      }
    } catch (error) {
      message.error('请求失败')
    }
  }

  const handleGenerate = (templateId: string, quality: 'low' | 'high') => {
    const apiKey = gptImageApiKey
    if (!apiKey) {
      openGPTTokenModal({
        onSuccess: (key) => {
          doGenerate(key, templateId, quality)
        }
      })
      return
    }

    doGenerate(apiKey, templateId, quality)
  }

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
            {filteredTemplates.map((item) => (
              <Card
                key={item.id}
                size="small"
                className="shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  <ImageGroup images={item.images || []} />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <Space size={[0, 4]} wrap>
                        <Tag
                          color={item.usageType === 'image' ? 'blue' : 'purple'}
                        >
                          {item.usageType === 'image' ? '图片' : '视频'}
                        </Tag>
                      </Space>
                      <Space size={8} className="flex-nowrap">
                        {item.usageType === 'image' && (
                          <>
                            <Button
                              type="text"
                              className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center"
                              icon={
                                <img
                                  src={openaiIcon}
                                  alt="1k"
                                  className="w-4 h-4 opacity-70"
                                />
                              }
                              onClick={() => handleGenerate(item.id, 'low')}
                            >
                              1k
                            </Button>
                            <Button
                              type="text"
                              className="text-slate-500 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center"
                              icon={
                                <img
                                  src={openaiIcon}
                                  alt="2k"
                                  className="w-4 h-4 opacity-70"
                                />
                              }
                              onClick={() => handleGenerate(item.id, 'high')}
                            >
                              2k
                            </Button>
                          </>
                        )}
                        <Popconfirm
                          title="确定要删除该模板吗？"
                          onConfirm={() => onDelete(item.id)}
                          okText="确定"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Popconfirm>
                      </Space>
                    </div>
                    {item.title && (
                      <div
                        className="font-bold text-slate-800 mb-1 truncate"
                        title={item.title}
                      >
                        {item.title}
                      </div>
                    )}
                    <p
                      className="text-sm text-slate-600 line-clamp-2 mt-1"
                      title={item.prompt}
                    >
                      {item.prompt}
                    </p>
                    <div className="mt-auto text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
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
