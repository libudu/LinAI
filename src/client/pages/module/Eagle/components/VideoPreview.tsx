import type { EagleItem } from '@/shared/eagle/types'
import {
  CloseOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
} from '@ant-design/icons'
import { Button, Modal, Segmented, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { eagleFileUrl, eagleVideoContactSheetUrl } from '../api'
import {
  loadVideoPlaybackRate,
  loadVideoPreviewMode,
  persistVideoPlaybackRate,
  persistVideoPreviewMode,
  type EagleVideoPreviewMode,
} from '../preferences'
import { formatFileSize } from './formatFileSize'
import { MediaEditSaveButton } from './MediaEditSaveButton'
import { getRotationEditOperations, normalizeRotation } from './rotation'
import { formatVideoDuration, VideoPlayer } from './VideoPlayer'

interface VideoPreviewProps {
  item:
    | (Pick<EagleItem, 'id' | 'name' | 'ext' | 'size' | 'contentVersion'> &
        Partial<Pick<EagleItem, 'width' | 'height'>>)
    | null
  onClose: () => void
  allowOverwrite?: boolean
}

/** 挂载即请求联系图，缺失时由接口生成；切换视频或关闭时卸载。 */
function VideoContactSheetPreview({
  item,
}: {
  item: NonNullable<VideoPreviewProps['item']>
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  return (
    <>
      <img
        key={attempt}
        src={`${eagleVideoContactSheetUrl(item.id)}?v=${item.contentVersion}&retry=${attempt}`}
        alt={`${item.name}.${item.ext} 的联系图`}
        className={`absolute inset-0 h-full w-full object-contain ${status === 'ready' ? '' : 'invisible'}`}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
      {status === 'loading' && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white"
        >
          <Spin size="large" />
          <span>正在加载或生成联系图…</span>
        </div>
      )}
      {status === 'error' && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white"
        >
          <span>联系图加载或生成失败</span>
          <Button
            onClick={() => {
              setStatus('loading')
              setAttempt((current) => current + 1)
            }}
          >
            重试
          </Button>
        </div>
      )}
    </>
  )
}

