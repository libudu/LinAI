import { EditOutlined, FolderOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Modal, message } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../server'

const client = hc<AppType>('/')

interface TemplateFolderProps {
  folder: string
  count: number
  onClick: () => void
  onDropTemplate?: (templateId: string, folder: string) => void
  onRenameSuccess?: () => void
}

export function TemplateFolder({
  folder,
  count,
  onClick,
  onDropTemplate,
  onRenameSuccess
}: TemplateFolderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    form.setFieldsValue({ newFolder: folder })
    setIsModalOpen(true)
  }

  const handleRename = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const res = await client.api.template.folder.rename.$put({
        json: {
          oldFolder: folder,
          newFolder: values.newFolder
        }
      })
      const json = await res.json()
      if (json.success) {
        message.success('重命名成功')
        setIsModalOpen(false)
        onRenameSuccess?.()
      } else {
        message.error(json.error || '重命名失败')
      }
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || '重命名失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Card
        size="small"
        className={`group cursor-pointer shadow-sm transition-all hover:border-blue-400 hover:shadow-md ${
          isDragOver ? 'border-blue-500 bg-blue-50' : ''
        }`}
        onClick={onClick}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => {
          setIsDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          const data = e.dataTransfer.getData('application/json')
          if (data) {
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'template' && parsed.id) {
                onDropTemplate?.(parsed.id, folder)
              }
            } catch (err) {
              // Ignore parse errors
            }
          }
        }}
      >
        <div className="flex items-center gap-2">
          <FolderOutlined className="text-xl text-blue-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-slate-700" title={folder}>
              {folder}
            </div>
            <div className="text-xs text-slate-400">{count} 个模板</div>
          </div>
          <Button
            type="text"
            icon={<EditOutlined />}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={handleEditClick}
          />
        </div>
      </Card>

      <Modal
        title="重命名文件夹"
        open={isModalOpen}
        okText="确定"
        onOk={handleRename}
        cancelText="取消"
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={submitting}
        destroyOnHidden
        width={400}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="newFolder"
            label="文件夹名称"
            rules={[
              { required: true, message: '请输入文件夹名称' },
              {
                validator: async (_, value) => {
                  if (value === folder) {
                    throw new Error('新名称不能与原名称相同')
                  }
                }
              }
            ]}
          >
            <Input placeholder="输入新的文件夹名称" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
