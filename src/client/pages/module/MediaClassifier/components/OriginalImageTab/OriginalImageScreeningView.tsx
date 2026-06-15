import {
  DeleteOutlined,
  EnterOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Button, Card, Empty, Spin } from 'antd'
import dayjs from 'dayjs'
import { useEffect } from 'react'
import type { MediaDecisionStatus, MediaImageItem } from '../../types'
import { MediaStatusImage } from './MediaStatusImage'

interface OriginalImageScreeningViewProps {
  images: MediaImageItem[]
  loading: boolean
  currentIndex: number
  onChangeIndex: (index: number) => void
  onMark: (
    relativePath: string,
    status: MediaDecisionStatus,
    autoAdvance?: boolean,
  ) => Promise<void>
  actionKey: string | null
}

const formatFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function OriginalImageScreeningView({
  images,
  loading,
  currentIndex,
  onChangeIndex,
  onMark,
  actionKey,
}: OriginalImageScreeningViewProps) {
  const currentImage = images[currentIndex]
  const previousImage = currentIndex > 0 ? images[currentIndex - 1] : null
  const nextImage =
    currentIndex < images.length - 1 ? images[currentIndex + 1] : null

  useEffect(() => {
    if (!currentImage) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      if (
        target?.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea'
      ) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        void onMark(currentImage.relativePath, 'keep', true)
        return
      }

      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault()
        void onMark(currentImage.relativePath, 'delete', true)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onChangeIndex(Math.max(currentIndex - 1, 0))
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onChangeIndex(Math.min(currentIndex + 1, images.length - 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentImage, currentIndex, images.length, onChangeIndex, onMark])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (!currentImage) {
    return <Empty description="当前没有可筛选的图片" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <Card
          className="border-slate-200 shadow-sm"
          classNames={{ body: 'p-3! md:p-5!' }}
        >
          <div className="flex h-[500px] items-center justify-center gap-3 rounded-2xl bg-slate-100 p-4 md:gap-5">
            <div className="flex h-full w-36 items-center justify-center md:w-44">
              {previousImage ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                  <MediaStatusImage
                    item={previousImage}
                    preview={false}
                    onClick={() => onChangeIndex(currentIndex - 1)}
                    ariaLabel={`查看上一张：${previousImage.name}`}
                    rootClassName="h-[60%] w-full opacity-80"
                    imageClassName="object-contain"
                  />
                  <Button
                    type="text"
                    icon={<LeftOutlined />}
                    onClick={() => onChangeIndex(currentIndex - 1)}
                  >
                    上一张
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="h-full min-w-0 flex-1">
              <MediaStatusImage
                item={currentImage}
                rootClassName="h-full w-full shadow-sm"
                imageClassName="max-w-full object-contain"
              />
            </div>

            <div className="flex h-full w-36 items-center justify-center md:w-44">
              {nextImage ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                  <MediaStatusImage
                    item={nextImage}
                    preview={false}
                    onClick={() => onChangeIndex(currentIndex + 1)}
                    ariaLabel={`查看下一张：${nextImage.name}`}
                    rootClassName="h-[60%] w-full opacity-80"
                    imageClassName="object-contain"
                  />
                  <Button
                    type="text"
                    icon={<RightOutlined />}
                    iconPosition="end"
                    onClick={() => onChangeIndex(currentIndex + 1)}
                  >
                    下一张
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card
          className="border-slate-200 shadow-sm"
          classNames={{
            body: 'flex items-center justify-between h-full gap-4 p-4!',
          }}
        >
          <div>
            <div className="space-y-2 text-base text-slate-500">
              <div>相对路径：{currentImage.relativePath}</div>
              <div>文件大小：{formatFileSize(currentImage.size)}</div>
              <div>
                修改时间：
                {dayjs(currentImage.mtimeMs).format('YYYY-MM-DD HH:mm')}
              </div>
            </div>
          </div>

          <div className="flex w-60 flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <Button
                size="large"
                disabled={currentIndex <= 0}
                onClick={() => onChangeIndex(Math.max(currentIndex - 1, 0))}
              >
                ← 上一张
              </Button>
              <Button
                size="large"
                disabled={currentIndex >= images.length - 1}
                onClick={() =>
                  onChangeIndex(Math.min(currentIndex + 1, images.length - 1))
                }
              >
                下一张 →
              </Button>
            </div>
            <Button
              type="primary"
              size="large"
              className="w-full"
              icon={<EnterOutlined />}
              loading={actionKey === `${currentImage.relativePath}:keep`}
              onClick={() =>
                void onMark(currentImage.relativePath, 'keep', true)
              }
            >
              保留（回车）
            </Button>
            <Button
              danger
              size="large"
              className="w-full"
              icon={<DeleteOutlined />}
              loading={actionKey === `${currentImage.relativePath}:delete`}
              onClick={() =>
                void onMark(currentImage.relativePath, 'delete', true)
              }
            >
              删除（D）
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