/** 视频沿用大图预览的黑色遮罩，记忆播放器/联系图模式，底部信息独立占用空间。 */
export function VideoPreview({
  item: inputItem,
  onClose,
  allowOverwrite = true,
}: VideoPreviewProps) {
  const inputKey = inputItem
    ? `${inputItem.id}:${inputItem.contentVersion}`
    : ''
  const [saved, setSaved] = useState<{
    inputKey: string
    item: NonNullable<VideoPreviewProps['item']>
  } | null>(null)
  const item = saved?.inputKey === inputKey ? saved.item : inputItem
  const [mode, setMode] = useState(loadVideoPreviewMode)
  const [playbackRate, setPlaybackRate] = useState(loadVideoPlaybackRate)
  const initializedVideoRef = useRef<HTMLVideoElement | null>(null)
  const [videoMetadata, setVideoMetadata] = useState<{
    key: string
    width: number
    height: number
    duration: number | null
  } | null>(null)
  const videoKey = item ? `${item.id}:${item.contentVersion}` : ''
  const metadata = videoMetadata?.key === videoKey ? videoMetadata : null
  const resolution =
    metadata && metadata.width > 0 && metadata.height > 0 ? metadata : item
  const duration = metadata?.duration ?? null
  const readVideoMetadata = (video: HTMLVideoElement) => {
    setVideoMetadata({
      key: videoKey,
      width: video.videoWidth,
      height: video.videoHeight,
      duration:
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : null,
    })
  }
  const [rotation, setRotation] = useState(0)
  const [saving, setSaving] = useState(false)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    setRotation(0)
  }, [videoKey, mode])
  useEffect(() => {
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])
  const sideways = rotation === 90 || rotation === 270
  const width = resolution?.width || containerSize.width
  const height = resolution?.height || containerSize.height
  const scale =
    Math.min(
      containerSize.width / (sideways ? height : width),
      containerSize.height / (sideways ? width : height),
    ) || 1
  const close = () => {
    if (!saving) onClose()
  }
  return (
    <Modal
      open={item !== null}
      onCancel={close}
      keyboard={!saving}
      maskClosable={!saving}
      title={<span className="sr-only">视频预览</span>}
      footer={null}
      closable={false}
      destroyOnHidden
      width="100%"
      mask={{ blur: false }}
      style={{ top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 }}
      styles={{
        mask: { background: 'rgba(0, 0, 0, 0.65)' },
        wrapper: { overflow: 'hidden' },
        container: {
          padding: 0,
          background: 'transparent',
          boxShadow: 'none',
          borderRadius: 0,
        },
        header: { height: 0, margin: 0, padding: 0, background: 'transparent' },
        body: { height: '100dvh', padding: 0 },
      }}
    >
      {item && (
        <div
          className="flex h-full flex-col items-center gap-3 px-4 pt-14 pb-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <button
            type="button"
            aria-label="关闭视频预览"
            title="关闭视频预览"
            className="absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            disabled={saving}
            onClick={close}
          >
            <CloseOutlined />
          </button>
          <div
            ref={setContainer}
            className="relative min-h-0 w-full flex-1 overflow-hidden"
            onClick={(event) => {
              if (event.target === event.currentTarget) close()
            }}
          >
            {mode === 'video' ? (
              <div
                className="absolute top-1/2 left-0 w-full -translate-y-1/2 bg-black/30"
                style={{ height: (sideways ? width : height) * scale }}
                onClick={(event) => event.stopPropagation()}
              >
                <VideoPlayer
                  key={videoKey}
                  src={eagleFileUrl(item.id, item.contentVersion)}
                  autoPlay
                  playsInline
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget
                    video.defaultPlaybackRate = playbackRate
                    video.playbackRate = playbackRate
                    initializedVideoRef.current = video
                    readVideoMetadata(video)
                  }}
                  onDurationChange={(event) =>
                    readVideoMetadata(event.currentTarget)
                  }
                  onRateChange={(event) => {
                    const video = event.currentTarget
                    // 忽略载入元数据前播放器重置倍速产生的事件。
                    if (
                      initializedVideoRef.current !== video ||
                      video.readyState < video.HAVE_METADATA
                    )
                      return
                    setPlaybackRate(video.playbackRate)
                    persistVideoPlaybackRate(video.playbackRate)
                  }}
                  className="absolute top-1/2 left-1/2 object-contain"
                  style={{
                    width: width * scale,
                    height: height * scale,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  }}
                />
              </div>
            ) : (
              <>
                <video
                  key={videoKey}
                  src={eagleFileUrl(item.id, item.contentVersion)}
                  preload="metadata"
                  className="hidden"
                  onLoadedMetadata={(event) =>
                    readVideoMetadata(event.currentTarget)
                  }
                  onDurationChange={(event) =>
                    readVideoMetadata(event.currentTarget)
                  }
                />
                <VideoContactSheetPreview key={videoKey} item={item} />
              </>
            )}
          </div>
          <div
            className="flex w-full shrink-0 items-center justify-center gap-3"
            onClick={(event) => {
              if (event.target === event.currentTarget) close()
            }}
          >
            {mode === 'video' && (
              <div className="relative flex shrink-0 items-center justify-center gap-3 rounded-full bg-black/40 px-4 py-2 text-white">
                <button
                  type="button"
                  title="向左旋转 90°"
                  aria-label="向左旋转 90°"
                  className="cursor-pointer p-2 text-xl disabled:cursor-wait disabled:opacity-50"
                  disabled={saving}
                  onClick={() =>
                    setRotation((value) => normalizeRotation(value - 90))
                  }
                >
                  <RotateLeftOutlined />
                </button>
                <button
                  type="button"
                  title="向右旋转 90°"
                  aria-label="向右旋转 90°"
                  className="cursor-pointer p-2 text-xl disabled:cursor-wait disabled:opacity-50"
                  disabled={saving}
                  onClick={() =>
                    setRotation((value) => normalizeRotation(value + 90))
                  }
                >
                  <RotateRightOutlined />
                </button>
                {allowOverwrite && (
                  <div className="absolute top-1/2 right-full mr-3 -translate-y-1/2">
                    <MediaEditSaveButton
                      key={item.id}
                      id={item.id}
                      contentVersion={item.contentVersion}
                      operations={getRotationEditOperations(rotation)}
                      video
                      onBusyChange={(busy) => {
                        setSaving(busy)
                        if (busy) initializedVideoRef.current?.pause()
                      }}
                      onSaved={(next) => {
                        setSaved({ inputKey, item: next })
                        setRotation(0)
                        setSaving(false)
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="max-h-[20dvh] min-w-0 overflow-y-auto rounded-lg bg-black/40 px-3 py-2 text-center text-sm text-white">
              <div className="wrap-anywhere whitespace-pre-wrap">
                {item.name}.{item.ext}
              </div>
              <div className="mt-1 text-white/70">
                {formatFileSize(item.size)}
                {resolution &&
                  (resolution.width ?? 0) > 0 &&
                  (resolution.height ?? 0) > 0 && (
                    <span className="ml-3">
                      {resolution.width} × {resolution.height}
                    </span>
                  )}
                {duration !== null && (
                  <span className="ml-3" title="视频时长">
                    {formatVideoDuration(duration)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Segmented<EagleVideoPreviewMode>
            disabled={saving}
            className="shrink-0"
            aria-label="视频预览方式"
            value={mode}
            options={[
              { value: 'video', label: '视频' },
              { value: 'contact-sheet', label: '联系图' },
            ]}
            onChange={(value) => {
              setMode(value)
              persistVideoPreviewMode(value)
            }}
          />
        </div>
      )}
    </Modal>
  )
}
