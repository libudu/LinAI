import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Spin } from 'antd'
import dayjs from 'dayjs'
import { useEffect } from 'react'
import type { MediaDecisionStatus, MediaImageItem } from '../../types'
import { AnimatedScreeningImageStrip } from './AnimatedScreeningImageStrip'

interface OriginalImageScreeningViewProps {
  images: MediaImageItem[]
  loading: boolean
  active: boolean
  currentIndex: number
  onChangeIndex: (index: number) => void
  onMark: (relativePath: string, status: MediaDecisionStatus) => Promise<void>
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
  active,
  currentIndex,
  onChangeIndex,
  onMark,
  actionKey,
}: OriginalImageScreeningViewProps) {
  const currentImage = images[currentIndex]

  useEffect(() => {
    if (!active) {
      return
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (
        !currentImage ||
        actionKey ||
        event.repeat ||
        event.defaultPrevented
      ) {
        return
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return
      }

      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      if (
        target?.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select'
      ) {
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        void onMark(currentImage.relativePath, 'keep')
        onChangeIndex(Math.min(currentIndex + 1, images.length - 1))
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        void onMark(currentImage.relativePath, 'delete')
        onChangeIndex(Math.min(currentIndex + 1, images.length - 1))
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

    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [
    actionKey,
    active,
    currentImage,
    currentIndex,
    images.length,
    onChangeIndex,
    onMark,
  ])

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
            <div className="h-full min-w-0 flex-1">
              <AnimatedScreeningImageStrip
                images={images}
                currentIndex={currentIndex}
                onChangeIndex={onChangeIndex}
              />
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
              icon={<ArrowUpOutlined />}
              loading={actionKey === `${currentImage.relativePath}:keep`}
              onClick={() => void onMark(currentImage.relativePath, 'keep')}
            >
              保留
            </Button>
            <Button
              danger
              size="large"
              className="w-full"
              icon={<ArrowDownOutlined />}
              loading={actionKey === `${currentImage.relativePath}:delete`}
              onClick={() => void onMark(currentImage.relativePath, 'delete')}
            >
              预删除
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
