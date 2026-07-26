import { ExperimentOutlined, InboxOutlined } from '@ant-design/icons'
import { Button, Spin, Upload } from 'antd'
import type { UploadProps } from 'antd'
import { STYLE_DIMENSIONS } from './dimensions'
import { StepBadge } from './StepBadge'

interface UploadSectionProps {
  uploading: boolean
  analyzing: boolean
  uploadedUrl: string | null
  uploadedPreview: string | null
  onUpload: UploadProps['customRequest']
  onAnalyze: () => void
}

export function UploadSection({
  uploading,
  analyzing,
  uploadedUrl,
  uploadedPreview,
  onUpload,
  onAnalyze,
}: UploadSectionProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <StepBadge n={1} />
        <span className="text-sm font-medium text-gray-700">上传图片</span>
      </div>

      <div className="flex items-stretch gap-4">
        <Upload.Dragger
          customRequest={onUpload}
          showUploadList={false}
          accept="image/jpeg,image/png,image/webp"
          disabled={analyzing}
          className="shrink-0! [&_.ant-upload]:p-0!"
        >
          <div
            className="flex items-center justify-center"
            style={{ width: 220, height: 160 }}
          >
            {uploadedPreview ? (
              <img
                src={uploadedPreview}
                alt="preview"
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                {uploading ? (
                  <Spin />
                ) : (
                  <InboxOutlined className="text-3xl text-gray-300" />
                )}
                <p className="text-xs text-gray-400">
                  {uploading ? '上传中...' : '点击或拖拽上传'}
                </p>
              </div>
            )}
          </div>
        </Upload.Dragger>

        <div className="flex flex-1 flex-col justify-between gap-3 py-1">
          <div className="space-y-1">
            <p className="text-xs leading-relaxed text-gray-500">
              支持 JPG / PNG / WebP 格式，上传后点击「开始解析」分析画风构成。
            </p>
            <p className="text-xs leading-relaxed text-gray-400">
              分析使用 {STYLE_DIMENSIONS.length}{' '}
              个维度对图片进行解构，结果可直接编辑和筛选。
            </p>
          </div>
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={onAnalyze}
            loading={analyzing}
            disabled={!uploadedUrl}
            className="self-start"
          >
            {analyzing ? '解析中...' : '开始解析'}
          </Button>
        </div>
      </div>
    </section>
  )
}
