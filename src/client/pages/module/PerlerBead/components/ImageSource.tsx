import {
  openGallery,
  type GalleryImageSelection,
} from '@/client/pages/common/GenImage/TemplateSection/TemplateForm/Gallery'
import {
  FileImageOutlined,
  InboxOutlined,
  PictureOutlined,
  SwapOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Button, Card, message, Upload } from 'antd'
import { useState } from 'react'

interface ImageSourceProps {
  compact?: boolean
  onSelectImage: (url: string) => void
  disabled?: boolean
}

export function ImageSource({
  compact = false,
  onSelectImage,
  disabled = false,
}: ImageSourceProps) {
  const [loading, setLoading] = useState(false)

  // 处理文件上传
  const handleBeforeUpload = (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      message.error('只支持上传 JPG、PNG 或 WebP 格式的图片')
      return Upload.LIST_IGNORE
    }

    try {
      const objectUrl = URL.createObjectURL(file)
      onSelectImage(objectUrl)
    } catch (err) {
      console.error('创建图片 URL 失败', err)
      message.error('读取本地图片失败')
    }
    return Upload.LIST_IGNORE
  }

  // 打开图库弹窗并加载选中的图片
  const handleOpenGallery = () => {
    openGallery({
      onSelect: async (selections: GalleryImageSelection[]) => {
        if (!selections || selections.length === 0) return
        const item = selections[0]
        setLoading(true)
        try {
          // 如果是本地静态图片可直接使用，或统一通过 fetch 转为安全 Blob URL 防 Canvas 跨域
          const res = await fetch(item.url)
          if (!res.ok) throw new Error('下载图库图片失败')
          const blob = await res.blob()
          const objectUrl = URL.createObjectURL(blob)
          onSelectImage(objectUrl)
        } catch (err) {
          console.error('获取图库图片失败', err)
          message.error(
            err instanceof Error ? err.message : '加载图库选中的图片失败',
          )
        } finally {
          setLoading(false)
        }
      },
    })
  }

  // 紧凑模式：通常放在顶部工具栏中作为“更换图片”按钮
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Upload
          accept="image/jpeg,image/png,image/webp"
          showUploadList={false}
          fileList={[]}
          maxCount={1}
          beforeUpload={handleBeforeUpload}
          disabled={disabled || loading}
        >
          <Button
            icon={<SwapOutlined />}
            size="small"
            loading={loading}
            disabled={disabled}
          >
            更换图片
          </Button>
        </Upload>
        <Button
          icon={<PictureOutlined />}
          size="small"
          onClick={handleOpenGallery}
          loading={loading}
          disabled={disabled}
        >
          从图库选
        </Button>
      </div>
    )
  }

  // 空状态大卡片模式：初始加载或未选图时展示
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center p-6">
      <Card className="w-full rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-400">
            <FileImageOutlined className="text-3xl" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            拼豆图制作与前处理
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            导入 AI
            生成的图片或手绘像素图，自动识别网格并归一化颜色，生成可用于制作的拼豆图纸
          </p>

          <div className="mt-8">
            <Upload.Dragger
              accept="image/jpeg,image/png,image/webp"
              showUploadList={false}
              fileList={[]}
              maxCount={1}
              beforeUpload={handleBeforeUpload}
              disabled={disabled || loading}
              className="bg-slate-50/50 hover:bg-slate-50 dark:bg-slate-800/30 dark:hover:bg-slate-800/50"
            >
              <p className="ant-upload-drag-icon text-orange-500">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text text-base font-medium">
                点击或将图片拖拽到此处
              </p>
              <p className="ant-upload-hint text-xs text-slate-400">
                支持 JPG、PNG、WebP 格式（纯前端本地处理，不上传外部服务器）
              </p>
            </Upload.Dragger>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4">
            <Upload
              accept="image/jpeg,image/png,image/webp"
              showUploadList={false}
              fileList={[]}
              maxCount={1}
              beforeUpload={handleBeforeUpload}
              disabled={disabled || loading}
            >
              <Button
                type="primary"
                icon={<UploadOutlined />}
                size="large"
                loading={loading}
              >
                选择本地图片
              </Button>
            </Upload>
            <Button
              icon={<PictureOutlined />}
              size="large"
              onClick={handleOpenGallery}
              loading={loading}
            >
              从图库选择
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
