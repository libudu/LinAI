import { useState, forwardRef, useImperativeHandle } from 'react'
import {
  InboxOutlined,
  DeleteOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons'
import { Card, message, Spin, Tag, Space, Popconfirm, Button } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'
import { useTemplates } from '../../hooks/useTemplates'

const client = hc<AppType>('/')

export interface TemplateListRef {
  refresh: () => void
}

export const TemplateList = forwardRef<TemplateListRef, unknown>((_, ref) => {
  const [selectedSource, setSelectedSource] = useState<
    'video' | 'image' | null
  >(null)

  const { data: templates = [], loading, refresh } = useTemplates()

  useImperativeHandle(ref, () => ({
    refresh
  }))

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

  const renderTemplateList = () => {
    if (selectedSource === null) {
      const wanCount = templates.filter((t) => t.usageType === 'video').length
      const geminiCount = templates.filter(
        (t) => t.usageType === 'image'
      ).length

      return (
        <div className="grid grid-cols-2 gap-4 h-full content-start mt-2">
          <Card
            hoverable
            onClick={() => setSelectedSource('video')}
            className="text-center cursor-pointer border-emerald-100 hover:border-emerald-300 transition-colors"
          >
            <div className="text-xl font-bold mb-2 text-emerald-600">视频</div>
            <div className="text-slate-500">{wanCount} 个模板</div>
          </Card>
          <Card
            hoverable
            onClick={() => setSelectedSource('image')}
            className="text-center cursor-pointer border-blue-100 hover:border-blue-300 transition-colors"
          >
            <div className="text-xl font-bold mb-2 text-blue-600">图片</div>
            <div className="text-slate-500">{geminiCount} 个模板</div>
          </Card>
        </div>
      )
    }

    const filteredTemplates = templates.filter(
      (t) => t.usageType === selectedSource
    )

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => setSelectedSource(null)}
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
                    <div className="w-24 h-24 shrink-0 relative ml-2">
                      {item.images &&
                        item.images.map((url, index) => {
                          const isFirst = index === 0
                          const isLast =
                            index === item.images.length - 1 &&
                            item.images.length > 1
                          const rotation = isFirst ? -6 : isLast ? 6 : 0
                          const leftOffset = index * 10 // Smaller offset for list view
                          const zIndex = isFirst ? 10 : isLast ? 8 : 9

                          return (
                            <div
                              key={index}
                              className="absolute rounded-md overflow-hidden bg-slate-100 border border-slate-200 shadow-sm transition-all duration-300 ease-in-out hover:!z-50 hover:scale-105 cursor-pointer"
                              style={{
                                width: '64px',
                                height: '96px',
                                left: `${leftOffset}px`,
                                zIndex: zIndex,
                                transform: `rotate(${rotation}deg)`,
                                transformOrigin: 'bottom center'
                              }}
                            >
                              <img
                                src={url}
                                alt="template"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )
                        })}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <Space size={[0, 4]} wrap>
                          <Tag
                            color={
                              item.usageType === 'image' ? 'blue' : 'purple'
                            }
                          >
                            {item.usageType === 'image' ? '图片' : '视频'}
                          </Tag>
                        </Space>
                        <Popconfirm
                          title="确定要删除该模板吗？"
                          onConfirm={() => handleDelete(item.id)}
                          okText="确定"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                          />
                        </Popconfirm>
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-800 m-0">
          已有模板 ({templates.length})
        </h3>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Spin />
        </div>
      ) : (
        renderTemplateList()
      )}
    </div>
  )
})
