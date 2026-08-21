import type { EagleFolder } from '@/shared/eagle/types'
import { Alert, Form, Input, Modal, message } from 'antd'
import { useEffect, useState } from 'react'
import { updateEagleFolder } from '../api'

// 编辑文件夹弹窗：修改名称/描述，写回 Eagle 库 metadata.json
export function EditFolderModal({
  folder,
  onClose,
  onSaved,
}: {
  folder: EagleFolder | null
  onClose: () => void
  onSaved?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string; description: string }>()

  // 打开弹窗时回填当前名称与描述
  useEffect(() => {
    if (folder) {
      form.setFieldsValue({
        name: folder.name,
        description: folder.description,
      })
    }
  }, [folder, form])

  const handleSave = async () => {
    if (!folder) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      await updateEagleFolder(folder.id, {
        name: values.name.trim(),
        description: values.description?.trim() ?? '',
      })
      message.success('文件夹已更新')
      onClose()
      onSaved?.()
    } catch (error) {
      console.error('更新 Eagle 文件夹失败', error)
      message.error('更新失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="编辑文件夹"
      open={folder !== null}
      onOk={handleSave}
      onCancel={onClose}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      <Alert
        className="my-4!"
        type="warning"
        showIcon
        title="修改文件夹数据后需要重启 Eagle 才会在 Eagle 内刷新显示"
      />
      <Form form={form} layout="vertical" className="pt-2">
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, whitespace: true, message: '请输入名称' }]}
        >
          <Input placeholder="文件夹名称" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} placeholder="文件夹描述（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
