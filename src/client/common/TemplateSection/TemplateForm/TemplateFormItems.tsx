import { Form, Input, InputNumber, Select } from 'antd'
import classnames from 'classnames'
import React from 'react'
import { useLocalSetting } from '../../../hooks/useLocalSetting'
import { FolderFormItem } from './FolderSelectInput'
import { ImageUpload } from './ImageUpload'

function TitleFormItem({ className }: { className?: string }) {
  return (
    <Form.Item name="title" label="（可选）标题" className={className}>
      <Input placeholder="请输入模板标题..." />
    </Form.Item>
  )
}

function AspectRatioFormItem({ className }: { className?: string }) {
  return (
    <Form.Item
      name="aspectRatio"
      label="比例"
      className={className}
      rules={[{ required: true, message: '请选择比例' }]}
    >
      <Select
        options={[
          { label: '21:9', value: '21:9' },
          { label: '2:1', value: '2:1' },
          { label: '16:9', value: '16:9' },
          { label: '4:3', value: '4:3' },
          { label: '1:1', value: '1:1' },
          { label: '3:4', value: '3:4' },
          { label: '9:16', value: '9:16' },
          { label: '1:2', value: '1:2' },
          { label: '9:21', value: '9:21' },
        ]}
      />
    </Form.Item>
  )
}

function CountFormItem({ className }: { className?: string }) {
  return (
    <Form.Item
      name="n"
      label="生成张数"
      className={classnames(className, '[&_.ant-input-number]:w-full!')}
    >
      <InputNumber min={1} max={8} className="" />
    </Form.Item>
  )
}

function PromptFormItem({
  className,
  label = '提示词',
}: {
  className?: string
  label?: React.ReactNode
}) {
  return (
    <Form.Item
      name="prompt"
      label={label}
      className={className}
      rules={[{ required: true, message: '请填写提示词' }]}
    >
      <Input.TextArea
        autoSize={{
          minRows: 5,
          maxRows: 10,
        }}
        placeholder="请输入生成内容的提示词..."
        style={{ resize: 'none' }}
      />
    </Form.Item>
  )
}

export function TemplateFormFields({
  form,
  imageUrls,
  setImageUrls,
  setUploadingCount,
}: {
  form: any
  imageUrls: string[]
  setImageUrls: (urls: string[]) => void
  setUploadingCount: (count: number) => void
}) {
  const { gptImageSettings } = useLocalSetting()

  return (
    <>
      <div className="flex gap-4">
        <TitleFormItem className="flex-1" />
        <FolderFormItem className="w-1/4" />
        <AspectRatioFormItem className="w-1/4" />
      </div>

      <div className="flex gap-4">
        <Form.Item label="上传图片" className="flex-1">
          <ImageUpload
            value={imageUrls}
            onChange={setImageUrls}
            onUploadingChange={(isUploading) =>
              setUploadingCount(isUploading ? 1 : 0)
            }
            onFirstImageRatio={(ratio) => {
              form.setFieldsValue({ aspectRatio: ratio })
            }}
          />
        </Form.Item>
        {gptImageSettings.enableMultiple && <CountFormItem className="w-1/4" />}
      </div>

      <PromptFormItem
        label={
          <div className="flex items-center gap-2">
            <span>提示词</span>
          </div>
        }
      />
    </>
  )
}
