import { BulbOutlined, ExperimentOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Select } from 'antd'
import classnames from 'classnames'
import React, { useState } from 'react'
import { useLocalSetting } from '../../../../hooks/useLocalSetting'
import { FolderFormItem } from './FolderSelectInput'
import { ImageUpload } from './ImageUpload'
import { StyleExtractModal } from './StyleExtractModal'
import { PromptOptimizeModal } from './PromptOptimizeModal'

function TitleFormItem({ className }: { className?: string }) {
  return (
    <Form.Item name="title" label="标题" className={className}>
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
      label="张数"
      className={classnames(className, '[&_.ant-input-number]:w-full!')}
    >
      <InputNumber min={1} max={8} className="" />
    </Form.Item>
  )
}

function PromptFormItem({
  className,
  label = '提示词',
  form,
  imageUrls,
}: {
  className?: string
  label?: React.ReactNode
  form: any
  imageUrls: string[]
}) {
  const [openStyleExtractModal, setOpenStyleExtractModal] = useState(false)
  const [openPromptOptimizeModal, setOpenPromptOptimizeModal] = useState(false)
  const { promptOptimizeEnabled } = useLocalSetting()
  const prompt = Form.useWatch('prompt', form) || ''

  return (
    <>
      <Form.Item
        name="prompt"
        label={
          <div className="flex w-full items-center justify-between gap-4">
            <span>{label}</span>
            {promptOptimizeEnabled && (
              <span className="flex items-center gap-2">
                <Button
                  type="link"
                  size="small"
                  icon={<ExperimentOutlined />}
                  className="px-0!"
                  onClick={() => setOpenStyleExtractModal(true)}
                >
                  图片风格提取
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<BulbOutlined />}
                  className="px-0!"
                  onClick={() => setOpenPromptOptimizeModal(true)}
                >
                  提示词优化
                </Button>
              </span>
            )}
          </div>
        }
        className={classnames(
          className,
          '[&_.ant-form-item-label>label]:w-full',
          '[&_.ant-form-item-label>label]:max-w-full',
        )}
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
      <PromptOptimizeModal
        open={openPromptOptimizeModal}
        prompt={prompt}
        imageUrls={imageUrls}
        onClose={() => setOpenPromptOptimizeModal(false)}
        onApply={(optimizedPrompt) => {
          form.setFieldsValue({ prompt: optimizedPrompt })
          setOpenPromptOptimizeModal(false)
        }}
      />
      <StyleExtractModal
        open={openStyleExtractModal}
        onClose={() => setOpenStyleExtractModal(false)}
        onApply={(composedPrompt) => {
          form.setFieldsValue({ prompt: composedPrompt })
          setOpenStyleExtractModal(false)
        }}
      />
    </>
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
        <AspectRatioFormItem className="w-1/5" />
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
        {gptImageSettings.enableMultiple && <CountFormItem className="w-1/5" />}
      </div>

      <PromptFormItem
        form={form}
        imageUrls={imageUrls}
        label={
          <div className="flex items-center gap-2">
            <span>提示词</span>
          </div>
        }
      />
    </>
  )
}
